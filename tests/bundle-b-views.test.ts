import { describe, expect, it } from 'vitest';
import { learningCards, lifeEvents } from '../src/data/content';
import { createGame, performAction, setDefaultOption, startTurn, submitQuiz } from '../src/engine/game-engine';
import { payoutPlan } from '../src/engine/scoring-engine';
import type { GameState, LifeResolution, TurnSummary } from '../src/types';
import { renderDefaultOptionCards, renderDefaultOptionModal } from '../src/ui/default-option-view';
import { renderLifeModal, renderLifeSettleBlock } from '../src/ui/life-view';
import { renderPayoutLine, renderPayoutModal } from '../src/ui/payout-view';
import { renderLearnedBlock, renderQuizModal } from '../src/ui/quiz-view';
import { renderSettlementModal } from '../src/ui/settlement';

const event = (id: string) => lifeEvents.find((item) => item.id === id)!;
const withEvent = (state: GameState, id: string): GameState => ({ ...state, currentEventId: id, awaitingAction: false });
const count = (html: string, needle: string) => html.split(needle).length - 1;

describe('생활사건 3지선다 모달(life-view)', () => {
  it('비용 사건: 선택지 3개를 data-action="resolve-life"로 그리고, 불가 사유는 잠근 채 이유를 보인다', () => {
    const state = withEvent(createGame('lv-1', 'balanced'), 'repair');
    const html = renderLifeModal(state, event('repair'), { cash: state.cash });
    expect(count(html, 'data-action="resolve-life"')).toBe(3);
    expect(html).toContain('data-choice="cash"');
    expect(html).toContain('data-choice="deposit"');
    expect(html).toContain('data-choice="withdraw"');
    expect(html).toContain('필요 금액');
    expect(html).toContain('지금:');
    expect(html).toContain('나중:');
    // car는 법정 중도인출 사유가 아니다 → 잠금 + 이유
    expect(event('repair').eligibleWithdrawal).toBe(false);
    expect(html).toContain('법정 중도인출 사유');
    expect(html).toMatch(/data-choice="withdraw"[^>]*disabled/);
  });

  it('생활자금이 모자라면 자동 충당 안내를 덧붙인다', () => {
    const state = withEvent({ ...createGame('lv-2', 'balanced'), cash: 500_000 }, 'repair');
    const html = renderLifeModal(state, event('repair'), { cash: state.cash });
    expect(html).toContain('모자랍니다');
    expect(html).toContain('자동 매도');
  });

  it('보너스 사건은 납입 두 가지와 생활자금, 이전 사건은 IRP 이전과 지금 받기를 보인다', () => {
    const bonus = withEvent(createGame('lv-3', 'balanced'), 'bonus');
    const bonusHtml = renderLifeModal(bonus, event('bonus'), { cash: bonus.cash });
    expect(bonusHtml).toContain('data-choice="contribute-all"');
    expect(bonusHtml).toContain('data-choice="contribute-half"');
    expect(bonusHtml).toContain('data-choice="cash"');
    expect(bonusHtml).toContain('들어온 금액');
    const transfer = withEvent(createGame('lv-3', 'balanced'), 'severance');
    const transferHtml = renderLifeModal(transfer, event('severance'), { cash: transfer.cash });
    expect(count(transferHtml, 'data-action="resolve-life"')).toBe(2);
    expect(transferHtml).toContain('data-choice="transfer-irp"');
    expect(transferHtml).toContain('지금 받기');
    expect(transferHtml).toContain('퇴직급여');
  });

  it('정산 「사건」 블록은 선택·금액 변화·다른 선택 한 줄을 담고, 사건이 없으면 빈 문자열', () => {
    const resolution: LifeResolution = {
      eventId: 'repair', title: '집 수리', kind: 'cost', choice: 'deposit', choiceLabel: '예금 중도해지로 해결',
      cost: 2_500_000, cashDelta: 0, irpDelta: -2_530_000, penalty: 30_000, fee: 0,
      sales: [{ productId: 'deposit', amount: 2_530_000, penalty: 30_000 }], shortage: false,
      alternative: '생활자금으로 냈다면 IRP는 그대로였습니다.', message: '예금을 깨서 냈습니다.'
    };
    const html = renderLifeSettleBlock(resolution);
    expect(html).toContain('사건 · 집 수리');
    expect(html).toContain('예금 중도해지로 해결');
    expect(html).toContain('IRP <b class="neg">-2,530,000원</b>');
    expect(html).toContain('불이익');
    expect(html).toContain('매도 1건');
    expect(html).toContain('생활자금으로 냈다면');
    expect(renderLifeSettleBlock(null)).toBe('');
  });
});

describe('퀴즈 모달(quiz-view)', () => {
  const card = learningCards[0];

  it('답하기 전: 선택지 3개 + 건너뛰기, 「계속」은 없다', () => {
    const html = renderQuizModal(card, { picked: null, progress: null, characters: true, streak: 0 });
    expect(count(html, 'data-action="quiz-pick"')).toBe(3);
    expect(html).toContain('data-action="quiz-skip"');
    expect(html).not.toContain('data-action="quiz-next"');
    expect(html).toContain(card.quiz.q);
    expect(html).toContain('한 문제 · 배운 카드에서');
  });

  it('정답 뒤: 정답 표시·해설·「계속」, 선택지는 잠긴다', () => {
    const html = renderQuizModal(card, { picked: card.quiz.answer, progress: null, characters: false, streak: 1 });
    expect(html).toContain('정답!');
    expect(html).toContain(card.quiz.why);
    expect(html).toContain('data-action="quiz-next"');
    expect(html).not.toContain('data-action="quiz-skip"');
    expect(count(html, 'class="quiz-option correct"')).toBe(1);
    expect(count(html, 'disabled')).toBeGreaterThanOrEqual(3);
  });

  it('오답 뒤: 정답을 알려 주고 벌점 없음을 말한다. 3연속이면 연속 수를 보인다', () => {
    const wrong = (card.quiz.answer + 1) % 3;
    const html = renderQuizModal(card, { picked: wrong, progress: null, characters: true, streak: 0 });
    expect(html).toContain('아쉬워요');
    expect(html).toContain(`정답은 「${card.quiz.options[card.quiz.answer]}」`);
    expect(html).toContain('벌점이 없습니다');
    expect(html).toContain('class="quiz-option wrong"');
    const streak = renderQuizModal(card, { picked: card.quiz.answer, progress: null, characters: true, streak: 3 });
    expect(streak).toContain('3연속');
  });

  it('마무리 퀴즈는 진행(n / 총)을 보이고 마지막 문항만 「계속」, 그 전은 「다음 문제」', () => {
    const mid = renderQuizModal(card, { picked: card.quiz.answer, progress: { index: 0, total: 3 }, characters: true, streak: 1 });
    expect(mid).toContain('마무리 퀴즈 · 1 / 3');
    expect(mid).toContain('다음 문제');
    const last = renderQuizModal(card, { picked: card.quiz.answer, progress: { index: 2, total: 3 }, characters: true, streak: 1 });
    expect(last).toContain('마무리 퀴즈 · 3 / 3');
    expect(last).toContain('>계속<');
  });

  it('결과 「배운 것」: 안 풀었으면 안내, 풀었으면 정답 수와 카드 목록', () => {
    const fresh = createGame('qv-1', 'balanced');
    expect(renderLearnedBlock(fresh)).toContain('퀴즈를 풀지 않았습니다');
    const cardId = fresh.unlockedCards[0];
    const target = learningCards.find((item) => item.id === cardId)!;
    const answered = submitQuiz(fresh, cardId, target.quiz.answer).state;
    const html = renderLearnedBlock(answered);
    expect(html).toContain('퀴즈 1/1 정답');
    expect(html).toContain(target.title);
    expect(html).toContain('class="ok"');
  });
});

describe('수령 방식 모달(payout-view)', () => {
  it('연금·일시금 카드 두 장을 data-choice로 그리고 세금·목표 판정을 나란히 보인다', () => {
    const state: GameState = { ...createGame('pv-1', 'balanced'), status: 'finished' };
    const html = renderPayoutModal(state, { characters: true, current: null });
    expect(html).toContain('data-choice="annuity20"');
    expect(html).toContain('data-choice="lumpSum"');
    expect(count(html, 'data-action="choose-payout"')).toBe(2);
    expect(html).toContain('연금(20년)');
    expect(html).toContain('일시금');
    expect(html).toContain('미공제 원금');
    expect(html).toContain('이연세액');
    expect(html).toContain('목표 판정 기준');
    expect(html).not.toContain('payout-card annuity current');
    const chosen = renderPayoutModal({ ...state, payoutChoice: 'lumpSum' }, { characters: false, current: 'lumpSum' });
    expect(chosen).toContain('payout-card lump current');
  });

  it('결과 줄은 고른 방식과 세율을 말한다', () => {
    expect(renderPayoutLine(payoutPlan(120_000_000, 'annuity20'))).toContain('연금(20년) 수령 · 세금 5.5%');
    const lump = renderPayoutLine(payoutPlan(120_000_000, 'lumpSum'));
    expect(lump).toContain('일시금 수령');
    expect(lump).toContain('16.5%');
    expect(lump).toContain('19,800,000원 차감');
  });
});

describe('디폴트옵션 모달(default-option-view)', () => {
  it('카드 4장, 성향 밖은 잠금 + 등급 이유, 추천에는 태그, 명시적인 미지정이면 체크하지 않는다', () => {
    const html = renderDefaultOptionCards({ profileId: 'stable', current: null, characters: true, mode: 'start' });
    expect(count(html, 'data-action="pick-default-option"')).toBe(4);
    expect(html).toMatch(/data-option="midRisk"[^>]*disabled/);
    expect(html).toMatch(/data-option="highRisk"[^>]*disabled/);
    expect(html).not.toMatch(/data-option="principal"[^>]*disabled/);
    expect(html).toContain('성향 추천');
    expect(html).toContain('성향 밖');
    expect(html).not.toContain('aria-checked="true"');
  });

  it('시작 모드는 「중위험으로 시작」+「지정 안 함」, 설정 모드는 「저장」+「지정 해제」', () => {
    const start = renderDefaultOptionModal({ profileId: 'balanced', current: 'midRisk', characters: true, mode: 'start' });
    expect(start).toContain('중위험으로 시작');
    expect(start).toContain('지정 안 함');
    expect(start).toContain('data-action="confirm-default-option"');
    expect(start).toContain('data-action="skip-default-option"');
    expect(start).toContain('자동 균등 매수');
    const settings = renderDefaultOptionModal({ profileId: 'balanced', current: 'midRisk', characters: false, mode: 'settings' });
    expect(settings).toContain('중위험으로 저장');
    expect(settings).toContain('지정 해제');
  });
});

describe('setDefaultOption(진행 중 판)', () => {
  it('지정하면 카드가 열리고 로그가 남는다. 성향 밖은 추천값으로, null은 해제', () => {
    const game = createGame('sdo-1', 'stable');
    const set = setDefaultOption(game, 'highRisk');
    expect(set.defaultOption).toBe('principal');
    expect(set.unlockedCards).toContain('default-option');
    expect(set.logs.at(-1)?.type).toBe('default-option');
    const same = setDefaultOption(set, 'principal');
    expect(same).toBe(set);
    const cleared = setDefaultOption(set, null);
    expect(cleared.defaultOption).toBeNull();
    expect(cleared.logs.at(-1)?.message).toContain('해제');
  });

  it('진행 중 지정하면 다음 「그대로」부터 대기자금을 운용한다', () => {
    let state = createGame('sdo-2', 'balanced');
    state = startTurn(state, 3).state;
    while (state.currentEventId) state = { ...state, currentEventId: null, awaitingAction: true };
    state = { ...state, irpCash: 2_000_000 };
    state = setDefaultOption(state, 'midRisk');
    const held = performAction(state, { kind: 'hold' });
    expect(held.ok).toBe(true);
    expect(held.message).toContain('디폴트옵션(중위험)');
    expect(held.state.irpCash).toBeLessThan(100_000);
  });
});

describe('12턴째 정산 창', () => {
  const summary: TurnSummary = {
    turn: 12, marketHeadline: '마지막 턴', shock: false, actionLine: '그대로', actionLines: ['그대로'],
    irpBefore: 120_000_000, irpAfter: 120_000_000, irpOpen: 119_000_000, irpAfterMarket: 120_000_000,
    marketDelta: 1_000_000, lifeDelta: 0, actionDelta: 0, riskBefore: 0.4, riskAfter: 0.4, marketLimitExceeded: false,
    productDeltas: [], nextHints: ['수고했습니다'], productReturns: { deposit: 0, shortBond: 0, longBond: 0, balanced: 0.01, equityEtf: 0, tdf: 0 },
    holdingShares: { deposit: 0.6, shortBond: 0, longBond: 0, balanced: 0.4, equityEtf: 0, tdf: 0 }, biggestMover: 'balanced', reaction: '끝',
    tileEffects: [], ghostIrp: null, lifeEvent: null, milestones: []
  };

  it('final이면 버튼이 마무리(퀴즈·수령 방식)로 이어지고 「마지막 턴」 배지가 붙는다', () => {
    const html = renderSettlementModal(summary, { characters: false, final: true });
    expect(html).toContain('마무리로 · 퀴즈와 수령 방식');
    expect(html).toContain('마지막 턴');
    expect(html).not.toContain('다음 턴 준비');
    expect(renderSettlementModal(summary, { characters: false })).toContain('다음 턴 준비');
  });

  it('이정표 배너는 cheer/warn 색과 100% 컨페티(동작 줄이기면 없음)를 그린다', () => {
    const cheer: TurnSummary = { ...summary, milestones: [{ id: 'goal-100', turn: 12, title: '목표 월 연금 도달!', detail: '지켰습니다', tone: 'cheer' }] };
    const html = renderSettlementModal(cheer, { characters: false });
    expect(html).toContain('milestone-banner cheer goal-100');
    expect(html).toContain('class="confetti"');
    expect(renderSettlementModal(cheer, { characters: false, reducedMotion: true })).not.toContain('class="confetti"');
    const warn: TurnSummary = { ...summary, milestones: [{ id: 'drawdown-12', turn: 12, title: '낙폭 12% 초과', detail: '조심', tone: 'warn' }] };
    expect(renderSettlementModal(warn, { characters: false })).toContain('milestone-banner warn drawdown-12');
  });
});
