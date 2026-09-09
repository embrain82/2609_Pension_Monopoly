import { boardTiles } from '../data/content';
import { REGIONS, ROUTE_REASONS, regionOf } from '../engine/route-engine';
import type { GameState } from '../types';
export function tileHint(index: number): string {
  const kind = boardTiles[index].kind;
  return ({ start: '납입 공제 환급 확인', product: '상품 특성과 결제 일정 살펴보기', market: '시장 신호 확인', life: '추가 생활사건 가능 · 첫/마지막 턴 제외', trade: '이번 턴 행동 2회', rebalance: '목표 구성 점검', policy: '제도 카드와 퀴즈', profile: '내 구성과 성향 비교', outlook: '은퇴 목표 점검' })[kind];
}
export function renderRegionProgress(state: GameState): string {
  return `<section class="region-progress" aria-label="지역 탐험"><strong>탐험 도장 ${state.route.badges.length}/4</strong><div>${REGIONS.map((r,i) => {
    const count = state.route.visits.filter(v => regionOf(v) === i).length;
    const completed = state.route.badges.includes(i);
    return `<button class="text-button ${completed ? 'complete' : ''}" data-action="open-explore" data-tile="${i*6}">${completed ? '★' : '○'} ${r} ${count}/6${!completed && count >= 2 ? ' · 도장 받기' : ''}</button>`;
  }).join('')}</div><button class="text-button" data-action="open-explore">지도·지역 미션 확인</button></section>`;
}
export function renderExplore(state: GameState, index: number): string {
  const tile = boardTiles[index]; const region = regionOf(index);
  const eligible = state.route.visits.filter(i => regionOf(i) === region).length >= 2 && !state.route.badges.includes(region);
  return `<p class="eyebrow">${REGIONS[region]} 지역 · ${state.route.visits.includes(index) ? '방문 도장 있음' : '아직 미방문'}</p><h2>${index+1}. ${tile.label}</h2><p>${tileHint(index)}</p><label for="map-tile">다른 칸 살펴보기</label><select id="map-tile">${boardTiles.map(t=>`<option value="${t.index}" ${t.index === index ? 'selected' : ''}>${t.index+1}. ${t.label}</option>`).join('')}</select><h3>지역 미션 · 두 곳을 보고 내 이유 남기기</h3><p>이 지역의 서로 다른 두 칸에 도착한 뒤, 살펴본 이유를 골라 도장을 완성하세요. 매수할 필요는 없습니다. 지역마다 도장은 한 번만 완성할 수 있습니다. 정답·투자성향 평가가 아닙니다.</p>${eligible ? `<div class="choice-stack">${ROUTE_REASONS.map((r,i)=>`<button data-action="reflect-region" data-region="${region}" data-reason="${i}">${r}</button>`).join('')}</div>` : `<p>${state.route.badges.includes(region) ? '★ 이 지역 미션 완료' : '서로 다른 두 칸에 먼저 도착하세요.'}</p>`}${renderRegionProgress(state)}`;
}
