import { describe, expect, it } from 'vitest';
import { createGame } from '../src/engine/game-engine';
import { rebalancePortfolio, settleAllOrders, rebalanceTargetRisk } from '../src/engine/portfolio-engine';
import { calculateScore, diversificationNeeded, starChecklist, starTitle } from '../src/engine/scoring-engine';

function withHoldings(
  state: ReturnType<typeof createGame>,
  holdings: typeof state.holdings,
  extra: Partial<typeof state> = {}
) {
  return { ...state, holdings, irpCash: 0, ...extra };
}

describe('별 사다리 헬퍼', () => {
  it('위험중립형 리밸런싱 목표 위험은 약 27.8%이다', () => {
    expect(rebalanceTargetRisk('balanced')).toBeCloseTo(0.2778, 3);
  });

  it('안정형은 허용 상품이 2개라 분산 하한이 2이다', () => {
    expect(diversificationNeeded('stable')).toBe(2);
    expect(diversificationNeeded('balanced')).toBe(3);
  });
});

describe('별 사다리 공식', () => {
  it('목표 95% 미만은 0별, 95%대는 1별이다', () => {
    const base = createGame('score-0');
    const low = withHoldings(base, [
      { productId: 'deposit', amount: 108_000_000, principal: 108_000_000, depositTurnsHeld: 4 }
    ], { cash: 10_000_000, goalMonthly: 500_000 });
    expect(calculateScore(low).stars).toBe(0);

    const near = withHoldings(base, [
      { productId: 'deposit', amount: 115_000_000, principal: 115_000_000, depositTurnsHeld: 4 }
    ], { cash: 10_000_000, goalMonthly: 500_000 });
    expect(calculateScore(near).stars).toBe(1);
    expect(calculateScore(near).starTitle).toBe('목표에 가까워진 적립가');
  });

  it('목표는 됐지만 생활자금이 부족하면 1별이다', () => {
    const state = withHoldings(createGame('score-cash'), [
      { productId: 'deposit', amount: 120_000_000, principal: 120_000_000, depositTurnsHeld: 4 }
    ], { cash: 1_000_000, goalMonthly: 500_000 });
    expect(calculateScore(state).stars).toBe(1);
  });

  it('목표+생활자금이면 2별이고, 분산이 부족하면 3별이 아니다', () => {
    const state = withHoldings(createGame('score-2'), [
      { productId: 'deposit', amount: 72_000_000, principal: 72_000_000, depositTurnsHeld: 4 },
      { productId: 'balanced', amount: 48_000_000, principal: 48_000_000, depositTurnsHeld: 0 }
    ], { cash: 10_000_000, goalMonthly: 500_000, maxDrawdown: 0.05 });
    const score = calculateScore(state);
    expect(score.stars).toBe(2);
    expect(score.starTitle).toBe('균형 잡힌 적립가');
  });

  it('납입 후 공식 리밸런싱에 가깝고 분산되면 3별이다', () => {
    const rich = { ...createGame('score-3', 'balanced', 400_000), cash: 10_000_000, maxDrawdown: 0.05 };
    const rebalanced = settleAllOrders(rebalancePortfolio(rich).state);
    const score = calculateScore({ ...rebalanced, cash: 10_000_000, maxDrawdown: 0.05 });
    expect(score.goalMet).toBe(true);
    expect(score.stars).toBe(3);
    expect(starTitle(3)).toBe('지속 가능한 연금 설계자');
  });

  it('체크리스트는 목표·생활자금·낙폭·분산·정렬 다섯 줄이다', () => {
    const state = withHoldings(createGame('list'), [
      { productId: 'deposit', amount: 108_000_000, principal: 108_000_000, depositTurnsHeld: 4 }
    ], { cash: 10_000_000, goalMonthly: 500_000, maxDrawdown: 0 });
    const rows = starChecklist(state, calculateScore(state));
    expect(rows.map((row) => row.label)).toEqual([
      '월 연금이 목표의 95%에 닿음',
      '생활자금 600만 원',
      '낙폭 12% 이하',
      '분산 3종 이상',
      '성향 목표 위험비중과 10%p 이내'
    ]);
    expect(rows[0].passed).toBe(false);
    expect(rows[1].passed).toBe(true);
  });
});


