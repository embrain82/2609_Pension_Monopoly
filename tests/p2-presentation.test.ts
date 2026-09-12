// @vitest-environment happy-dom
import {beforeEach,it,expect} from 'vitest';
import {createGame,autoplay} from '../src/engine/game-engine';
import {changeDomain,changeGeometry,renderChangeChart} from '../src/ui/mini-chart';
import {renderResultHero,renderResultCollection} from '../src/ui/result-summary';
import {renderTitleCover} from '../src/ui/title-cover';
import {renderMarketCard} from '../src/ui/market-view';
import {calculateScore} from '../src/engine/scoring-engine';
import {missionDisplay} from '../src/engine/progress-engine';
import {renderBoardMarkup,boardPosition} from '../src/ui/board';
import {tokenPercent,renderTokenLayer} from '../src/ui/token3d';
import {PensionRoadApp} from '../src/ui/app';
import {defaultSave,STORAGE_KEY} from '../src/ui/ui-state';
import {CHECKPOINT_KEY} from '../src/ui/play-checkpoint';
import {PROFILE_IDS} from '../src/engine/profile-engine';
import type {MissionId} from '../src/engine/scenario-engine';
let root:HTMLElement;
beforeEach(()=>{localStorage.clear();document.body.innerHTML='<div id="app"></div>';root=document.querySelector('#app')!;});
it('0·양수·음수·한 원의 변화와 매우 큰 금액은 공통 0축의 올바른 쪽에 놓인다',()=>{
 expect(changeDomain([0,.1,-1])).toBe(1000);expect(changeGeometry(0,1000)).toEqual({x:160,width:0});
 expect(changeGeometry(500,1000)).toEqual({x:160,width:70});expect(changeGeometry(-500,1000)).toEqual({x:90,width:70});
 expect(changeGeometry(1,1000).width).toBeCloseTo(.14);
 for(const values of [[0],[20e9,-40e9],[2,3,-2],[1000,-1001]])for(const v of values){const d=changeDomain(values),r=changeGeometry(v,d);expect(r.x).toBeGreaterThanOrEqual(20);expect(r.x+r.width).toBeLessThanOrEqual(300);expect(d).toBeGreaterThanOrEqual(Math.abs(v));}
 root.innerHTML=renderChangeChart([{label:'시장 손익',value:-10,kind:'market'},{label:'외부 입출금',value:1000,kind:'flow'},{label:'매매·정산',value:0,kind:'trade'}],'1턴');
 expect(root.textContent).toContain('시장 손익-10원');expect(root.textContent).toContain('외부 입출금+1,000원');expect(root.textContent).toContain('0원 기준');expect(root.querySelectorAll('svg[aria-hidden="true"]')).toHaveLength(3);
});
it('금리 이전·현재와 %p, 시장 예시 수익률 %를 구분한다',()=>{
 const g=createGame('rate');g.turn=1;g.lastMarket={...g.lastMarket,ratePct:2.75,rateDeltaPct:-.25};
 root.innerHTML=renderMarketCard(g,false);expect(root.textContent).toContain('이전 3.00%');expect(root.textContent).toContain('현재 2.75%');expect(root.textContent).toContain('%p');
});
it('세 미션의 달성·미달·연습 결과는 엔진 판정과 접근 가능한 별 수가 같다',()=>{
 for(const mission of ['pension','purchasing','cushion'] as MissionId[])for(const seed of ['p2-result-a','p2-result-b']){
  const g=autoplay(seed,'passive','balanced',{scenario:'classic',mission});
  for(const passed of [false,true]){
   const state=structuredClone(g);
   if(mission==='pension')state.campaign!.startingGoal=passed?1:1e9;
   if(mission==='cushion'){state.cash=passed?1e9:0;state.livingDebt=0;}
   if(mission==='purchasing')state.campaign!.index=passed?10:.1;
   const score=calculateScore(state),d=missionDisplay(state,score);root.innerHTML=renderResultHero(state,true);
   expect(root.querySelector('h1')!.textContent).toBe(`${d.name} ${d.passed?'달성':'미달'}`);expect(root.querySelector('.stars')!.getAttribute('aria-label')).toBe(`3개 중 ${score.stars}개 별`);expect(root.querySelectorAll('.stars .earned')).toHaveLength(score.stars);
   expect(root.querySelector('.result-hero')!.textContent).toContain(d.valueText);
  }
 }
});
it('수집 없음·여러 업적·분기 연습의 수집 표시가 점수와 구분된다',()=>{
 const g=autoplay('collection-result','steward','balanced',{scenario:'classic',automaticStamps:true});
 root.innerHTML=renderResultCollection(g,[],false);expect(root.textContent).toContain('새로 추가된 업적은 없습니다');expect(root.querySelectorAll('.stamp-shelf>span')).toHaveLength(4);
 root.innerHTML=renderResultCollection({...g,campaign:{...g.campaign!,practice:true}},['annuity-choice'],true);expect(root.textContent).toContain('누적 기록을 추가하지 않습니다');expect(root.querySelector('.new-collection')!.hasAttribute('open')).toBe(false);
});
it('24칸에서 말과 칸 좌표가 일치하고 잔상은 최대 지정된 칸에만 남는다',()=>{
 const g=createGame('token-p2');
 for(let i=0;i<24;i++){
  const {x,y}=boardPosition(i),p=tokenPercent(i);expect(p.x).toBeCloseTo((x+50)/7,2);expect(p.y).toBeCloseTo((y+50)/7,2);
  root.innerHTML=renderBoardMarkup(g,false,{focusIndex:i,trail:[(i+23)%24],hopping:true,landed:true,tokenInSvg:false});expect(root.querySelectorAll('.arrival-ring')).toHaveLength(1);expect(root.querySelectorAll('.move-trail')).toHaveLength(1);expect(root.querySelector('.board')!.getAttribute('aria-label')).toContain(`${i+1}번 칸`);
  root.innerHTML=renderBoardMarkup(g,false,{focusIndex:i,tokenInSvg:false});expect(root.querySelector('.move-trail')).toBeNull();expect(root.querySelector('.arrival-ring')).toBeNull();
 }
 for(const avatarId of PROFILE_IDS){expect(renderTokenLayer({...g,avatarId},{index:1,characters:true,mood:'calm'})).toContain('data-animal=');expect(renderTitleCover(avatarId,true)).toContain('24칸 보드');}
});
it('표지 캐릭터 선택이 즉시 그림에 반영되며 동의 전 시작이 잠긴다',()=>{
 new PensionRoadApp(root);expect(root.querySelector<HTMLButtonElement>('[data-action="begin"]')!.disabled).toBe(true);
 const select=root.querySelector<HTMLSelectElement>('#title-avatar-pick')!;select.value='stableGrowth';select.dispatchEvent(new Event('change',{bubbles:true}));expect(root.querySelector('.title-cover svg')!.getAttribute('aria-label')).toContain('코알라');
 const check=root.querySelector<HTMLInputElement>('#disclaimer')!;check.checked=true;check.dispatchEvent(new Event('change',{bubbles:true}));expect(root.querySelector<HTMLButtonElement>('[data-action="begin"]')!.disabled).toBe(false);
});
it('결과의 주 동작은 하나이며 상세 복기·공유·재도전·수령 변경을 유지한다',()=>{
 const g=autoplay('p2-result-app','passive','balanced',{defaultTrading:true,scenario:'classic',automaticStamps:true,settlementLearning:true});
 localStorage.setItem(STORAGE_KEY,JSON.stringify({...defaultSave,disclaimerAccepted:true}));localStorage.setItem(CHECKPOINT_KEY,JSON.stringify({version:'c3',game:g,modal:null,lastSummary:null,quizCardId:null,quizPicked:null,finalQuizQueue:[],finalQuizTotal:0,finishing:false,defaultOptionAsk:false}));
 new PensionRoadApp(root);root.querySelector<HTMLButtonElement>('[data-action="resume-game"]')!.click();
 // A completed save first resumes the final payout if still missing.
 root.querySelector<HTMLButtonElement>('[data-action="resume-finish"]')?.click();
 root.querySelector<HTMLButtonElement>('[data-action="choose-payout"]')?.click();
 const result=root.querySelector('.result-screen');expect(result).not.toBeNull();
 expect(result!.querySelectorAll('button.primary')).toHaveLength(1);expect(result!.querySelector('.result-details')!.hasAttribute('open')).toBe(false);
 for(const action of ['copy-result','same-seed','new-seed','export-run','open-payout'])expect(result!.querySelector(`[data-action="${action}"]`),action).not.toBeNull();
});
it('결과 복기의 펼침 상태는 이유 선택·수령 재선택 뒤에도 유지한다',async()=>{
 const {updateView}=await import('../src/ui/dom-view');
 const markup='<details data-preserve-open class="result-details"><summary>복기</summary><p>기록</p></details><details><summary>다른 상태</summary></details>';
 updateView(root,markup);root.querySelector('details')!.open=true;
 updateView(root,markup.replace('기록','선택 반영'));expect(root.querySelector('details')!.open).toBe(true);
 root.querySelector('details')!.open=false;updateView(root,markup);expect(root.querySelector('details')!.open).toBe(false);
});
