import type { AchievementId, GameState } from '../types';
import { calculateScore, starChecklist } from '../engine/scoring-engine';
import { missionDisplay } from '../engine/progress-engine';
import { AVATAR_ANIMALS, renderAvatar } from './avatars';
import { formatShortWon, signedPercent } from './format';
import { REGIONS } from '../engine/route-engine';
import { renderNewAchievements } from './achievements-view';
import { renderRouteReflections } from './route-view';
export function renderResultHero(state: GameState, characters: boolean): string {
  const score = calculateScore(state), mission = missionDisplay(state,score);
  const first = starChecklist(state,score).find(c=>!c.passed);
  const cause = mission.passed ? first ? `미션은 달성했습니다. 다음 별의 조건: ${first.label}` : '미션과 생활자금·안정성 조건을 모두 충족했습니다.' : `${mission.remaining}. 이번 판의 자금 배분과 시장 영향을 복기해 보세요.`;
  return `<header class="result-cover ${mission.passed?'met':'unmet'}"><p class="eyebrow">${state.campaign?.practice?'분기 연습 · 최고 기록 제외':'12턴 완주 · 이번 판 결과'}</p>
    <div class="result-headline">${characters?renderAvatar(state.avatarId,'happy',56):''}<h1>${mission.name} ${mission.passed?'달성':'미달'}</h1></div>
    <div class="stars" role="img" aria-label="3개 중 ${score.stars}개 별">${[1,2,3].map(n=>`<span aria-hidden="true" class="${n<=score.stars?'earned':''}" style="--i:${n}">★</span>`).join('')}</div>
    <div class="result-hero"><small>${mission.metric}</small><strong>${mission.valueText}</strong><span>목표 ${mission.targetText} · 진행률 ${Math.floor(mission.ratio*1000)/10}%</span></div>
    <p class="result-cause">${cause}</p><small class="hint">${mission.basis}</small></header>`;
}
export function renderResultOverview(state: GameState):string {
 const score=calculateScore(state);
 return `<section class="result-overview" aria-label="자산과 학습 요약"><article><small>최종 IRP</small><strong>${formatShortWon(score.irpValue)}</strong><span>납입 제외 운용수익률 ${signedPercent(score.investmentReturnRate)}</span></article><article><small>생활자금</small><strong>${formatShortWon(score.cash)}</strong><span>미지급 생활비 ${formatShortWon(state.livingDebt)}</span></article><article><small>제도·운용 이해</small><strong>${score.knowledgeScore}/20점</strong><span>이번 판 학습 카드 ${state.unlockedCards.length}장</span></article></section>`;
}
export function renderResultCollection(state: GameState, ids: AchievementId[], characters:boolean):string {
 return `<section class="result-collection"><h2>이번 여행의 수집</h2><p class="hint">금융 성과와 별개인 방문 기록입니다. ${state.campaign?.practice?'연습에서는 누적 기록을 추가하지 않습니다.':'지역 도장은 이 판의 기록입니다.'}</p><div class="stamp-shelf">${REGIONS.map((r,i)=>`<span class="${state.route.badges.includes(i)?'earned':'empty'}"><b aria-hidden="true">${state.route.badges.includes(i)?'★':'○'}</b>${r}<small>${state.route.badges.includes(i)?'획득':'미획득'}</small></span>`).join('')}</div>
 <p class="collection-character">${characters?renderAvatar(state.avatarId,'happy',40):''}${AVATAR_ANIMALS[state.avatarId]}와 12턴 완주 · ${state.route.badges.length}/4 도장</p>
 ${ids.length?`<details data-preserve-open class="new-collection"><summary>새 업적 ${ids.length}개 확인</summary>${renderNewAchievements(ids)}</details>`:'<p class="hint">이번 판에 새로 추가된 업적은 없습니다.</p>'}
 ${renderRouteReflections(state)}<button class="text-button" data-action="open-cards" data-tab="achievements">업적 · 컬렉션</button></section>`;
}
