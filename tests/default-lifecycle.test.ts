import { describe, expect, it } from 'vitest';
import { createGame, setDefaultOption, startTurn, performAction } from '../src/engine/game-engine';
import { advanceDefaultOption, applyDefaultOption, optOutDefaultOption, releaseMaturedDeposits } from '../src/engine/default-option';
import { registerCash, keepCash } from '../src/engine/cash-ledger';
import { buyProduct, portfolioValue, sellProduct, settleAllOrders } from '../src/engine/portfolio-engine';
import { equityExposureRatio, riskAssetRatio } from '../src/engine/policy-engine';
import { investorProfiles, products } from '../src/data/content';
import { applyProfileToGame, profileDistance } from '../src/engine/profile-engine';
import { calculateScore } from '../src/engine/scoring-engine';
import { loadSave, defaultSave } from '../src/ui/ui-state';
import type { GameState } from '../src/types';

const base = () => createGame('lifecycle', 'aggressive', 450000, { ghost: false, defaultOption: 'highRisk' });
const tick = (state: GameState, turn: number) => advanceDefaultOption({ ...state, turn });
const funded = (origin: 'maturity' | 'newAccount' | 'contribution' | 'sale' | 'transfer') => registerCash({ ...base(), holdings: [], irpCash: 1000000 }, 1000000, origin);

describe('디폴트옵션 대상 자금과 절차', () => {
  it('만기 2턴 뒤 통지, 추가 1턴 뒤 단 한 번 주문하고 공통 결제한다', () => {
    let g = funded('maturity'); g = tick(g, 1);
    expect(g.defaultCashLots[0].noticeAt).toBeNull(); expect(g.irpCash).toBe(1000000);
    g = tick(g, 2); expect(g.defaultCashLots[0]).toMatchObject({ status: 'notified', noticeAt: 2, activateAt: 3 });
    g = tick(g, 3); expect(g.record.defaultOptionRuns).toBe(1); expect(g.irpCash).toBe(0);
    expect(portfolioValue(g)).toBeCloseTo(1000000, 2);
    g = tick(g, 3); expect(g.record.defaultOptionRuns).toBe(1);
    expect(settleAllOrders(g).pendingOrders).toHaveLength(0);
  });
  it('신규가입은 첫 통지 후 1턴, 기존계좌 추가납입·매도·이전은 자동대상이 아니다', () => {
    let g = tick(funded('newAccount'), 0); expect(g.defaultCashLots[0].activateAt).toBe(1);
    g = tick(g, 1); expect(g.record.defaultOptionRuns).toBe(1);
    for (const origin of ['contribution', 'sale', 'transfer'] as const) {
      expect(tick(funded(origin), 9).irpCash).toBe(1000000);
    }
  });
  it('옵션 미지정은 현금 보관, 뒤늦게 지정해도 새 통지를 거친다', () => {
    let g = tick(setDefaultOption(funded('maturity'), null), 8);
    expect(g.irpCash).toBe(1000000); expect(g.defaultCashLots[0].noticeAt).toBeNull();
    g = tick(setDefaultOption(g, 'highRisk'), 8); expect(g.defaultCashLots[0].activateAt).toBe(9);
    expect(g.irpCash).toBe(1000000);
  });
  it('옵션 변경 시 재통지하며 현금 유지 지시는 지정 변경에도 유지한다', () => {
    const notified = tick(funded('maturity'), 2);
    const changed = tick(setDefaultOption(notified, 'principal'), 3);
    expect(changed.defaultCashLots[0].activateAt).toBe(4); expect(changed.irpCash).toBe(1000000);
    const explicit = tick(setDefaultOption(keepCash(notified), 'principal'), 9);
    expect(explicit.irpCash).toBe(1000000);
  });
  it('부분 직접 매수는 대상 원장도 차감하고 남은 만기자금만 자동운용한다', () => {
    const cash = tick(funded('maturity'), 2);
    const bought = buyProduct(cash, 'equityEtf', 300000).state;
    expect(bought.defaultCashLots[0].amount).toBe(700000);
    const automated = tick(bought, 3);
    expect(automated.holdings.find(h => h.productId === 'equityEtf')!.defaultAmount).toBe(560000);
    expect(portfolioValue(automated)).toBe(1000000);
  });
  it('만기 대상 외 현금과 합쳐져도 자동주문은 해당 자금만 소비한다', () => {
    const ordinary = registerCash({ ...base(), holdings: [], irpCash: 3000000 }, 2000000, 'contribution');
    const g = tick(tick(registerCash(ordinary, 1000000, 'maturity'), 2), 3);
    expect(g.irpCash).toBe(2000000);
    expect(g.defaultCashLots).toHaveLength(1); expect(g.defaultCashLots[0].cashOrigin).toBe('contribution');
    expect(g.defaultCashLots[0].amount).toBe(2000000);
  });
  it('미결제가 있으면 대상 자금을 보존하고 결제 후 한 번만 주문한다', () => {
    let g = funded('maturity'); g = buyProduct(g, 'tdf', 200000).state;
    g = tick(tick(g, 2), 3); expect(g.irpCash).toBe(800000); expect(g.record.defaultOptionRuns).toBe(0);
    g = tick(settleAllOrders(g), 4); expect(g.record.defaultOptionRuns).toBe(1);
  });
  it('그대로 두기와 현금 유지 지시는 다르며 옵트인은 대기 없이 명시적으로 실행한다', () => {
    const g = { ...funded('maturity'), turn: 1, awaitingAction: true, actionsLeft: 1 };
    expect(performAction(g, { kind: 'hold' }).state.irpCash).toBe(1000000);
    expect(performAction(g, { kind: 'cash-instruction' }).state.defaultCashLots[0].explicitCashInstruction).toBe(true);
    expect(performAction(g, { kind: 'default-opt-in' }).state.record.defaultOptionRuns).toBe(1);
  });
  it('만기 가입 건만 풀고 신규 약정은 보존하며 두 번 현금화하지 않는다', () => {
    let g = base(); g = buyProduct({ ...g, turn: 2, irpCash: 1000000 }, 'deposit', 1000000).state;
    const before = portfolioValue(g); g = releaseMaturedDeposits({ ...g, turn: 3 });
    expect(g.holdings.find(h => h.productId === 'deposit')!.amount).toBe(1000000);
    expect(portfolioValue(g)).toBe(before);
    expect(releaseMaturedDeposits(g)).toEqual(g);
  });
  it('게임 마지막 정산은 통지 대기시간을 임의로 진행하지 않는다', () => {
    const g = tick({ ...funded('maturity'), turn: 12, awaitingAction: true, defaultCashLots: funded('maturity').defaultCashLots.map(l => ({ ...l, createdTurn: 12 })) }, 12);
    const end = performAction(g, { kind: 'hold' }).state;
    expect(end.status).toBe('finished'); expect(end.irpCash).toBe(1000000); expect(end.record.defaultOptionRuns).toBe(0);
  });
});

describe('가상 승인형 포트폴리오와 옵트아웃', () => {
  it('승인형 편입분만 한도 예외이고 같은 ETF 직접 매수에는 한도가 적용된다', () => {
    const cash = { ...base(), holdings: [], irpCash: 1000000 };
    expect(buyProduct(cash, 'equityEtf', 800000).ok).toBe(false);
    let auto = applyDefaultOption(cash).state;
    expect(auto.irpCash).toBe(0); expect(riskAssetRatio(auto)).toBe(0);
    auto = settleAllOrders(auto); expect(equityExposureRatio(auto)).toBeCloseTo(.89);
    const sold = sellProduct(auto, 'equityEtf', 200000).state;
    expect(sold.holdings.find(h => h.productId === 'equityEtf')!.defaultAmount).toBe(600000);
    expect(riskAssetRatio(sold)).toBe(0);
  });
  it('옵트아웃은 편입분만 환매하고 일반 보유분을 남긴다', () => {
    const normal = { ...base(), holdings: [{ productId: 'equityEtf' as const, amount: 100000, principal: 100000, depositTurnsHeld: 0 }], irpCash: 1000000 };
    const auto = settleAllOrders(applyDefaultOption(normal).state);
    const out = optOutDefaultOption(auto); expect(out.ok).toBe(true);
    expect(out.state.defaultOptedOut).toBe(true);
    expect(out.state.holdings.find(h => h.productId === 'equityEtf')!.amount).toBeCloseTo(100000);
    expect(out.state.pendingOrders.some(o => o.side === 'sell')).toBe(true);
    const done = settleAllOrders(out.state); expect(portfolioValue(done)).toBe(1100000);
    expect(done.irpCash).toBe(1000000);
  });
  it('예금 옵트아웃도 원래 직접 가입한 약정을 건드리지 않는다', () => {
    let g: GameState = { ...base(), defaultOption: 'principal' as const, irpCash: 1000000 };
    const original = g.holdings.find(h => h.productId === 'deposit')!.amount;
    g = applyDefaultOption(g).state; const done = optOutDefaultOption(g).state;
    expect(done.holdings.find(h => h.productId === 'deposit')!.amount).toBe(original);
    expect(done.irpCash).toBe(1000000);
  });
});

describe('성향과 캐릭터 분리', () => {
  it('5성향 모두 시작 구성·목표 구성의 상품 적합성과 합계가 맞는다', () => {
    for (const p of investorProfiles) {
      expect(Object.values(p.allocation).reduce((a,b) => a+b,0)).toBeCloseTo(1);
      const g = createGame('profile', p.id, 450000, { ghost: false, avatarId: 'aggressive' });
      expect(g.avatarId).toBe('aggressive');
      for (const h of g.holdings) expect(products.find(x => x.id === h.productId)!.riskGrade).toBeGreaterThanOrEqual(p.minRiskGrade);
      const target = { ...g, holdings: products.map(x => ({ productId: x.id, amount: 120000000*p.allocation[x.id], principal: 120000000*p.allocation[x.id], depositTurnsHeld: 0 })), cash: p.safeCash, irpCash: 0 };
      expect(profileDistance(target)).toBeCloseTo(0); expect(calculateScore(target).behaviorProfile).toBe(p.id);
      expect(calculateScore(target).profileAligned).toBe(true); expect(calculateScore(target).stars).toBe(3);
    }
  });
  it('재진단이 동물과 진행 중 자산을 바꾸지 않는다', () => {
    const g = startTurn(createGame('identity', 'aggressive', 500000, { avatarId: 'stable', ghost: false })).state;
    const changed = applyProfileToGame(g, 'stable');
    expect(changed.avatarId).toBe('stable'); expect(changed.holdings).toEqual(g.holdings);
  });
  it('저장 v6의 동물 외형과 컬렉션을 보존하고 v7부터 별도 선택을 기억한다', () => {
    const old = { ...defaultSave, version: 6, avatarId: undefined, profileId: 'growth' };
    expect(loadSave({ getItem: () => JSON.stringify(old) }).avatarId).toBe('growth');
    const selected = { ...defaultSave, profileId: 'stable', avatarId: 'aggressive' };
    expect(loadSave({ getItem: () => JSON.stringify(selected) })).toMatchObject({ profileId: 'stable', avatarId: 'aggressive', version: 7 });
  });
});

import { compareDefaultModes } from '../src/engine/default-comparison';
import { applyMarketStep } from '../src/engine/market-engine';

describe('통제 비교와 평가 보존', () => {
  it('세 비교 경로는 같은 생활자금·납입 조건을 사용하고 결정적이다', () => {
    const rows = compareDefaultModes('same-conditions', 'balanced');
    expect(rows.map(r => r.contributions)).toEqual([0, 0, 0]);
    expect(new Set(rows.map(r => r.cash)).size).toBe(1);
    expect(rows.every(r => Number.isFinite(r.value) && r.value > 0)).toBe(true);
    expect(compareDefaultModes('same-conditions', 'balanced')).toEqual(rows);
  });
  it('승인형 편입분도 실제 가격 하락을 겪고 환매 결제까지 금액이 보존된다', () => {
    let g = applyDefaultOption({ ...base(), holdings: [], irpCash: 1000000 }).state;
    const market = { ...g.lastMarket, returns: { ...g.lastMarket.returns, equityEtf: -.2, tdf: -.1 } };
    g = applyMarketStep({ ...g, turn: 1 }, market);
    expect(g.holdings[0].defaultAmount).toBe(g.holdings[0].amount);
    expect(portfolioValue(g)).toBeLessThan(850000);
    expect(riskAssetRatio(g)).toBe(0);
    g = settleAllOrders(g); const before = portfolioValue(g);
    const after = settleAllOrders(optOutDefaultOption(g).state);
    expect(portfolioValue(after)).toBeCloseTo(before, 2);
    expect(after.holdings.every(h => (h.defaultAmount ?? 0) < .01)).toBe(true);
  });
});
