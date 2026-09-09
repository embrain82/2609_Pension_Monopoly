import type { GameState } from '../types';
import { AVATAR_ANIMALS, avatarBody, type Mood } from './avatars';
import { TOKEN_STEP_MS, boardPosition, tokenTileIndex } from './board';

/** 보드 SVG viewBox 한 변. 칸 중심을 이 값으로 나눠 퍼센트 좌표를 만든다. */
export const BOARD_UNITS = 700;

export interface TokenView {
  index: number;
  characters: boolean;
  mood: Mood;
}

/** 퍽의 기본 자세. 모든 키프레임은 여기서 출발해 여기로 돌아온다. */
export const TOKEN_BASE = 'translate(-50%, -64%)';
/** 한 칸 점프의 총 길이(ms). 이 중 HOP_AIR 비율만 공중에 있고 나머지는 칸 위에 내려앉아 있는 박자. */
export const HOP_MS = TOKEN_STEP_MS;
export const HOP_AIR = 0.7;
/** 마지막 칸 착지(찌그러짐) 길이. 마지막 점프가 칸에 닿은 뒤 이 시간만큼 지나서 속보 카드가 뜬다. */
export const LAND_MS = 320;
/** 점프 최고점: 퍽 높이 대비. 125%면 칸 한 변의 약 0.7배 높이라 "옆으로 미끄러짐"이 아니라 점프로 읽힌다. */
export const HOP_HEIGHT = '125%';

/** DOM `Keyframe`에 그대로 넘길 수 있는 형태. 순수 모듈이라 DOM 타입에는 의존하지 않는다. */
export interface TokenKeyframe {
  [property: string]: string | number | null | undefined;
  transform?: string;
  opacity?: number;
  offset?: number;
  easing?: string;
}

export interface HopPlan {
  /** 애니메이션 총 길이(ms). 마지막 칸은 착지 찌그러짐만큼 길다. */
  duration: number;
  /** 퍽이 칸에 닿는 시점(0~1). 이 시점까지 가로 이동이 끝나고, 이후는 칸 위에서 찌그러짐·복원. */
  land: number;
  puck: TokenKeyframe[];
  shadow: TokenKeyframe[];
}

/**
 * 한 칸 점프 한 번. 출발 → 최고점 → 칸에 닿음(찌그러짐) → 복원. 첫 칸부터 마지막 칸까지 모든 칸이
 * 같은 높이·같은 공중 시간을 쓰고, 마지막 칸만 찌그러짐이 더 크고 길다. 가로 이동(`slideKeyframes`)도
 * 같은 `land` 시점에 끝나 퍽이 공중에 있는 동안만 움직인다. `scale`은 설정 속도(2×면 0.5)로 길이만 줄이고
 * 비율은 그대로 둔다.
 */
export function hopPlan(final: boolean, scale = 1): HopPlan {
  const air = HOP_MS * HOP_AIR * scale;
  const duration = final ? air + LAND_MS * scale : HOP_MS * scale;
  const land = air / duration;
  const peak = land / 2;
  const settle = land + (1 - land) * 0.55;
  const squash = final ? 'scale(1.16, 0.82)' : 'scale(1.08, 0.92)';
  return {
    duration,
    land,
    puck: [
      { transform: TOKEN_BASE, offset: 0, easing: 'ease-out' },
      { transform: `${TOKEN_BASE} translateY(-${HOP_HEIGHT}) rotateX(-10deg) scale(1.05)`, offset: peak, easing: 'ease-in' },
      { transform: `${TOKEN_BASE} ${squash}`, offset: land, easing: 'ease-out' },
      { transform: `${TOKEN_BASE} scale(0.97, 1.03)`, offset: settle, easing: 'ease-in-out' },
      { transform: TOKEN_BASE, offset: 1 }
    ],
    shadow: [
      { transform: 'none', opacity: 1, offset: 0, easing: 'ease-out' },
      { transform: 'scale(0.45)', opacity: 0.35, offset: peak, easing: 'ease-in' },
      { transform: 'scale(1.12)', opacity: 1, offset: land, easing: 'ease-out' },
      { transform: 'none', opacity: 1, offset: 1 }
    ]
  };
}

/** 가로 이동: 공중에 있는 동안(0~land) 출발 칸 → 도착 칸, 그 뒤로는 도착 칸에 고정. */
export function slideKeyframes(from: number, to: number, land: number): TokenKeyframe[] {
  return [
    { transform: tokenTranslate(from), offset: 0, easing: 'ease-in-out' },
    { transform: tokenTranslate(to), offset: land },
    { transform: tokenTranslate(to), offset: 1 }
  ];
}

/** 칸 중심의 보드 대비 퍼센트 좌표. 정사각형 `.board-stage` 위에서 SVG 좌표와 1:1로 맞는다. */
export function tokenPercent(index: number): { x: number; y: number } {
  const { x, y } = boardPosition(tokenTileIndex(index));
  return {
    x: Math.round(((x + 50) / BOARD_UNITS) * 10000) / 100,
    y: Math.round(((y + 50) / BOARD_UNITS) * 10000) / 100
  };
}

export function tokenTranslate(index: number): string {
  const { x, y } = tokenPercent(index);
  return `translate(${x}%, ${y}%)`;
}

export function tokenClasses(view: Pick<TokenView, 'characters'>): string {
  return view.characters ? 'token3d' : 'token3d plain';
}

/**
 * 2.5D 말(퍽) 오버레이. 위치 정보는 보드 SVG의 aria-label이 전달하므로 이 레이어는 aria-hidden.
 * 이동·hop·착지 애니메이션은 유지되는 말 노드에 app.ts의 animateToken이
 * 위 키프레임을 Web Animations API로 붙인다. 마크업 자체는 정지 자세만 그린다.
 */
export function renderTokenLayer(state: GameState, view: TokenView): string {
  const index = tokenTileIndex(view.index);
  const face = view.characters
    ? `<svg viewBox="0 0 100 100" aria-hidden="true">${avatarBody(state.avatarId, view.mood)}</svg>`
    : '<b>나</b>';
  return `<div class="token-layer" aria-hidden="true">
      <div class="token-pos" data-index="${index}" data-animal="${view.characters ? AVATAR_ANIMALS[state.avatarId] : ''}" style="transform:${tokenTranslate(index)}">
        <div class="${tokenClasses(view)}"><i class="token-shadow"></i><i class="token-rim"></i><div class="token-face">${face}</div></div>
      </div>
    </div>`;
}
