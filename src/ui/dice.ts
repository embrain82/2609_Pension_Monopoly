import type { GameState } from '../types';

export const DICE_ROLL_DURATION_MS = 1120;
export const DICE_LAND_HOLD_MS = 280;

const FACE_TRANSFORMS: Record<number, string> = {
  1: 'rotateX(0deg) rotateY(0deg)',
  2: 'rotateX(0deg) rotateY(-90deg)',
  3: 'rotateX(-90deg) rotateY(0deg)',
  4: 'rotateX(90deg) rotateY(0deg)',
  5: 'rotateX(0deg) rotateY(90deg)',
  6: 'rotateX(0deg) rotateY(180deg)'
};

export function diceLandTransform(face: number, variant = 0): string {
  const pose = FACE_TRANSFORMS[face] ?? FACE_TRANSFORMS[1];
  const spin = variant === 0
    ? 'rotateX(360deg) rotateY(360deg)'
    : 'rotateX(-360deg) rotateY(360deg)';
  return `${spin} ${pose}`;
}

export function shouldSkipDiceAnimation(reducedMotion: boolean, prefersReducedMotion = false): boolean {
  return reducedMotion || prefersReducedMotion;
}

export function canRevealNextTurn(state: GameState): boolean {
  return state.status === 'playing' && !state.awaitingAction && !state.currentEventId;
}

export { dicePairForTurn } from '../engine/random-engine';

export function diceSteps(faces: [number, number]): number {
  return faces[0] + faces[1];
}

export function dicePairLabel(left: number, right: number): string {
  return `${left + right}칸`;
}

export function isUpcomingSpoiler(stepTurn: number, currentTurn: number): boolean {
  return stepTurn > currentTurn;
}

export function isRevealedTurn(stepTurn: number, currentTurn: number, waiting: boolean): boolean {
  return !waiting && stepTurn === currentTurn;
}

export function isCompletedTurn(stepTurn: number, currentTurn: number, waiting: boolean): boolean {
  if (stepTurn < currentTurn) return true;
  return waiting && currentTurn > 0 && stepTurn === currentTurn;
}

const PIP_MAP: Record<number, number[]> = {
  1: [5],
  2: [1, 9],
  3: [1, 5, 9],
  4: [1, 3, 7, 9],
  5: [1, 3, 5, 7, 9],
  6: [1, 3, 4, 6, 7, 9]
};

function facePips(face: number): string {
  const active = new Set(PIP_MAP[face] ?? []);
  return Array.from({ length: 9 }, (_, index) => `<i class="pip${active.has(index + 1) ? ' on' : ''}"></i>`).join('');
}

function cubeMarkup(face: number, variant: 0 | 1, rolling: boolean, durationMs: number): string {
  const faces = [1, 2, 3, 4, 5, 6].map((value) => `<div class="dice-face n${value}">${facePips(value)}</div>`).join('');
  const alt = variant === 1 ? ' alt' : '';
  return `<div class="dice-slot${alt}"><div class="dice ${rolling ? `rolling${alt}` : 'landed'}" style="--land:${diceLandTransform(face, variant)};--dice-ms:${durationMs}ms">${faces}</div></div>`;
}

/** 주사위 오버레이. `durationMs`는 설정 속도(2×면 절반)를 반영한 굴림 길이로, CSS `--dice-ms`가 그대로 쓴다 */
export function renderDiceMarkup(faces: [number, number], rolling: boolean, durationMs = DICE_ROLL_DURATION_MS): string {
  const label = dicePairLabel(faces[0], faces[1]);
  return `<div class="dice-overlay" role="status" aria-live="assertive" aria-label="${rolling ? '주사위 두 개를 굴리는 중입니다' : `주사위 결과 ${label}`}">
    <div class="dice-scene" style="--dice-ms:${durationMs}ms">
      ${cubeMarkup(faces[0], 0, rolling, durationMs)}
      ${cubeMarkup(faces[1], 1, rolling, durationMs)}
    </div>
    <p>${rolling ? '주사위를 굴리는 중' : `${label} 이동 · 이번 턴 시장을 확인하세요`}</p>
  </div>`;
}

/** 최근 실제 굴림을 정지된 점 눈으로 확인한다. 동작 줄이기·이어하기에서도 결과를 읽을 수 있다. */
export function renderDiceOutcome(faces: [number, number]): string {
  return `<div class="dice-outcome" role="img" aria-label="직전 주사위 ${faces[0]}과 ${faces[1]}, 합계 ${diceSteps(faces)}칸 이동"><span class="dice-outcome-label">직전 주사위</span><div class="dice-outcome-pair" aria-hidden="true">${cubeMarkup(faces[0], 0, false, 0)}${cubeMarkup(faces[1], 1, false, 0)}</div><strong>${diceSteps(faces)}칸 이동</strong></div>`;
}
