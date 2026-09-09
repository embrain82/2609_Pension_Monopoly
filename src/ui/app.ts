import { accountPayout, sourceBalances } from '../engine/account-engine';
import { balanceConfig, boardTiles, investorProfiles, learningCards, policyRules, products } from '../data/content';
import { applyGoalToGame, choosePayout, clampGoalMonthly, createGame, performAction, resolveActionAmount, resolveLifeEvent, setDefaultOption, startTurn, submitQuiz, type AmountPreset, type GameAction } from '../engine/game-engine';
import { getLifeEvent, getLearningCard } from '../engine/content-engine';
import { isDefaultOptionId, suggestDefaultOption } from '../engine/default-option';
import { finalQuizCards } from '../engine/quiz-engine';
import { renderDefaultOptionModal, defaultOptionName, defaultOptionProducts } from './default-option-view';
import { renderLifeModal } from './life-view';
import { renderLearnedBlock, renderQuizModal } from './quiz-view';
import { renderPayoutLine, renderPayoutModal } from './payout-view';
import { ACHIEVEMENTS, newlyUnlocked, recordCollection, resultShareText } from '../engine/achievements';
import { renderAchievementGallery, renderCollectionGallery, renderLifeResolvedStrip, renderNewAchievements, renderSeedLine, renderWeeklyButton } from './achievements-view';
import { portfolioValue, rebalanceShares, sellProduct, depositLots } from '../engine/portfolio-engine';
import { canBuyForProfile, contributionCredit, decideBuyAgainstRiskLimit, expectedRiskAfterBuy, equityExposureRatio, maxBuyWithinRiskLimit, riskAssetRatio, type BuyLimitDecision } from '../engine/policy-engine';
import { rebalanceGapLine } from '../engine/tile-effects';
import { heldProductIds, pickHeldProduct, tradeBlockReason } from './action-form';
import { randomSeed } from '../engine/random-engine';
import { emptyMarketStep } from '../engine/market-engine';
import { applyProfileToGame, profileFromScore } from '../engine/profile-engine';
import { pickTileBriefing } from '../engine/tile-briefing';
import { KNOWLEDGE_CAPS, calculateScore, knowledgeBreakdown, shortfallPlan, starChecklist, starLockReason } from '../engine/scoring-engine';
import type { AchievementId, ActionKind, DefaultOptionId, GameState, LifeChoice, PayoutChoice, ProfileId, ProductId, SaveData, TurnSummary } from '../types';
import { DICE_LAND_HOLD_MS, DICE_ROLL_DURATION_MS, canRevealNextTurn, dicePairForTurn, dicePairLabel, diceSteps, renderDiceMarkup, shouldSkipDiceAnimation } from './dice';
import { TOKEN_STEP_MS, boardViewFor, movePath, renderBoardMarkup } from './board';
import { hopPlan, renderTokenLayer, slideKeyframes } from './token3d';
import { buyNeedsContribution, renderHowToModal, renderSettingsHowToButton, shouldShowHowTo, shouldShowLearningTip } from './howto';
import { renderTileBriefing } from './tile-briefing';
import { renderNewsFlash } from './news-flash';
import { NUMBER_TWEEN_MS, animatedNumber, scaleMs, scenePace, speedScale } from './fx';
import { runNumberAnimations } from './fx-dom';
import { ghostMonthlyNow, renderGoalMeter, renderRiskMeter } from './hud';
import { renderGhostVerdict } from './ghost';
import { percent, renderMarketCard, renderMarketTimeline, renderSettingsEntry, renderTurnTrack, signedPercent } from './market-view';
import { loadSave, saveData } from './ui-state';
import { AUTO_SETTLE_MS, SETTLE_CTA_NEXT, canAutoSettle, renderSettlementModal } from './settlement';
import { avatarMood, renderAvatar, resultMood } from './avatars';
import { renderSpeech } from './speech';
import { settlementSound } from './sound';
import { SoundPlayer } from './sound-dom';
import { renderIrpSparkline, worstTurnLine } from './result-chart';

type Screen = 'title' | 'diagnosis' | 'goal' | 'game' | 'result';
type Modal = 'life' | 'action' | 'portfolio' | 'market' | 'cards' | 'settings' | 'howto' | 'news' | 'tile' | 'settle' | 'quiz' | 'payout' | 'default-option' | null;
/** 「그대로」는 확인 화면 없이 목록에서 바로 실행되므로 보기가 없다 */
type ActionView = 'menu' | Exclude<ActionKind, 'hold'>;
type CardsTab = 'cards' | 'achievements' | 'collection';

const questions = [
  { text: '노후자금까지 남은 투자기간은?', options: [['10년 미만', 1], ['10~20년', 2], ['20년 이상', 4]] },
  { text: '평가액이 일시적으로 하락한다면 감내 가능한 범위는?', options: [['5% 안팎', 1], ['10% 안팎', 2], ['20% 이상도 가능', 4]] },
  { text: '비상생활자금은 어느 정도 확보되어 있나요?', options: [['거의 없음', 1], ['3개월 정도', 2], ['6개월 이상', 4]] },
  { text: '투자상품이 10% 하락하면 어떻게 할 것 같나요?', options: [['대부분 매도', 1], ['상황을 점검하고 일부 조정', 2], ['장기계획에 따라 유지·분할매수', 4]] },
  { text: '노후자금 운용에서 더 중요한 것은?', options: [['원금 변동 최소화', 1], ['안정과 성장의 균형', 2], ['큰 변동을 감수한 성장', 4]] }
] as const;

const ACHIEVEMENT_COUNT = ACHIEVEMENTS.length;
const formatWon = (value: number) => `${Math.round(value).toLocaleString('ko-KR')}원`;
const formatShortWon = (value: number) => value >= 100_000_000
  ? `${(value / 100_000_000).toFixed(2)}억원`
  : `${Math.round(value / 10_000).toLocaleString('ko-KR')}만원`;
export class PensionRoadApp {
  private screen: Screen = 'title';
  private modal: Modal = null;
  private game: GameState | null = null;
  private save: SaveData = loadSave();
  private disclaimerChecked = this.save.disclaimerAccepted;
  private questionIndex = 0;
  private diagnosisScore = 0;
  private profileId: ProfileId = this.save.profileId;
  private goalMonthly = clampGoalMonthly(this.save.goalMonthly);
  private selectedBuy: ProductId = 'deposit';
  private selectedSell: ProductId = 'deposit';
  private switchFrom: ProductId = 'balanced';
  private switchTo: ProductId = 'shortBond';
  private amountPreset: AmountPreset = 'default';
  private buyLimitConfirm: Extract<BuyLimitDecision, { kind: 'confirm' }> | null = null;
  private lastSummary: TurnSummary | null = null;
  private actionView: ActionView = 'menu';
  private setupReturn: Screen = 'title';
  private tipDismissed = false;
  private feedback = '';
  private diceRolling = false;
  private tokenHopping = false;
  private tokenFocus = 0;
  private diceFaces: [number, number] = [1, 1];
  private diceTimer = 0;
  private shown: { seed: string; irp: number; pension: number; returnRate: number } | null = null;
  private readonly sound = new SoundPlayer(() => this.save.settings.sound);
  private landed = false;
  private starTimers: number[] = [];
  /** 직전 렌더에서 2.5D 말이 놓였던 칸. 이동 애니메이션의 출발점. */
  private tokenShown: number | null = null;
  /** 지금 화면에 뜬 퀴즈 카드와 고른 답. 마무리 퀴즈는 큐를 차례로 소비한다. */
  private quizCardId: string | null = null;
  private quizPicked: number | null = null;
  private finalQuizQueue: string[] = [];
  private finalQuizTotal = 0;
  /** 디폴트옵션 모달에서 눌러 둔 값(확정 전) */
  private defaultOptionPick: DefaultOptionId | null = null;
  private defaultOptionMode: 'start' | 'settings' = 'start';
  /** 판 시작 뒤 아직 디폴트옵션을 묻지 않았다(게임 방법 창 뒤에 묻는다) */
  private defaultOptionAsk = false;
  /** 12턴 정산을 닫은 뒤 마무리 퀴즈·수령 방식으로 가는 중 */
  private finishing = false;
  /** 정산 자동 진행 타이머. 0이면 예약 없음 */
  private autoSettleTimer = 0;
  /** 이번 판 결과 화면에서 새로 연 업적 */
  private newAchievements: AchievementId[] = [];
  private cardsTab: CardsTab = 'cards';
  /** 클립보드 복사가 막혔을 때 직접 복사할 수 있게 보이는 결과 텍스트 */
  private shareFallback = '';

  constructor(private readonly root: HTMLElement) {
    this.root.addEventListener('click', (event) => this.onClick(event));
    this.root.addEventListener('change', (event) => this.onChange(event));
    document.addEventListener('keydown', (event) => this.onKeydown(event));
    this.render();
  }

  private announce(message: string): void {
    this.feedback = message;
    const announcer = document.querySelector<HTMLElement>('#announcer');
    if (announcer) announcer.textContent = message;
  }

  private persist(progress = false): void {
    if (this.game && progress) {
      this.save.unlockedCards = [...new Set([...this.save.unlockedCards, ...this.game.unlockedCards])];
      this.save.lastSeed = this.game.seed;
    }
    saveData(this.save);
  }

  /**
   * 결과 화면에 들어설 때 한 번 판 수·컬렉션을 세고, 수령 방식을 바꿔 점수가 달라지면 최고 기록만 다시 맞춘다.
   * 업적은 두 경우 모두 다시 평가해 새로 연 것만 더한다(연금으로 바꾸면 「일시금 유혹 거절」이 열릴 수 있다).
   */
  private recordResult(countPlay: boolean): void {
    if (!this.game || this.game.status !== 'finished') return;
    const score = calculateScore(this.game);
    this.save.bestScore = Math.max(this.save.bestScore, score.totalScore);
    this.save.bestReturnRate = Math.max(this.save.bestReturnRate, score.returnRate);
    this.save.bestGoalRate = Math.max(this.save.bestGoalRate, score.goalRate);
    if (countPlay) {
      this.save.playCount += 1;
      this.save.collection = recordCollection(this.save.collection, this.game.profileId, score.stars);
      this.newAchievements = [];
    }
    const fresh = newlyUnlocked(this.save.achievements, this.game, this.save.collection);
    if (fresh.length) {
      this.save.achievements = [...this.save.achievements, ...fresh];
      this.newAchievements = [...this.newAchievements, ...fresh];
      this.scheduleAchievementSound(score.stars);
    }
    this.persist(true);
  }

  /** 새 업적 소리는 별 소리가 끝난 뒤 한 번 */
  private scheduleAchievementSound(stars: number): void {
    const instant = shouldSkipDiceAnimation(this.save.settings.reducedMotion, window.matchMedia('(prefers-reduced-motion: reduce)').matches);
    const delay = instant ? 0 : scaleMs(400 * (stars + 1) + 200, this.save.settings.speed);
    this.starTimers.push(window.setTimeout(() => this.sound.play('milestone'), delay));
  }

  /** 예약을 지우고, 열린 정산 창의 진행 막대·「자동 진행」 문구도 재렌더 없이(펼친 <details>·포커스를 지키려고) 걷는다 */
  private clearAutoSettle(): void {
    if (!this.autoSettleTimer) return;
    window.clearTimeout(this.autoSettleTimer);
    this.autoSettleTimer = 0;
    const cta = this.root.querySelector<HTMLElement>('.settle-cta.auto');
    if (!cta) return;
    cta.classList.remove('auto');
    cta.querySelector('.auto-bar')?.remove();
    const button = cta.querySelector('button');
    if (button) button.textContent = SETTLE_CTA_NEXT;
  }

  /** 설정이 켜져 있고 읽을 것이 없는 턴이면 2.5초 뒤 정산 창을 닫는다. 창 안을 누르면 취소 */
  private scheduleAutoSettle(summary: TurnSummary): void {
    this.clearAutoSettle();
    if (!this.save.settings.autoSettle || !this.game) return;
    if (!canAutoSettle(summary, this.game.status === 'finished')) return;
    this.autoSettleTimer = window.setTimeout(() => {
      this.autoSettleTimer = 0;
      if (this.modal !== 'settle') return;
      this.afterSettlement();
      this.render();
    }, AUTO_SETTLE_MS);
  }

  /** 결과 텍스트를 클립보드로. 막히면 아래에 텍스트를 펼쳐 직접 복사하게 한다 */
  private copyResult(): void {
    if (!this.game || this.game.status !== 'finished') return;
    const text = resultShareText(this.game, calculateScore(this.game), { newAchievements: this.newAchievements, url: `${location.origin}${location.pathname}` });
    const clipboard = typeof navigator !== 'undefined' ? navigator.clipboard : undefined;
    if (!clipboard?.writeText) {
      this.shareFallback = text;
      this.announce('클립보드를 쓸 수 없어 아래 텍스트를 직접 복사하세요.');
      this.render();
      return;
    }
    clipboard.writeText(text).then(() => {
      this.shareFallback = '';
      this.announce('결과를 복사했습니다. 붙여 넣어 공유하세요.');
      this.render();
    }).catch(() => {
      this.shareFallback = text;
      this.announce('클립보드를 쓸 수 없어 아래 텍스트를 직접 복사하세요.');
      this.render();
    });
  }

  private onChange(event: Event): void {
    const target = event.target;
    if (!(target instanceof HTMLInputElement || target instanceof HTMLSelectElement)) return;
    if (target.id === 'disclaimer' && target instanceof HTMLInputElement) this.disclaimerChecked = target.checked;
    if (target.id === 'goal-range') this.goalMonthly = Number(target.value);
    if (target.id === 'buy-product') {
      this.selectedBuy = target.value as ProductId;
      this.buyLimitConfirm = null;
    }
    if (target.id === 'sell-product') this.selectedSell = target.value as ProductId;
    if (target.id === 'switch-from') this.switchFrom = target.value as ProductId;
    if (target.id === 'switch-to') this.switchTo = target.value as ProductId;
    if (target.id === 'reduced-motion' && target instanceof HTMLInputElement) {
      this.save.settings.reducedMotion = target.checked;
      document.documentElement.dataset.reduceMotion = String(target.checked);
      this.persist();
    }
    if (target.id === 'characters' && target instanceof HTMLInputElement) {
      this.save.settings.characters = target.checked;
      this.persist();
    }
    if (target.id === 'ghost' && target instanceof HTMLInputElement) {
      this.save.settings.ghost = target.checked;
      this.persist();
    }
    if (target.id === 'sound' && target instanceof HTMLInputElement) {
      this.setSound(target.checked);
    }
    if (target.id === 'speed' && target instanceof HTMLInputElement) {
      this.save.settings.speed = target.checked ? 2 : 1;
      this.persist();
      this.announce(target.checked ? '애니메이션 속도 2× · 주사위·말·숫자·속보·정산 연출이 절반 길이입니다.' : '애니메이션 속도 1×.');
    }
    if (target.id === 'auto-settle' && target instanceof HTMLInputElement) {
      this.save.settings.autoSettle = target.checked;
      this.persist();
      this.announce(target.checked ? '정산 자동 진행 켬 · 평범한 턴은 2.5초 뒤 다음 턴으로 넘어갑니다. 충격·이정표·사건·마지막 턴은 직접 넘깁니다.' : '정산 자동 진행 끔.');
    }
    this.render();
  }

  private onClick(event: Event): void {
    const button = (event.target as HTMLElement).closest<HTMLElement>('[data-action]');
    if (!button) return;
    const action = button.dataset.action;
    if (!action) return;
    this.sound.unlock();
    if (action === 'toggle-sound') {
      this.setSound(!this.save.settings.sound);
      this.render();
      return;
    }
    if ((this.diceRolling || this.tokenHopping) && action !== 'to-title') return;
    // 정산 창 안을 누르면(자세히 펼치기 포함) 자동 진행을 멈추고 읽을 시간을 준다.
    if (this.modal === 'settle') this.clearAutoSettle();

    if (action === 'begin' && this.canStart()) {
      this.save.disclaimerAccepted = true;
      this.disclaimerChecked = true;
      this.persist();
      this.startGame(randomSeed());
    } else if (action === 'weekly-seed' && this.canStart()) {
      this.save.disclaimerAccepted = true;
      this.disclaimerChecked = true;
      this.persist();
      this.startGame(button.dataset.seed || randomSeed());
    } else if (action === 'copy-result') {
      this.copyResult();
      return;
    } else if (action === 'cards-tab') {
      const tab = button.dataset.tab;
      this.cardsTab = tab === 'achievements' || tab === 'collection' ? tab : 'cards';
    } else if (action === 'answer') {
      this.diagnosisScore += Number(button.dataset.score ?? 0);
      this.questionIndex += 1;
      if (this.questionIndex >= questions.length) {
        this.profileId = profileFromScore(this.diagnosisScore);
        this.save.profileId = this.profileId;
        if (this.game) {
          this.game = applyProfileToGame(this.game, this.profileId);
          // 성향이 낮아져 디폴트옵션이 허용 밖이 되면 엔진이 추천값으로 바꾼다. 저장값도 따라간다.
          if (this.game.defaultOption) {
            this.game = setDefaultOption(this.game, this.game.defaultOption);
            this.save.defaultOption = this.game.defaultOption;
          }
        }
        this.persist();
        this.screen = this.setupReturn === 'game' && this.game ? 'game' : 'title';
        this.announce(`성향이 ${investorProfiles.find((item) => item.id === this.profileId)?.name ?? ''}으로 반영되었습니다.`);
      }
    } else if (action === 'goal-next') {
      this.save.goalMonthly = clampGoalMonthly(this.goalMonthly);
      this.goalMonthly = this.save.goalMonthly;
      if (this.game) this.game = applyGoalToGame(this.game, this.goalMonthly);
      this.persist();
      this.screen = this.setupReturn === 'game' && this.game ? 'game' : 'title';
      this.announce(`월 연금 목표 ${formatWon(this.goalMonthly)}이 지금 판에 반영되었습니다.`);
    } else if (action === 'roll-dice') {
      this.beginDiceRoll();
      return;
    } else if (action === 'open-action' && this.game?.awaitingAction) {
      this.actionView = 'menu';
      this.amountPreset = 'default';
      this.modal = 'action';
    } else if (action === 'action-view') {
      this.actionView = (button.dataset.view as ActionView) || 'menu';
      this.buyLimitConfirm = null;
    } else if (action === 'amount-preset') {
      this.amountPreset = (button.dataset.preset as AmountPreset) || 'default';
      this.buyLimitConfirm = null;
    } else if (action === 'resolve-life') {
      this.resolveLife(button.dataset.choice as LifeChoice | undefined);
    } else if (action === 'pick-default-option') {
      if (isDefaultOptionId(button.dataset.option)) this.defaultOptionPick = button.dataset.option;
    } else if (action === 'confirm-default-option') {
      this.applyDefaultOptionChoice(this.defaultOptionPick ?? this.save.defaultOption ?? (this.game ? suggestDefaultOption(this.game.profileId) : null));
    } else if (action === 'skip-default-option') {
      this.applyDefaultOptionChoice(null);
    } else if (action === 'open-default-option') {
      this.defaultOptionMode = 'settings';
      this.defaultOptionPick = this.game?.defaultOption ?? this.save.defaultOption;
      this.modal = 'default-option';
    } else if (action === 'quiz-pick') {
      this.pickQuiz(Number(button.dataset.option));
    } else if (action === 'quiz-skip') {
      this.skipQuiz();
    } else if (action === 'quiz-next') {
      this.nextQuiz();
    } else if (action === 'choose-payout') {
      this.pickPayout(button.dataset.choice === 'lumpSum' ? 'lumpSum' : 'annuity20');
    } else if (action === 'open-payout') {
      if (this.game?.status === 'finished') this.modal = 'payout';
    } else if (action === 'resume-finish') {
      if (this.finishing) this.modal = this.quizCardId ? 'quiz' : 'payout';
      else this.afterSettlement();
    } else if (action === 'do-contribute') {
      this.runAction({ kind: 'contribute', amount: this.currentAmount('contribute') });
    } else if (action === 'do-buy') {
      this.requestBuy();
    } else if (action === 'confirm-buy-cap') {
      if (this.buyLimitConfirm) {
        const capped = this.buyLimitConfirm.capped;
        this.buyLimitConfirm = null;
        this.runAction({ kind: 'buy', productId: this.selectedBuy, amount: capped });
      }
    } else if (action === 'cancel-buy-cap') {
      this.buyLimitConfirm = null;
      this.announce('한도 초과 매수를 보류했습니다. 금액이나 상품을 바꿔 다시 고를 수 있습니다.');
    } else if (action === 'do-sell') {
      this.runAction({ kind: 'sell', productId: this.selectedSell, amount: this.currentAmount('sell', this.selectedSell) });
    } else if (action === 'do-switch') {
      this.runAction({ kind: 'switch', fromProductId: this.switchFrom, toProductId: this.switchTo, amount: this.currentAmount('switch', this.switchFrom) });
    } else if (action === 'do-rebalance') {
      this.runAction({ kind: 'rebalance' });
    } else if (action === 'do-hold') {
      this.runAction({ kind: 'hold' });
    } else if (action === 'dismiss-settle') {
      this.afterSettlement();
    } else if (action === 'open-portfolio') {
      this.modal = 'portfolio';
    } else if (action === 'open-market') {
      this.modal = 'market';
    } else if (action === 'open-cards') {
      this.cardsTab = (button.dataset.tab as CardsTab | undefined) ?? 'cards';
      this.modal = 'cards';
    } else if (action === 'open-settings') {
      this.modal = 'settings';
    } else if (action === 'open-howto') {
      this.modal = 'howto';
    } else if (action === 'dismiss-howto') {
      this.afterHowTo();
    } else if (action === 'dismiss-tile') {
      this.afterTileBriefing();
    } else if (action === 'dismiss-news') {
      this.afterNews();
    } else if (action === 'open-tile') {
      this.modal = 'tile';
    } else if (action === 'open-diagnosis') {
      this.clearDiceTimer();
      this.diceRolling = false;
      this.tokenHopping = false;
      this.setupReturn = this.game ? 'game' : 'title';
      this.questionIndex = 0;
      this.diagnosisScore = 0;
      this.modal = null;
      this.screen = 'diagnosis';
    } else if (action === 'open-goal') {
      this.clearDiceTimer();
      this.diceRolling = false;
      this.tokenHopping = false;
      this.setupReturn = this.game ? 'game' : 'title';
      this.modal = null;
      this.screen = 'goal';
    } else if (action === 'dismiss-tip') {
      this.tipDismissed = true;
    } else if (action === 'close-modal') {
      this.closeModal();
    } else if (action === 'same-seed') {
      this.startGame((this.game?.seed ?? this.save.lastSeed) || randomSeed());
    } else if (action === 'new-seed') {
      this.startGame(randomSeed());
    } else if (action === 'to-title') {
      this.clearDiceTimer();
      this.clearAutoSettle();
      this.screen = 'title'; this.modal = null; this.game = null; this.tipDismissed = false; this.diceRolling = false; this.tokenHopping = false;
      this.finishing = false; this.defaultOptionAsk = false; this.finalQuizQueue = []; this.quizCardId = null;
      this.newAchievements = []; this.shareFallback = '';
    }
    this.render();
  }

  /** ×·Esc로 닫을 수 없는 창: 결정을 요구하는 것들. 퀴즈는 「건너뛰기」, 디폴트옵션은 「지정 안 함」이 있다 */
  private static readonly STICKY_MODALS: Modal[] = ['life', 'action', 'quiz', 'payout', 'default-option'];

  private closeModal(): void {
    if (PensionRoadApp.STICKY_MODALS.includes(this.modal)) return;
    if (this.modal === 'howto') this.afterHowTo();
    else if (this.modal === 'tile') this.afterTileBriefing();
    else if (this.modal === 'news') this.afterNews();
    else this.modal = null;
  }

  /** 게임 방법 창 뒤: 판 시작이면 디폴트옵션을 묻고, 설정에서 열었으면 그냥 닫는다 */
  private afterHowTo(): void {
    this.markHowToSeen();
    this.modal = null;
    if (this.defaultOptionAsk && this.game) this.openDefaultOptionAtStart();
  }

  private openDefaultOptionAtStart(): void {
    if (!this.game) return;
    this.defaultOptionMode = 'start';
    this.defaultOptionPick = this.save.defaultOption;
    this.modal = 'default-option';
  }

  /** 디폴트옵션 확정(null이면 해제). 저장과 지금 판에 함께 반영한다 */
  private applyDefaultOptionChoice(choice: DefaultOptionId | null): void {
    if (this.game) this.game = setDefaultOption(this.game, choice);
    const applied = this.game ? this.game.defaultOption : choice;
    this.save.defaultOption = applied;
    this.defaultOptionAsk = false;
    this.defaultOptionPick = applied;
    this.persist(true);
    const name = defaultOptionName(applied);
    this.announce(applied
      ? `디폴트옵션 ${name}(${defaultOptionProducts(applied)}). 「이번엔 그대로」를 고르면 대기자금이 이 상품으로 자동 매수됩니다.`
      : '디폴트옵션을 지정하지 않았습니다. 대기자금은 직접 매수해야 합니다.');
    this.modal = this.defaultOptionMode === 'settings' ? 'settings' : null;
  }

  /** 생활사건 3지선다. 성공하면 행동 창(또는 남은 일 없음)으로, 실패하면 이유를 알리고 창을 유지한다 */
  private resolveLife(choice: LifeChoice | undefined): void {
    if (!this.game || !choice) return;
    const result = resolveLifeEvent(this.game, choice);
    this.game = result.state;
    this.announce(result.message);
    if (!result.ok) return;
    if (choice === 'withdraw' || choice === 'deposit') this.sound.play('down');
    else if (choice === 'transfer-irp' || choice.startsWith('contribute')) this.sound.play('up');
    this.modal = this.game.awaitingAction ? 'action' : null;
    this.persist(true);
  }

  /** 속보(또는 칸 설명)를 닫은 뒤: 퀴즈 → 생활사건 → 행동 대기 순서 */
  private afterMarketScene(): void {
    if (!this.game) { this.modal = null; return; }
    if (this.game.pendingQuizCardId && !this.game.quizLog.some((record) => record.cardId === this.game!.pendingQuizCardId)) {
      this.openQuiz(this.game.pendingQuizCardId);
      return;
    }
    this.modal = this.game.currentEventId ? 'life' : null;
  }

  private openQuiz(cardId: string): void {
    this.quizCardId = cardId;
    this.quizPicked = null;
    this.modal = 'quiz';
    this.announce(`퀴즈 · ${getLearningCard(cardId)?.title ?? ''} 카드에서 한 문제. 오답은 벌점이 없습니다.`);
  }

  private pickQuiz(option: number): void {
    if (!this.game || !this.quizCardId || this.quizPicked !== null || !Number.isInteger(option)) return;
    const result = submitQuiz(this.game, this.quizCardId, option);
    this.game = result.state;
    this.announce(result.message);
    if (!result.ok) return;
    this.quizPicked = option;
    this.sound.play(result.correct ? 'up' : 'down');
    this.persist(true);
  }

  /** 건너뛰기: 이 카드는 이번 판에 답하지 않은 채로 남고(마무리 퀴즈에 다시 나올 수 있다) 다음 장면으로 */
  private skipQuiz(): void {
    if (!this.game) return;
    if (this.game.pendingQuizCardId === this.quizCardId) this.game = { ...this.game, pendingQuizCardId: null };
    this.announce('이번 문제는 건너뛰었습니다.');
    this.nextQuiz();
  }

  /** 답하거나 건너뛴 뒤. 마무리 중이면 다음 문항 또는 수령 방식, 턴 중이면 생활사건 또는 행동 대기 */
  private nextQuiz(): void {
    this.quizCardId = null;
    this.quizPicked = null;
    if (this.finishing) {
      const next = this.finalQuizQueue.shift();
      if (next) { this.openQuiz(next); return; }
      this.modal = 'payout';
      this.announce('마지막 결정입니다. 연금(20년)과 일시금 중 수령 방식을 고르세요. 결과 화면에서 다시 바꿀 수 있습니다.');
      return;
    }
    this.modal = this.game?.currentEventId ? 'life' : null;
  }

  /** 정산 창 닫기. 12턴이면 마무리(퀴즈 최대 3문항 → 수령 방식 → 결과) */
  private afterSettlement(): void {
    this.clearAutoSettle();
    if (!this.game || this.game.status !== 'finished') { this.modal = null; return; }
    this.finishing = true;
    this.finalQuizQueue = finalQuizCards(this.game).map((card) => card.id);
    this.finalQuizTotal = this.finalQuizQueue.length;
    this.nextQuiz();
  }

  /** 수령 방식 결정. 마무리 중이면 결과 화면으로, 결과 화면에서 다시 고른 것이면 창만 닫는다 */
  private pickPayout(choice: PayoutChoice): void {
    if (!this.game) return;
    const result = choosePayout(this.game, choice);
    this.game = result.state;
    this.announce(result.message);
    if (!result.ok) return;
    this.modal = null;
    if (this.finishing || this.screen !== 'result') {
      this.finishing = false;
      this.screen = 'result';
      this.recordResult(true);
      this.scheduleStarSounds(calculateScore(this.game).stars);
      return;
    }
    this.recordResult(false);
  }

  private setSound(on: boolean): void {
    this.save.settings.sound = on;
    this.persist();
    if (on) {
      this.sound.unlock();
      this.sound.play('arrive');
    }
    this.announce(on ? '효과음을 켰습니다.' : '효과음을 껐습니다.');
  }

  private canStart(): boolean {
    return this.save.disclaimerAccepted || this.disclaimerChecked;
  }

  private currentAmount(kind: ActionKind, productId?: ProductId): number {
    if (!this.game) return 0;
    return resolveActionAmount(this.game, kind, this.amountPreset, productId);
  }

  private switchPreview(amount: number): string {
    const from = products.find((item) => item.id === this.switchFrom);
    const fundNote = from?.kind === 'fund' ? ' 펀드 환매대금은 다음 턴에 새 매수로 이어질 수 있습니다.' : '';
    if (!this.game || !from || from.kind === 'fund') {
      return `${formatWon(amount)} 교체. 위험한도를 넘으면 한도까지만 사고 나머지는 대기자금으로 남습니다.${fundNote}`;
    }
    const sold = sellProduct(this.game, this.switchFrom, amount);
    if (!sold.ok) return `${formatWon(amount)} 교체.`;
    const affordable = Math.min(amount, sold.state.irpCash);
    const cap = maxBuyWithinRiskLimit(sold.state, this.switchTo, affordable);
    if (cap < affordable) {
      return `${formatWon(amount)} 매도 후 위험한도까지 ${formatWon(cap)}만 사고, 나머지 ${formatWon(Math.max(0, sold.state.irpCash - cap))}는 대기자금으로 남습니다.`;
    }
    const to = products.find((item) => item.id === this.switchTo);
    if (to?.kind === 'fund') {
      return `${formatWon(amount)} 교체. 매도 후 새 상품 주문을 접수하고 다음 턴에 잔고에 반영합니다.`;
    }
    return `${formatWon(amount)} 교체. 매도 후 새 상품을 바로 삽니다.`;
  }

  private requestBuy(): void {
    if (!this.game) return;
    const amount = this.currentAmount('buy', this.selectedBuy);
    const decision = decideBuyAgainstRiskLimit(this.game, this.selectedBuy, amount);
    if (decision.kind === 'confirm') {
      this.buyLimitConfirm = decision;
      this.announce(decision.message);
      this.render();
      return;
    }
    if (decision.kind === 'reject') {
      this.announce(decision.message);
      this.render();
      return;
    }
    this.runAction({ kind: 'buy', productId: this.selectedBuy, amount: decision.amount });
  }

  private runAction(action: GameAction): void {
    if (!this.game) return;
    const result = performAction(this.game, action);
    this.game = result.state;
    this.announce(result.message);
    if (!result.ok) return;
    this.actionView = 'menu';
    this.amountPreset = 'default';
    this.buyLimitConfirm = null;
    this.tipDismissed = false;
    if (this.game.awaitingAction && !result.summary) {
      // 운용지시 칸: 행동이 남아 있어 턴이 열려 있다. 시트를 메뉴로 되돌리고 남은 횟수를 알린다.
      this.modal = 'action';
      this.persist(true);
      return;
    }
    this.lastSummary = result.summary ?? null;
    // 12턴째도 정산 창을 먼저 보인다. 닫으면 마무리 퀴즈 → 수령 방식 → 결과로 이어진다(afterSettlement).
    this.modal = result.summary ? 'settle' : null;
    if (result.summary) {
      const cheer = result.summary.milestones.some((milestone) => milestone.tone === 'cheer');
      const cue = cheer ? 'milestone' : settlementSound(result.summary.irpOpen, result.summary.irpAfter, result.summary.shock);
      if (cue) this.sound.play(cue);
      this.scheduleAutoSettle(result.summary);
    }
    this.persist(true);
  }

  /** 별이 0.4초 간격으로 하나씩 뜨는 동안 같은 박자로 소리를 낸다. */
  private scheduleStarSounds(stars: number): void {
    this.starTimers.forEach((timer) => window.clearTimeout(timer));
    this.starTimers = [];
    const instant = shouldSkipDiceAnimation(this.save.settings.reducedMotion, window.matchMedia('(prefers-reduced-motion: reduce)').matches);
    for (let index = 0; index < stars; index += 1) {
      this.starTimers.push(window.setTimeout(() => this.sound.play('star'), instant ? 0 : scaleMs(400 * (index + 1), this.save.settings.speed)));
    }
  }

  private clearDiceTimer(): void {
    if (this.diceTimer) window.clearTimeout(this.diceTimer);
    this.diceTimer = 0;
  }

  private beginDiceRoll(): void {
    if (!this.game || this.diceRolling || this.tokenHopping || !canRevealNextTurn(this.game)) return;
    this.diceFaces = dicePairForTurn(this.game.seed, this.game.turn);
    const steps = diceSteps(this.diceFaces);
    const origin = this.game.position;
    const label = dicePairLabel(this.diceFaces[0], this.diceFaces[1]);
    const speed = this.save.settings.speed;
    this.modal = null;

    const reveal = (): void => {
      if (!this.game) return;
      const next = startTurn(this.game, steps);
      this.game = next.state;
      this.diceRolling = false;
      this.tokenHopping = false;
      this.tokenFocus = this.game.position;
      this.landed = false;
      this.modal = 'news';
      this.announce(`${label} 이동 · ${next.message}`);
      this.persist(true);
      this.sound.play(this.game.lastMarket.shock ? 'shock' : 'news');
      if (this.game.tileEffects.some((effect) => effect.kind === 'tax-refund' && (effect.amount ?? 0) > 0)) {
        window.setTimeout(() => this.sound.play('refund'), scaleMs(450, speed));
      }
      this.render();
    };

    const hop = (): void => {
      if (!this.game) return;
      const path = movePath(origin, steps);
      this.diceRolling = false;
      this.tokenHopping = true;
      this.tokenFocus = origin;
      this.announce(`${label} 이동합니다`);
      this.render();
      let index = 0;
      const tick = (): void => {
        if (!this.game || !this.tokenHopping) return;
        this.tokenFocus = path[index];
        this.announce(`${index + 1}/${steps}칸`);
        const last = index + 1 >= path.length;
        if (last) this.landed = true;
        this.sound.play(last ? 'arrive' : 'hop');
        this.render();
        index += 1;
        if (index >= path.length) {
          this.diceTimer = window.setTimeout(reveal, hopPlan(true, speedScale(speed)).duration);
          return;
        }
        this.diceTimer = window.setTimeout(tick, scaleMs(TOKEN_STEP_MS, speed));
      };
      this.diceTimer = window.setTimeout(tick, scaleMs(TOKEN_STEP_MS, speed));
    };

    if (shouldSkipDiceAnimation(
      this.save.settings.reducedMotion,
      window.matchMedia('(prefers-reduced-motion: reduce)').matches
    )) {
      reveal();
      return;
    }

    this.diceRolling = true;
    this.sound.play('dice');
    this.announce('주사위를 굴리는 중');
    this.render();
    this.clearDiceTimer();
    this.diceTimer = window.setTimeout(() => {
      const overlay = this.root.querySelector('.dice-overlay');
      overlay?.querySelectorAll('.dice').forEach((die) => {
        die.classList.remove('rolling', 'alt');
        die.classList.add('landed');
      });
      if (overlay) {
        overlay.setAttribute('aria-label', `주사위 결과 ${label}`);
        const caption = overlay.querySelector('p');
        if (caption) caption.textContent = `${label} 이동합니다`;
      }
      this.diceTimer = window.setTimeout(hop, scaleMs(DICE_LAND_HOLD_MS, speed));
    }, scaleMs(DICE_ROLL_DURATION_MS, speed));
  }

  private startGame(seed: string): void {
    this.clearDiceTimer();
    // 저장된 디폴트옵션으로 판을 만들고, 시작 모달에서 다시 확인·변경한다(성향 밖 값은 엔진이 추천값으로 바꾼다).
    this.game = createGame(seed, this.profileId, this.goalMonthly, { defaultOption: this.save.defaultOption });
    this.selectedBuy = 'deposit';
    this.selectedSell = 'deposit';
    this.switchFrom = 'balanced';
    this.switchTo = 'shortBond';
    this.screen = 'game';
    this.actionView = 'menu';
    this.tipDismissed = false;
    this.diceRolling = false;
    this.tokenHopping = false;
    this.tokenFocus = 0;
    this.finishing = false;
    this.finalQuizQueue = [];
    this.quizCardId = null;
    this.quizPicked = null;
    this.defaultOptionAsk = true;
    this.clearAutoSettle();
    this.newAchievements = [];
    this.shareFallback = '';
    this.persist(true);
    if (shouldShowHowTo(this.save.howtoSeen)) {
      this.modal = 'howto';
      this.announce('한 턴은 주사위, 시장 확인, 운용 지시 순서로 진행됩니다.');
      return;
    }
    this.openDefaultOptionAtStart();
    this.announce('먼저 디폴트옵션을 정하세요. 「이번엔 그대로」를 고르면 대기자금이 이 옵션으로 운용됩니다.');
  }

  private markHowToSeen(): void {
    if (this.save.howtoSeen) return;
    this.save.howtoSeen = true;
    this.persist();
  }

  private afterTileBriefing(): void {
    this.afterMarketScene();
  }

  private afterNews(): void {
    this.afterMarketScene();
  }

  private onKeydown(event: KeyboardEvent): void {
    if (event.key === 'Escape' && this.modal && !PensionRoadApp.STICKY_MODALS.includes(this.modal)) {
      this.closeModal();
      this.render();
      return;
    }
    if (event.key !== 'Tab' || !this.modal) return;
    const dialog = this.root.querySelector<HTMLElement>('[role="dialog"]');
    if (!dialog) return;
    const focusables = [...dialog.querySelectorAll<HTMLElement>('button:not([disabled]), select, input:not([disabled]), a[href]')];
    if (!focusables.length) return;
    const first = focusables[0];
    const last = focusables[focusables.length - 1];
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
  }

  private render(): void {
    document.documentElement.dataset.reduceMotion = String(this.save.settings.reducedMotion);
    document.documentElement.dataset.speed = String(this.save.settings.speed);
    const existingOverlay = this.diceRolling ? this.root.querySelector('.dice-overlay') : null;
    const screenHtml = this.screen === 'title' ? this.renderTitle()
      : this.screen === 'diagnosis' ? this.renderDiagnosis()
        : this.screen === 'goal' ? this.renderGoal()
          : this.screen === 'game' ? this.renderGame()
            : this.renderResult();
    this.root.innerHTML = `<main id="main" class="app-shell">${screenHtml}</main>${this.renderModal()}`;
    if (this.diceRolling) {
      if (existingOverlay) this.root.appendChild(existingOverlay);
      else this.root.insertAdjacentHTML('beforeend', renderDiceMarkup(this.diceFaces, true, scaleMs(DICE_ROLL_DURATION_MS, this.save.settings.speed)));
      const main = this.root.querySelector('#main');
      main?.setAttribute('aria-hidden', 'true');
      main?.setAttribute('inert', '');
    }
    const dialog = this.root.querySelector<HTMLElement>('[role="dialog"]');
    if (dialog) requestAnimationFrame(() => dialog.querySelector<HTMLElement>('button:not([disabled]), select, input:not([disabled]), a[href]')?.focus());
    const instant = shouldSkipDiceAnimation(this.save.settings.reducedMotion, window.matchMedia('(prefers-reduced-motion: reduce)').matches);
    runNumberAnimations(this.root, instant, scaleMs(NUMBER_TWEEN_MS, this.save.settings.speed));
    this.animateToken(instant);
    // <details>의 toggle은 버블링하지 않아 여기서 붙인다. 펼침 상태를 기억하고, 펼치면 자동 진행을 멈춘다.
    this.root.querySelector<HTMLDetailsElement>('details.settle-more')?.addEventListener('toggle', (event) => {
      const open = (event.target as HTMLDetailsElement).open;
      if (this.save.settings.settleExpanded !== open) {
        this.save.settings.settleExpanded = open;
        this.persist();
      }
      if (open) this.clearAutoSettle();
    });
  }

  private renderTitle(): string {
    const needsDisclaimer = !this.save.disclaimerAccepted;
    return `<section class="title-screen">
      <div class="eyebrow">시장을 보고 움직이는 12턴</div>
      <div class="title-mark" aria-hidden="true"><span>12</span><small>TURNS</small></div>
      <h1>연금로드</h1><p class="subtitle">12턴의 은퇴설계</p>
      <p class="lead">가상 퇴직연금으로 시장 국면을 읽고<br>매매·리밸런싱해 목표 월 연금에 도전하세요.</p>
      ${needsDisclaimer ? `<div class="disclaimer-check">
        <input id="disclaimer" type="checkbox" ${this.disclaimerChecked ? 'checked' : ''}>
        <label for="disclaimer"><strong>교육용 단순화에 동의합니다.</strong><br>실제 투자 권유가 아니며 수익·원금을 보장하지 않습니다.</label>
      </div>` : ''}
      <button class="primary jumbo" data-action="begin" ${this.canStart() ? '' : 'disabled'}>바로 시작</button>
      ${this.canStart() ? renderWeeklyButton() : ''}
      <div class="utility-row">
        <button class="text-button" data-action="open-cards" data-tab="cards">학습 카드 <span class="badge">${this.save.unlockedCards.length}</span></button>
        <button class="text-button" data-action="open-cards" data-tab="achievements">업적 <span class="badge">${this.save.achievements.length}/${ACHIEVEMENT_COUNT}</span></button>
        <button class="text-button" data-action="open-settings">면책 · 출처 · 설정</button>
      </div>
      <p class="manual-links"><a href="./user-manual.html" target="_blank" rel="noreferrer">사용자 매뉴얼</a> · <a href="./operator-manual.html" target="_blank" rel="noreferrer">운영자 매뉴얼</a></p>
      <p class="record">최고 달성률 <strong>${Math.round(this.save.bestGoalRate * 100)}%</strong> · 최고 수익률 <strong>${signedPercent(this.save.bestReturnRate)}</strong> · ${this.save.bestScore}점 · ${this.save.playCount}판</p>
    </section>`;
  }

  private renderDiagnosis(): string {
    const question = questions[this.questionIndex];
    return `<section class="setup-screen narrow">
      <header class="step-header"><span>투자자성향 진단</span><strong>${this.questionIndex + 1} / 5</strong></header>
      <div class="progress" aria-label="진행률 ${this.questionIndex + 1}/5"><i style="width:${(this.questionIndex + 1) * 20}%"></i></div>
      <p class="eyebrow">정답은 없습니다 · 결과는 바로 반영됩니다</p><h1>${question.text}</h1>
      <div class="choice-stack">${question.options.map(([label, score], index) => `<button data-action="answer" data-score="${score}"><span class="choice-index">${String.fromCharCode(65 + index)}</span>${label}<span aria-hidden="true">→</span></button>`).join('')}</div>
      <p class="hint">입력 내용은 브라우저 밖으로 전송되지 않습니다.</p>
    </section>`;
  }

  private renderGoal(): string {
    const profile = investorProfiles.find((item) => item.id === this.profileId)!;
    return `<section class="setup-screen narrow">
      <div class="profile-stamp">${profile.name}</div>
      <h1>월 연금 목표를 정하세요</h1>
      <p>${profile.description} 성향은 서열이 아니라 감당 가능한 변동을 확인하는 기준입니다.</p>
      <div class="goal-display"><small>목표 월 연금</small><strong>${formatWon(this.goalMonthly)}</strong></div>
      <label class="sr-only" for="goal-range">월 연금 목표</label>
      <input id="goal-range" type="range" min="${balanceConfig.minGoal}" max="${balanceConfig.maxGoal}" step="50000" value="${this.goalMonthly}">
      <div class="range-labels"><span>${formatWon(balanceConfig.minGoal)}</span><span>${formatWon(balanceConfig.maxGoal)}</span></div>
      <div class="assumption"><strong>게임 계산 가정</strong><span>최종 IRP 평가액 ÷ ${policyRules.receivingMonths}개월</span><span>세전 · 물가/수령 중 수익 미반영</span></div>
      <button class="primary jumbo" data-action="goal-next">이 목표 저장</button>
    </section>`;
  }

  private renderBoard(state: GameState, waiting: boolean): string {
    const view = boardViewFor(state, { tokenHopping: this.tokenHopping, tokenFocus: this.tokenFocus, landed: this.landed });
    const characters = this.save.settings.characters;
    const mood = avatarMood(state, calculateScore(state).goalMet);
    return `<div class="board-stage">
      ${renderBoardMarkup(state, waiting, { ...view, characters, mood, tokenInSvg: false })}
      ${renderTokenLayer(state, { index: view.focusIndex ?? state.position, characters, mood })}
    </div>`;
  }

  /**
   * render()가 innerHTML을 갈아 끼우므로 CSS transition·클래스 키프레임은 쓸 수 없다. 대신 새로 만들어진
   * 말 노드에 직전 칸 → 현재 칸 점프 한 번(hopPlan)을 Web Animations API로 붙인다. 칸이 바뀐 모든 렌더가
   * 첫 칸부터 마지막 칸까지 같은 점프를 쓰고, 마지막 칸만 착지 찌그러짐이 더 크고 길다. 동작 줄이기면 즉시 놓인다.
   */
  private animateToken(instant: boolean): void {
    const pos = this.root.querySelector<HTMLElement>('.token-pos');
    const puck = pos?.querySelector<HTMLElement>('.token3d');
    if (!pos || !puck || !this.game) {
      this.tokenShown = null;
      return;
    }
    const index = Number(pos.dataset.index);
    const from = this.tokenShown;
    this.tokenShown = index;
    if (from === null || from === index || instant || !this.tokenHopping) return;
    if (typeof pos.animate !== 'function') return;
    const plan = hopPlan(this.landed, speedScale(this.save.settings.speed));
    pos.animate(slideKeyframes(from, index, plan.land), { duration: plan.duration });
    pos.querySelector<HTMLElement>('.token-shadow')?.animate(plan.shadow, { duration: plan.duration });
    puck.animate(plan.puck, { duration: plan.duration });
  }

  private renderGameCta(state: GameState): string {
    if (this.diceRolling) {
      return `<button class="dice-button" disabled><span>⚄</span>주사위 굴리는 중</button>`;
    }
    if (this.tokenHopping) {
      return `<button class="dice-button" disabled><span>↗</span>이동 중</button>`;
    }
    if (state.status === 'finished') {
      // 창을 잃어도 막히지 않게: 누르면 마무리(퀴즈·수령 방식)를 이어 간다.
      return `<button class="dice-button ready" data-action="resume-finish"><span>★</span>마무리 · 수령 방식 정하기</button>`;
    }
    if (canRevealNextTurn(state)) {
      return `<button class="dice-button ready" data-action="roll-dice"><span>⚄</span>주사위 굴리기</button>`;
    }
    if (state.currentEventId) {
      return `<button class="dice-button" disabled><span>♥</span>생활사건 해결 중</button>`;
    }
    if (state.awaitingAction) {
      const done = state.turnActionLines.length;
      const label = done ? `행동 ${done + 1}/${done + state.actionsLeft} 하기` : '이번 턴 운용하기';
      return `<button class="dice-button" data-action="open-action"><span>↗</span>${label}</button>`;
    }
    return `<button class="dice-button" disabled><span>↗</span>정산 중</button>`;
  }

  private renderGame(): string {
    if (!this.game) return '';
    const state = this.game;
    const score = calculateScore(state);
    const shown = this.shown?.seed === state.seed ? this.shown : null;
    this.shown = { seed: state.seed, irp: score.irpValue, pension: score.monthlyPension, returnRate: score.returnRate };
    const pending = state.pendingOrders.length;
    const latestCard = getLearningCard(state.unlockedCards.at(-1) ?? '');
    const waitingForDice = canRevealNextTurn(state) || this.diceRolling || this.tokenHopping;
    const profile = investorProfiles.find((item) => item.id === state.profileId);
    const learningTip = shouldShowLearningTip(state, this.tipDismissed, waitingForDice) && latestCard
      ? `<p class="card-tip"><strong>${latestCard.title}</strong>${latestCard.key}<button class="text-button" data-action="dismiss-tip">닫기</button></p>`
      : '';
    return `<section class="game-screen">
      <header class="game-topbar">
        <div class="brand-small"><span>연금로드</span><small>금리의 두 얼굴</small></div>
        <div class="mobile-stats">
          <div><small>턴</small><strong>${state.turn}/12</strong></div>
          <div><small>예상 월 연금</small><strong>${animatedNumber('shortWon', shown?.pension ?? null, score.monthlyPension)}</strong></div>
          <div><small>수익률</small><strong class="${score.returnRate < 0 ? 'neg' : ''}">${animatedNumber('signedPercent', shown?.returnRate ?? null, score.returnRate)}</strong></div>
        </div>
        <div class="topbar-tools">
          ${this.renderSoundToggle()}
          ${renderSettingsEntry(profile?.name)}
        </div>
      </header>
      <div class="game-layout">
        <div class="board-wrap">
          ${renderTurnTrack(state, waitingForDice)}
          ${this.renderBoard(state, waitingForDice)}
        </div>
        <aside class="dashboard">
          ${learningTip}
          ${!waitingForDice && state.lastMarket.shock ? '<p class="shock-banner">충격 턴 · 신호를 보고 비중을 조정하세요</p>' : ''}
          ${renderMarketCard(state, waitingForDice)}
          <article class="asset-card"><div class="card-label-row"><div class="card-label">나의 은퇴설계</div>${this.save.settings.characters ? renderAvatar(state.profileId, avatarMood(state, score.goalMet), 44) : ''}</div>
            <div class="big-number"><span>IRP 평가액</span><strong>${animatedNumber('shortWon', shown?.irp ?? null, score.irpValue)}</strong></div>
            <div class="metric-row"><span><abbr title="최종 IRP 평가액을 240개월로 나눈 교육용 값">예상 월 연금</abbr><strong>${animatedNumber('won', shown?.pension ?? null, score.monthlyPension)}</strong></span><span>시작 대비<strong class="${score.returnRate < 0 ? 'neg' : ''}">${animatedNumber('signedPercent', shown?.returnRate ?? null, score.returnRate)}</strong></span></div>
            ${renderGoalMeter(state, score, this.save.settings.ghost ? ghostMonthlyNow(state) : null)}
            <p class="hint">미지급 생활비 ${formatWon(state.livingDebt)} · 다음 급여에서 우선 지급</p><div class="profile-line"><span>투자 성향 <b>${profile?.name ?? ''}</b></span><span>${profile?.minRiskGrade ?? 0}~6등급 매수</span></div>
            <div class="risk-line"><span>위험자산 비중 <b>${percent(score.riskRatio)}</b></span><span>생활자금 ${formatShortWon(state.cash)}</span></div>
            ${renderRiskMeter(score.riskRatio, policyRules.riskAssetLimit)}
            ${state.marketLimitExceeded ? '<p class="warning">시장 상승으로 한도 초과 · 위험자산 추가매수 제한, 예금·채권 매수나 리밸런싱은 가능</p>' : ''}
            ${pending ? `<p class="order-note">주문 ${pending}건이 다음 턴 기준가·결제를 기다리는 중</p>` : ''}
            ${state.pendingTaxCredit >= 1 ? `<p class="order-note refund-note">세액공제 ${formatWon(state.pendingTaxCredit)} 환급 대기 · 연말정산 칸을 지나면 생활자금으로</p>` : ''}
          </article>
          <div class="turn-log"><strong>최근 기록</strong><p>${state.logs.at(-1)?.message ?? ''}</p></div>
        </aside>
      </div>
      <nav class="game-actions" aria-label="게임 행동">
        <button data-action="open-portfolio"><span>◫</span>포트폴리오</button>
        ${this.renderGameCta(state)}
        <button data-action="open-market"><span>☰</span>타임라인</button>
      </nav>
    </section>`;
  }

  private renderSoundToggle(): string {
    const on = this.save.settings.sound;
    return `<button class="sound-toggle ${on ? 'on' : ''}" type="button" data-action="toggle-sound" aria-pressed="${on}" aria-label="효과음 ${on ? '끄기' : '켜기'}"><span aria-hidden="true">♪</span><small>${on ? '켬' : '끔'}</small></button>`;
  }

  private renderResult(): string {
    if (!this.game) return '';
    const score = calculateScore(this.game);
    const diagnosed = investorProfiles.find((item) => item.id === this.game!.profileId)!;
    const actual = investorProfiles.find((item) => item.id === score.behaviorProfile)!;
    const headline = score.goalMet ? '목표에 도착했습니다' : `목표까지 ${formatWon(Math.max(0, this.game.goalMonthly - score.monthlyPension))}`;
    const characters = this.save.settings.characters;
    const shockTurns = this.game.marketPath.filter((step) => step.shock).map((step) => step.turn);
    const ghostOn = this.save.settings.ghost && Boolean(this.game.ghost);
    const ghostHistory = ghostOn ? this.game.ghost!.irpHistory : null;
    const payout = this.game.payoutChoice ?? 'annuity20';
    const plan = accountPayout(score.irpValue, payout, this.game.accountBasis);
    const lock = starLockReason(this.game, score);
    const shortfall = shortfallPlan(this.game, score);
    const knowledge = knowledgeBreakdown(this.game);
    const lockLine = lock.reason
      ? `<p class="star-lock"><span class="star-lock-count">${lock.passed}/${lock.total} 조건</span> 별 ${lock.nextStars}개까지: <b>${lock.reason}</b></p>`
      : `<p class="star-lock all"><span class="star-lock-count">${lock.passed}/${lock.total} 조건</span> 모두 통과했습니다.</p>`;
    const shortfallBlock = shortfall
      ? renderSpeech('coach', `<p>${shortfall.line}</p>`, { characters, title: shortfall.withinLimit ? '처방 · 납입만으로 닿았습니다' : '처방 · 납입 + 운용이 필요했습니다' })
      : '';
    return `<section class="result-screen">
      <div class="eyebrow">12턴 은퇴설계 리포트</div>
      <div class="result-headline">${characters ? renderAvatar(this.game.profileId, resultMood(score.stars), 72) : ''}<h1>${headline}</h1></div>
      <div class="result-hero dual">
        <div><small>${payout === 'lumpSum' ? '월 연금 환산(일시금 기준)' : '예상 월 연금'}</small><strong>${formatWon(score.monthlyPension)}</strong><span>목표 ${formatWon(this.game.goalMonthly)} · 달성률 ${Math.round(score.goalRate * 100)}%</span></div>
        <div><small>시작 대비 수익률</small><strong class="${score.returnRate < 0 ? 'neg' : ''}">${signedPercent(score.returnRate)}</strong><span>운용수익률 ${signedPercent(score.investmentReturnRate)} · 낙폭 ${percent(score.maxDrawdown)}</span></div>
      </div>
      <p class="payout-line ${payout}"><span>${renderPayoutLine(plan)}</span><button class="text-button" data-action="open-payout">수령 방식 바꾸기</button></p>
      <p class="score-title">보조 점수 <strong>${score.totalScore}점</strong> · 별 ${score.stars}개 · ${score.starTitle}</p>
      <div class="stars" role="img" aria-label="3개 중 ${score.stars}개 별">${[1, 2, 3].map((n) => `<span aria-hidden="true" class="${n <= score.stars ? 'earned' : ''}" style="--i:${n}">★</span>`).join('')}</div>
      ${lockLine}
      ${renderNewAchievements(this.newAchievements)}
      ${shortfallBlock}
      <article class="result-journey"><div class="card-label">12턴 IRP 흐름${ghostOn ? ' · 그대로 둔 나와 비교' : ''}</div>${renderIrpSparkline(this.game.irpHistory, shockTurns, ghostHistory)}<p>${worstTurnLine(this.game.irpHistory)}${shockTurns.length ? ` · 충격 ${shockTurns.map((turn) => `${turn}턴`).join('·')}` : ''}</p>${ghostOn ? renderGhostVerdict(this.game) : ''}</article>
      <ul class="star-checks">${starChecklist(this.game, score).map((row) =>
        `<li class="${row.passed ? 'ok' : 'miss'}">${row.passed ? '됨' : '아직'} · ${row.label}</li>`
      ).join('')}</ul>
      <div class="result-grid">
        <article><span>IRP 최종 평가액</span><strong>${formatWon(score.irpValue)}</strong></article>
        <article><span>추가납입</span><strong>${formatWon(this.game.contributionTotal)}</strong></article>
        <article><span>생활자금</span><strong>${formatWon(score.cash)}</strong></article>
        <article><span>위험자산 비중</span><strong>${percent(score.riskRatio)}</strong></article>
        <article><span>분산도</span><strong>${score.diversification}개 자산</strong></article>
        <article><span>생활자금 부족</span><strong>${this.game.cashShortages}회</strong></article>
      </div>
      <div class="score-breakdown"><span>노후소득 <b>${score.incomeScore}/50</b></span><span>안정성 <b>${score.stabilityScore}/30</b></span><span>제도·운용 이해 <b>${score.knowledgeScore}/20</b><small class="knowledge-split">기본 ${KNOWLEDGE_CAPS.base} · 퀴즈 ${knowledge.quiz} · 이해 ${knowledge.understanding} · 리밸런싱 ${knowledge.rebalance}${knowledge.penalty ? ` · 위반 −${knowledge.penalty}` : ''}</small></span></div>
      ${renderLearnedBlock(this.game)}
      <article class="behavior-card"><div><small>기준 성향</small><strong>${diagnosed.name}</strong></div><span>→</span><div><small>실제 행동성향</small><strong>${actual.name}</strong></div><p>${score.profileAligned ? '공식 리밸런싱 목표 위험비중에 가깝게 끝났습니다.' : '공식 리밸런싱 목표 위험비중과 차이가 있습니다. 한 번 리밸런싱을 검토해보세요.'}</p></article>
      <div class="decision-grid"><article class="good"><span>✓ 가장 좋았던 결정</span><p>${score.bestDecision}</p></article><article class="improve"><span>↗ 다음에 바꿀 한 가지</span>${renderSpeech('coach', `<p>${score.improvement}</p>`, { characters })}</article></div>
      <details class="assumptions"><summary>수익률·월 연금 계산 가정과 면책</summary><p>시작 대비 수익률은 (최종 IRP − 시작 IRP) ÷ 시작 IRP입니다. 운용수익률은 같은 식에서 추가납입을 빼 시장 효과를 구분합니다. 월 연금은 최종 IRP ÷ ${policyRules.receivingMonths}개월의 단순 균등분할(세전)입니다. 수령 방식 줄에서만 교육용 세율(연금 ${Math.round(policyRules.pensionTaxRate * 1000) / 10}% · 일시금 ${Math.round(policyRules.lumpSumTaxRate * 1000) / 10}%)을 뺀 값을 보이고, 일시금을 고르면 목표 판정은 세후 총액을 연금 세후 기준으로 환산해 잽니다. 수령 중 수익률, 비용, 물가는 반영하지 않습니다. 실제 결과와 다를 수 있고 투자 권유가 아닙니다.</p></details>
      ${renderSeedLine(this.game)}
      ${this.shareFallback ? `<textarea class="share-fallback" readonly aria-label="결과 텍스트" rows="6">${this.shareFallback}</textarea>` : ''}
      <div class="result-actions"><button class="primary" data-action="same-seed">같은 시드로 다시</button><button class="secondary" data-action="new-seed">새 시드로 도전</button><button class="text-button" data-action="open-cards" data-tab="cards">관련 학습 카드 보기</button><button class="text-button" data-action="open-cards" data-tab="achievements">업적 · 컬렉션</button><button class="text-button" data-action="to-title">타이틀로</button></div>
    </section>`;
  }

  private renderModal(): string {
    if (!this.modal) return '';
    const close = !PensionRoadApp.STICKY_MODALS.includes(this.modal) ? '<button class="modal-close" data-action="close-modal" aria-label="닫기">×</button>' : '';
    let content = '';
    const characters = this.save.settings.characters;
    const reducedMotion = shouldSkipDiceAnimation(this.save.settings.reducedMotion, window.matchMedia('(prefers-reduced-motion: reduce)').matches);
    if (this.modal === 'life') content = this.renderLifeModal();
    if (this.modal === 'action') content = this.renderActionModal();
    if (this.modal === 'portfolio') content = this.renderPortfolioModal();
    if (this.modal === 'market') content = this.renderMarketModal();
    if (this.modal === 'cards') content = this.renderCardsModal();
    if (this.modal === 'settings') content = this.renderSettingsModal();
    if (this.modal === 'howto') content = renderHowToModal(characters);
    if (this.modal === 'settle' && this.lastSummary) {
      const summary = this.lastSummary;
      content = renderSettlementModal(summary, {
        characters,
        ghost: this.save.settings.ghost,
        reducedMotion,
        final: this.game?.status === 'finished',
        expanded: this.save.settings.settleExpanded,
        autoSettleMs: this.autoSettleTimer ? AUTO_SETTLE_MS : null,
        pace: scenePace(summary.turn, summary.shock, summary.milestones.length)
      });
    }
    if (this.modal === 'quiz' && this.game && this.quizCardId) {
      const card = getLearningCard(this.quizCardId);
      if (card) {
        content = renderQuizModal(card, {
          picked: this.quizPicked,
          progress: this.finishing ? { index: this.finalQuizTotal - this.finalQuizQueue.length - 1, total: this.finalQuizTotal } : null,
          characters,
          streak: this.game.quizStreak
        });
      }
    }
    if (this.modal === 'payout' && this.game) content = renderPayoutModal(this.game, { characters, current: this.game.payoutChoice });
    if (this.modal === 'default-option') {
      const profileId = this.game?.profileId ?? this.profileId;
      content = renderDefaultOptionModal({ profileId, current: this.defaultOptionPick, characters, mode: this.defaultOptionMode });
    }
    if (this.modal === 'news' && this.game) {
      const prev = this.game.marketPath[this.game.turn - 2] ?? emptyMarketStep();
      content = renderNewsFlash(this.game.lastMarket, prev, boardTiles[this.game.position], {
        characters,
        ledger: { open: this.game.ledger.open, afterMarket: this.game.ledger.afterMarket },
        tileEffects: this.game.tileEffects,
        coach: this.game.turn === 1,
        pace: scenePace(this.game.turn, Boolean(this.game.lastMarket.shock))
      });
    }
    if (this.modal === 'tile' && this.game) {
      const tile = boardTiles[this.game.position];
      content = renderTileBriefing(
        pickTileBriefing(this.game.seed, this.game.turn, this.game.position),
        tile.label,
        tile.index + 1
      );
    }
    const labels: Record<NonNullable<Modal>, string> = {
      action: '운용 행동 선택', life: '생활사건', howto: '게임 방법', tile: '도착 칸 설명', news: '시장 속보', settle: '턴 정산 요약',
      quiz: '퀴즈', payout: '수령 방식 선택', 'default-option': '디폴트옵션 지정', portfolio: '포트폴리오', market: '시장 타임라인', cards: '도감', settings: '설정'
    };
    return `<div class="modal-backdrop"><section class="modal-sheet modal-${this.modal}" role="dialog" aria-modal="true" aria-label="${labels[this.modal]}">${close}${content}<p class="modal-feedback" aria-live="polite">${this.feedback}</p></section></div>`;
  }

  private renderLifeModal(): string {
    if (!this.game?.currentEventId) return '';
    const event = getLifeEvent(this.game.currentEventId);
    if (!event) return '';
    return renderLifeModal(this.game, event, { cash: this.game.cash });
  }

  private allowedProductId(preferred: ProductId, avoid?: ProductId): ProductId {
    if (!this.game) return preferred;
    if (canBuyForProfile(this.game.profileId, preferred).ok && preferred !== avoid) return preferred;
    return products.find((product) => product.id !== avoid && canBuyForProfile(this.game!.profileId, product.id).ok)?.id
      ?? products.find((product) => canBuyForProfile(this.game!.profileId, product.id).ok)?.id
      ?? 'deposit';
  }

  private productOptions(selected: ProductId, holdingsOnly = false, forBuy = false): string {
    if (!this.game) return '';
    const held = holdingsOnly ? heldProductIds(this.game) : null;
    return products.filter((product) => !held || held.includes(product.id))
      .map((product) => {
        const blocked = forBuy && !canBuyForProfile(this.game!.profileId, product.id).ok;
        return `<option value="${product.id}" ${selected === product.id ? 'selected' : ''} ${blocked ? 'disabled' : ''}>${product.name} · ${product.riskGrade}등급${blocked ? ' · 성향 밖' : ''}</option>`;
      }).join('');
  }

  private amountButtons(kind: ActionKind, productId?: ProductId): string {
    if (!this.game) return '';
    return `<div class="amount-presets">${(['default', 'half', 'max'] as const).map((preset) => {
      const amount = resolveActionAmount(this.game!, kind, preset, productId);
      const label = preset === 'default' ? '기본' : preset === 'half' ? '절반' : '가능액';
      return `<button type="button" class="${this.amountPreset === preset ? 'active' : ''}" data-action="amount-preset" data-preset="${preset}">${label}<small>${formatShortWon(amount)}</small></button>`;
    }).join('')}</div>`;
  }

  private renderActionModal(): string {
    if (!this.game) return '';
    const game = this.game;
    const done = game.turnActionLines.length;
    const totalActions = done + game.actionsLeft;
    const spotlight = game.spotlightProductId ? products.find((item) => item.id === game.spotlightProductId) : null;
    if (this.actionView === 'menu') {
      const counter = totalActions > 1 ? `행동 ${done + 1}/${totalActions}` : '행동은 한 번';
      const soFar = done
        ? `<div class="preview-box action-sofar"><strong>이번 턴 지금까지</strong><p>${game.turnActionLines.join(' · ')}</p></div>`
        : '';
      const spotlightNote = spotlight
        ? `<p class="spotlight-note">☆ 오늘의 스포트라이트 <b>${spotlight.name}</b> · 사면 이해 +1${spotlight.kind === 'fund' ? ' · 일반 결제 규칙 적용' : spotlight.kind === 'deposit' ? ' · 가입 건별 약정 유지' : ''}</p>`
        : '';
      // 사건을 막 해결하고 온 길이면 두 번째 결정처럼 느껴지지 않게 한 흐름으로 잇는다.
      const resolved = game.lifeResolution && done === 0 ? renderLifeResolvedStrip(game.lifeResolution) : '';
      const autoRun = this.holdAutoRuns(game);
      return `${resolved}<p class="eyebrow">TURN ${game.turn} · ${counter}</p><h2>무엇을 할까요?</h2><p>시장은 이미 움직여 보유분에 반영됐습니다. 지금 고르는 행동은 다음 턴 흐름에 거는 것입니다.</p>
        ${soFar}${spotlightNote}
        <div class="action-list">
          <article><div><strong>추가납입</strong><small>생활자금 → IRP 대기자금 · 세액공제는 연말정산 칸에서 환급</small></div><button data-action="action-view" data-view="contribute">선택</button></article>
          <article><div><strong>매수</strong><small>대기자금으로 상품 매수 · 다음 턴 수익률부터</small></div><button data-action="action-view" data-view="buy">선택</button></article>
          <article><div><strong>매도</strong><small>보유 상품을 줄이기</small></div><button data-action="action-view" data-view="sell">선택</button></article>
          <article><div><strong>바꾸기</strong><small>한 상품을 다른 상품으로</small></div><button data-action="action-view" data-view="switch">선택</button></article>
          <article class="featured"><div><strong>리밸런싱</strong><small>성향 안 목표비중에 가깝게 복원${game.rebalanceBonusTurn === game.turn ? ' · 오늘 이해 +2' : ''}</small></div><button data-action="action-view" data-view="rebalance">선택</button></article>
          <article class="hold-row"><div><strong>이번엔 그대로</strong><small>${this.holdMenuNote(game)}${game.actionsLeft > 1 ? ' · 남은 행동도 함께 마감' : ''}</small></div><button data-action="do-hold" class="${autoRun ? 'default-run' : ''}">${autoRun ? '디폴트옵션으로 운용하고 마감' : '그대로 두고 마감'}</button></article>
        </div>`;
    }
    if (this.actionView === 'contribute') {
      const amount = this.currentAmount('contribute');
      const nextPension = (portfolioValue(game) + amount) / policyRules.receivingMonths;
      const credit = contributionCredit(game.contributionTotal, amount);
      const creditNote = credit.benefit > 0
        ? `세액공제 ${formatWon(credit.benefit)}(교육용)은 연말정산 칸을 지날 때 생활자금으로 돌아옵니다.`
        : '공제 한도를 채워 이번 납입은 세액공제가 없습니다.';
      return `<button class="text-button" data-action="action-view" data-view="menu">← 행동 목록</button>
        <p class="eyebrow">추가납입</p><h2>IRP에 얼마나 넣을까요?</h2>
        ${this.amountButtons('contribute')}
        <div class="preview-box"><strong>미리보기</strong><p>납입 ${formatWon(amount)} · ${creditNote} 예상 월 연금 약 ${formatWon(nextPension)}.</p></div>
        <button class="primary jumbo" data-action="do-contribute">납입 실행</button>`;
    }
    if (this.actionView === 'buy') {
      this.selectedBuy = this.allowedProductId(this.selectedBuy);
      const amount = this.currentAmount('buy', this.selectedBuy);
      const product = products.find((item) => item.id === this.selectedBuy)!;
      const expected = expectedRiskAfterBuy(game, this.selectedBuy, amount);
      const isSpotlight = game.spotlightProductId === this.selectedBuy;
      const pending = isSpotlight
        ? `오늘 스포트라이트 · ${product.kind === 'fund' ? '일반 결제 규칙 적용' : '즉시 체결'} · 이해 +1`
        : product.kind === 'fund' ? '펀드·TDF는 다음 턴 가격 확정, 그다음 턴 결제' : '예금·ETF는 즉시 체결 · 수익률은 다음 턴부터';
      const suitability = canBuyForProfile(game.profileId, this.selectedBuy);
      const decision = suitability.ok ? decideBuyAgainstRiskLimit(game, this.selectedBuy, amount) : null;
      const preview = !suitability.ok
        ? suitability.reason
        : decision?.kind === 'confirm'
          ? `${formatWon(decision.requested)} 매수 시 예상 위험비중 ${percent(decision.fullRatio)}로 한도 70%를 넘습니다. 한도까지는 ${formatWon(decision.capped)}입니다. 나머지는 대기자금으로 남습니다.`
          : decision?.kind === 'reject'
            ? decision.message
            : `${formatWon(amount)} 매수 후 예상 위험비중 ${percent(expected)}. 대기자금이 없으면 먼저 납입하세요.`;
      const confirm = this.buyLimitConfirm;
      const contributeCta = buyNeedsContribution(game.irpCash)
        ? `<button class="secondary" data-action="action-view" data-view="contribute">먼저 납입하기</button>`
        : '';
      const actions = confirm
        ? `<div class="preview-box"><strong>한도 확인</strong><p>${confirm.message}</p></div>
        <div class="button-stack">
          <button class="primary jumbo" data-action="confirm-buy-cap">진행 · 한도까지 매수</button>
          <button class="secondary" data-action="cancel-buy-cap">보류</button>
        </div>`
        : `<div class="button-stack">
          <button class="primary jumbo" data-action="do-buy" ${suitability.ok && decision?.kind !== 'reject' ? '' : 'disabled'}>매수 실행</button>
          ${contributeCta}
        </div>`;
      return `<button class="text-button" data-action="action-view" data-view="menu">← 행동 목록</button>
        <p class="eyebrow">매수 · ${pending}</p><h2>무엇을 살까요?</h2>
        <label for="buy-product">상품</label><select id="buy-product">${this.productOptions(this.selectedBuy, false, true)}</select>
        ${this.amountButtons('buy', this.selectedBuy)}
        <div class="preview-box ${decision?.kind === 'confirm' || decision?.kind === 'reject' ? 'warning' : ''}"><strong>미리보기</strong><p>${preview}</p></div>
        ${actions}`;
    }
    if (this.actionView === 'sell') {
      // 전액 매도·교체 뒤에도 선택값이 옛 상품에 남으면 셀렉트와 금액이 어긋난다. 항상 실제 보유 상품으로 맞춘다.
      this.selectedSell = pickHeldProduct(game, this.selectedSell);
      const amount = this.currentAmount('sell', this.selectedSell);
      const blocked = tradeBlockReason(game, 'sell', amount);
      const sellNote = sellProduct(game, this.selectedSell, amount).message;
      return `<button class="text-button" data-action="action-view" data-view="menu">← 행동 목록</button>
        <p class="eyebrow">매도</p><h2>무엇을 줄일까요?</h2>
        <label for="sell-product">상품</label><select id="sell-product">${this.productOptions(this.selectedSell, true)}</select>
        ${this.amountButtons('sell', this.selectedSell)}
        <div class="preview-box ${blocked ? 'warning' : ''}"><strong>미리보기</strong><p>${blocked ?? `${formatWon(amount)} 매도. ${sellNote}`}</p></div>
        <button class="primary jumbo" data-action="do-sell" ${blocked ? 'disabled' : ''}>매도 실행</button>`;
    }
    if (this.actionView === 'switch') {
      this.switchFrom = pickHeldProduct(game, this.switchFrom);
      this.switchTo = this.allowedProductId(this.switchTo, this.switchFrom);
      const amount = this.currentAmount('switch', this.switchFrom);
      const suitability = canBuyForProfile(game.profileId, this.switchTo);
      const blocked = suitability.ok ? tradeBlockReason(game, 'switch', amount) : suitability.reason;
      return `<button class="text-button" data-action="action-view" data-view="menu">← 행동 목록</button>
        <p class="eyebrow">교체매매</p><h2>무엇을 바꿀까요?</h2>
        <label for="switch-from">기존 상품</label><select id="switch-from">${this.productOptions(this.switchFrom, true)}</select>
        <label for="switch-to">새 상품</label><select id="switch-to">${this.productOptions(this.switchTo, false, true)}</select>
        ${this.amountButtons('switch', this.switchFrom)}
        <div class="preview-box ${blocked ? 'warning' : ''}"><strong>미리보기</strong><p>${blocked ?? this.switchPreview(amount)}</p></div>
        <button class="primary jumbo" data-action="do-switch" ${blocked ? 'disabled' : ''}>교체 실행</button>`;
    }
    if (this.actionView === 'rebalance') {
      const shares = rebalanceShares(game.profileId);
      const skipped = products.filter((product) => balanceConfig.rebalanceAllocation[product.id] > 0 && shares[product.id] <= 0);
      const targets = products
        .filter((product) => shares[product.id] > 0)
        .map((product) => `${product.shortName} ${(shares[product.id] * 100).toFixed(0)}%`)
        .join(' · ');
      const skipNote = skipped.length
        ? `${skipped.map((item) => item.shortName).join('·')}은 성향 허용 범위보다 위험이 커서 빼고 나머지로 맞춥니다.`
        : '오른 자산을 줄이고 낮아진 자산을 채워 위험 수준을 맞춥니다.';
      const bonus = game.rebalanceBonusTurn === game.turn;
      const gap = `<div class="preview-box rebalance-gap${bonus ? ' bonus' : ''}"><strong>지금 → 목표${bonus ? ' · 리밸런싱 칸 보너스 이해 +2' : ''}</strong><p>${rebalanceGapLine(game)}</p></div>`;
      return `<button class="text-button" data-action="action-view" data-view="menu">← 행동 목록</button>
        <p class="eyebrow">리밸런싱</p><h2>목표비중으로 되돌릴까요?</h2>
        ${gap}
        <div class="preview-box"><strong>목표비중</strong><p>${targets}</p><p>${skipNote}</p><p>차액 주문으로 처리합니다. 매도 결제 후 매수하며 10만원 미만 차액은 대기자금으로 남을 수 있습니다.</p></div>
        <p class="hint">${game.pendingOrders.length || game.rebalancePlan ? "접수 주문 정산 후 실행할 수 있습니다." : "예금 이자 조정과 펀드 가격·결제 대기를 적용합니다."}</p><button class="primary jumbo" data-action="do-rebalance" ${game.pendingOrders.length || game.rebalancePlan ? "disabled" : ""}>리밸런싱 실행</button>`;
    }
    return '';
  }

  /** 「그대로」에서 디폴트옵션이 실제로 무언가 사는가(지정됐고 대기자금 10만 원 이상) */
  private holdAutoRuns(game: GameState): boolean {
    return Boolean(game.defaultOption) && game.irpCash >= 100_000;
  }

  /** 「그대로」는 확인 화면 없이 바로 실행되므로 무슨 일이 일어나는지 목록 한 줄이 다 말해야 한다 */
  private holdMenuNote(game: GameState): string {
    if (this.holdAutoRuns(game)) return `대기자금 ${formatShortWon(game.irpCash)}을 지정옵션(${defaultOptionName(game.defaultOption)})으로 ${defaultOptionProducts(game.defaultOption)} 균등 매수 실행(옵트인 체험) · 바로 마감`;
    if (game.defaultOption) {
      const cash = game.irpCash < 10_000 ? '대기자금이 없어' : `대기자금 ${formatShortWon(game.irpCash)}은 10만 원 미만이라`;
      return `구성 그대로 마감 · ${cash} 디폴트옵션(${defaultOptionName(game.defaultOption)})이 살 것이 없음`;
    }
    return `구성 그대로 마감${game.irpCash >= 100_000 ? ` · 대기자금 ${formatShortWon(game.irpCash)}은 디폴트옵션이 없어 남음(설정에서 지정)` : ''}`;
  }

  private renderPortfolioModal(): string {
    if (!this.game) return '';
    const total = portfolioValue(this.game);
    const basis = sourceBalances(total, this.game.accountBasis);
    const rows = products.map((product) => {
      const amount = this.game!.holdings.find((holding) => holding.productId === product.id)?.amount ?? 0;
      const ret = this.game!.lastMarket.returns[product.id] ?? 0;
      return `<tr><td><span class="risk-symbol ${!product.principal_guaranteed ? 'risky' : 'safe'}">${!product.principal_guaranteed ? '▲' : '●'}</span>${product.shortName}<small>${product.riskLabel}</small></td><td>${formatShortWon(amount)}</td><td>${total ? percent(amount / total) : '0%'}</td><td class="${ret < 0 ? 'neg' : ''}">${product.id === 'deposit' ? '가입 건별 약정' : signedPercent(ret)}</td></tr>`;
    }).join('');
    const deposit = this.game.holdings.find(h => h.productId === 'deposit');
    const lots = deposit ? depositLots(this.game, deposit).map(lot => `<li>${formatWon(lot.amount)} · 가입 ${lot.openedTurn}턴 / 만기 ${lot.maturityTurn}턴 · 턴당 약정 ${percent(lot.ratePerTurn)}${this.game!.turn >= lot.maturityTurn ? ' · 만기 후 보관' : ''}</li>`).join('') : '';
    const orders = this.game.pendingOrders.length ? this.game.pendingOrders.map((order) => `<li>${order.side === 'buy' ? '매수' : '환매'} · ${products.find((item) => item.id === order.productId)?.shortName} · ${formatWon(order.amount)} · ${order.units != null ? `${order.units.toFixed(2)} 모형수량 · ` : ''}${order.stage === 'received' ? '주문 접수' : '기준가 확정'} → ${order.settlesTurn}턴 반영</li>`).join('') : '<li>대기 주문 없음</li>';
    return `<p class="eyebrow">포트폴리오</p><h2>${formatWon(total)}</h2><p>규제 위험자산 ${percent(riskAssetRatio(this.game))} · 기초 주식 노출 ${percent(equityExposureRatio(this.game))} · IRP 대기자금 ${formatWon(this.game.irpCash)}</p><div class="table-wrap"><table><thead><tr><th>상품</th><th>평가액</th><th>비중</th><th>이번 턴</th></tr></thead><tbody>${rows}</tbody></table></div><p class="hint">적격 TDF의 한도 예외는 손실 위험이 없다는 뜻이 아닙니다. 주식 노출 외에 금리·신용 위험도 있습니다.</p><h3>자금 원천</h3><p>퇴직급여 ${formatWon(basis.retirement)} · 미공제 원금 ${formatWon(basis.nonDeducted)} · 공제 원금 ${formatWon(basis.deducted)} · 운용수익 ${formatWon(basis.earnings)}</p><h3>예금 약정</h3><ul class="order-list">${lots || "<li>예금 보유 없음</li>"}</ul><h3>주문 처리</h3><ul class="order-list">${orders}</ul>`;
  }

  private renderMarketModal(): string {
    const waiting = Boolean(this.game && (canRevealNextTurn(this.game) || this.diceRolling));
    return renderMarketTimeline(this.game, waiting);
  }

  private renderCardsModal(): string {
    const unlocked = new Set(this.save.unlockedCards);
    const tabs: Array<[CardsTab, string]> = [
      ['cards', `학습 카드 ${unlocked.size}/${learningCards.length}`],
      ['achievements', `업적 ${this.save.achievements.length}/${ACHIEVEMENT_COUNT}`],
      ['collection', `캐릭터 ${Object.values(this.save.collection).filter((entry) => entry.plays > 0).length}/5`]
    ];
    const nav = `<div class="tab-row" role="tablist" aria-label="도감">${tabs.map(([tab, label]) => `<button type="button" role="tab" class="${this.cardsTab === tab ? 'active' : ''}" aria-selected="${this.cardsTab === tab}" data-action="cards-tab" data-tab="${tab}">${label}</button>`).join('')}</div>`;
    if (this.cardsTab === 'achievements') {
      return `<p class="eyebrow">도감</p><h2>업적 ${this.save.achievements.length} / ${ACHIEVEMENT_COUNT}</h2>${nav}<p class="hint">판이 끝나면 결과 화면에서 새로 연 업적이 뜹니다. 누적 업적은 여러 판에 걸쳐 열립니다.</p>${renderAchievementGallery(this.save.achievements)}`;
    }
    if (this.cardsTab === 'collection') {
      return `<p class="eyebrow">도감</p><h2>캐릭터 컬렉션</h2>${nav}${renderCollectionGallery(this.save.collection, this.save.settings.characters)}<p class="hint">성향 진단을 다시 하면 다른 캐릭터로 판을 시작할 수 있습니다(설정 → 성향 다시 진단).</p>`;
    }
    return `<p class="eyebrow">도감</p><h2>학습 카드 ${unlocked.size} / ${learningCards.length} 발견</h2>${nav}<div class="card-library">${learningCards.map((card) => unlocked.has(card.id) ? `<article><span>${card.category}</span><h3>${card.title}</h3><p>${card.key}</p><details><summary>쉬운 설명</summary><p>${card.detail}</p></details></article>` : `<article class="locked"><span>미발견</span><h3>?</h3><p>관련 시장 국면과 행동에서 열립니다.</p></article>`).join('')}</div>`;
  }

  private defaultOptionSettingNote(): string {
    const current = this.game?.defaultOption ?? this.save.defaultOption;
    if (!current) return '지정 안 함 · 「이번엔 그대로」를 골라도 대기자금은 그대로 남습니다.';
    return `${defaultOptionName(current)} · ${defaultOptionProducts(current)} · 「이번엔 그대로」를 고르면 대기자금을 이 상품으로 균등 매수${this.game ? ' · 지금 판부터 바로' : ''}`;
  }

  private renderSettingsModal(): string {
    const playing = this.game ? investorProfiles.find((item) => item.id === this.game!.profileId) : null;
    const nextProfile = investorProfiles.find((item) => item.id === this.profileId);
    const profileNote = playing
      ? `이번 판 성향은 <strong>${playing.name}</strong>이며 ${playing.minRiskGrade}~6등급 매수할 수 있습니다. 다시 진단하면 지금 판부터 바로 바뀝니다.`
      : `저장된 성향은 <strong>${nextProfile?.name ?? '위험중립형'}</strong>이며 ${nextProfile?.minRiskGrade ?? 4}~6등급 매수할 수 있습니다.`;
    return `<p class="eyebrow">설정 · 면책 · 출처</p><h2>교육용 게임 안내</h2>
      <p class="profile-note">${profileNote}</p>
      <label class="setting-row" for="reduced-motion"><span><strong>동작 줄이기</strong><small>전환·주사위 애니메이션을 즉시 표시합니다.</small></span><input id="reduced-motion" type="checkbox" ${this.save.settings.reducedMotion ? 'checked' : ''}></label>
      <label class="setting-row" for="characters"><span><strong>캐릭터 표시</strong><small>성향별 동물 말, 앵커·코치 말풍선을 보입니다. 끄면 문구만 남습니다.</small></span><input id="characters" type="checkbox" ${this.save.settings.characters ? 'checked' : ''}></label>
      <label class="setting-row" for="sound"><span><strong>효과음</strong><small>주사위·속보·정산·환급·별 소리. 기본 끔이며 게임 화면 오른쪽 위에서도 바꿀 수 있습니다.</small></span><input id="sound" type="checkbox" ${this.save.settings.sound ? 'checked' : ''}></label>
      <label class="setting-row" for="ghost"><span><strong>"그대로 둔 나" 비교</strong><small>같은 시드·같은 주사위로 아무 행동도 하지 않은 경로를 정산·결과·목표 게이지에 나란히 보입니다.</small></span><input id="ghost" type="checkbox" ${this.save.settings.ghost ? 'checked' : ''}></label>
      <label class="setting-row" for="speed"><span><strong>애니메이션 2× 빠르게</strong><small>주사위·말 이동·숫자·속보·정산 연출을 절반 길이로. 7턴부터는 충격·이정표 턴을 빼고 저절로 빨라집니다.</small></span><input id="speed" type="checkbox" ${this.save.settings.speed === 2 ? 'checked' : ''}></label>
      <label class="setting-row" for="auto-settle"><span><strong>정산 자동 진행</strong><small>평범한 턴의 정산 창을 2.5초 뒤 저절로 넘깁니다. 충격·이정표·생활사건·마지막 턴은 직접 넘기고, 창 안을 누르면 멈춥니다. 기본 끔.</small></span><input id="auto-settle" type="checkbox" ${this.save.settings.autoSettle ? 'checked' : ''}></label>
      <div class="setting-row default-option-row"><span><strong>디폴트옵션(사전지정운용)</strong><small>${this.defaultOptionSettingNote()}</small></span><button class="secondary compact" data-action="open-default-option">${(this.game?.defaultOption ?? this.save.defaultOption) ? '바꾸기' : '지정'}</button></div>
      <div class="button-stack compact">
        ${renderSettingsHowToButton()}
        <button class="secondary" data-action="open-diagnosis">성향 다시 진단</button>
        <button class="secondary" data-action="open-goal">월 연금 목표 바꾸기</button>
        <p class="manual-links"><a href="./user-manual.html" target="_blank" rel="noreferrer">사용자 매뉴얼</a> · <a href="./operator-manual.html" target="_blank" rel="noreferrer">운영자 매뉴얼</a></p>
      </div>
      <div class="disclaimer-box"><strong>중요 면책</strong><p>모든 금융 수치는 교육용으로 단순화했습니다. 특정 금융회사·상품을 추천하지 않으며, 수익·원금·세제 혜택을 보장하지 않습니다. 실제 규정과 세무 결과는 개인 상황과 기준일에 따라 달라질 수 있습니다. 은행 계좌·잔고와 연동되지 않는 가상 포트폴리오입니다.</p></div>
      <h3>정책 데이터</h3><p>기준일 ${policyRules.reviewed_at} · 교육용 단순화 ${policyRules.simplified ? '예' : '아니오'}</p>
      <ul class="source-list"><li><a href="${policyRules.source_urls[0]}" target="_blank" rel="noreferrer">금융감독원 · 위험자산별 투자한도</a></li><li><a href="${policyRules.source_urls[1]}" target="_blank" rel="noreferrer">금융감독원 · 퇴직연금 세제—세액공제</a></li><li><a href="${policyRules.source_urls[2]}" target="_blank" rel="noreferrer">금융감독원 · 퇴직연금 세제—연금수령</a></li></ul>
      <p class="version">연금로드 v1.4 · 저장 데이터는 이 브라우저에만 보관됩니다.</p>`;
  }
}
