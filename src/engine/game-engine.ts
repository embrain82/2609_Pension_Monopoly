import { acceptedContribution, contributionConstraint, actionTiming, blockReason } from './action-constraints';
import { previewContribution } from './contribution-engine';
import { initializePositions, scopedHolding } from './position-engine';
import { executeDefaultTrade, nextDefaultCommand } from './default-trade-engine';
import { beginPerformance, finishPerformance } from './performance-engine';
import { scenarioConfig, withGlidePath, inflatedEvent, type ScenarioId, type MissionId } from './scenario-engine';
import { newRouteProgress, stampVisit } from './route-engine';
import { initialHoldings } from './profile-engine';
import { addAccountFlow, accountPayout } from './account-engine';
import { balanceConfig, boardTiles, defaultOptions, learningCards, lifeEvents, marketScenario, marketShocks, policyRules, investorProfiles } from '../data/content';
import type { ActionKind, ActionResult, DefaultOptionId, GameState, GhostTrack, LifeChoice, LifeEvent, PayoutChoice, PlayRecord, ProfileId, ProductId } from '../types';
import { ALERT_CARD_ID, applyMarketStep, emptyMarketStep, generateMarketPath, marketPathOf, marketHoldingEffects } from './market-engine';
import { pickTileBriefing } from './tile-briefing';
import { buyProduct, portfolioValue, rebalancePortfolio, sellProduct, settleOrders, settleAllOrders, switchProduct } from './portfolio-engine';
import { contributionCredit, riskAssetRatio } from './policy-engine';
import { holdingsMap, summarizeTurn } from './settlement-engine';
import { diceStepsForTurn, hashSeed, nextRandom } from './random-engine';
import { applyGoalToGame, clampGoalMonthly } from './goal';
import { REBALANCE_TILE_BONUS, applyTileArrival } from './tile-effects';
import { diversificationCount } from './scoring-engine';
import { applyDefaultOption, normalizeDefaultOption, suggestDefaultOption } from './default-option';
import { resolveLifeChoice } from './life-engine';
import { actionLesson, answerQuiz, finalQuizCards, marketTileQuizzes, pickQuizCard, queueQuiz } from './quiz-engine';
import { milestonesReached, stampMilestones } from './milestones';

export { applyGoalToGame, clampGoalMonthly };

export interface GameAction {
  kind: ActionKind;
  productId?: ProductId;
  fromProductId?: ProductId;
  toProductId?: ProductId;
  amount?: number;
  optionId?: DefaultOptionId;
  fraction?: .5 | 1;
  commandId?: string;
}

export type AmountPreset = 'default' | 'half' | 'max';

export interface GameOptions {
  settlementLearning?: boolean;
  /** 개인 추가납입 속도 제한. 새 UI 판에서 켜며 기존 저장·시뮬은 명시하지 않으면 유지. */
  contributionPacing?: boolean;
  /** 새 직접매매 규칙. C/D 저장과 기존 시뮬은 생략 시 구 규칙 유지. */
  defaultTrading?: boolean;
  scenario?: ScenarioId;
  mission?: MissionId;
  weekly?: boolean;
  avatarId?: ProfileId;
  /** 칸 효과 켬/끔. 게이트 측정용. 기본 켬 */
  tileEffects?: boolean;
  /** 고스트("그대로 둔 나") 경로를 함께 계산. 시뮬·고스트 자신은 끔. 기본 켬 */
  ghost?: boolean;
  /** 디폴트옵션. 성향 밖이면 추천값으로 바뀐다. 없으면 null(「그대로」가 대기자금을 건드리지 않음) */
  defaultOption?: DefaultOptionId | null;
}


function scheduleLifeEvents(rngState: number): { rngState: number; schedule: Array<{ turn: number; eventId: string }> } {
  const pool = [2, 3, 4, 5, 6, 7, 8, 9, 10, 11];
  const chosen: number[] = [];
  let state = rngState;
  while (chosen.length < 3) {
    const roll = nextRandom(state);
    state = roll.state;
    const turn = pool[Math.floor(roll.value * pool.length)];
    if (!chosen.includes(turn)) chosen.push(turn);
  }
  chosen.sort((a, b) => a - b);
  const schedule = chosen.map((turn) => {
    const roll = nextRandom(state);
    state = roll.state;
    const event = lifeEvents[Math.floor(roll.value * lifeEvents.length)];
    return { turn, eventId: event.id };
  });
  return { rngState: state, schedule };
}

function cardForTurn(turn: number, path: GameState['marketPath']): string {
  const shockTurns = path.filter((step) => step.shock).map((step) => step.turn);
  const laterShock = shockTurns.at(-1);
  if (laterShock === turn) return 'etf-order';
  if (turn <= 4) return 'rate-bond';
  if (turn <= 8) return 'duration';
  return 'rebalance';
}

export function emptyRecord(): PlayRecord {
  return { rebalanceTurns: [], diversifiedTurns: 0, defaultOptionRuns: 0, lifeChoices: [] };
}

/** 같은 시드·같은 주사위·행동은 늘 "그대로"인 경로. 결과 화면과 정산의 비교 기준. */
export function ghostTrackFor(seed: string, profileId: ProfileId, goalMonthly: number, tileEffects: boolean, options: GameOptions = {}): GhostTrack {
  const ghost = autoplay(seed, 'passive', profileId, { ...options, ghost: false, tileEffects, goalMonthly });
  return { irpHistory: ghost.irpHistory, finalCash: ghost.cash };
}

export function createGame(seed: string, profileId: ProfileId = 'balanced', goalMonthly = balanceConfig.defaultGoal, options: GameOptions = {}): GameState {
  if(options.weekly) { profileId='balanced'; goalMonthly=500000; options={...options,scenario:'classic',mission:'pension'}; }
  const scheduled = scheduleLifeEvents(hashSeed(seed));
  const marketPath = options.scenario ? withGlidePath(generateMarketPath(seed, scenarioConfig(options.scenario))) : generateMarketPath(seed);
  const market = emptyMarketStep();
  const tileEffectsEnabled = options.tileEffects !== false;
  const goal = clampGoalMonthly(goalMonthly);
  const state: GameState = {
    ...(options.settlementLearning?{learningFlow:{version:'settlement-v1' as const,queue:[]}}:{}),
    ...(options.contributionPacing ? { contributionPacing: { version: 'v1' as const, perTurnLimit: balanceConfig.contributionPerTurnLimit } } : {}),
    route: newRouteProgress(),
    accountType: 'IRP', rulesetVersion: options.defaultTrading ? '2026-09-10-e' : options.scenario ? '2026-09-10-d' : '2026-09-10-c', avatarId: options.avatarId ?? 'balanced',
    accountBasis: { retirement: 90_000_000, retirementTax: 1_800_000, deducted: 9_000_000, nonDeducted: 9_000_000 },
    cashFlows: [], livingDebt: 0, orderSequence: 0, rebalancePlan: null,
    prices: { deposit: 1000, shortBond: 1000, longBond: 1000, balanced: 1000, equityEtf: 1000, tdf: 1000 },
    seed,
    rngState: scheduled.rngState,
    status: 'playing',
    turn: 0,
    position: 0,
    phase: market.phase,
    goalMonthly: goal,
    profileId,
    cash: balanceConfig.startingCash,
    irpCash: 0,
    holdings: initialHoldings(profileId),
    pendingOrders: [],
    contributionTotal: 0,
    taxCreditEligible: 0,
    taxCreditBenefit: 0,
    maxIrpValue: balanceConfig.startingIrp,
    maxDrawdown: 0,
    irpHistory: [balanceConfig.startingIrp],
    cashShortages: 0,
    ruleBreaches: 0,
    marketLimitExceeded: false,
    understandingPoints: 0,
    rebalanceCount: 0,
    riskBuyCount: 0,
    safeActionCount: 0,
    unlockedCards: ['rate-bond'],
    eventHistory: [],
    logs: [{ turn: 0, type: 'start', message: `${investorProfiles.find(p => p.id === profileId)!.name}에 맞는 가상 시작 포트폴리오로 출발했습니다.` }],
    lastMarket: market,
    marketPath,
    awaitingAction: false,
    currentEventId: null,
    lifeEventSchedule: scheduled.schedule,
    ledger: { open: balanceConfig.startingIrp, afterMarket: balanceConfig.startingIrp, beforeAction: null },
    tileEffects: [],
    actionsLeft: 0,
    turnActionLines: [],
    pendingTaxCredit: 0,
    taxCreditRefunded: 0,
    spotlightProductId: null,
    rebalanceBonusTurn: null,
    extraLifeEvents: 0,
    tileEffectsEnabled,
    ghost: options.ghost === false ? null : ghostTrackFor(seed, profileId, goal, tileEffectsEnabled, options),
    payoutChoice: null,
    defaultOption: options.defaultOption ? normalizeDefaultOption(profileId, options.defaultOption, options.defaultTrading) : null,
    lifeResolution: null,
    quizLog: [],
    quizStreak: 0,
    pendingQuizCardId: null,
    milestonesHit: [],
    turnMilestones: [],
    record: emptyRecord()
  };
  if (options.scenario) {
    const weights = Object.fromEntries(state.holdings.map(h => [h.productId, h.amount / balanceConfig.startingIrp]));
    state.unlockedCards = [...new Set([...state.unlockedCards,'db-dc-irp','pricing-vs-settlement','tdf-glide'])];
    state.campaign = { scenario: options.scenario, mission: options.mission ?? 'pension', weekly: options.weekly ?? false, milestonesByMission: true,
      startingProfile: profileId, startingGoal: goal, priceIndex: 1, index: 1, peak: 1, drawdown: 0,
      open: balanceConfig.startingIrp, afterMarket: balanceConfig.startingIrp, flowStart: 0,
      benchmark: balanceConfig.startingIrp, benchmarkOpen: balanceConfig.startingIrp,
      baselineWeights: { deposit:0, shortBond:0, longBond:0, balanced:0, equityEtf:0, tdf:0, ...weights }, reviews: [], branches: [] };
  }
  if(options.defaultTrading) {
    state.defaultTrading={version:'e1',groups:[]};
    state.holdings=initializePositions(state).holdings;
  }
  // 시작 시점에 이미 넘어선 이정표(기본 목표면 90%까지)는 배너 없이 기록만 한다.
  return { ...state, milestonesHit: milestonesReached(state) };
}

/**
 * 12턴 뒤 최종 결정: 연금(20년 분할)으로 받을지 일시금으로 받을지. 점수의 목표 판정에 반영되고
 * 연금소득세·수령 요건 카드가 열린다. 끝난 판에서만 가능하다.
 */
export function choosePayout(state: GameState, choice: PayoutChoice): ActionResult {
  if (state.status !== 'finished') return { ok: false, message: '12턴을 마친 뒤에 수령 방식을 정할 수 있습니다.', state };
  const irp = portfolioValue(state);
  const plan = accountPayout(irp, choice, state.accountBasis);
  const label = choice === 'lumpSum' ? '일시금' : '연금(20년)';
  const message = choice === 'lumpSum'
    ? `일시금 수령 · 재원별 합산 세금(잔액 대비 ${Math.round(plan.taxRate * 10000) / 100}%) ${Math.round(plan.tax).toLocaleString('ko-KR')}원을 뺀 ${Math.round(plan.net).toLocaleString('ko-KR')}원.`
    : `연금 수령 · 재원별 합산 세금(잔액 대비 ${Math.round(plan.taxRate * 10000) / 100}%)을 뺀 평균 월 ${Math.round(plan.monthlyNet).toLocaleString('ko-KR')}원을 240개월.`;
  let next: GameState = {
    ...state,
    payoutChoice: choice,
    logs: [...state.logs.filter((log) => log.type !== 'payout'), { turn: state.turn, type: 'payout', message: `${label} 선택 · ${message}` }]
  };
  next = unlock(unlock(next, 'pension-tax'), 'payout-choice');
  return { ok: true, message, state: next };
}

function unlock(state: GameState, cardId: string): GameState {
  return state.unlockedCards.includes(cardId) ? state : { ...state, unlockedCards: [...state.unlockedCards, cardId] };
}

/**
 * 디폴트옵션 지정·변경·해제. 판 시작 모달과 설정이 함께 쓴다. 성향 밖 값은 추천값으로 바뀌고,
 * 지정하면 `default-option` 카드가 열린다. 진행 중 판에도 바로 적용된다(다음 「그대로」부터).
 */
export function setDefaultOption(state: GameState, wanted: DefaultOptionId | null): GameState {
  const next = wanted ? normalizeDefaultOption(state.profileId, wanted, !!state.defaultTrading) : null;
  if (next === state.defaultOption) return state;
  const name = next ? defaultOptions.find((option) => option.id === next)?.name ?? next : null;
  const message = state.defaultTrading ? (next ? `사전지정 ${name} 저장 · 자산은 바뀌지 않습니다. 디폴트옵션 메뉴에서 직접 매수하세요.` : '사전지정 해제 · 보유한 디폴트옵션 자산은 유지됩니다.') : next ? `디폴트옵션 ${name} 지정 · 「그대로」를 고르면 대기자금을 이 옵션으로 운용합니다.` : '디폴트옵션 해제 · 대기자금은 직접 매수해야 합니다.';
  const stamped: GameState = { ...state, defaultOption: next, logs: [...state.logs, { turn: state.turn, type: 'default-option', message }] };
  return next ? unlock(stamped, 'default-option') : stamped;
}

/**
 * 도착 칸 퀴즈 출제. 제도 안내 칸은 방금 연 카드(없으면 해금·미출제 카드 1장), 시장 뉴스 칸은 시드·턴이
 * 짝수일 때 1장. 칸 효과 켬/끔과 무관하게 배움 장치로 동작하며, 퀴즈는 점수의 지식 항목에만 들어간다.
 */
function queueTileQuiz(state: GameState, position: number): GameState {
  const tile = boardTiles[position];
  if (!tile) return state;
  if (tile.kind === 'policy') {
    const opened = state.tileEffects.find((effect) => effect.kind === 'policy-brief')?.cardId;
    return queueQuiz(state, opened && !state.quizLog.some((record) => record.cardId === opened) ? opened : pickQuizCard(state, state.turn));
  }
  if (tile.kind === 'market' && marketTileQuizzes(state.seed, state.turn)) return queueQuiz(state, pickQuizCard(state, state.turn));
  return state;
}

/** 퀴즈 답. `quiz-engine.answerQuiz`를 게임 행동 형태로 감싼다 */
export function submitQuiz(state: GameState, cardId: string, option: number): ActionResult & { correct: boolean } {
  const result = answerQuiz(state, cardId, option);
  return { ok: result.ok, message: result.message, state: result.state, correct: result.correct };
}

/**
 * 턴 시작. 시장이 **먼저** 움직여 보유분에 반영되고(펀드 대기 주문도 이때 체결), 그 뒤 급여·칸 효과·
 * 생활사건 순서로 열린다. 속보 카드가 보여 주는 수익률은 이미 일어난 일이고, 이번 턴 행동은 다음 턴
 * 시장에 노출된다. 지난 턴의 칸 효과·행동 기록은 여기서 비운다.
 */
export function startTurn(state: GameState, steps = 0): ActionResult {
  if (state.status === 'finished' || state.turn >= balanceConfig.maxTurns) {
    return { ok: false, message: '이미 종료된 경기입니다.', state };
  }
  if (state.awaitingAction || state.currentEventId) {
    return { ok: false, message: '이번 턴의 생활사건과 운용 행동을 먼저 완료하세요.', state };
  }
  const turn = state.turn + 1;
  const path = marketPathOf(state);
  const market = path[turn - 1] ?? emptyMarketStep();
  const scheduled = state.lifeEventSchedule.find((item) => item.turn === turn);
  const boardSize = balanceConfig.boardSize;
  const moved = Math.max(0, steps);
  const position = ((state.position + moved) % boardSize + boardSize) % boardSize;
  const crossedStart = moved > 0 && state.position + moved >= boardSize;
  const open = portfolioValue(state);
  let next: GameState = applyMarketStep({
    ...state,
    turn,
    position,
    phase: market.phase,
    marketPath: path,
    cash: Math.max(0, state.cash + balanceConfig.salarySurplusPerTurn - state.livingDebt),
    livingDebt: Math.max(0, state.livingDebt - state.cash - balanceConfig.salarySurplusPerTurn),
    logs: [...state.logs, { turn, type: 'market', message: `${market.headline} · ${market.signal}` }],
    tileEffects: [],
    actionsLeft: 1,
    turnActionLines: [],
    spotlightProductId: null,
    rebalanceBonusTurn: null,
    lifeResolution: null,
    pendingQuizCardId: null,
    turnMilestones: []
  }, market);
  const marketEffects = marketHoldingEffects(state, next);
  next = settleOrders(next);
  next = beginPerformance(state, next);
  next = {
    ...next,
    ledger: { open, afterMarket: portfolioValue(next), beforeAction: null, marketEffects },
    awaitingAction: !scheduled,
    currentEventId: scheduled?.eventId ?? null
  };
  next = unlock(next, cardForTurn(turn, path));
  next = unlock(next, pickTileBriefing(state.seed, turn, position).cardId);
  if (market.alert) next = unlock(next, ALERT_CARD_ID);
  if (market.shockId) {
    const shock = marketShocks.find((item) => item.id === market.shockId);
    if (shock) next = unlock(next, shock.cardId);
  }
  if (next.tileEffectsEnabled) {
    next = applyTileArrival(next, { position, crossedStart, scheduledEvent: Boolean(scheduled) });
  }
  next = stampVisit(queueTileQuiz(next, position));
  if (scheduled) {
    next = { ...next, eventHistory: [...next.eventHistory, scheduled.eventId] };
    return { ok: true, message: '생활사건이 발생했습니다.', state: next };
  }
  if (next.currentEventId) {
    return { ok: true, message: '생활 사건 칸에서 사건이 하나 더 왔습니다.', state: next };
  }
  return { ok: true, message: `${turn}턴 시장이 반영되었습니다. 이제 운용을 정하세요.`, state: next };
}

export function resolveActionAmount(state: GameState, kind: ActionKind, preset: AmountPreset, productId?: ProductId): number {
  const holdingAmount = productId
    ? scopedHolding(state, productId).amount
    : 0;
  const available = kind === 'contribute' ? previewContribution(state, { requested: state.cash }).available
    : kind === 'buy' ? state.irpCash
      : kind === 'sell' || kind === 'switch' ? holdingAmount
        : 0;
  const base = kind === 'contribute' ? balanceConfig.contributionAmount : balanceConfig.tradeAmount;
  if (preset === 'max') return Math.floor(available);
  if (kind === 'contribute' && state.contributionPacing) return preset === 'half' ? base / 2 : base;
  if (preset === 'half') return Math.floor(Math.min(base, available) / 2);
  return Math.min(base, available);
}

/**
 * 생활사건 해결. 선택지 규칙·비용표·기록은 `life-engine`에 있다. 'cash'·'withdraw'는 예전 호출과 호환된다.
 */
export function resolveLifeEvent(state: GameState, choice: LifeChoice): ActionResult {
  return resolveLifeChoice(state, choice);
}

function contribute(state: GameState, amount: number): ActionResult {
  const error = blockReason(contributionConstraint(state, amount));
  if (error) return { ok: false, message: error, state };
  const accepted = acceptedContribution(state, amount);
  const credit = contributionCredit(state.contributionTotal, accepted);
  const next = unlock({
    ...state,
    cash: state.cash - accepted,
    irpCash: state.irpCash + accepted,
    contributionTotal: state.contributionTotal + accepted,
    taxCreditEligible: state.taxCreditEligible + credit.eligible,
    taxCreditBenefit: state.taxCreditBenefit + credit.benefit,
    // 공제 효과는 바로 주지 않고 연말정산 칸을 지날 때 환급 장면으로 돌아온다.
    pendingTaxCredit: state.pendingTaxCredit + credit.benefit,
    understandingPoints: state.understandingPoints + 1
  }, 'contribution-limit');
  const creditNote = credit.benefit > 0
    ? `세액공제 ${Math.round(credit.benefit).toLocaleString('ko-KR')}원(교육용)은 연말정산 칸을 지날 때 생활자금으로 돌아옵니다.`
    : '공제 한도를 넘어 이번 납입은 세액공제가 없습니다.';
  const funded = addAccountFlow(next, accepted, 'contribution', credit.eligible);
  return { ok: true, message: `${accepted.toLocaleString('ko-KR')}원 추가납입. ${creditNote}`, state: funded };
}


/**
 * 운용 행동 1회. 시장은 턴 시작에 이미 반영됐으므로 여기서는 행동만 처리한다. 행동이 남아 있으면
 * (운용지시 칸) 턴을 열어 둔 채 돌아오고, 마지막 행동 뒤에 `finalizeTurn`과 정산 요약을 붙인다.
 * "그대로"는 남은 행동을 모두 쓴다.
 */
export function performAction(state: GameState, action: GameAction): ActionResult {
  const timing = actionTiming(state);
  if (!timing.enabled) return { ok: false, message: timing.reason, state };
  const opened: GameState = state.ledger.beforeAction
    ? state
    : { ...state, ledger: { ...state.ledger, beforeAction: { irp: portfolioValue(state), risk: riskAssetRatio(state), holdings: holdingsMap(state) } } };
  let result: ActionResult;
  switch (action.kind) {
    case 'contribute': result = contribute(opened, action.amount ?? balanceConfig.contributionAmount); break;
    case 'buy': result = action.productId ? buyProduct(opened, action.productId, action.amount) : { ok: false, message: '매수 상품을 선택하세요.', state }; break;
    case 'sell': result = action.productId ? sellProduct(opened, action.productId, action.amount) : { ok: false, message: '매도 상품을 선택하세요.', state }; break;
    case 'switch': result = action.fromProductId && action.toProductId ? switchProduct(opened, action.fromProductId, action.toProductId, action.amount) : { ok: false, message: '교체할 두 상품을 선택하세요.', state }; break;
    case 'rebalance': result = rebalancePortfolio(opened); break;
    case 'default-opt-in':
    case 'default-opt-out':
      result=executeDefaultTrade(opened,{tab:action.kind==='default-opt-in'?'in':'out',optionId:action.optionId??opened.defaultOption??'principal',amount:action.amount??0,fraction:action.fraction??1},action.commandId);break;
    case 'hold': {
      // 운용지시가 없으면 디폴트옵션이 대기자금을 운용한다(제도의 사전지정운용). 없으면 예전처럼 유지.
      const auto = opened.defaultTrading ? {state:opened,bought:[],message:''} : applyDefaultOption(opened);
      const ran = auto.bought.length > 0;
      result = {
        ok: true,
        message: ran ? auto.message : '이번 턴은 행동하지 않고 현재 구성을 유지했습니다.',
        state: {
          ...auto.state,
          safeActionCount: auto.state.safeActionCount + 1,
          record: ran ? { ...auto.state.record, defaultOptionRuns: auto.state.record.defaultOptionRuns + 1 } : auto.state.record
        }
      };
      break;
    }
  }
  if (!result.ok) return { ...result, state: { ...result.state, ledger: state.ledger } };
  let acted: GameState = actionLesson(result.state, action.kind);
  let message = result.message;
  if (action.kind === 'rebalance') {
    acted = { ...acted, record: { ...acted.record, rebalanceTurns: [...acted.record.rebalanceTurns, state.turn] } };
  }
  if (action.kind === 'rebalance' && opened.rebalanceBonusTurn === opened.turn) {
    acted = { ...acted, understandingPoints: acted.understandingPoints + REBALANCE_TILE_BONUS, rebalanceBonusTurn: null };
    message = `${message} 리밸런싱 칸 보너스 · 이해 +${REBALANCE_TILE_BONUS}.`;
  }
  acted = {
    ...acted,
    turnActionLines: [...acted.turnActionLines, message],
    logs: [...acted.logs, { turn: state.turn, type: 'action', message }]
  };
  const left = action.kind === 'hold' ? 0 : Math.max(0, acted.actionsLeft - 1);
  if (left > 0) {
    return { ...result, message: `${message} 이번 턴 행동 ${left}회 더 할 수 있어요.`, state: { ...acted, actionsLeft: left } };
  }
  const next = finalizeTurn({ ...acted, actionsLeft: 0 });
  return {
    ...result,
    message,
    state: next,
    summary: summarizeTurn(opened, next, acted.turnActionLines.join(' · '))
  };
}

/**
 * 턴 마감. 시장 반영은 `startTurn`으로 옮겨 갔으므로 여기서는 12턴 잔여 주문 강제 체결·잔여 환급·
 * 이력·상태만 정리한다.
 */
export function finalizeTurn(state: GameState): GameState {
  let next = state;
  if (state.turn === balanceConfig.maxTurns) {
    next = settleAllOrders(next);
    if (next.pendingTaxCredit > 0) {
      const refund = next.pendingTaxCredit;
      next = {
        ...next,
        cash: next.cash + refund,
        pendingTaxCredit: 0,
        taxCreditRefunded: next.taxCreditRefunded + refund,
        logs: [...next.logs, { turn: state.turn, type: 'refund', message: `판 마감 · 미정산 세액공제 ${Math.round(refund).toLocaleString('ko-KR')}원 일괄 환급`, impact: Math.round(refund) }]
      };
    }
  }
  next = finishPerformance(next);
  const diversified = diversificationCount(next) >= balanceConfig.diversificationMin;
  const finalized = stampMilestones({
    ...next,
    status: state.turn >= balanceConfig.maxTurns ? 'finished' : 'playing',
    awaitingAction: false,
    actionsLeft: 0,
    spotlightProductId: null,
    rebalanceBonusTurn: null,
    irpHistory: [...next.irpHistory, portfolioValue(next)],
    record: diversified ? { ...next.record, diversifiedTurns: next.record.diversifiedTurns + 1 } : next.record,
    logs: [...next.logs, { turn: state.turn, type: 'settle', message: `${state.turn}턴 마감` }]
  });
  if(finalized.campaign && [3,6,9].includes(finalized.turn)) {
    const {campaign,...rest}=finalized;
    const {branches,...progress}=campaign;
    finalized.campaign={...campaign,branches:[...branches,{turn:finalized.turn,state:structuredClone(rest),progress:structuredClone(progress)}]};
  }
  return finalized;
}

export type AutoStrategy = 'balanced' | 'passive' | 'contributor' | 'growth' | 'steward' | 'etfOnly' | 'stopLoss' | 'momentum' | 'newsChaser' | 'defaultOption' | 'withdrawer';

export const AUTO_STRATEGIES: AutoStrategy[] = ['balanced', 'passive', 'contributor', 'growth', 'steward', 'etfOnly', 'stopLoss', 'momentum', 'newsChaser', 'defaultOption', 'withdrawer'];

/** 전략이 ETF를 살 수 있도록 성향을 맞춘다. 게이트(성향 밖 매수 거절)는 그대로 둔다. */
export function defaultProfileFor(strategy: AutoStrategy): ProfileId {
  if (strategy === 'growth') return 'growth';
  if (strategy === 'etfOnly' || strategy === 'stopLoss' || strategy === 'momentum' || strategy === 'newsChaser') return 'aggressive';
  return 'balanced';
}

function holdingOf(state: GameState, productId: ProductId): number {
  return scopedHolding(state, productId).amount;
}

export interface AutoplayOptions extends GameOptions {
  goalMonthly?: number;
  /** 생활사건 선택 규칙. 기본: 모든 사건을 생활자금 쪽으로(`cash`) */
  lifeChoice?: (state: GameState, event: LifeEvent) => LifeChoice;
  /** 퀴즈 응답. `correct`는 다 맞히고 `wrong`은 다 틀리고 `none`(기본)은 풀지 않는다 */
  quiz?: 'correct' | 'wrong' | 'none';
}

function autoAnswer(state: GameState, cardId: string, mode: 'correct' | 'wrong'): GameState {
  const card = learningCards.find((item) => item.id === cardId);
  if (!card) return state;
  const option = mode === 'correct' ? card.quiz.answer : (card.quiz.answer + 1) % card.quiz.options.length;
  return answerQuiz(state, cardId, option).state;
}

/**
 * 시뮬 기본 생활사건 선택 = 고스트 "그대로 둔 나". 지출·보너스는 생활자금, 퇴직급여도 지금 받는다(일시 수령).
 * 현실에서 퇴직급여 IRP 계좌의 대다수가 곧바로 해지되는 것을 따른 기준선이라, IRP 이전은 플레이어의 판단으로 남는다.
 */
export const defaultLifeChoice: (state: GameState, event: LifeEvent) => LifeChoice = () => 'cash';

/** 허용 사유면 항상 중도인출. 게이트: balanced를 넘지 않아야 한다 */
export function withdrawerLifeChoice(state: GameState, event: LifeEvent): LifeChoice {
  if (event.kind === 'cost' && event.eligibleWithdrawal) return 'withdraw';
  return defaultLifeChoice(state, event);
}

/**
 * 자동 플레이. 시뮬·게이트·고스트가 쓴다. 기본은 고스트 없이(`ghost: false`) 돈다. 행동 2회 칸이 있어
 * 같은 턴에서 `awaitingAction`이 풀릴 때까지 전략 판단을 반복한다.
 */
export function autoplay(seed: string, strategy: AutoStrategy = 'balanced', profileId: ProfileId = defaultProfileFor(strategy), options: AutoplayOptions = {}): GameState {
  // defaultOption 전략만 추천 디폴트옵션을 지정한다. 나머지(고스트 기준선 passive 포함)는 없음.
  const defaultOption = options.defaultOption ?? (strategy === 'defaultOption' ? suggestDefaultOption(profileId) : null);
  let state = createGame(seed, profileId, options.goalMonthly ?? balanceConfig.defaultGoal, { ghost: false, ...options, defaultOption });
  let stoppedOut = false;
  const decide = (): GameAction => {
    const etfReturn = state.lastMarket.returns.equityEtf;
    let action: GameAction;
    if (strategy === 'passive') action = { kind: 'hold' };
    else if (strategy === 'newsChaser') {
      // 속보의 이번 턴 ETF 수익률을 보고 오른 뒤 사고 내린 뒤 판다. 3.2 이전에는 최적해였다.
      if (etfReturn > 0.01) {
        action = holdingOf(state, 'deposit') >= 100000
          ? { kind: 'switch', fromProductId: 'deposit', toProductId: 'equityEtf', amount: holdingOf(state, 'deposit') }
          : state.irpCash >= 100000
            ? { kind: 'buy', productId: 'equityEtf', amount: state.irpCash }
            : state.cash > balanceConfig.contributionAmount ? { kind: 'contribute' } : { kind: 'hold' };
      } else if (etfReturn < -0.01 && holdingOf(state, 'equityEtf') >= 100000) {
        action = { kind: 'switch', fromProductId: 'equityEtf', toProductId: 'deposit', amount: holdingOf(state, 'equityEtf') };
      } else action = state.cash > balanceConfig.contributionAmount ? { kind: 'contribute' } : { kind: 'hold' };
    }
    else if (strategy === 'contributor') action = state.cash > balanceConfig.contributionAmount ? { kind: 'contribute' } : { kind: 'hold' };
    // 납입 여력이 있으면 납입, 아니면 「그대로」 — 매수는 디폴트옵션에 맡긴다.
    else if (strategy === 'defaultOption' && state.defaultTrading && state.irpCash>=100000) action={kind:'default-opt-in',optionId:state.defaultOption??'principal',amount:Math.floor(state.irpCash),commandId:nextDefaultCommand(state)};
    else if (strategy === 'defaultOption') action = state.cash > balanceConfig.safeCashThreshold + balanceConfig.contributionAmount ? { kind: 'contribute' } : { kind: 'hold' };
    else if (strategy === 'growth') action = state.turn % 2 === 1
      ? { kind: 'contribute' }
      : { kind: 'buy', productId: 'equityEtf', amount: balanceConfig.contributionAmount };
    else if (strategy === 'etfOnly') action = state.turn === 1
      ? { kind: 'switch', fromProductId: 'deposit', toProductId: 'equityEtf', amount: holdingOf(state, 'deposit') }
      : state.turn % 2 === 0 && state.irpCash >= 100000
        ? { kind: 'buy', productId: 'equityEtf', amount: state.irpCash }
        : state.cash > balanceConfig.contributionAmount ? { kind: 'contribute' } : { kind: 'hold' };
    else if (strategy === 'stopLoss') {
      if (state.turn === 1) action = { kind: 'switch', fromProductId: 'deposit', toProductId: 'equityEtf', amount: holdingOf(state, 'deposit') };
      else if (!stoppedOut && etfReturn <= -0.05 && holdingOf(state, 'equityEtf') >= 100000) {
        stoppedOut = true;
        action = { kind: 'sell', productId: 'equityEtf', amount: holdingOf(state, 'equityEtf') };
      } else action = state.cash > balanceConfig.contributionAmount ? { kind: 'contribute' } : { kind: 'hold' };
    } else if (strategy === 'momentum') {
      if (etfReturn >= 0.02) action = state.irpCash >= 100000
        ? { kind: 'buy', productId: 'equityEtf', amount: state.irpCash }
        : { kind: 'contribute' };
      else if (etfReturn <= -0.02 && holdingOf(state, 'equityEtf') >= 200000) action = { kind: 'sell', productId: 'equityEtf', amount: holdingOf(state, 'equityEtf') / 2 };
      else action = { kind: 'hold' };
    } else if (strategy === 'steward') {
      const pension = portfolioValue(state) / policyRules.receivingMonths;
      action = pension < state.goalMonthly && state.cash > balanceConfig.safeCashThreshold + balanceConfig.contributionAmount
        ? { kind: 'contribute' }
        : state.turn >= 9
          ? { kind: 'rebalance' }
          : { kind: 'hold' };
    } else action = state.turn % 4 === 0 || state.turn >= 11 // balanced · withdrawer
      ? { kind: 'rebalance' }
      : state.cash > balanceConfig.safeCashThreshold + balanceConfig.contributionAmount
        ? { kind: 'contribute' }
        : { kind: 'hold' };
    return action;
  };
  const quizMode = options.quiz ?? 'none';
  while (state.status === 'playing') {
    state = startTurn(state, diceStepsForTurn(state.seed, state.turn)).state;
    if (quizMode !== 'none' && state.pendingQuizCardId) state = autoAnswer(state, state.pendingQuizCardId, quizMode);
    if (state.currentEventId) {
      const event = inflatedEvent(state, lifeEvents.find((item) => item.id === state.currentEventId)!);
      const choose = options.lifeChoice ?? (strategy === 'withdrawer' ? withdrawerLifeChoice : defaultLifeChoice);
      const resolved = resolveLifeEvent(state, choose(state, event));
      state = resolved.ok ? resolved.state : resolveLifeEvent(state, defaultLifeChoice(state, event)).state;
      // 기본 선택까지 거절되면 startTurn이 같은 상태를 돌려줘 무한 루프가 되므로 바로 알린다.
      if (state.currentEventId) throw new Error(`autoplay: 생활사건 ${event.id}을 해결할 수 없습니다 (${strategy})`);
    }
    while (state.status === 'playing' && state.awaitingAction) {
      const acted = performAction(state, decide());
      state = acted.ok ? acted.state : performAction(state, { kind: 'hold' }).state;
    }
  }
  if (quizMode !== 'none') {
    for (const card of finalQuizCards(state)) state = autoAnswer(state, card.id, quizMode);
  }
  return state;
}

export function contentCount(): number {
  return marketScenario.length + lifeEvents.length + learningCards.length;
}
