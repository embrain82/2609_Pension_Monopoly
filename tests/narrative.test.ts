import { describe, expect, it } from 'vitest';
import { balanceConfig, policyRules } from '../src/data/content';
import { autoplay, createGame, performAction, startTurn } from '../src/engine/game-engine';
import { goalRateOf, isUrgent, milestonesReached, stampMilestones } from '../src/engine/milestones';
import { portfolioValue } from '../src/engine/portfolio-engine';
import { calculateScore, monthlyPension, shortfallPlan, starLockReason } from '../src/engine/scoring-engine';
import type { GameState } from '../src/types';

const finished = (seed: string, overrides: Partial<GameState> = {}): GameState => ({ ...autoplay(seed, 'balanced'), ...overrides });

/** 보유분을 비율로 늘려 월 연금을 원하는 값으로 맞춘 상태 */
function withPension(state: GameState, monthly: number): GameState {
  const target = monthly * policyRules.receivingMonths;
  const factor = target / portfolioValue(state);
  return { ...state, irpCash: state.irpCash * factor, holdings: state.holdings.map((holding) => ({ ...holding, amount: holding.amount * factor })) };
}

describe('별 잠금 이유(starLockReason)', () => {
  it('0별: 95% 선까지 얼마가 모자란지 말한다', () => {
    const state = withPension(finished('lock-0', { cash: 10_000_000 }), 400_000);
    const score = calculateScore(state);
    expect(score.stars).toBe(0);
    const lock = starLockReason(state, score);
    expect(lock.nextStars).toBe(1);
    expect(lock.reason).toContain('95%');
    expect(lock.reason).toContain('모자랍니다');
    expect(lock.line).toMatch(/^5개 조건 중 \d개 통과 · 별 1개까지/);
  });

  it('1별(미달): 목표까지 부족액 / 1별(달성·생활자금 부족): 생활자금 기준', () => {
    const near = withPension(finished('lock-1a', { cash: 10_000_000 }), 480_000);
    const nearScore = calculateScore(near);
    expect(nearScore.stars).toBe(1);
    expect(starLockReason(near, nearScore).reason).toContain('목표 월 연금');
    const poor = withPension(finished('lock-1b', { cash: 1_000_000 }), 520_000);
    const poorScore = calculateScore(poor);
    expect(poorScore.stars).toBe(1);
    const lock = starLockReason(poor, poorScore);
    expect(lock.nextStars).toBe(2);
    expect(lock.reason).toContain('생활자금');
  });

  it('2별: 낙폭 → 분산 → 성향 순서로 잠근 첫 조건 하나만', () => {
    const base = withPension(finished('lock-2', { cash: 10_000_000, maxDrawdown: 0.2 }), 520_000);
    const score = calculateScore(base);
    expect(score.stars).toBe(2);
    expect(starLockReason(base, score).reason).toContain('낙폭');
    const calm: GameState = { ...base, maxDrawdown: 0.05, holdings: [{ ...base.holdings[0], amount: portfolioValue(base) }], irpCash: 0 };
    const calmScore = calculateScore(calm);
    if (calmScore.stars === 2) expect(starLockReason(calm, calmScore).reason).toMatch(/보유 상품|위험비중/);
  });

  it('3별이면 이유가 없고 모두 통과 문장', () => {
    let three: GameState | null = null;
    for (let index = 0; index < 60 && !three; index += 1) {
      const state = autoplay(`lock-3-${index}`, 'steward');
      if (calculateScore(state).stars === 3) three = state;
    }
    expect(three).not.toBeNull();
    const lock = starLockReason(three!, calculateScore(three!));
    expect(lock.nextStars).toBeNull();
    expect(lock.reason).toBeNull();
    expect(lock.passed).toBe(5);
    expect(lock.line).toContain('모두 통과');
  });
});

describe('부족 계획(shortfallPlan)', () => {
  it('목표 달성이면 null', () => {
    const state = withPension(finished('plan-ok', { cash: 10_000_000 }), 600_000);
    expect(shortfallPlan(state, calculateScore(state))).toBeNull();
  });

  it('부족 월 연금 × 240 = 필요 IRP, 남은 납입 한도 안이면 "납입만으로", 환급 추정이 붙는다', () => {
    const state = withPension(finished('plan-in', { contributionTotal: 0, taxCreditEligible: 0 }), 450_000);
    const plan = shortfallPlan(state, calculateScore(state))!;
    expect(plan.gapMonthly).toBeCloseTo(50_000, 0);
    expect(plan.neededIrp).toBeCloseTo(50_000 * 240, 0);
    expect(plan.contributionRoom).toBe(policyRules.annualContributionLimit);
    expect(plan.withinLimit).toBe(true);
    // 필요 1,200만 중 공제 한도 900만까지만 13.2%
    expect(plan.refundEstimate).toBeCloseTo(policyRules.annualTaxCreditLimit * policyRules.taxCreditRate, 0);
    expect(plan.line).toContain('납입만으로');
    expect(plan.line).toContain('세액공제');
  });

  it('남은 한도를 넘으면 "운용 수익" 쪽으로 말하고, 일시금이면 필요액이 커진다', () => {
    const state = withPension(finished('plan-out', { contributionTotal: policyRules.annualContributionLimit }), 350_000);
    const plan = shortfallPlan(state, calculateScore(state))!;
    expect(plan.contributionRoom).toBe(0);
    expect(plan.withinLimit).toBe(false);
    expect(plan.refundEstimate).toBe(0);
    expect(plan.line).toContain('운용 수익');
    const lump: GameState = { ...state, payoutChoice: 'lumpSum' };
    const lumpPlan = shortfallPlan(lump, calculateScore(lump))!;
    expect(lumpPlan.neededIrp).toBeGreaterThan(plan.neededIrp);
    expect(lumpPlan.neededIrp).toBeCloseTo(lumpPlan.gapMonthly * calculateScore(lump).irpValue / calculateScore(lump).payout.monthlyBasis, 0);
    expect(lumpPlan.line).toContain('일시금');
  });
});

describe('이정표(milestones)', () => {
  it('시작 시점에 이미 넘은 이정표는 배너 없이 기록만 된다(기본 목표 50만이면 90%까지)', () => {
    const state = createGame('ms-start', 'balanced', 500_000, { ghost: false });
    expect(goalRateOf(state)).toBeCloseTo(monthlyPension(balanceConfig.startingIrp) / 500_000, 6);
    // 시작 IRP 1억 800만 ÷ 240 = 45만 = 목표의 90%
    expect(state.milestonesHit).toEqual(['goal-50', 'goal-75', 'goal-90']);
    expect(state.turnMilestones).toEqual([]);
    // 목표를 최대로 올리면(설정 상한) 시작 달성률이 낮아져 75% 이상은 아직 남는다
    const high = createGame('ms-high', 'balanced', balanceConfig.maxGoal, { ghost: false });
    expect(goalRateOf(high)).toBeLessThan(0.75);
    expect(high.milestonesHit).not.toContain('goal-75');
    expect(high.milestonesHit).not.toContain('goal-90');
  });

  it('처음 넘는 턴에만 배너가 붙고, 한 턴에 여러 단계를 뚫으면 가장 높은 것 하나만 배너', () => {
    const state = createGame('ms-jump', 'balanced', 500_000, { ghost: false });
    const jumped = withPension({ ...state, turn: 4 }, 520_000);
    const stamped = stampMilestones(jumped);
    expect(stamped.milestonesHit).toEqual(['goal-50', 'goal-75', 'goal-90', 'goal-100']);
    expect(stamped.turnMilestones).toHaveLength(1);
    expect(stamped.turnMilestones[0]).toMatchObject({ id: 'goal-100', tone: 'cheer', turn: 4 });
    expect(stamped.turnMilestones[0].detail).toContain('지키는 싸움');
    expect(stamped.logs.at(-1)?.type).toBe('milestone');
    const again = stampMilestones({ ...stamped, turn: 5 });
    expect(again.turnMilestones).toEqual([]);
    expect(again.milestonesHit).toEqual(stamped.milestonesHit);
  });

  it('낙폭 12% 첫 초과는 경고 배너, 목표 배너와 함께 최대 2개', () => {
    const state = withPension({ ...createGame('ms-dd', 'balanced', 500_000, { ghost: false }), turn: 6, maxDrawdown: 0.15 }, 520_000);
    const stamped = stampMilestones(state);
    expect(stamped.turnMilestones.map((item) => item.id)).toEqual(['goal-100', 'drawdown-12']);
    expect(stamped.turnMilestones[1].tone).toBe('warn');
    expect(stamped.turnMilestones[1].detail).toContain('3별 조건');
    expect(milestonesReached(stamped)).toContain('drawdown-12');
  });

  it('턴 마감이 이정표를 찍고 정산 요약에 실리며 다음 턴 시작에 비워진다', () => {
    let state = createGame('ms-flow', 'balanced', 500_000, { ghost: false });
    state = startTurn(state, 3).state;
    if (state.currentEventId) state = { ...state, currentEventId: null, awaitingAction: true };
    const boosted = withPension(state, 530_000);
    const acted = performAction(boosted, { kind: 'hold' });
    expect(acted.summary?.milestones.map((item) => item.id)).toEqual(['goal-100']);
    expect(acted.state.turnMilestones).toHaveLength(1);
    const next = startTurn(acted.state, 2).state;
    expect(next.turnMilestones).toEqual([]);
    expect(next.milestonesHit).toContain('goal-100');
  });

  it('자동 플레이 전체에서 같은 이정표는 한 번만 찍히고 시드가 같으면 같다', () => {
    const a = autoplay('ms-auto', 'steward');
    const b = autoplay('ms-auto', 'steward');
    expect(a.milestonesHit).toEqual(b.milestonesHit);
    expect(new Set(a.milestonesHit).size).toBe(a.milestonesHit.length);
    const banners = a.logs.filter((log) => log.type === 'milestone');
    expect(banners.length).toBeLessThanOrEqual(a.milestonesHit.length);
  });
});

describe('막판 긴급(isUrgent)', () => {
  it('남은 턴 3 이하·목표 미달일 때만 true', () => {
    const early = { ...createGame('urg', 'balanced', 500_000, { ghost: false }), turn: 5 };
    expect(isUrgent(early)).toBe(false);
    const late = { ...early, turn: 9 };
    expect(isUrgent(late)).toBe(true);
    expect(isUrgent(withPension(late, 600_000))).toBe(false);
    expect(isUrgent({ ...late, status: 'finished' })).toBe(false);
  });
});
