import type { ActionResult, GameState } from '../types';

export const REGIONS = ['안정', '성장', '생활', '은퇴'] as const;
export const ROUTE_REASONS = ['방어 수단 살펴보기', '성장 기회 살펴보기', '생활자금 점검하기', '은퇴 계획 점검하기'] as const;
export interface RouteProgress {
  /** 없는 저장은 이유 선택 후 도장을 받는 기존 규칙. */
  version?: 'auto-v1';
  visits: number[];
  badges: number[];
  reflections: Array<{ region: number; reason: number }>;
}
export const newRouteProgress = (automatic = false): RouteProgress => ({ ...(automatic ? { version: 'auto-v1' as const } : {}), visits: [], badges: [], reflections: [] });
export const regionOf = (index: number): number => Math.floor(index / 6);
/** 방문만 판정한다. RNG, 금액, 점수, 행동 횟수와 무관한 수집 장식. */
export function eligibleRegions(visits: number[]): number[] {
  return REGIONS.flatMap((_, region) => new Set(visits.filter(i => Number.isInteger(i) && i >= 0 && i < 24 && regionOf(i) === region)).size >= 2 ? [region] : []);
}
export function stampVisit(state: GameState): GameState {
  if (state.route.visits.includes(state.position)) return state;
  const visits = [...state.route.visits, state.position];
  const earned = state.route.version === 'auto-v1'
    ? eligibleRegions(visits).filter(i => !state.route.badges.includes(i)) : [];
  return { ...state, route: { ...state.route, visits, badges: [...state.route.badges, ...earned] },
    logs: [...state.logs, ...earned.map(i => ({ turn: state.turn, type: 'region', message: `${REGIONS[i]} 지역 도장 획득 · 서로 다른 두 칸 방문` }))] };
}
export function validRoute(route: RouteProgress): boolean {
  if (!route || !Array.isArray(route.visits) || !Array.isArray(route.badges) || !Array.isArray(route.reflections)) return false;
  if (route.version !== undefined && route.version !== 'auto-v1') return false;
  if (!route.visits.every(i => Number.isInteger(i) && i >= 0 && i < 24) || !route.badges.every(i => Number.isInteger(i) && i >= 0 && i < 4) ||
      !route.reflections.every(r => r && Number.isInteger(r.region) && r.region >= 0 && r.region < 4 && Number.isInteger(r.reason) && r.reason >= 0 && r.reason < 4)) return false;
  if (!route.version) return true;
  const eligible = eligibleRegions(route.visits);
  return new Set(route.visits).size === route.visits.length && new Set(route.badges).size === route.badges.length &&
    eligible.length === route.badges.length && eligible.every(i => route.badges.includes(i)) &&
    new Set(route.reflections.map(r => r.region)).size === route.reflections.length && route.reflections.every(r => route.badges.includes(r.region));
}
export function reflectRegion(state: GameState, region: number, reason: number): ActionResult {
  const visits = state.route.visits.filter(i => regionOf(i) === region);
  if (!Number.isInteger(region) || region < 0 || region > 3 || !Number.isInteger(reason) || !ROUTE_REASONS[reason] || visits.length < 2 || (state.route.version ? state.status !== 'finished' || state.route.reflections.some(r => r.region === region) : state.route.badges.includes(region)))
    return { ok: false, state, message: state.route.version ? '완주 후 두 칸 이상 방문한 지역에 이유를 한 번 남길 수 있습니다.' : '서로 다른 두 칸에 도착한 지역에서 한 번만 도장을 완성할 수 있습니다.' };
  const message = `${REGIONS[region]} 지역 ${state.route.version ? '선택 복기' : '탐험 완료'} · ${ROUTE_REASONS[reason]}`;
  return { ok: true, message, state: { ...state, route: { ...state.route,
    badges: state.route.version ? state.route.badges : [...state.route.badges, region], reflections: [...state.route.reflections, { region, reason }] },
    logs: [...state.logs, { turn: state.turn, type: 'region', message }] } };
}
