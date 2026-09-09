import { profileLimits } from './profile-engine';
import { balanceConfig } from '../data/content';
import type { GameState, Milestone, MilestoneId } from '../types';
import { portfolioValue } from './portfolio-engine';
import { monthlyPension } from './scoring-engine';

/** 목표 달성률 이정표. 낮은 것부터 검사해 한 턴에 여러 개를 넘으면 모두 기록하되 배너는 가장 높은 것만 */
const GOAL_STEPS: Array<{ id: MilestoneId; rate: number }> = [
  { id: 'goal-50', rate: 0.5 },
  { id: 'goal-75', rate: 0.75 },
  { id: 'goal-90', rate: 0.9 },
  { id: 'goal-100', rate: 1 }
];

const won = (value: number) => `${Math.round(value).toLocaleString('ko-KR')}원`;

export function goalRateOf(state: GameState): number {
  return state.goalMonthly <= 0 ? 0 : monthlyPension(portfolioValue(state), state.payoutChoice ?? 'annuity20') / state.goalMonthly;
}

/** 지금 상태가 이미 넘어선 이정표 전부. `createGame`이 시작값을 기록해 두는 데 쓴다 */
export function milestonesReached(state: GameState): MilestoneId[] {
  const rate = goalRateOf(state);
  const hit: MilestoneId[] = GOAL_STEPS.filter((step) => rate >= step.rate).map((step) => step.id);
  if (state.maxDrawdown > profileLimits(state).maxDrawdown) hit.push('drawdown-12');
  return hit;
}

function describe(id: MilestoneId, state: GameState): Omit<Milestone, 'turn'> {
  const pension = monthlyPension(portfolioValue(state), state.payoutChoice ?? 'annuity20');
  const left = balanceConfig.maxTurns - state.turn;
  switch (id) {
    case 'goal-100':
      return { id, tone: 'cheer', title: '목표 월 연금 도달!', detail: `월 ${won(pension)} ≥ 목표 ${won(state.goalMonthly)}. ${left > 0 ? `남은 ${left}턴은 지키는 싸움입니다 — 생활자금·낙폭·분산이 별을 가릅니다.` : '마지막 턴까지 지켰습니다.'}` };
    case 'goal-90':
      return { id, tone: 'cheer', title: '목표의 90% 통과', detail: `월 ${won(pension)}. 목표까지 ${won(Math.max(0, state.goalMonthly - pension))}. 여기부터는 첫 별(95%)이 보입니다.` };
    case 'goal-75':
      return { id, tone: 'cheer', title: '목표의 75% 통과', detail: `월 ${won(pension)}. 납입과 운용이 함께 가면 ${left}턴 안에 닿을 수 있습니다.` };
    case 'goal-50':
      return { id, tone: 'cheer', title: '목표의 절반 통과', detail: `월 ${won(pension)}. 절반을 넘었습니다.` };
    case 'drawdown-12':
      return { id, tone: 'warn', title: `낙폭 ${Math.round(profileLimits(state).maxDrawdown * 100)}% 초과`, detail: `최대 낙폭 ${Math.round(state.maxDrawdown * 100)}%. 이번 판 3별 조건 하나가 잠겼습니다. 분산과 리밸런싱으로 더 깊어지는 것을 막으세요.` };
  }
}

/**
 * 턴 마감에 처음 넘은 이정표를 찍는다. 목표 이정표는 가장 높은 것 하나만 배너로 남기고 낮은 것은
 * 조용히 기록한다(한 턴에 50%→100%를 뚫으면 배너는 100% 하나). 낙폭 경고는 별도.
 */
export function stampMilestones(state: GameState): GameState {
  const reached = milestonesReached(state).filter((id) => !state.milestonesHit.includes(id));
  if (reached.length === 0) return { ...state, turnMilestones: [] };
  const goalHits = reached.filter((id) => id !== 'drawdown-12');
  const banners: Milestone[] = [];
  if (goalHits.length) banners.push({ ...describe(goalHits[goalHits.length - 1], state), turn: state.turn });
  if (reached.includes('drawdown-12')) banners.push({ ...describe('drawdown-12', state), turn: state.turn });
  return {
    ...state,
    milestonesHit: [...state.milestonesHit, ...reached],
    turnMilestones: banners,
    logs: [...state.logs, ...banners.map((banner) => ({ turn: state.turn, type: 'milestone', message: `${banner.title} · ${banner.detail}` }))]
  };
}

/** 남은 턴이 3 이하인데 목표 미달이면 턴 트랙이 서두른다 */
export function isUrgent(state: GameState): boolean {
  return state.status === 'playing' && balanceConfig.maxTurns - state.turn <= 3 && goalRateOf(state) < 1;
}
