import { ACHIEVEMENTS, achievementDef, isWeeklySeed, weeklyLabel, weeklySeed } from '../engine/achievements';
import { PROFILE_IDS } from '../engine/profile-engine';
import type { AchievementId, Collection, GameState, LifeResolution } from '../types';
import { AVATAR_ANIMALS, renderAvatar } from './avatars';

/** 결과 화면 「새 업적」. 별 연출과 같은 박자로 하나씩 뜬다(`--i`). 없으면 빈 문자열 */
export function renderNewAchievements(ids: AchievementId[]): string {
  if (!ids.length) return '';
  const cards = ids.map((id, index) => {
    const def = achievementDef(id);
    return `<li class="new-achievement" style="--i:${index}"><span class="achievement-mark" aria-hidden="true">🏅</span><div><strong>${def.title}</strong><p>${def.detail}</p></div></li>`;
  }).join('');
  return `<section class="new-achievements" aria-label="새 업적 ${ids.length}개"><div class="card-label">새 업적 ${ids.length}개</div><ul>${cards}</ul></section>`;
}

/** 도감 「업적」 탭. 가진 것은 제목·설명, 없는 것은 제목만 흐리게(조건은 보여 준다 — 목표가 있어야 다시 한다) */
export function renderAchievementGallery(owned: AchievementId[]): string {
  const have = new Set(owned);
  const items = ACHIEVEMENTS.map((def) => {
    const got = have.has(def.id);
    return `<article class="achievement ${got ? 'earned' : 'locked'}"><span class="achievement-mark" aria-hidden="true">${got ? '🏅' : '○'}</span><div><h3>${def.title}</h3><p>${def.detail}</p>${def.scope === 'meta' ? '<small>누적 업적</small>' : ''}</div></article>`;
  }).join('');
  return `<div class="achievement-grid">${items}</div>`;
}

/** 도감 「캐릭터 컬렉션」 탭. 성향 5종 동물, 완주 수, 최고 별 */
export function renderCollectionGallery(collection: Collection, characters: boolean): string {
  const items = PROFILE_IDS.map((id) => {
    const entry = collection[id];
    const done = entry.plays > 0;
    const stars = `${'★'.repeat(entry.bestStars)}${'☆'.repeat(3 - entry.bestStars)}`;
    return `<article class="collection-card ${done ? 'earned' : 'locked'}">
        ${characters ? renderAvatar(id, entry.bestStars >= 2 ? 'happy' : done ? 'calm' : 'tense', 56) : `<b class="collection-initial">${AVATAR_ANIMALS[id].slice(0, 1)}</b>`}
        <h3>${AVATAR_ANIMALS[id]}<small>모든 투자성향에서 선택 가능</small></h3>
        <p class="collection-stars" aria-label="최고 별 ${entry.bestStars}개">${stars}</p>
        <p>${done ? `${entry.plays}판 완주` : '아직 완주 없음'}</p>
      </article>`;
  }).join('');
  const done = PROFILE_IDS.filter((id) => collection[id].plays > 0).length;
  return `<p class="collection-summary">${done} / ${PROFILE_IDS.length} 캐릭터 완주 · 각 캐릭터로 별 3개를 노려 보세요</p><div class="collection-grid">${items}</div>`;
}

/** 결과 화면 시드 줄: 주간 시드면 배지, 「결과 복사」 버튼 */
export function renderSeedLine(state: GameState): string {
  const weekly = isWeeklySeed(state.seed);
  const label = weekly ? `<span class="seed-badge weekly">주간 시드 ${weeklyLabel(state.seed)}</span>` : `<span class="seed-badge">시드 ${state.seed}</span>`;
  return `<p class="seed-line">${label}<button class="text-button" data-action="copy-result">결과 복사</button></p>`;
}

/** 타이틀 「이번 주 시드로 도전」 버튼 */
export function renderWeeklyButton(date = new Date()): string {
  const seed = weeklySeed(date);
  return `<button class="secondary weekly-button" data-action="weekly-seed" data-seed="${seed}"><span>이번 주 시드로 도전</span><small>${weeklyLabel(seed)} · 모두 같은 시장</small></button>`;
}

/** 사건을 해결한 뒤 열리는 행동 목록 머리글. 두 번째 결정처럼 느껴지지 않게 한 흐름으로 잇는다 */
export function renderLifeResolvedStrip(resolution: LifeResolution): string {
  return `<p class="life-resolved-strip"><span class="life-resolved-mark" aria-hidden="true">✓</span><span>사건 해결됨 · <b>${resolution.title}</b> → ${resolution.choiceLabel}</span><strong>이제 운용</strong></p>`;
}
