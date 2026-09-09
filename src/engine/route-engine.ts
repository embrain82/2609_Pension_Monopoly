import type { ActionResult, GameState } from '../types';

export const REGIONS = ['안정', '성장', '생활', '은퇴'] as const;
export const ROUTE_REASONS = ['방어 수단 살펴보기', '성장 기회 살펴보기', '생활자금 점검하기', '은퇴 계획 점검하기'] as const;
export interface RouteProgress {
  visits: number[];
  badges: number[];
  reflections: Array<{ region: number; reason: number }>;
}
export const newRouteProgress = (): RouteProgress => ({ visits: [], badges: [], reflections: [] });
export const regionOf = (index: number): number => Math.floor(index / 6);
export function stampVisit(state: GameState): GameState {
  if (state.route.visits.includes(state.position)) return state;
  return { ...state, route: { ...state.route, visits: [...state.route.visits, state.position] } };
}
export function reflectRegion(state: GameState, region: number, reason: number): ActionResult {
  const visits = state.route.visits.filter(i => regionOf(i) === region);
  if (!Number.isInteger(region) || region < 0 || region > 3 || !Number.isInteger(reason) || !ROUTE_REASONS[reason] || visits.length < 2 || state.route.badges.includes(region))
    return { ok: false, state, message: '서로 다른 두 칸에 도착한 지역에서 한 번만 도장을 완성할 수 있습니다.' };
  const message = `${REGIONS[region]} 지역 탐험 완료 · ${ROUTE_REASONS[reason]}`;
  return { ok: true, message, state: { ...state, route: { ...state.route,
    badges: [...state.route.badges, region], reflections: [...state.route.reflections, { region, reason }] },
    logs: [...state.logs, { turn: state.turn, type: 'region', message }] } };
}
