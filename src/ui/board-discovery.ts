import { boardTiles } from '../data/content';
import type { BoardVisibility, GameState } from '../types';

type BoardState = Pick<GameState, 'boardVisibility' | 'route'>;
export const TILE_REVEAL_MS = 340;
export function boardVisibilityOf(state: Pick<GameState, 'boardVisibility'>): BoardVisibility {
  return state.boardVisibility ?? 'open-v1';
}
export function validBoardVisibility(value: unknown): boolean {
  return value === undefined || value === 'open-v1' || value === 'arrival-v1';
}
/** 출발칸 공개는 도장 방문 기록에 추가하지 않는다. 공개 이력은 최종 도착 기록에서만 파생한다. */
export function revealedTiles(state: BoardState): Set<number> {
  return new Set(boardVisibilityOf(state) === 'open-v1' ? boardTiles.map(t => t.index) : [0, ...state.route.visits]);
}
export function isTileRevealed(state: BoardState, index: number, arrivingIndex?: number): boolean {
  return index === arrivingIndex || revealedTiles(state).has(index);
}
export function visibleTileLabel(state: BoardState, index: number, arrivingIndex?: number): string {
  return isTileRevealed(state, index, arrivingIndex) ? boardTiles[index].label : '아직 모르는 칸';
}
export function renderDiscoveryProgress(state: BoardState): string {
  return boardVisibilityOf(state) === 'arrival-v1'
    ? `<p class="board-discovery-progress"><strong>발견 ${revealedTiles(state).size}/24</strong><span>출발칸 공개 · 최종 도착칸만 열려요</span></p>` : '';
}
