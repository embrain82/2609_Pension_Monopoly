import { REGIONS, regionOf } from '../engine/route-engine';
import { boardTiles } from '../data/content';
import type { GameState, TileKind } from '../types';
import { AVATAR_ANIMALS, avatarBody, type Mood } from './avatars';

/** 한 칸 점프 한 번의 길이(ms). 공중 70% + 칸 위에 내려앉은 박자 30%(token3d.ts HOP_AIR). */
export const TOKEN_STEP_MS = 260;

export interface BoardView {
  focusIndex?: number;
  hopping?: boolean;
  /** 설정 "캐릭터 표시". 켜면 말이 성향 동물 아바타가 된다. */
  characters?: boolean;
  mood?: Mood;
  /** 이번 렌더가 도착 직후면 칸 bounce·파티클을 튼다. */
  landed?: boolean;
  /** false면 SVG 안에 말을 그리지 않는다(2.5D 오버레이가 대신 그림). aria-label의 위치 문구는 유지. */
  tokenInSvg?: boolean;
}

export interface TokenMotion {
  /** 말이 칸을 건너뛰는 중(마지막 칸 도착 렌더 포함) */
  tokenHopping: boolean;
  /** 이동 중 말이 지금 놓인 칸 */
  tokenFocus: number;
  /** 마지막 칸 도착 렌더 */
  landed: boolean;
}

/**
 * 말 위치·이펙트 결정. 이동 중(마지막 칸 도착 렌더 포함)에는 `state.position`(아직 startTurn 전이라
 * 출발 칸)을 쓰지 않고 항상 `tokenFocus`를 쓴다. 중앙 문구도 계속 「N번 이동 중」이다.
 * 칸 자체는 이동 중 강조하지 않는다(위치는 말이 보여 준다). 도착 렌더에만 landed 이펙트가 붙는다.
 */
export function boardViewFor(state: GameState, motion: TokenMotion): Pick<BoardView, 'focusIndex' | 'hopping' | 'landed'> {
  return {
    focusIndex: motion.tokenHopping ? motion.tokenFocus : state.position,
    hopping: motion.tokenHopping,
    landed: motion.landed
  };
}

/** 칸 종류별 파티클 색. 시장 뉴스=신문지, 생활=경고등, 상품·거래=코인, 리밸런싱=저울. */
const FX_COLORS: Partial<Record<TileKind, string>> = {
  market: '#5b8fb9',
  life: '#e05a3a',
  product: '#e6983e',
  trade: '#e6983e',
  rebalance: '#3f8f5f'
};

function tileFx(kind: TileKind): string {
  const color = FX_COLORS[kind] ?? '#a9d36a';
  return `<g class="tile-fx" fill="${color}">${[0, 1, 2, 3, 4].map((i) => `<circle style="--i:${i}" cx="50" cy="50" r="4"></circle>`).join('')}</g>`;
}

function playerToken(state: GameState, view: BoardView): string {
  if (view.characters) {
    return `<svg class="player-avatar" x="26" y="16" width="48" height="48" viewBox="0 0 100 100" aria-label="${AVATAR_ANIMALS[state.avatarId]} 말">${avatarBody(state.avatarId, view.mood ?? 'calm')}</svg>`;
  }
  return '<circle class="player" cx="50" cy="45" r="13"></circle><text class="player-mark" x="50" y="50" text-anchor="middle">나</text>';
}

const TILE_ICONS: Record<TileKind, string> = {
  start: '↻',
  product: '◆',
  market: '↗',
  life: '♥',
  trade: '⇄',
  rebalance: '◎',
  policy: '§',
  profile: '◐',
  outlook: '⌂'
};

export function boardPosition(index: number): { x: number; y: number } {
  if (index <= 6) return { x: index * 100, y: 0 };
  if (index <= 12) return { x: 600, y: (index - 6) * 100 };
  if (index <= 18) return { x: (18 - index) * 100, y: 600 };
  return { x: 0, y: (24 - index) * 100 };
}

export function tokenTileIndex(position: number): number {
  const size = 24;
  return ((position % size) + size) % size;
}

export function movePath(from: number, steps: number): number[] {
  return Array.from({ length: Math.max(0, steps) }, (_, index) => tokenTileIndex(from + index + 1));
}

export function renderBoardMarkup(
  state: GameState,
  waiting: boolean,
  view: BoardView = {}
): string {
  const token = tokenTileIndex(view.focusIndex ?? state.position);
  const tile = boardTiles[token];
  const tiles = boardTiles.map((item) => {
    const { x, y } = boardPosition(item.index);
    const active = item.index === token;
    const landed = active && Boolean(view.landed);
    return `<g data-key="tile-${item.index}" data-action="open-explore" data-tile="${item.index}" role="button" tabindex="${active ? 0 : -1}" aria-label="${item.index+1}. ${item.label} · ${REGIONS[regionOf(item.index)]} 지역 · 칸 정보" class="tile tile-${item.kind} region-${regionOf(item.index)}${active ? ' active' : ''}${landed ? ' landed' : ''}" transform="translate(${x} ${y})">
        <rect x="3" y="3" width="94" height="94" rx="15"></rect>
        ${state.route.visits.includes(item.index) ? '<circle class="visit-stamp" cx="50" cy="18" r="5"></circle>' : ''}
        <text class="tile-icon" x="14" y="30">${TILE_ICONS[item.kind]}</text>
        <text class="tile-number" x="84" y="24" text-anchor="end">${String(item.index + 1).padStart(2, '0')}</text>
        <text class="tile-label" x="50" y="70" text-anchor="middle">${item.label.length > 7 ? item.label.slice(0, 7) : item.label}</text>
        ${landed ? tileFx(item.kind) : ''}
        ${active && view.tokenInSvg !== false ? playerToken(state, view) : ''}
      </g>`;
  }).join('');
  const center = view.hopping
    ? `<text x="350" y="286" text-anchor="middle">TURN ${String(Math.min(state.turn + 1, 12)).padStart(2, '0')} / 12</text>
      <text class="phase" x="350" y="338" text-anchor="middle">${token + 1}번</text>
      <path d="M260 368H440"></path>
      <text x="350" y="410" text-anchor="middle">이동 중</text>
      <text x="350" y="438" text-anchor="middle">${tile.label}</text>`
    : waiting
      ? `<text x="350" y="286" text-anchor="middle">TURN ${String(Math.min(state.turn + 1, 12)).padStart(2, '0')} / 12</text>
      <text class="phase" x="350" y="338" text-anchor="middle">대기</text>
      <path d="M260 368H440"></path>
      <text x="350" y="410" text-anchor="middle">주사위를 굴려</text>
      <text x="350" y="438" text-anchor="middle">시장을 확인하세요</text>`
      : `<text x="350" y="280" text-anchor="middle">현재 시장 국면</text>
      <text class="phase" x="350" y="324" text-anchor="middle">${state.phase}</text>
      <path d="M260 356H440"></path>
      <text class="rate" x="350" y="392" text-anchor="middle">금리 ${state.lastMarket.ratePct.toFixed(2)}%</text>
      <text x="350" y="420" text-anchor="middle">${state.lastMarket.signal}</text>
      <text class="seed" x="350" y="452" text-anchor="middle">TURN ${String(state.turn).padStart(2, '0')} / 12 · ${tile.label}</text>`;
  return `<svg class="board" viewBox="0 0 700 700" role="group" aria-label="24칸 순환 보드. 현재 말은 ${token + 1}번 칸 ${tile.label}에 있습니다.">
      <rect class="board-bg" x="0" y="0" width="700" height="700" rx="28"></rect>${tiles}
      <g class="board-center">${center}</g>
    </svg>`;
}
