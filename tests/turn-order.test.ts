import { describe, expect, it } from 'vitest';
import { balanceConfig, products } from '../src/data/content';
import { AUTO_STRATEGIES, autoplay, createGame, performAction, resolveLifeEvent, startTurn } from '../src/engine/game-engine';
import { portfolioValue } from '../src/engine/portfolio-engine';
import { calculateScore } from '../src/engine/scoring-engine';
import type { GameState, ProductId } from '../src/types';

const OPTIONS = { ghost: false, tileEffects: false };

function holding(state: GameState, productId: ProductId): number {
  return state.holdings.find((item) => item.productId === productId)?.amount ?? 0;
}

/** 생활사건이 없는 첫 턴을 열고 운용 대기 상태로 만든다. */
function openTurn(seed: string, profile: 'balanced' | 'aggressive' = 'balanced', steps = 1): GameState {
  let state = startTurn(createGame(seed, profile, balanceConfig.defaultGoal, OPTIONS), steps).state;
  if (state.currentEventId) state = resolveLifeEvent(state, 'cash').state;
  return state;
}

describe('3.2 뉴스는 이미 가격에 반영 — 시장이 먼저, 행동은 그 뒤', () => {
  it('턴 시작에 이번 턴 수익률이 보유분에 반영되고 장부에 시장 전·후가 남는다', () => {
    const created = createGame('order-open', 'balanced', balanceConfig.defaultGoal, OPTIONS);
    const started = startTurn(created, 1).state;
    const step = created.marketPath[0];
    for (const product of products) {
      const before = holding(created, product.id);
      if (before <= 0) continue;
      const gross = product.id === 'deposit' ? before * (1 + balanceConfig.market.depositBase + balanceConfig.market.depositPerRatePct * balanceConfig.market.rateStartPct) : before * (1 + step.returns[product.id]);
      expect(holding(started, product.id)).toBeCloseTo(gross - gross * product.feeRate, 2);
    }
    expect(started.ledger.open).toBe(balanceConfig.startingIrp);
    expect(started.ledger.afterMarket).toBeCloseTo(portfolioValue(started), 6);
    expect(started.ledger.beforeAction).toBeNull();
  });

  it('행동 뒤 마감은 시장을 다시 적용하지 않는다', () => {
    const state = openTurn('order-hold');
    const held = performAction(state, { kind: 'hold' });
    expect(held.ok).toBe(true);
    for (const product of products) {
      expect(holding(held.state, product.id)).toBeCloseTo(holding(state, product.id), 6);
    }
    expect(held.state.awaitingAction).toBe(false);
    expect(held.state.irpHistory.at(-1)).toBeCloseTo(portfolioValue(held.state), 6);
  });

  it('속보를 보고 산 ETF는 이번 턴 수익률을 받지 않는다(다음 턴 시장에 노출)', () => {
    const state = { ...openTurn('order-etf', 'aggressive'), holdings: [{ productId: 'deposit' as const, amount: 20000000, principal: 20000000, depositTurnsHeld: 0 }], irpCash: 5_000_000 };
    const bought = performAction(state, { kind: 'buy', productId: 'equityEtf', amount: 5_000_000 });
    expect(bought.ok).toBe(true);
    expect(holding(bought.state, 'equityEtf')).toBe(5_000_000);
    const nextTurn = startTurn(bought.state, 1).state;
    const nextReturn = state.marketPath[state.turn].returns.equityEtf;
    const etf = products.find((item) => item.id === 'equityEtf')!;
    const gross = 5_000_000 * (1 + nextReturn);
    expect(holding(nextTurn, 'equityEtf')).toBeCloseTo(gross - gross * etf.feeRate, 2);
  });

  it('펀드 매수는 다음 턴 가격 확정 전에 지난 수익률을 받지 않는다', () => {
    const state = { ...openTurn('order-fund'), irpCash: 2_000_000 };
    const bought = performAction(state, { kind: 'buy', productId: 'shortBond', amount: 2_000_000 });
    expect(bought.ok).toBe(true);
    expect(bought.state.pendingOrders).toHaveLength(1);
    expect(holding(bought.state, 'shortBond')).toBe(0);
    const nextTurn = startTurn(bought.state, 1).state;
    expect(nextTurn.pendingOrders).toHaveLength(1);
    expect(nextTurn.pendingOrders[0].stage).toBe('priced');
    expect(holding(nextTurn, 'shortBond')).toBe(0);
    expect(nextTurn.pendingOrders[0].amount).toBe(2_000_000);
  });

  it('무행동 경로의 최종 IRP는 예금 약정과 투자상품 시장수익을 각각 반영한 값이다', () => {
    const done = autoplay('order-passive', 'passive', undefined, OPTIONS);
    const path = done.marketPath;
    let expected = 0;
    for (const product of products) {
      let amount = balanceConfig.startingIrp * balanceConfig.defaultAllocation[product.id];
      if (amount <= 0) continue;
      if (product.id === 'deposit') {
        expected += amount * (1 + balanceConfig.depositMaturityTurns * (balanceConfig.market.depositBase + balanceConfig.market.depositPerRatePct * balanceConfig.market.rateStartPct));
        continue;
      }
      for (const step of path) {
        const gross = amount * (1 + step.returns[product.id]);
        amount = gross - gross * product.feeRate;
      }
      expected += amount;
    }
    expect(portfolioValue(done)).toBeCloseTo(expected, 0);
    expect(done.status).toBe('finished');
    expect(done.irpHistory).toHaveLength(13);
  });

  it('정산 요약은 시장이 한 일·생활사건·내가 한 일을 세 구간으로 나눈다', () => {
    const state = { ...openTurn('order-summary'), cash: 5_000_000 };
    const result = performAction(state, { kind: 'contribute', amount: 1_000_000 });
    const summary = result.summary!;
    expect(summary.irpOpen).toBe(balanceConfig.startingIrp);
    expect(summary.irpAfterMarket).toBeCloseTo(state.ledger.afterMarket, 6);
    expect(summary.irpBefore).toBeCloseTo(portfolioValue(state), 6);
    expect(summary.irpAfter).toBeCloseTo(portfolioValue(result.state), 6);
    expect(summary.marketDelta).toBeCloseTo(summary.irpAfterMarket - summary.irpOpen, 6);
    expect(summary.actionDelta).toBeCloseTo(1_000_000, 6);
    expect(summary.marketDelta + summary.lifeDelta + summary.actionDelta).toBeCloseTo(summary.irpAfter - summary.irpOpen, 6);
    expect(summary.actionLines).toHaveLength(1);
  });

  it('12턴 행동 뒤에는 시장이 없고, 남은 펀드 주문은 강제 체결된다', () => {
    let state = createGame('order-last', 'balanced', balanceConfig.defaultGoal, OPTIONS);
    while (state.turn < 11) {
      state = startTurn(state, 1).state;
      if (state.currentEventId) state = resolveLifeEvent(state, 'cash').state;
      state = performAction(state, { kind: 'hold' }).state;
    }
    state = startTurn(state, 1).state;
    if (state.currentEventId) state = resolveLifeEvent(state, 'cash').state;
    expect(state.turn).toBe(12);
    const withCash = { ...state, irpCash: 1_000_000 };
    const done = performAction(withCash, { kind: 'buy', productId: 'tdf', amount: 1_000_000 }).state;
    expect(done.status).toBe('finished');
    expect(done.pendingOrders).toHaveLength(0);
    expect(holding(done, 'tdf')).toBe(1_000_000);
    for (const product of products) {
      if (product.id === 'tdf') continue;
      expect(holding(done, product.id)).toBeCloseTo(holding(withCash, product.id), 6);
    }
  });

  it('전략 9종이 모두 12턴을 마치고 유효한 점수를 낸다', () => {
    for (const strategy of AUTO_STRATEGIES) {
      const done = autoplay(`order-${strategy}`, strategy, undefined, OPTIONS);
      expect(done.status).toBe('finished');
      expect(done.turn).toBe(12);
      const score = calculateScore(done);
      expect(Number.isFinite(score.monthlyPension)).toBe(true);
      expect(score.monthlyPension).toBeGreaterThan(0);
    }
  });
});
