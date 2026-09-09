import { products } from '../data/content';
import { SCENARIOS, MISSIONS, tdfEquity, missionResult, type ScenarioId, type MissionId } from '../engine/scenario-engine';
import { calculateScore } from '../engine/scoring-engine';
import type { GameState } from '../types';
const won=(n:number)=>Math.round(n).toLocaleString('ko-KR')+'원';
const pct=(n:number)=>(n*100).toFixed(1)+'%';
const esc=(s:string)=>s.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
export function renderCampaignPicker(scenario:ScenarioId,mission:MissionId, open=false):string {
  return `<details class="campaign-picker" ${open ? "open" : ""}><summary>이번 판 설정 · ${SCENARIOS[scenario].name} / ${MISSIONS[mission].name}</summary>
    <label for="scenario-pick">시장 시나리오</label><select id="scenario-pick">${Object.entries(SCENARIOS).map(([id,s])=>`<option value="${id}" ${id===scenario?'selected':''}>${s.name} · ${s.description}</option>`).join('')}</select>
    <label for="mission-pick">이번 판 미션</label><select id="mission-pick">${Object.entries(MISSIONS).map(([id,m])=>`<option value="${id}" ${id===mission?'selected':''}>${m.name} · ${m.description}</option>`).join('')}</select>
    <p>미션·성향·월 연금 목표는 시작 후 고정됩니다. 주간 도전은 기본 시장·연금 미션·위험중립형·월 50만원으로 통일합니다.</p>
    <p>12턴 압축 체험: 물가와 TDF 생애주기는 1턴=가상 3개월, 납입 한도는 한 판 합산입니다. 수익률·비용은 턴당 게임 값이며 실제 연율이 아닙니다.</p></details>`;
}
export function renderCampaignStatus(g:GameState):string {
  if(!g.campaign) return '';
  const d=g.campaign;
  return `<aside class="campaign-status"><strong>${SCENARIOS[d.scenario].name} · ${MISSIONS[d.mission].name}</strong>
    <p>${missionResult(g,calculateScore(g).monthlyPension).progress} · ${Math.min(4,Math.floor(g.turn/3)+1)}장 / 4장</p>
    <small>누적 물가 ${pct(d.priceIndex-1)} · TDF 2029 주식 비중 ${pct(tdfEquity(g.turn))}</small></aside>`;
}
export function renderCampaignResult(g:GameState):string {
  if(!g.campaign) return '';
  const d=g.campaign, score=calculateScore(g);
  return `<section class="campaign-report"><h2>내 판단 복기</h2>
    <p>오늘 가치의 세후 평균 월 연금 <strong>${won(score.payout.monthlyNet/d.priceIndex)}</strong> · 명목 ${won(score.payout.monthlyNet)}</p>
    <p>운용지수 ${(100*d.index).toFixed(1)} · 실질 운용지수 ${(100*d.index/d.priceIndex).toFixed(1)} · 시작 100</p>
    <p>같은 턴·같은 순입출금의 기준 지수 평가액 ${won(d.benchmark)} / 내 IRP ${won(score.irpValue)} / 차이 ${won(score.irpValue-d.benchmark)}</p>
    <small>기준 지수는 초기 상품 비중을 매 턴 복원하는 가상 비교입니다. 동일 입출금을 턴 말 반영하며 실제 예금 약정·거래비용·결제 대기는 재현하지 않습니다. 고스트는 생활 선택과 납입까지 다른 전체 경로 비교입니다.</small>
    <details><summary>12턴 선택과 자금 흐름 펼쳐 보기</summary><div class="table-wrap"><table><thead><tr><th>턴</th><th>시장·선택</th><th>시장 손익</th><th>순입출금</th><th>매매·정산 영향</th><th>IRP</th></tr></thead><tbody>
    ${d.reviews.map(r=>`<tr><td>${r.turn}${r.chapter?' · 장 완료':''}</td><td>${esc(r.headline)}<br>${r.actions.map(esc).join('<br>')}<small><br>정산 후 보유: ${r.holdings.map(h=>`${products.find(p=>p.id===h.productId)?.shortName} ${won(h.amount)}`).join(' · ')}</small></td><td>${won(r.market)}</td><td>${won(r.flow)}</td><td>${won(r.costs)}</td><td>${won(r.irp)}</td></tr>`).join('')}</tbody></table></div></details>
    <p>분기 연습은 완료된 장 끝으로 돌아가 이후 운용을 바꿉니다. 시장은 같고 이미 확인한 미래 정보가 있으므로 첫 플레이와 같은 조건의 성과는 아닙니다.</p>
    <div class="decision-tools">${d.branches.map(b=>`<button class="secondary" data-action="replay-chapter" data-turn="${b.turn}">${b.turn}턴 끝부터 다른 선택</button>`).join('')}<button class="secondary" data-action="export-run">복기 기록 다운로드</button></div></section>`;
}
