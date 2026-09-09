import { boardTiles } from '../data/content';
import { REGIONS, ROUTE_REASONS, regionOf, routeOptions } from '../engine/route-engine';
import type { GameState } from '../types';
export function tileHint(index: number): string {
  const kind = boardTiles[index].kind;
  return ({ start: '납입 공제 환급 확인', product: '상품 특성과 결제 일정 살펴보기', market: '시장 신호 확인', life: '추가 생활사건 가능 · 첫/마지막 턴 제외', trade: '이번 턴 행동 2회', rebalance: '목표 구성 점검', policy: '제도 카드와 퀴즈', profile: '내 구성과 성향 비교', outlook: '은퇴 목표 점검' })[kind];
}
export function renderRouteChoice(state: GameState): string {
  return `<p class="eyebrow">이동 전 선택 · 경로 토큰 ${state.route.tokens}개</p><h2>어디로 갈까요?</h2><p>기본은 두 주사위의 합입니다. 토큰 1개로 큰 주사위 하나만큼 이동할 수 있습니다. 시장과 급여는 어느 길이든 한 번만 반영됩니다.</p><div class="route-options">${routeOptions(state).map(o => `<article><small>${o.mode === 'sum' ? '기본 경로 · 무료' : '짧은 경로 · 토큰 1개'}</small><h3>${o.steps}칸 → ${o.position+1}. ${o.tile.label}</h3><p>${o.region} 지역 · ${tileHint(o.position)}</p><p>${o.crossesStart ? '↻ 연말정산 통과 · 환급 대기액 처리' : '연말정산 통과 없음'}</p><button class="primary" data-action="choose-route" data-mode="${o.mode}" ${state.route.tokens < o.cost ? 'disabled' : ''}>${o.mode === 'sum' ? '기본 경로로 이동' : '토큰 쓰고 이동'}</button></article>`).join('')}</div><p class="hint">더블은 한 판에 처음 한 번만 토큰 +1. 추가 턴은 없습니다.</p>`;
}
export function renderRegionProgress(state: GameState): string {
  return `<section class="region-progress" aria-label="지역 탐험"><strong>탐험 도장 ${state.route.badges.length}/4 · 경로 토큰 ${state.route.tokens}</strong><div>${REGIONS.map((r,i) => {
    const count = state.route.visits.filter(v => regionOf(v) === i).length;
    const completed = state.route.badges.includes(i);
    return `<button class="text-button ${completed ? 'complete' : ''}" data-action="open-explore" data-tile="${i*6}">${completed ? '★' : '○'} ${r} ${count}/6${!completed && count >= 2 ? ' · 도장 받기' : ''}</button>`;
  }).join('')}</div><button class="text-button" data-action="open-explore">지도·지역 미션 확인</button></section>`;
}
export function renderExplore(state: GameState, index: number): string {
  const tile = boardTiles[index]; const region = regionOf(index);
  const eligible = state.route.visits.filter(i => regionOf(i) === region).length >= 2 && !state.route.badges.includes(region);
  return `<p class="eyebrow">${REGIONS[region]} 지역 · ${state.route.visits.includes(index) ? '방문 도장 있음' : '아직 미방문'}</p><h2>${index+1}. ${tile.label}</h2><p>${tileHint(index)}</p><label for="map-tile">다른 칸 살펴보기</label><select id="map-tile">${boardTiles.map(t=>`<option value="${t.index}" ${t.index === index ? 'selected' : ''}>${t.index+1}. ${t.label}</option>`).join('')}</select><h3>지역 미션 · 두 곳을 보고 내 이유 남기기</h3><p>이 지역의 서로 다른 두 칸에 도착한 뒤, 살펴본 이유를 골라 도장을 완성하세요. 매수할 필요는 없습니다. 지역마다 한 번 경로 토큰 +1, 보유 상한 4개입니다. 정답·투자성향 평가가 아닙니다.</p>${eligible ? `<div class="choice-stack">${ROUTE_REASONS.map((r,i)=>`<button data-action="reflect-region" data-region="${region}" data-reason="${i}">${r}</button>`).join('')}</div>` : `<p>${state.route.badges.includes(region) ? '★ 이 지역 미션 완료' : '서로 다른 두 칸에 먼저 도착하세요.'}</p>`}${renderRegionProgress(state)}`;
}
