import { calculateScore, starChecklist } from '../engine/scoring-engine';
import type { GameState } from '../types';
const esc=(s:string)=>s.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
export function retrySuggestion(state:GameState):{reason:string;turn:number|null;moment:number}|null {
 if(!state.campaign || state.status!=='finished')return null;
 const checks=starChecklist(state,calculateScore(state));const failed=checks.findIndex(c=>!c.passed);
 if(failed<0)return null;
 const reviews=state.campaign.reviews;
 const examine=failed===1?[...reviews].sort((a,b)=>a.cash-b.cash)[0]:failed===2||state.campaign.mission==='purchasing'?[...reviews].sort((a,b)=>a.market-b.market)[0]:reviews.at(-1);
 const moment=examine?.turn??12;
 const branch=state.campaign.branches.filter(b=>b.turn<moment).sort((a,b)=>b.turn-a.turn)[0];
 return {reason:checks[failed].label,turn:branch?.turn??null,moment};
}
export function renderRetrySuggestion(state:GameState):string {
 const item=retrySuggestion(state);if(!item)return '';
 return `<article class="retry-suggestion"><p class="eyebrow">다음 판에서 바꿔 볼 한 가지</p><h3>${esc(item.reason)}</h3><p>${item.moment}턴 기록을 중심으로 ${item.turn?`${item.turn}턴 끝에서 돌아가 이후 운용과 생활자금 배분을`:'처음부터 자금 배분을'} 바꿔 보세요. 이 지점은 복기를 위한 제안이며 결과 개선을 보장하지 않습니다.</p><button class="primary" data-action="${item.turn?'replay-chapter':'same-seed'}" ${item.turn?`data-turn="${item.turn}"`:''}>${item.turn?`${item.turn}턴 끝부터 연습`:'같은 시장 · 시작 조건 다시 확인'}</button><p class="hint">분기 연습은 이미 본 시장을 활용하는 연습 판입니다.</p></article>`;
}
