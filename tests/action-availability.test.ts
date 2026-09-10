import { describe, expect, it } from 'vitest';
import { actionAvailability, buyDecision, defaultTabAvailability } from '../src/engine/action-availability';
import { acceptedContribution, contributionConstraint } from '../src/engine/action-constraints';
import { createGame, performAction, startTurn } from '../src/engine/game-engine';
import { nextDefaultCommand, previewDefaultOptIn, previewDefaultOptOut } from '../src/engine/default-trade-engine';
import { buyProduct, rebalancePortfolio, settleAllOrders, switchProduct } from '../src/engine/portfolio-engine';
import { policyRules, products } from '../src/data/content';
import type { GameState } from '../src/types';

const open = (): GameState => ({ ...startTurn(createGame('availability', 'balanced', 500000, { defaultTrading: true, scenario: 'classic', ghost: false }), 5).state, irpCash: 2000000, awaitingAction: true, currentEventId: null, actionsLeft: 2 });
const can = (g: GameState, op: Parameters<typeof actionAvailability>[1]) => actionAvailability(g, op).enabled;
const optIn = (g: GameState, amount: number, optionId: 'principal' | 'highRisk' = 'highRisk') => performAction(g, { kind: 'default-opt-in', optionId, amount, commandId: nextDefaultCommand(g) }).state;

describe('운용지시 실행 가능 조건', () => {
  it.each([0, 99999, 100000, 150000])('현금 %i 경계값은 실제 최소 매수와 일치한다', cash => {
    const g = { ...open(), irpCash: cash };
    expect(can(g, 'buy')).toBe(cash >= 100000);
    expect(defaultTabAvailability(g).in.enabled).toBe(cash >= 100000);
    expect(previewDefaultOptIn(g, 'principal', 100000).ok).toBe(cash >= 100000);
    expect(buyProduct(g, 'deposit', 100000).ok).toBe(cash >= 100000);
  });
  it('첫 전액 펀드 매수 뒤 납입·직접 매도·교체는 남고 리밸런싱은 결제 대기한다', () => {
    const g = open(), next = performAction(g, { kind: 'buy', productId: 'tdf', amount: g.irpCash }).state;
    expect(next.actionsLeft).toBe(1);
    expect(['contribute', 'buy', 'sell', 'switch', 'rebalance', 'default', 'hold'].map(op => can(next, op as Parameters<typeof can>[1]))).toEqual([true, false, true, true, false, false, true]);
  });
  it('옵션 주문은 옵션 양쪽 탭만 잠그고 남은 직접 거래를 허용한다', () => {
    const g = optIn(open(), 1000000);
    expect(defaultTabAvailability(g).in).toMatchObject({ enabled: false, code: 'default-pending' });
    expect(defaultTabAvailability(g).out).toMatchObject({ enabled: false, code: 'default-pending' });
    expect(can(g, 'buy')).toBe(true); expect(can(g, 'sell')).toBe(true); expect(can(g, 'switch')).toBe(true);
    expect(can(g, 'rebalance')).toBe(false);
    const settled = settleAllOrders(g);
    expect(defaultTabAvailability(settled).in.enabled).toBe(true);
    expect(defaultTabAvailability(settled).out.enabled).toBe(true);
  });
  it('현금 없이 옵션만 보유하면 묶음 메뉴와 환매만 열고 일반 매도·리밸런싱은 막는다', () => {
    const g = { ...settleAllOrders(optIn({ ...open(), holdings: [] }, 2000000)), irpCash: 0 };
    expect(can(g, 'default')).toBe(true);
    expect(defaultTabAvailability(g).in.enabled).toBe(false); expect(defaultTabAvailability(g).out.enabled).toBe(true);
    expect(can(g, 'sell')).toBe(false); expect(can(g, 'switch')).toBe(false); expect(can(g, 'rebalance')).toBe(false);
    expect(previewDefaultOptOut(g, 1).ok).toBe(true);
  });
  it('옵트아웃과 구성품에는 일반 10만원 최소금액을 적용하지 않는다', () => {
    const small = { ...settleAllOrders(optIn({ ...open(), holdings: [] }, 100000)), irpCash: 0 };
    const half = previewDefaultOptOut(small, .5);
    expect(half.ok).toBe(true); expect(half.legs.every(l => l.amount < 100000)).toBe(true);
    const remaining = settleAllOrders(half.state);
    expect(defaultTabAvailability(remaining).out.enabled).toBe(true);
  });
  it('리밸런싱 매도 계획이 끝난 뒤 일반 매수 주문만 있으면 거래 잠금이 풀린다', () => {
    const selling = rebalancePortfolio({ ...open(), holdings: [{ productId: 'balanced', amount: 80000000, principal: 80000000, depositTurnsHeld: 0 }] }).state;
    expect(selling.rebalancePlan).not.toBeNull();
    for (const op of ['buy', 'sell', 'switch', 'default', 'rebalance'] as const) expect(can(selling, op), op).toBe(false);
    expect(can(selling, 'contribute')).toBe(true); expect(can(selling, 'hold')).toBe(true);
    const buying = buyProduct(open(), 'tdf', 100000).state;
    expect(buying.rebalancePlan).toBeNull(); expect(can(buying, 'buy')).toBe(true); expect(can(buying, 'default')).toBe(true); expect(can(buying, 'rebalance')).toBe(false);
  });
  it('납입 한도와 세액공제 한도를 구분하고 남은 한도만 반영한다', () => {
    const g = { ...open(), contributionTotal: policyRules.annualTaxCreditLimit };
    expect(can(g, 'contribute')).toBe(true);
    const almost = { ...g, contributionTotal: policyRules.annualContributionLimit - 100000 };
    expect(acceptedContribution(almost, 3000000)).toBe(100000);
    expect(contributionConstraint(almost, 3000000).enabled).toBe(true);
    expect(performAction(almost, { kind: 'contribute', amount: 3000000 }).state.contributionTotal).toBe(policyRules.annualContributionLimit);
    expect(can({ ...almost, contributionTotal: policyRules.annualContributionLimit - 99999 }, 'contribute')).toBe(false);
  });
  it('위험한도 축소 확인은 가능한 거래이며 안전상품 때문에 메뉴는 계속 열린다', () => {
    const g = { ...open(), profileId: 'growth' as const, irpCash: 80000000, holdings: [{ productId: 'deposit' as const, amount: 20000000, principal: 20000000, depositTurnsHeld: 0 }] };
    const decision = buyDecision(g, 'equityEtf', g.irpCash);
    expect(decision.kind).toBe('confirm'); expect(can(g, 'buy')).toBe(true);
    if (decision.kind === 'confirm') expect(buyProduct(g, 'equityEtf', decision.capped).ok).toBe(true);
  });
  it('0원 현금으로 교체 가능하며 목표 상품 제한 때문에 환매 접수를 막지 않는다', () => {
    const g = { ...open(), profileId: 'growth' as const, irpCash: 0, holdings: [{ productId: 'balanced' as const, amount: 100000, principal: 100000, depositTurnsHeld: 0 }] };
    expect(can(g, 'switch')).toBe(true); expect(switchProduct(g, 'balanced', 'equityEtf', 100000).ok).toBe(true);
  });
  it('메뉴를 반복 조회해도 자산·행동·학습 기록을 바꾸지 않는다', () => {
    const g = open(), before = JSON.stringify(g);
    for (let i = 0; i < 10; i++) for (const op of ['buy', 'sell', 'switch', 'default', 'rebalance', 'hold'] as const) actionAvailability(g, op);
    for (const p of products) buyDecision(g, p.id, g.irpCash);
    expect(JSON.stringify(g)).toBe(before);
  });
  it('마감만 가능한 상태도 사용자가 직접 마감하며 종료·행동 소진 상태의 재실행은 거절한다', () => {
    const g = { ...open(), cash: 0, irpCash: 0, holdings: [] };
    expect(can(g, 'hold')).toBe(true); expect(performAction(g, { kind: 'hold' }).ok).toBe(true);
    for (const invalid of [{ ...g, actionsLeft: 0 }, { ...g, status: 'finished' as const }]) {
      expect(can(invalid, 'hold')).toBe(false); expect(performAction(invalid, { kind: 'hold' }).ok).toBe(false);
    }
  });
});
