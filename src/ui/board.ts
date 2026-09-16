import { isTileRevealed, visibleTileLabel } from './board-discovery';
import { REGIONS, regionOf } from '../engine/route-engine';
import { boardTiles } from '../data/content';
import type { GameState, TileKind } from '../types';
import { AVATAR_NAMES, avatarBody, type Mood } from './avatars';

/** 한 칸 점프 한 번의 길이(ms). 공중 70% + 칸 위에 내려앉은 박자 30%(token3d.ts HOP_AIR). */
export const TOKEN_STEP_MS = 260;

export interface BoardView {
  /** 마지막 착지 완료 후, 금융 상태를 확정하기 전 잠깐 공개하는 칸. 저장하지 않는다. */
  revealIndex?: number;
  trail?: number[];
  focusIndex?: number;
  hopping?: boolean;
  /** 설정 "캐릭터 표시". 켜면 말이 선택한 캐릭터 아바타가 된다. */
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
    return `<svg class="player-avatar" x="26" y="8" width="48" height="48" viewBox="0 0 100 100" aria-label="${AVATAR_NAMES[state.avatarId]} 말">${avatarBody(state.avatarId, view.mood ?? 'calm')}</svg>`;
  }
  return '<circle class="player" cx="50" cy="45" r="13"></circle><text class="player-mark" x="50" y="50" text-anchor="middle">나</text>';
}

const TILE_SHAPES:Record<TileKind,string>={
 start:'<path d="M20 8a9 9 0 1 0 1 9M20 2v6h-6"/>',
 product:'<path d="M12 2 22 12 12 22 2 12Z"/><path d="M12 7v10M8 12h8"/>',
 market:'<path d="M3 3v18h18M6 16l5-6 4 3 6-9M16 4h5v5"/>',
 life:'<path d="M12 21 3 12C-2 3 8-1 12 6c4-7 14-3 9 6Z"/>',
 trade:'<path d="M2 7h19l-5-5M22 17H3l5 5"/>',
 rebalance:'<path d="M12 2v19M3 6h18M6 6 2 15h8ZM18 6l-4 9h8ZM7 22h10"/>',
 policy:'<path d="M4 2h13l4 4v16H4ZM16 2v6h5M8 12h9M8 17h6"/>',
 profile:'<circle cx="12" cy="7" r="5"/><path d="M3 23v-3a9 9 0 0 1 18 0v3"/>',
 outlook:'<path d="M2 11 12 2l10 9M5 9v13h14V9M10 22v-7h4v7"/>'
};
function boardSymbols():string {
 return `<defs>${Object.entries(TILE_SHAPES).map(([kind,shape])=>`<symbol id="board-icon-${kind}" viewBox="0 0 24 24"><g fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${shape}</g></symbol>`).join('')}</defs>`;
}
function regionLandmarks():string {
 return `<g class="board-landmarks" aria-hidden="true">${[
  {x:350,y:145,icon:'policy',region:0},{x:545,y:329,icon:'market',region:1},
  {x:350,y:525,icon:'life',region:2},{x:155,y:329,icon:'outlook',region:3}
 ].map(p=>`<g class="region-landmark region-${p.region}" transform="translate(${p.x} ${p.y})"><rect x="-38" y="-27" width="76" height="72" rx="18"/><use href="#board-icon-${p.icon}" x="-12" y="-17" width="24" height="24"/><text y="31" text-anchor="middle">${REGIONS[p.region]}</text></g>`).join('')}</g>`;
}

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

/** 종류별 색·이름·아이콘을 담지 않는 공통 지도 스티커. */
function mapSticker(revealing: boolean): string {
  return `<g class="map-sticker${revealing ? ' discovery-cover' : ''}" aria-hidden="true">
    <path class="map-paper" d="M18 4H82L96 18V82Q96 96 82 96H18Q4 96 4 82V18Q4 4 18 4Z"/>
    <path class="map-route" d="M18 69q14-22 27-5t35-17"/>
    <path class="map-fold" d="M80 4v14h16Z"/>
    <text class="map-question" x="50" y="49" text-anchor="middle">?</text>
    <text class="map-caption" x="50" y="84" text-anchor="middle">미지의 칸</text>
  </g>`;
}

export function renderBoardMarkup(
  state: GameState,
  waiting: boolean,
  view: BoardView = {}
): string {
  const token = tokenTileIndex(view.focusIndex ?? state.position);
  const label = visibleTileLabel(state, token, view.revealIndex);
  const tiles = boardTiles.map((item) => {
    const { x, y } = boardPosition(item.index);
    const active = item.index === token;
    const visible = isTileRevealed(state, item.index, view.revealIndex);
    const revealing = item.index === view.revealIndex;
    const landed = active && Boolean(view.landed) && visible;
    const name = visibleTileLabel(state, item.index, view.revealIndex);
    return `<g data-key="tile-${item.index}" data-action="open-explore" data-tile="${item.index}" role="button" tabindex="${active ? 0 : -1}" aria-label="${item.index+1}. ${name} · ${visible ? `${REGIONS[regionOf(item.index)]} 지역 · 칸 정보` : '최종 도착하면 공개'}" class="tile ${visible ? `tile-${item.kind} region-${regionOf(item.index)}` : 'tile-hidden'}${revealing ? ' tile-revealing' : ''}${active ? ' active' : ''}${active && view.hopping && !landed ? ' moving' : ''}${landed ? ' landed' : ''}" transform="translate(${x} ${y})">
        <rect x="3" y="3" width="94" height="94" rx="15"></rect>
        ${state.route.visits.includes(item.index) ? '<circle class="visit-stamp" cx="50" cy="18" r="5"></circle>' : ''}
        ${visible ? `<use class="tile-kind-icon" href="#board-icon-${item.kind}" x="14" y="12" width="24" height="24" aria-hidden="true"/>` : ''}
        <text class="tile-label" x="50" y="70" text-anchor="middle">${visible ? item.label.replace(' 거리','').replace('은퇴 전망대','은퇴전망').replace('금리 전망길','금리전망') : ''}</text>
        ${!visible || revealing ? mapSticker(revealing) : ''}
        <text class="tile-number" x="84" y="24" text-anchor="end">${String(item.index + 1).padStart(2, '0')}</text>
        ${(view.trail ?? []).includes(item.index) ? '<circle class="move-trail" cx="50" cy="46" r="9" aria-hidden="true"/>' : ''}
        ${landed ? '<ellipse class="arrival-ring" cx="50" cy="50" rx="34" ry="20" aria-hidden="true"/>' + tileFx(item.kind) : ''}
        ${active && view.tokenInSvg !== false ? playerToken(state, view) : ''}
      </g>`;
  }).join('');
  const center = view.hopping
    ? `<text x="350" y="286" text-anchor="middle">TURN ${String(Math.min(state.turn + 1, 12)).padStart(2, '0')} / 12</text>
      <text class="phase" x="350" y="338" text-anchor="middle">${token + 1}번</text>
      <path d="M260 368H440"></path>
      <text x="350" y="410" text-anchor="middle">${view.revealIndex !== undefined ? '새로운 칸 발견' : '이동 중'}</text>
      <text x="350" y="438" text-anchor="middle">${label}</text>`
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
      <text class="seed" x="350" y="452" text-anchor="middle">TURN ${String(state.turn).padStart(2, '0')} / 12 · ${label}</text>`;
  return `<svg class="board" viewBox="0 0 700 700" role="group" aria-label="24칸 순환 보드. 현재 말은 ${token + 1}번 칸 ${label}에 있습니다.">
      ${boardSymbols()}<rect class="board-bg" x="0" y="0" width="700" height="700" rx="28"></rect>${regionLandmarks()}${tiles}
      <g class="board-center">${view.characters ? '<g class="board-guide" aria-hidden="true"><image href="./assets/design-a1/mascot.jpg" x="274" y="209" width="152" height="88" preserveAspectRatio="xMidYMid meet"/></g>' : ''}<g transform="translate(0 ${view.characters ? 45 : 0})">${center}</g></g>
    </svg>`;
}
