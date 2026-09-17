import type { AvatarId, GameState } from '../types';
import { missionDisplay } from '../engine/progress-engine';

export type Mood = 'calm' | 'tense' | 'happy';
export type Speaker = 'anchor' | 'coach';

/** Legacy appearance slots stay stable so saves and collection records remain compatible. */
export const CHARACTER_IDS: readonly AvatarId[] = ['stable', 'stableGrowth', 'balanced', 'growth', 'aggressive'];
export const CHARACTERS: Record<AvatarId, { name: string; asset: string; color: string; centers: [number, number, number]; feet: number }> = {
  stable: { name: '올리', asset: 'olli', centers: [391, 371.5, 305.5], feet: 651, color: '#dcefaf' },
  stableGrowth: { name: '원이', asset: 'woni', centers: [375, 343, 358.5], feet: 622, color: '#fff0ac' },
  balanced: { name: '단지', asset: 'danji', centers: [392, 377.5, 315.5], feet: 640, color: '#fbd5e0' },
  growth: { name: '달리', asset: 'dalli', centers: [414, 354, 283.5], feet: 650, color: '#f8e2be' },
  aggressive: { name: '코리', asset: 'kori', centers: [378, 364, 360], feet: 642, color: '#cfe9fb' }
};
export const AVATAR_NAMES = Object.fromEntries(CHARACTER_IDS.map(id => [id, CHARACTERS[id].name])) as Record<AvatarId, string>;

export const MOOD_LABELS: Record<Mood, string> = { calm: '평온', tense: '긴장', happy: '기쁨' };

const INK = '#183635';
const CREAM = '#fbfcf6';
const STROKE = `stroke="${INK}" stroke-width="3" stroke-linejoin="round" stroke-linecap="round"`;

export const EMOTION_RETURN_THRESHOLD = .01;
export interface AvatarEmotion { mood: Mood; reason: string; }

/** 도착 효과와 현재 운용 장부만 읽는다. 연출 때문에 금융 상태나 달성 기록을 쓰지 않는다. */
export function avatarEmotion(state: GameState): AvatarEmotion {
  const calm: AvatarEmotion = { mood: 'calm', reason: '차분하게 다음 선택을 준비해요' };
  if (state.turn === 0) return calm;
  if (state.currentEventId) return { mood: 'tense', reason: '생활 사건이 생겼어요' };
  const { open, marketEffects, cashInterest } = state.ledger;
  const interest = cashInterest?.turn === state.turn ? cashInterest.amount : 0;
  // 구 저장의 합산 잔액에는 결제/입출금이 섞일 수 있어 운용수익률을 추정하지 않는다.
  const rate = marketEffects && open > 0 ? (marketEffects.reduce((sum, e) => sum + e.delta, 0) + interest) / open : null;
  if (rate !== null && Number.isFinite(rate) && Math.abs(rate) >= EMOTION_RETURN_THRESHOLD) {
    return { mood: rate < 0 ? 'tense' : 'happy', reason: `이번 턴 운용 ${rate > 0 ? '+' : ''}${(rate * 100).toFixed(1)}%` };
  }
  for (const effect of state.tileEffects.filter(e => e.tileIndex === state.position)) {
    if (effect.kind === 'tax-refund' && (effect.amount ?? 0) > 0) return { mood: 'happy', reason: '세액공제 환급을 받았어요' };
    if (effect.kind === 'double-action') return { mood: 'happy', reason: '운용 기회가 2회예요' };
    if (['policy-brief', 'profile-check', 'diversify-check'].includes(effect.kind) && (effect.understanding ?? 0) > 0) {
      return { mood: 'happy', reason: `제도·운용 이해 +${effect.understanding}점을 얻었어요` };
    }
  }
  const justReached = state.turnMilestones.some(m => m.id === 'goal-100' && m.turn === state.turn)
    || (!state.milestonesHit.includes('goal-100') && missionDisplay(state).passed);
  return justReached ? { mood: 'happy', reason: '이번 판 목표에 처음 도달했어요' } : calm;
}

export function avatarMood(state: GameState): Mood {
  return avatarEmotion(state).mood;
}

export function resultMood(stars: number): Mood {
  if (stars >= 2) return 'happy';
  if (stars === 0) return 'tense';
  return 'calm';
}

const MOOD_FRAME: Record<Mood, number> = { calm: 0, tense: 1, happy: 2 };

/** Align each pose center/feet within the existing 100×100 token viewport without editing the source PNG. */
export function avatarBody(avatarId: AvatarId, mood: Mood): string {
  const character = CHARACTERS[avatarId], frame = MOOD_FRAME[mood];
  return `<g class="allone-art" data-character="${character.asset}" data-mood="${mood}">
    <g class="avatar-fallback" visibility="hidden"><circle cx="50" cy="51" r="38" fill="${character.color}" stroke="${INK}" stroke-width="2"/><text x="50" y="59" text-anchor="middle" font-family="sans-serif" font-size="24" font-weight="700" fill="${INK}">${character.name}</text></g>
    <svg class="avatar-frame" x="0" y="0" width="100" height="100" viewBox="${frame * 724 + character.centers[frame] - 362} ${character.feet - 656} 724 724" overflow="hidden"><image data-character-image="${character.asset}" href="/assets/characters/allone/${character.asset}.png" x="0" y="0" width="2172" height="724"/></svg>
  </g>`;
}

export function renderAvatar(avatarId: AvatarId, mood: Mood, size = 64): string {
  return `<svg class="avatar avatar-${avatarId} mood-${mood}" viewBox="0 0 100 100" width="${size}" height="${size}" role="img" aria-label="${AVATAR_NAMES[avatarId]} · ${MOOD_LABELS[mood]}">${avatarBody(avatarId, mood)}</svg>`;
}

/** Keep failed-image fallback local to this app, including after DOM morphs and token hops. */
export function showAvatarFallbacks(root: Element, failed: ReadonlySet<string>): void {
  if (!failed.size) return;
  for (const art of root.querySelectorAll<SVGElement>('.allone-art')) {
    if (!failed.has(art.dataset.character ?? '')) continue;
    art.querySelector('.avatar-fallback')?.setAttribute('visibility', 'visible');
    art.querySelector('.avatar-frame')?.setAttribute('visibility', 'hidden');
  }
}

function owlBody(): string {
  return `<path d="M22 30l8 12M78 30l-8 12" fill="none" ${STROKE}/>
    <ellipse cx="50" cy="58" rx="32" ry="34" fill="#7a6a58" ${STROKE}/>
    <circle cx="36" cy="50" r="12" fill="${CREAM}" ${STROKE}/><circle cx="64" cy="50" r="12" fill="${CREAM}" ${STROKE}/>
    <circle cx="36" cy="50" r="5" fill="${INK}"/><circle cx="64" cy="50" r="5" fill="${INK}"/>
    <path d="M50 58l-5 8h10z" fill="#e9893a" ${STROKE}/>
    <rect x="70" y="66" width="8" height="22" rx="4" fill="#3d4f4c" ${STROKE}/><circle cx="74" cy="64" r="7" fill="#3d4f4c" ${STROKE}/>`;
}

function penguinBody(): string {
  return `<ellipse cx="50" cy="60" rx="30" ry="34" fill="${INK}" ${STROKE}/>
    <ellipse cx="50" cy="66" rx="20" ry="24" fill="${CREAM}"/>
    <path d="M28 20h44l-4 12h-36z" fill="#3f8f5f" ${STROKE}/><rect x="24" y="30" width="52" height="7" rx="3" fill="#3f8f5f" ${STROKE}/>
    <circle cx="41" cy="48" r="3.5" fill="${INK}"/><circle cx="59" cy="48" r="3.5" fill="${INK}"/>
    <path d="M44 56h12l-6 6z" fill="#e9893a" ${STROKE}/>
    <path d="M22 62q-8 12 2 22M78 62q8 12 -2 22" fill="none" ${STROKE}/>`;
}

export function renderSpeaker(speaker: Speaker, size = 56): string {
  const label = speaker === 'anchor' ? '앵커 부엉이' : '코치 펭귄';
  return `<svg class="avatar avatar-${speaker}" viewBox="0 0 100 100" width="${size}" height="${size}" role="img" aria-label="${label}">${speaker === 'anchor' ? owlBody() : penguinBody()}</svg>`;
}
