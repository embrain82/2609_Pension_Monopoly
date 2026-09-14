/** A-1의 공통 표식. 장식용 그림과 실제 선택된 게임 말을 구분한다. */
export function brandIcon(): string {
  return '<svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="1.7" aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="5"/><g fill="currentColor" stroke="none"><circle cx="8" cy="8" r="1.3"/><circle cx="16" cy="8" r="1.3"/><circle cx="12" cy="12" r="1.3"/><circle cx="8" cy="16" r="1.3"/><circle cx="16" cy="16" r="1.3"/></g></svg>';
}
export function brandWordmark(): string {
  return `<span class="road-wordmark">${brandIcon()}<span>연금로드</span></span>`;
}
export function renderBrandArt(kind: 'board' | 'mascot', characters = true): string {
  return `<div class="road-art road-art-${kind}"><div class="road-art-fallback" aria-hidden="true">${brandIcon()}<span>12턴의 은퇴설계</span></div>${characters ? `<img data-brand-art="${kind}" src="./assets/design-a1/${kind}.jpg" width="1536" height="1024" alt="올리·원이와 함께하는 ${kind === 'board' ? '24칸 보드 여행' : '연금로드'}" decoding="async">` : ''}</div>`;
}
