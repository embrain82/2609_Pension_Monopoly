import type { AvatarId, GameState } from '../types';

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

/** 충격 턴이거나 이번 턴 IRP가 5% 이상 줄면 긴장, 목표를 넘기면 기쁨. */
export function avatarMood(state: GameState, goalMet: boolean): Mood {
  if (goalMet) return 'happy';
  if (state.turn > 0 && state.lastMarket.shock) return 'tense';
  const last = state.irpHistory.at(-1);
  const prev = state.irpHistory.at(-2);
  if (last !== undefined && prev !== undefined && prev > 0 && last / prev - 1 <= -0.05) return 'tense';
  return 'calm';
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
