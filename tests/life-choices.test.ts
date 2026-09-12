import { describe, expect, it } from 'vitest';
import { balanceConfig, lifeEvents, policyRules } from '../src/data/content';
import { lifeChoicesFor, resolveLifeChoice } from '../src/engine/life-engine';
import { autoplay, createGame, defaultLifeChoice, performAction, resolveLifeEvent, startTurn } from '../src/engine/game-engine';
import { portfolioValue } from '../src/engine/portfolio-engine';
import { calculateScore } from '../src/engine/scoring-engine';
import { summarizeTurn } from '../src/engine/settlement-engine';
import type { GameState, LifeChoice, LifeEvent } from '../src/types';

const event = (id: string): LifeEvent => lifeEvents.find((item) => item.id === id)!;
const withEvent = (state: GameState, id: string): GameState => ({ ...startTurn(state, 3).state, currentEventId: id, awaitingAction: false });
const base = () => createGame('life-1', 'balanced', 500_000, { ghost: false });

describe('생활사건 12종(3.5)', () => {
  it('사건은 12종이고 종류·비용·카드가 맞는다', () => {
    expect(lifeEvents).toHaveLength(12);
    const kinds = new Map(lifeEvents.map((item) => [item.id, item.kind]));
    expect(kinds.get('medical')).toBe('cost');
    expect(kinds.get('bonus')).toBe('bonus');
    expect(kinds.get('yearend-bonus')).toBe('bonus');
    expect(kinds.get('severance')).toBe('transfer');
    for (const item of lifeEvents) {
      if (item.kind === 'cost') expect(item.cost).toBeGreaterThan(0);
      else expect(item.cost).toBeLessThan(0);
    }
    expect(lifeEvents.filter((item) => item.eligibleWithdrawal).map((item) => item.id).sort()).toEqual(['housing', 'medical']);
  });
});

describe('선택지 표(lifeChoicesFor)', () => {
  it('비용 사건: 생활자금·예금 해지·중도인출 3개, 불가 사유는 비활성 + 이유', () => {
    const state = withEvent(base(), 'moving');
    const choices = lifeChoicesFor(state, event('moving'));
    expect(choices.map((choice) => choice.id)).toEqual(['cash', 'deposit', 'withdraw']);
    expect(choices[0].enabled).toBe(true);
    expect(choices[1].enabled).toBe(false);
    expect(choices[2].enabled).toBe(false);
    expect(choices[2].reason).toContain('사유');
    for (const choice of choices) {
      expect(choice.immediate.length).toBeGreaterThan(0);
      expect(choice.longTerm.length).toBeGreaterThan(0);
    }
  });

  it('허용 사유면 중도인출이 활성이고 수수료가 표에 보인다', () => {
    const choices = lifeChoicesFor(withEvent(base(), 'medical'), event('medical'));
    const withdraw = choices.find((choice) => choice.id === 'withdraw')!;
    expect(withdraw.enabled).toBe(true);
    expect(withdraw.immediate).toContain('재원별 세금');
    expect(withdraw.immediate).not.toContain('3%');
  });

  it('예금이 없으면 예금 해지는 비활성', () => {
    const state = withEvent(base(), 'moving');
    const noDeposit: GameState = { ...state, holdings: state.holdings.filter((holding) => holding.productId !== 'deposit') };
    const deposit = lifeChoicesFor(noDeposit, event('moving')).find((choice) => choice.id === 'deposit')!;
    expect(deposit.enabled).toBe(false);
  });

  it('보너스: 전액 납입·절반 납입·생활자금 유지', () => {
    const choices = lifeChoicesFor(withEvent(base(), 'bonus'), event('bonus'));
    expect(choices.map((choice) => choice.id)).toEqual(['contribute-all', 'contribute-half', 'cash']);
    expect(choices.every((choice) => choice.enabled)).toBe(true);
    expect(choices[0].immediate).toContain('환급 대기');
  });

  it('이직 퇴직금: IRP 이전(세금 없음) · 일시 수령(16.5%)', () => {
    const choices = lifeChoicesFor(withEvent(base(), 'severance'), event('severance'));
    expect(choices.map((choice) => choice.id)).toEqual(['transfer-irp', 'cash']);
    expect(choices[1].label).toBe('지금 받기(일시 수령)');
    expect(choices[1].immediate).toContain('퇴직소득세 60,000원');
  });
});

describe('선택 실행(resolveLifeChoice)', () => {
  it.each(lifeEvents.filter(e => e.kind === 'cost'))('$id: 잔액 경계에서도 미리보기와 실제 지급이 일치하고 IRP는 유지된다', event => {
    for (const cash of [0, event.cost - 1, event.cost]) {
      const state = { ...withEvent(base(), event.id), cash };
      const before = structuredClone(state);
      const preview = lifeChoicesFor(state, event).find(c => c.id === 'cash')!.payment!;
      const out = resolveLifeChoice(state, 'cash');
      expect(state).toEqual(before);
      expect(out.ok).toBe(true);
      expect(state.cash - out.state.cash).toBe(preview.cashPaid);
      expect(out.state.livingDebt - state.livingDebt).toBe(preview.unpaid);
      expect(portfolioValue(out.state) - portfolioValue(state)).toBe(preview.irpDelta);
      expect(out.state.holdings).toEqual(state.holdings);
      expect(out.state.pendingOrders).toEqual(state.pendingOrders);
      expect(out.state.defaultOption).toBe(state.defaultOption);
      if (!event.eligibleWithdrawal) {
        for (const choice of ['deposit', 'withdraw'] as const) {
          expect(lifeChoicesFor(state, event).find(c => c.id === choice)!.enabled).toBe(false);
          expect(resolveLifeChoice(state, choice).state).toBe(state);
        }
      }
    }
  });

  it.each(['medical', 'housing'])('%s: 허용 인출의 재원별 세금과 IRP 감소도 미리보기와 일치한다', id => {
    const state = withEvent(base(), id);
    for (const choice of ['deposit', 'withdraw'] as const) {
      const preview = lifeChoicesFor(state, event(id)).find(c => c.id === choice)!;
      const out = resolveLifeChoice(state, choice);
      expect(preview.enabled).toBe(true);
      expect(out.ok).toBe(true);
      expect(out.state.lifeResolution!.irpDelta).toBeCloseTo(preview.payment!.irpDelta, 4);
      expect(out.state.lifeResolution!.fee).toBeCloseTo(preview.payment!.tax, 4);
      expect(out.state.lifeResolution!.penalty).toBeCloseTo(preview.payment!.penalty, 4);
    }
  });

  it('생활자금 지급: 예전과 같고 기록이 남는다', () => {
    const state = withEvent(base(), 'moving');
    const out = resolveLifeChoice(state, 'cash');
    expect(out.ok).toBe(true);
    expect(out.state.cash).toBeCloseTo(state.cash - 2_500_000, 0);
    expect(out.state.lifeResolution?.choice).toBe('cash');
    expect(out.state.lifeResolution?.cashDelta).toBeCloseTo(-2_500_000, 0);
    expect(out.state.lifeResolution?.alternative).toBe('');
    expect(out.state.awaitingAction).toBe(true);
    expect(out.state.currentEventId).toBeNull();
  });

  it('비허용 사건은 예금 해지로도 계좌 밖 지급을 우회하지 못한다', () => {
    const state = withEvent(base(), 'moving');
    const out = resolveLifeChoice(state, 'deposit');
    expect(out.ok).toBe(false);
    expect(out.state).toBe(state);
  });

  it('결제 자금이 부족하면 인출은 거절하고 생활자금 경로를 사용한다', () => {
    const state = withEvent(base(), 'medical');
    const onlyFund: GameState = { ...state, holdings: state.holdings.filter(h => h.productId !== 'deposit') };
    expect(resolveLifeChoice(onlyFund, 'deposit').ok).toBe(false);
    expect(resolveLifeChoice(onlyFund, 'cash').ok).toBe(true);
  });

  it('중도인출은 재원별 세금과 공통 거래 비용을 따로 기록한다', () => {
    const state = withEvent(base(), 'medical');
    const out = resolveLifeChoice(state, 'withdraw');
    expect(out.ok).toBe(true);
    const resolution = out.state.lifeResolution!;
    expect(portfolioValue(state) - portfolioValue(out.state)).toBeCloseTo(3_500_000 + resolution.fee + resolution.penalty, 4);
    expect(out.state.cash).toBe(state.cash);
    expect(resolution.fee).not.toBe(3_500_000 * .03);
    expect(resolveLifeChoice(withEvent(base(), 'moving'), 'withdraw').ok).toBe(false);
  });

  it('보너스 전액 납입: 연간 한도 안에서 IRP 대기자금으로, 공제는 환급 대기', () => {
    const state = withEvent(base(), 'bonus');
    const out = resolveLifeChoice(state, 'contribute-all');
    expect(out.ok).toBe(true);
    expect(out.state.irpCash).toBeCloseTo(state.irpCash + 2_500_000, 0);
    expect(out.state.cash).toBeCloseTo(state.cash, 0);
    expect(out.state.contributionTotal).toBeCloseTo(2_500_000, 0);
    expect(out.state.pendingTaxCredit).toBeCloseTo(2_500_000 * policyRules.taxCreditRate, 0);
    const half = resolveLifeChoice(state, 'contribute-half');
    expect(half.state.irpCash).toBeCloseTo(state.irpCash + 1_250_000, 0);
    expect(half.state.cash).toBeCloseTo(state.cash + 1_250_000, 0);
  });

  it('보너스를 생활자금으로: 예전과 같다', () => {
    const state = withEvent(base(), 'bonus');
    const out = resolveLifeChoice(state, 'cash');
    expect(out.state.cash).toBeCloseTo(state.cash + 2_500_000, 0);
    expect(out.state.irpCash).toBe(state.irpCash);
  });

  it('이직 퇴직금: IRP 이전은 전액 대기자금, 일시 수령은 16.5% 차감', () => {
    const state = withEvent(base(), 'severance');
    const irp = resolveLifeChoice(state, 'transfer-irp');
    expect(irp.state.irpCash).toBeCloseTo(state.irpCash + 6_000_000, 0);
    expect(irp.state.contributionTotal).toBe(state.contributionTotal);
    const cash = resolveLifeChoice(state, 'cash');
    expect(cash.state.cash).toBeCloseTo(state.cash + 5_940_000, 0);
    expect(cash.state.lifeResolution?.fee).toBeCloseTo(60_000, 0);
    expect(cash.state.lifeResolution?.choiceLabel).toBe('지금 받기(일시 수령)');
  });

  it('사건 종류에 맞지 않는 선택은 거절하고, cash는 어떤 사건에서도 받는다', () => {
    expect(resolveLifeChoice(withEvent(base(), 'bonus'), 'deposit').ok).toBe(false);
    expect(resolveLifeChoice(withEvent(base(), 'moving'), 'contribute-all').ok).toBe(false);
    expect(resolveLifeChoice(withEvent(base(), 'severance'), 'transfer-irp').ok).toBe(true);
    for (const id of ['moving', 'bonus', 'severance'] as const) expect(resolveLifeChoice(withEvent(base(), id), 'cash').ok).toBe(true);
  });
});

describe('게임 엔진 연결', () => {
  it('resolveLifeEvent는 새 선택지를 받고, 정산 요약에 사건 블록이 붙고, 다음 턴에 비워진다', () => {
    const state = withEvent(base(), 'moving');
    const resolved = resolveLifeEvent(state, 'cash');
    expect(resolved.ok).toBe(true);
    const acted = performAction(resolved.state, { kind: 'hold' });
    expect(acted.summary?.lifeEvent?.eventId).toBe('moving');
    expect(acted.summary?.lifeEvent?.choice).toBe('cash');
    const next = startTurn(acted.state, 2).state;
    expect(next.lifeResolution).toBeNull();
  });

  it('사건이 없는 턴의 요약은 lifeEvent가 null', () => {
    const state = startTurn(base(), 2).state;
    const noEvent: GameState = { ...state, currentEventId: null, awaitingAction: true, lifeResolution: null };
    const acted = performAction(noEvent, { kind: 'hold' });
    expect(acted.summary?.lifeEvent).toBeNull();
    expect(summarizeTurn(noEvent, acted.state, 'x').lifeEvent).toBeNull();
  });

  it('withdrawer 전략은 12턴을 마치고 balanced보다 별 평균이 높지 않다', () => {
    const seeds = Array.from({ length: 24 }, (_, index) => `life-gate-${index}`);
    let withdrawerStars = 0;
    let balancedStars = 0;
    let withdrew = 0;
    for (const seed of seeds) {
      const w = autoplay(seed, 'withdrawer', 'balanced');
      const b = autoplay(seed, 'balanced', 'balanced');
      expect(w.status).toBe('finished');
      expect(w.irpHistory).toHaveLength(balanceConfig.maxTurns + 1);
      withdrawerStars += calculateScore(w).stars;
      balancedStars += calculateScore(b).stars;
      if (w.logs.some((log) => log.type === 'life' && log.message.includes('인출'))) withdrew += 1;
    }
    expect(withdrew).toBeGreaterThan(0);
    expect(withdrawerStars).toBeLessThanOrEqual(balancedStars);
  });

  it('기준선(고스트·passive)은 모든 사건을 cash로 풀고, 퇴직급여를 IRP로 옮기는 판단은 같은 시드에서 월 연금을 올린다', () => {
    for (const event of lifeEvents) expect(defaultLifeChoice(base(), event)).toBe('cash');
    const saver = (_state: GameState, event: LifeEvent): LifeChoice => (event.kind === 'transfer' ? 'transfer-irp' : 'cash');
    let severanceSeeds = 0;
    for (let index = 0; index < 60; index += 1) {
      const seed = `severance-gate-${index}`;
      const passive = autoplay(seed, 'passive');
      if (!passive.eventHistory.includes('severance')) continue;
      severanceSeeds += 1;
      const kept = autoplay(seed, 'passive', 'balanced', { lifeChoice: saver });
      expect(calculateScore(kept).monthlyPension).toBeGreaterThan(calculateScore(passive).monthlyPension);
      expect(kept.cash).toBeLessThan(passive.cash);
    }
    expect(severanceSeeds).toBeGreaterThan(0);
  });
});
