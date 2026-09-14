/** A-1의 공통 표식. 장식용 그림과 실제 선택된 게임 말을 구분한다. */
export function brandIcon(): string {
  return '<svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="1.7" aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="5"/><g fill="currentColor" stroke="none"><circle cx="8" cy="8" r="1.3"/><circle cx="16" cy="8" r="1.3"/><circle cx="12" cy="12" r="1.3"/><circle cx="8" cy="16" r="1.3"/><circle cx="16" cy="16" r="1.3"/></g></svg>';
}
export function brandWordmark(): string {
  return `<span class="road-wordmark">${brandIcon()}<span>연금로드</span></span>`;
}

/** 06-2 운용 카드와 생활 사건의 장식 아이콘. 의미는 항상 옆 문구로도 표시한다. */
export function operationIcon(kind: string): string {
  const paths: Record<string,string> = {
    contribute:'<path d="M12 3v12m-5-5 5 5 5-5M4 16v5h16v-5"/>',
    buy:'<path d="M12 4v16M4 12h16"/>',
    sell:'<path d="M4 12h16"/>',
    switch:'<path d="M3 7h18l-5-4M21 17H3l5 4"/>',
    rebalance:'<path d="M4 20V11m8 9V4m8 16v-6M2 8l6-5M16 10l6-6"/>',
    default:'<rect x="4" y="3" width="16" height="18" rx="3"/><path d="M8 8h8M8 12h8M8 16h4"/>',
    cash:'<rect x="3" y="6" width="18" height="14" rx="3"/><path d="M3 9V5l13-3v4M16 12h5v5h-5z"/>',
    life:'<path d="M12 21 3 12a6 6 0 0 1 9-8 6 6 0 0 1 9 8Z"/>'
  };
  return `<svg class="operation-icon" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[kind]??paths.default}</svg>`;
}
export function renderBrandArt(kind: 'board' | 'mascot', characters = true): string {
  return `<div class="road-art road-art-${kind}"><div class="road-art-fallback" aria-hidden="true">${brandIcon()}<span>12턴의 은퇴설계</span></div>${characters ? `<img data-brand-art="${kind}" src="./assets/design-a1/${kind}.jpg" width="1536" height="1024" alt="올리·원이와 함께하는 ${kind === 'board' ? '24칸 보드 여행' : '연금로드'}" decoding="async">` : ''}</div>`;
}
