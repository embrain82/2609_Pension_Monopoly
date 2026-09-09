import { boardTiles } from '../data/content';
import { dicePairForTurn } from './random-engine';
import type { ActionResult, GameState } from '../types';

export const REGIONS = ['안정', '성장', '생활', '은퇴'] as const;
export const ROUTE_REASONS = ['방어 수단 살펴보기', '성장 기회 살펴보기', '생활자금 점검하기', '은퇴 계획 점검하기'] as const;
export interface RouteProgress {
  tokens: number;
  doubleRewarded: boolean;
  visits: number[];
  badges: number[];
  choices: Array<{ turn: number; mode: 'sum' | 'short'; steps: number }>;
  reflections: Array<{ region: number; reason: number }>;
}
export const newRouteProgress = (): RouteProgress => ({ tokens: 2, doubleRewarded: false, visits: [], badges: [], choices: [], reflections: [] });
export const regionOf = (index: number): number => Math.floor(index / 6);
export function routeOptions(state: GameState) {
  const faces = dicePairForTurn(state.seed, state.turn);
  return (['sum', 'short'] as const).map(mode => {
    const steps = mode === 'sum' ? faces[0] + faces[1] : Math.max(...faces);
    const position = (state.position + steps) % 24;
    return { mode, steps, position, tile: boardTiles[position], region: REGIONS[regionOf(position)],
      cost: mode === 'short' ? 1 : 0, crossesStart: state.position + steps >= 24 };
  });
}
/** 선택 기록만 생성한다. 금융 효과와 턴 진행은 startTurn에서 한 번만 처리한다. */
export function chooseRoute(state: GameState, mode: 'sum' | 'short'): ActionResult {
  if (state.status !== 'playing' || state.awaitingAction || state.currentEventId || state.route.choices.some(c => c.turn === state.turn + 1))
    return { ok: false, state, message: '이미 경로를 정했거나 이번 턴이 진행 중입니다.' };
  const option = routeOptions(state).find(o => o.mode === mode)!;
  if (state.route.tokens < option.cost) return { ok: false, state, message: '경로 토큰이 부족합니다.' };
  const faces = dicePairForTurn(state.seed, state.turn);
  const reward = faces[0] === faces[1] && !state.route.doubleRewarded;
  const route = { ...state.route, tokens: Math.min(4, state.route.tokens - option.cost + (reward ? 1 : 0)),
    doubleRewarded: state.route.doubleRewarded || reward,
    choices: [...state.route.choices, { turn: state.turn + 1, mode, steps: option.steps }] };
  return { ok: true, state: { ...state, route }, message: `${option.steps}칸 → ${option.tile.label}${reward ? ' · 첫 더블! 경로 토큰 +1 (추가 턴 없음)' : ''}` };
}
export function stampVisit(state: GameState): GameState {
  if (state.route.visits.includes(state.position)) return state;
  return { ...state, route: { ...state.route, visits: [...state.route.visits, state.position] } };
}
export function reflectRegion(state: GameState, region: number, reason: number): ActionResult {
  const visits = state.route.visits.filter(i => regionOf(i) === region);
  if (!Number.isInteger(region) || region < 0 || region > 3 || !Number.isInteger(reason) || !ROUTE_REASONS[reason] || visits.length < 2 || state.route.badges.includes(region))
    return { ok: false, state, message: '서로 다른 두 칸에 도착한 지역에서 한 번만 도장을 완성할 수 있습니다.' };
  const message = `${REGIONS[region]} 지역 탐험 완료 · ${ROUTE_REASONS[reason]} · 경로 토큰 +1 (최대 4개)`;
  return { ok: true, message, state: { ...state, route: { ...state.route, tokens: Math.min(4, state.route.tokens + 1),
    badges: [...state.route.badges, region], reflections: [...state.route.reflections, { region, reason }] },
    logs: [...state.logs, { turn: state.turn, type: 'region', message }] } };
}
