import { DEFAULT_PORTFOLIOS } from '../data/default-portfolios';
import { brandWordmark } from './design-system';
import { investorProfiles,products } from '../data/content';
import { allowedDefaultOptions } from '../engine/default-option';
import { SCENARIOS,MISSIONS,type ScenarioId,type MissionId } from '../engine/scenario-engine';
import type { DefaultOptionId,ProfileId,SaveData } from '../types';
import { defaultOptionName,defaultOptionProducts,initialDefaultOption,renderDefaultOptionCards } from './default-option-view';
export interface StartPreparation {
  seed: string; profileId: ProfileId; option: DefaultOptionId|null; optionSource:'suggested'|'saved'|'chosen';
  provenance: 'new'|'legacy'|'confirmed'|'diagnosed'|'weekly';
  stage: 'profile'|'option'; returnTo: 'title'|'result';
  scenario: ScenarioId; mission: MissionId; goal: number; notice?:string;
}
export function prepareStart(save:SaveData,seed:string,scenario:ScenarioId,mission:MissionId,goal:number,returnTo:StartPreparation['returnTo']):StartPreparation {
  const weekly=seed.startsWith('weekly-'),profileId=weekly?'balanced':save.profileId;
  const initial=initialDefaultOption(profileId,save.defaultOption,'start',true);
  return {seed,profileId,option:initial.value,optionSource:save.defaultOption!==null&&!initial.notice?'saved':'suggested',notice:initial.notice,provenance:weekly?'weekly':save.profileAssessment?.origin??'new',stage:'profile',returnTo,scenario:weekly?'classic':scenario,mission:weekly?'pension':mission,goal:weekly?500000:goal};
}
export function reassessPreparation(draft:StartPreparation,profileId:ProfileId):StartPreparation {
  if(draft.provenance==='weekly')return draft;
  const initial=initialDefaultOption(profileId,draft.optionSource==='suggested'?null:draft.option,draft.optionSource==='suggested'?'start':'settings',true);
  return {...draft,profileId,provenance:'diagnosed',stage:'profile',option:initial.value,optionSource:initial.notice?'suggested':draft.optionSource,notice:initial.notice};
}
export function canConfirmPreparation(draft:StartPreparation):boolean {
  return draft.provenance!=='new'&&draft.stage==='option'&&(draft.option===null||allowedDefaultOptions(draft.profileId,true).some(p=>p.id===draft.option));
}
export function renderStartPreparation(d:StartPreparation):string {
  const p=investorProfiles.find(p=>p.id===d.profileId)!;
  const origin={new:'기본 설정 · 아직 진단하지 않았습니다',legacy:'저장된 성향 · 이전 진단 이력은 확인되지 않습니다',confirmed:'이전에 확인한 성향',diagnosed:'교육용 진단 결과',weekly:'주간 도전의 공통 성향'}[d.provenance];
  const profile=`<article class="preparation-profile"><small>${origin}</small><h2>${p.name}</h2><p>${p.description}</p><div class="preparation-scale" role="img" aria-label="5개 성향 중 ${p.name}">${investorProfiles.map(x=>`<i class="${x.id===p.id?'current':''}"></i>`).join('')}</div><p class="hint">성향은 서열이 아닌 감당 가능한 변동의 기준입니다.</p></article>`;
  const conditions=`<article class="road-panel"><h2>이번 판의 시작 조건</h2><dl class="preparation-facts"><div><dt>매수 가능 범위</dt><dd>가상 ${p.minRiskGrade}~6등급</dd></div><div><dt>시작 구성</dt><dd>${products.filter(x=>p.startingAllocation[x.id]>0).map(x=>`${x.shortName} ${Math.round(p.startingAllocation[x.id]*100)}%`).join(' · ')}</dd></div><div><dt>시장 · 미션</dt><dd>${SCENARIOS[d.scenario].name} · ${MISSIONS[d.mission].name}${d.mission==='pension'?`<br>목표 월 ${Math.round(d.goal/10000)}만원`:''}</dd></div></dl><p class="info-note">성향은 캐릭터 외형과 다릅니다.<br><b>미션·성향·목표는 게임 시작 후 고정됩니다.</b></p></article>`;
  const selected=DEFAULT_PORTFOLIOS.find(x=>x.id===d.option);
  const detail=`<article class="road-panel preparation-option-detail"><p class="eyebrow">내가 선택한 옵션</p><h2>${defaultOptionName(d.option,true)}</h2><p class="option-composition">${defaultOptionProducts(d.option,true)||'사전지정 없이 직접 운용을 선택합니다.'}</p>${selected?`<p class="option-description">${selected.blurb}</p><span class="profile-stamp">가상 ${selected.riskGrade}등급 · 교육용 구성</span>`:''}<p class="default-option-selection" aria-live="polite">현재 선택: <strong>${defaultOptionName(d.option,true)}</strong><br>추천 표시는 선택을 바꾸지 않습니다.</p><p class="info-note"><b>지정만으로 매수되지 않습니다.</b><br>게임에서 운용지시 → 디폴트옵션 옵트인/아웃으로 직접 거래합니다.</p></article>`;
  const help=`<details class="preparation-help" data-preserve-open><summary>게임 시작 전에 알아둘 세 가지</summary><ul><li>생활자금은 생활비, IRP 대기자금은 계좌 안 매수에 씁니다.</li><li>시장이 먼저 보유분에 반영되고 내 주문은 이후 시장에 영향을 받습니다.</li><li>일반 턴은 행동 1회, 운용지시 칸은 2회. 조회·X 취소는 0회입니다.</li></ul><p>옵션은 교육용 가상 상품입니다. 실제 통지·대기 후 자동운용은 실행하지 않습니다. 펀드·TDF는 원금 손실이 가능합니다.</p></details>`;
  return `<section class="setup-screen preparation-screen road-preparation" data-preparation-stage="${d.stage}"><header class="road-header">${brandWordmark()}<button class="icon-button preparation-close" data-action="cancel-preparation" aria-label="시작 준비 닫기">×</button></header>
    <header class="step-header"><span>시작 준비</span><strong>${d.stage==='profile'?'1 · 성향 확인':'2 · 옵션 선택'}</strong></header>
    <h1>${d.stage==='profile'?'내 투자자성향부터 확인해요':'이 성향으로 옵션을 골라요'}</h1>
    <p class="lead">${d.stage==='profile'?'나에게 맞는 선택을 위한 첫 단계예요.':`확인한 성향 · ${p.name}`}</p>
    ${d.stage==='profile'?`<div class="road-split preparation-profile-layout"><div>${profile}</div><div>${conditions}<div class="button-stack preparation-actions">${d.provenance==='weekly'?'<p class="info-note">주간 도전은 모두 같은 조건입니다. 다른 성향은 일반 새 판에서 선택할 수 있습니다.</p>':`<button class="secondary" data-action="prepare-diagnosis">${d.provenance==='new'?'5문항으로 성향 진단':'성향 다시 진단'}</button>`}<button class="primary jumbo" data-action="prepare-continue" ${d.provenance==='new'?'disabled':''}>이 성향 확인 · 옵션 선택으로</button>${d.provenance==='new'?'<p class="hint">기본값을 진단 결과로 사용하지 않도록 먼저 5문항을 확인하세요.</p>':''}</div></div></div>`:
      `${d.notice?`<p class="info-note" role="status">${d.notice}</p>`:''}<div class="road-split preparation-option-layout"><div><h2 class="road-section-label">정해둘 옵션을 선택하세요</h2>${renderDefaultOptionCards({profileId:d.profileId,current:d.option,characters:false,mode:'start',modern:true,compact:true})}<button class="text-button preparation-none ${d.option===null?'picked':''}" data-action="prepare-no-option" aria-pressed="${d.option===null}">${d.option===null?'✓ ':''}지정 안 함으로 선택</button></div><div>${detail}${help}<div class="button-stack preparation-actions"><button class="primary jumbo" data-action="confirm-default-option" ${canConfirmPreparation(d)?'':'disabled'}>${defaultOptionName(d.option,true)} 확인 · 게임 시작</button><button class="secondary" data-action="prepare-back">성향 확인으로 돌아가기</button></div></div></div>`}
    <p class="hint preparation-footnote">최종 시작을 눌러야 새 판이 만들어집니다. 이전 진행이 있다면 그때 대체됩니다.</p></section>`;
}
