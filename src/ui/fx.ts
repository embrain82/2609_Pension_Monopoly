import { formatWon, formatShortWon } from './format';
import type { AnimationSpeed } from '../types';

export type NumberKind = 'won' | 'shortWon' | 'percent' | 'signedPercent';

export const NUMBER_TWEEN_MS = 600;

/** 이 턴부터 속보·정산 연출이 절반 길이(충격·이정표 턴 제외). 1~6턴에서 신선했던 연출이 후반엔 넘기고 싶은 창이 된다 */
export const LATE_GAME_TURN = 7;

export type ScenePace = 'normal' | 'fast';

/** 설정 「애니메이션 속도」 → 시간 배수. 2×면 모든 JS 타이머와 CSS `--fx`에 0.5를 곱한다 */
export function speedScale(speed: AnimationSpeed): number {
  return speed === 2 ? 0.5 : 1;
}

export function scaleMs(ms: number, speed: AnimationSpeed): number {
  return Math.round(ms * speedScale(speed));
}

/** 후반 가속. 7턴부터 빠르고, 충격 턴과 이정표를 처음 넘은 턴은 정속으로 돌려 놓는다 */
export function scenePace(turn: number, shock: boolean, milestones = 0): ScenePace {
  return turn >= LATE_GAME_TURN && !shock && milestones === 0 ? 'fast' : 'normal';
}

export function easeOutCubic(t: number): number {
  const clamped = Math.min(1, Math.max(0, t));
  return 1 - (1 - clamped) ** 3;
}

export function interpolate(from: number, to: number, t: number): number {
  return from + (to - from) * t;
}

export function formatByKind(kind: NumberKind, value: number): string {
  switch (kind) {
    case 'won': return formatWon(value);
    case 'shortWon': return formatShortWon(value);
    case 'percent': return `${Math.round(value * 100)}%`;
    case 'signedPercent': return `${value > 0 ? '+' : ''}${(value * 100).toFixed(1)}%`;
  }
}

/** 끝 값을 먼저 그려 두고, 시작 값이 있으면 렌더 뒤 트윈이 이어받는다. */
export function animatedNumber(kind: NumberKind, from: number | null, to: number, className = ''): string {
  const fromAttr = from === null || Math.abs(from - to) < 1e-9 ? '' : ` data-from="${from}"`;
  const cls = className ? ` class="${className}"` : '';
  return `<span${cls} data-anim="${kind}"${fromAttr} data-to="${to}">${formatByKind(kind, to)}</span>`;
}

