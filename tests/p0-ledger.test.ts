import { describe, expect, it } from 'vitest';
import { products, lifeEvents } from '../src/data/content';
import { accountPayout, grossForNet, withdrawalTax } from '../src/engine/account-engine';
import { autoplay, createGame, performAction, resolveLifeEvent, startTurn } from '../src/engine/game-engine';
import { applyMarketStep, emptyMarketStep } from '../src/engine/market-engine';
import { buyProduct, sellProduct, switchProduct, rebalancePortfolio, settleOrders, settleAllOrders, portfolioValue } from '../src/engine/portfolio-engine';
import { canBuyForProfile, effectiveRiskRatio, riskAssetRatio } from '../src/engine/policy-engine';
import { calculateScore } from '../src/engine/scoring-engine';
import type { AccountBasis, GameState, ProductId } from '../src/types';

const base = () => createGame('p0-ledger', 'aggressive', 500000, { ghost: false, tileEffects: false });
const cashAccount = (cash = 6000000): GameState => ({ ...base(), holdings: [], irpCash: cash,
  accountBasis: { retirement: 0, retirementTax: 0, deducted: 0, nonDeducted: cash } });
const market = (state: GameState, rate: number): GameState => applyMarketStep({ ...state, turn: state.turn + 1 }, {
  ...emptyMarketStep(), turn: state.turn + 1,
  returns: Object.fromEntries(products.map(p => [p.id, rate])) as Record<ProductId, number>
});

describe('P0 계좌 경계와 생활비', () => {
  it('비허용 모든 사건에서 현금·예금·인출 경로가 IRP를 유출하지 않는다', () => {
    for (const event of lifeEvents.filter(e => e.kind === 'cost' && !e.eligibleWithdrawal)) {
      const state = { ...base(), cash: 0, currentEventId: event.id };
      const cash = resolveLifeEvent(state, 'cash');
      expect(cash.ok).toBe(true);
      expect(portfolioValue(cash.state)).toBe(portfolioValue(state));
      expect(cash.state.livingDebt).toBe(event.cost);
      for (const choice of ['deposit', 'withdraw'] as const) {
        const result = resolveLifeEvent(state, choice);
        expect(result.ok).toBe(false);
        expect(result.state).toBe(state);
      }
    }
  });
  it('미지급 비용은 사라지지 않고 다음 급여로 상환된다', () => {
    const resolved = resolveLifeEvent({ ...base(), cash: 0, currentEventId: 'moving' }, 'cash').state;
    const next = startTurn({ ...resolved, awaitingAction: false }, 2).state;
    expect(next.livingDebt).toBeLessThan(resolved.livingDebt);
    expect(next.cash).toBe(0);
    expect(next.livingDebt + 1400000).toBe(resolved.livingDebt);
  });
  it('대기주문뿐인 계좌는 무상으로 인출 사건을 해결하지 못한다', () => {
    const ordered = buyProduct(cashAccount(), 'tdf', 6000000).state;
    const state = { ...ordered, currentEventId: 'medical' };
    const out = resolveLifeEvent(state, 'withdraw');
    expect(out.ok).toBe(false);
    expect(out.state.currentEventId).toBe('medical');
    expect(portfolioValue(out.state)).toBe(6000000);
  });
  it('결제 현금만으로 허용 인출할 때 비용과 재원별 세금이 정확히 빠진다', () => {
    const state = { ...cashAccount(), currentEventId: 'medical', accountBasis: { retirement: 0, retirementTax: 0, deducted: 6000000, nonDeducted: 0 } };
    const out = resolveLifeEvent(state, 'withdraw');
    const gross = 3500000 / .835;
    expect(out.ok).toBe(true);
    expect(portfolioValue(out.state)).toBeCloseTo(6000000 - gross, 5);
    expect(out.state.accountBasis.deducted).toBeCloseTo(6000000 - gross, 5);
    expect(out.state.cashFlows.at(-1)?.amount).toBeCloseTo(-gross, 5);
  });
  it('퇴직급여 이전을 운용수익이나 공제 납입으로 계산하지 않는다', () => {
    const state = { ...base(), currentEventId: 'severance' };
    const out = resolveLifeEvent(state, 'transfer-irp').state;
    expect(out.accountBasis.retirement).toBe(state.accountBasis.retirement + 6000000);
    expect(out.accountBasis.retirementTax).toBe(state.accountBasis.retirementTax + 60000);
    expect(out.contributionTotal).toBe(0);
    expect(calculateScore(out).investmentReturnRate).toBe(0);
    expect(resolveLifeEvent(state, 'cash').state.cash - state.cash).toBe(5940000);
  });
});

describe('P0 재원별 수령', () => {
  const basis = (key: 'retirement' | 'deducted' | 'nonDeducted'): AccountBasis => ({ retirement: 0, retirementTax: key === 'retirement' ? 120000 : 0, deducted: 0, nonDeducted: 0, [key]: 6000000 });
  it('미공제 원금은 두 수령 방식 모두 세금 0', () => {
    for (const choice of ['annuity20', 'lumpSum'] as const) expect(accountPayout(6000000, choice, basis('nonDeducted')).tax).toBe(0);
  });
  it('퇴직급여는 이연세액을 적용하고 연차별 70%·60%를 구분', () => {
    expect(accountPayout(6000000, 'lumpSum', basis('retirement')).tax).toBeCloseTo(120000, 5);
    expect(accountPayout(6000000, 'annuity20', basis('retirement')).tax).toBeCloseTo(78000, 5);
  });
  it('공제 원금과 운용수익은 연금외수령 16.5%, 연금은 나이별 비율', () => {
    const empty = { retirement: 0, retirementTax: 0, deducted: 0, nonDeducted: 0 };
    for (const source of [basis('deducted'), empty]) {
      expect(accountPayout(6000000, 'lumpSum', source).tax).toBeCloseTo(990000, 5);
      expect(accountPayout(6000000, 'annuity20', source).tax).toBeCloseTo(313500, 5);
    }
  });
  it('부분 인출은 미공제 원금을 먼저 사용하고 재원 장부가 보존된다', () => {
    const source = { retirement: 2000000, retirementTax: 40000, deducted: 2000000, nonDeducted: 2000000 };
    const out = withdrawalTax(7000000, source, 3000000);
    expect(out.tax).toBe(20000);
    expect(out.nextBasis).toEqual({ retirement: 1000000, retirementTax: 20000, deducted: 2000000, nonDeducted: 0 });
    expect(grossForNet(7000000, source, 2980000)).toBeCloseTo(3000000, 5);
    expect(grossForNet(1, source, 2)).toBe(Infinity);
  });
});

describe('P0 주문과 약정', () => {
  it('매수 가격 확정 전 수익은 얻지 않고 확정 뒤에는 결제 대기 중에도 노출된다', () => {
    const ordered = buyProduct(cashAccount(), 'balanced', 1000000).state;
    const priced = settleOrders(market(ordered, .1));
    expect(priced.pendingOrders[0].stage).toBe('priced');
    expect(priced.pendingOrders[0].amount).toBe(1000000);
    const settled = settleOrders(market(priced, .1));
    expect(settled.pendingOrders).toHaveLength(0);
    expect(settled.holdings[0].amount).toBeCloseTo(1000000 * 1.1 * (1 - .0008), 5);
  });
  it('환매 확정 전에는 하락 위험, 확정 뒤에는 금액 고정', () => {
    const invested = settleAllOrders(buyProduct(cashAccount(), 'balanced', 1000000).state);
    const sold = sellProduct(invested, 'balanced', 1000000).state;
    const priced = settleOrders(market(sold, -.1));
    expect(priced.pendingOrders[0].amount).toBeCloseTo(899280, 5);
    const settled = settleOrders(market(priced, -.2));
    expect(settled.irpCash).toBeCloseTo(5899280, 5);
  });
  it('가격 불변 매매·교체에서 돈이 보존되고 마지막 연결 주문도 모두 끝난다', () => {
    const state = settleAllOrders(buyProduct(cashAccount(), 'balanced', 2000000).state);
    const final = settleAllOrders(switchProduct({ ...state, turn: 12 }, 'balanced', 'tdf', 1000000).state);
    expect(final.pendingOrders).toHaveLength(0);
    expect(final.turn).toBe(12);
    expect(portfolioValue(final)).toBeCloseTo(6000000, 5);
    expect(final.holdings.find(h => h.productId === 'tdf')?.amount).toBe(1000000);
  });
  it('리밸런싱이 접수 주문을 지우지 않고, 차액 거래에 같은 결제 규칙을 쓴다', () => {
    const pending = buyProduct(cashAccount(), 'balanced', 1000000).state;
    expect(rebalancePortfolio(pending).ok).toBe(false);
    expect(rebalancePortfolio(pending).state.pendingOrders).toEqual(pending.pendingOrders);
    const state = base();
    const order = rebalancePortfolio(state);
    expect(order.state.pendingOrders.length).toBeGreaterThan(0);
    const final = settleAllOrders(order.state);
    expect(final.pendingOrders).toHaveLength(0);
    expect(final.rebalancePlan).toBeNull();
    expect(portfolioValue(final)).toBeCloseTo(portfolioValue(state), 3);
  });
  it('예금 이자가 없으면 해지해도 원금 차감이 없다', () => {
    const state = buyProduct(cashAccount(), 'deposit', 1000000).state;
    const out = sellProduct(state, 'deposit', 1000000);
    expect(out.state.irpCash).toBe(6000000);
  });
  it('추가 예금은 별도 약정이며 기존 가입일·금리를 바꾸지 않는다', () => {
    const one = buyProduct(cashAccount(), 'deposit', 1000000).state;
    const grown = market(one, .9);
    const previous = grown.holdings[0].lots![0];
    const two = buyProduct({ ...grown, turn: 2, lastMarket: { ...grown.lastMarket, ratePct: 8 } }, 'deposit', 1000000).state;
    expect(two.holdings[0].lots).toHaveLength(2);
    expect(two.holdings[0].lots![0]).toEqual(previous);
    expect(two.holdings[0].lots![1].ratePerTurn).not.toBe(previous.ratePerTurn);
    const sold = sellProduct(two, 'deposit', 500000).state;
    expect(sold.holdings[0].lots![1]).toEqual(two.holdings[0].lots![1]);
    expect(portfolioValue(two) - portfolioValue(sold)).toBeGreaterThan(0);
    expect(portfolioValue(two) - portfolioValue(sold)).toBeLessThan(5000);
  });
  it('NaN·음수·무한대는 장부를 변경하지 않는다', () => {
    for (const amount of [NaN, -1, Infinity, 0]) {
      const state = base();
      expect(buyProduct(state, 'deposit', amount).ok).toBe(false);
      expect(sellProduct(state, 'deposit', amount).state).toBe(state);
    }
  });
  it('70% 규제는 상품 분류이며 적격 TDF 예외는 손실 위험 0이라는 뜻이 아니다', () => {
    expect(effectiveRiskRatio('balanced')).toBe(1);
    expect(effectiveRiskRatio('tdf')).toBe(0);
    const state = buyProduct(cashAccount(), 'tdf', 6000000).state;
    expect(riskAssetRatio(state)).toBe(0);
    expect(products.find(p => p.id === 'tdf')?.equityExposure).toBe(.45);
    expect(products.find(p => p.id === 'deposit')?.riskGrade).toBe(6);
    expect(canBuyForProfile('stable', 'equityEtf').ok).toBe(false);
  });
  it('12턴 실제 행동 마감에 연결 주문을 모두 정산한다', () => {
    const ready = settleAllOrders(buyProduct(cashAccount(), 'balanced', 1000000).state);
    const out = performAction({ ...ready, turn: 12, awaitingAction: true, actionsLeft: 1 }, { kind: 'switch', fromProductId: 'balanced', toProductId: 'tdf', amount: 1000000 });
    expect(out.state.status).toBe('finished');
    expect(out.state.pendingOrders).toHaveLength(0);
  });
  it('여러 전략 완주에서 음수·미결 주문·미지급 비용 소실이 없다', () => {
    for (let i = 0; i < 20; i++) for (const strategy of ['balanced', 'steward', 'withdrawer', 'etfOnly'] as const) {
      const state = autoplay(`p0-smoke-${i}`, strategy);
      expect(state.status).toBe('finished');
      expect(state.pendingOrders).toHaveLength(0);
      expect(state.rebalancePlan).toBeNull();
      expect(state.irpCash).toBeGreaterThanOrEqual(0);
      expect(state.cash).toBeGreaterThanOrEqual(0);
      expect(state.livingDebt).toBeGreaterThanOrEqual(0);
    }
  });
});
