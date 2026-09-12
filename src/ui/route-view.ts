import { boardTiles } from '../data/content';
import { REGIONS, ROUTE_REASONS, regionOf } from '../engine/route-engine';
import type { GameState } from '../types';
export function tileHint(index: number): string {
  const kind = boardTiles[index].kind;
  return ({ start: '납입 공제 환급 확인', product: '상품 특성과 결제 일정 살펴보기', market: '시장 신호 확인', life: '추가 생활사건 가능 · 첫/마지막 턴 제외', trade: '이번 턴 행동 2회', rebalance: '목표 구성 점검', policy: '제도 카드와 퀴즈', profile: '내 구성과 성향 비교', outlook: '은퇴 목표 점검' })[kind];
}
export function renderRegionProgress(state: GameState): string {
  return `<section class="region-progress" aria-label="지역 탐험"><strong>탐험 도장 ${state.route.badges.length}/4</strong><div>${REGIONS.map((r,i) => {
    const count = new Set(state.route.visits.filter(v => regionOf(v) === i)).size;
    const completed = state.route.badges.includes(i);
    return `<button class="text-button ${completed ? 'complete' : ''}" data-action="open-explore" data-tile="${i*6}"><span aria-hidden="true">${completed ? '★' : '○'}</span> ${r}<small>도장 ${Math.min(2,count)}/2${completed ? ' 완료' : !state.route.version && count>=2 ? ' · 이유 선택' : ''} · 방문 ${count}/6</small></button>`;
  }).join('')}</div><button class="text-button" data-action="open-explore">지도·지역 미션 확인</button></section>`;
}
export function renderRegionReflection(state: GameState, region: number): string {
  const reflection = state.route.reflections.find(r => r.region === region);
  return reflection ? `<p>남긴 이유 · ${ROUTE_REASONS[reflection.reason]}</p>` : `<div class="choice-stack">${ROUTE_REASONS.map((r,i)=>`<button data-action="reflect-region" data-region="${region}" data-reason="${i}">${r}</button>`).join('')}</div>`;
}
export function renderExplore(state: GameState, index: number): string {
  const tile = boardTiles[index]; const region = regionOf(index);
  const count = new Set(state.route.visits.filter(i => regionOf(i) === region)).size;
  const eligible = count >= 2 && !state.route.badges.includes(region);
  const automatic = state.route.version === 'auto-v1';
  return `<p class="eyebrow">${REGIONS[region]} 지역 · ${state.route.visits.includes(index) ? '방문 도장 있음' : '아직 미방문'}</p><h2>${index+1}. ${tile.label}</h2><p>${tileHint(index)}</p><label for="map-tile">다른 칸 살펴보기</label><select id="map-tile">${boardTiles.map(t=>`<option value="${t.index}" ${t.index === index ? 'selected' : ''}>${t.index+1}. ${t.label}</option>`).join('')}</select>
    <h3>지역 미션 · 서로 다른 두 곳 방문</h3><p>${automatic ? '서로 다른 두 칸에 도착하면 지역 도장을 자동으로 받습니다. 이유 남기기는 완주 후 선택 복기입니다.' : '이전 판 규칙: 서로 다른 두 칸에 도착한 뒤 이유를 골라 도장을 완성하세요.'} 매수할 필요는 없으며 점수·금액 보상이 없는 수집 장식입니다.</p>
    <p>도장 조건 ${Math.min(2,count)}/2 · 지역 방문 ${count}/6</p>
    ${automatic ? `<p>${state.route.badges.includes(region) ? '★ 이 지역 도장 획득' : '서로 다른 두 칸에 먼저 도착하세요.'}</p>` : eligible ? renderRegionReflection(state,region) : `<p>${state.route.badges.includes(region) ? '★ 이 지역 미션 완료' : '서로 다른 두 칸에 먼저 도착하세요.'}</p>`}${renderRegionProgress(state)}`;
}
export function renderRouteReflections(state: GameState): string {
  if (!state.route.version || !state.route.badges.length) return '';
  return `<details data-preserve-open class="route-reflections"><summary>지역을 돌아보며 · 이유 남기기 (선택)</summary><p>정답·성향 평가가 아닙니다. 도장과 점수는 바뀌지 않습니다.</p>${state.route.badges.map(i=>`<section><h3>${REGIONS[i]} 지역</h3>${renderRegionReflection(state,i)}</section>`).join('')}</details>`;
}
