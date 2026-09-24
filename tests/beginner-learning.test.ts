// @vitest-environment happy-dom
import { expect, it } from 'vitest';
import { createGame, performAction, startTurn, resolveLifeEvent } from '../src/engine/game-engine';
import { buyProduct, switchProduct } from '../src/engine/portfolio-engine';
import { actionAvailability } from '../src/engine/action-availability';
import { presentMaturityNotices } from '../src/engine/default-lifecycle';
import { renderProductHelp, renderLearningReference } from '../src/ui/learning-help';
import { renderOrderTimeline } from '../src/ui/order-timeline';
import { renderTradePreview } from '../src/ui/trade-preview';
import { renderPortfolio } from '../src/ui/portfolio-view';
import { renderMaturitySummary } from '../src/ui/maturity-view';
import { beginPractice, normalizePractice, practiceChoice, renderPractice } from '../src/ui/guided-practice';
import type { GameState } from '../src/types';
const g = ():GameState => ({ ...startTurn(createGame('learning-flow','aggressive',500000,{defaultLifecycle:true,contributionPacing:true,defaultOption:'midRisk',scenario:'classic',ghost:false}),5).state, currentEventId:null,awaitingAction:true,actionsLeft:2,cash:12000000,irpCash:2000000 });
const dom = (html:string) => { const el=document.createElement('div');el.innerHTML=html;return el; };
function maturity(turn=4) { let s=createGame('learning-maturity','aggressive',500000,{defaultLifecycle:true,defaultOption:'midRisk',scenario:'classic',ghost:false}); while(s.turn<turn){if(s.currentEventId)s=resolveLifeEvent(s,'cash').state;if(s.awaitingAction)s=performAction(s,{kind:'hold'}).state;s=startTurn(s,1).state;}return s; }

it('상품 세 줄 설명은 채권·TDF 손실 가능성과 예금 계약 조건을 구분한다',()=>{
 for(const id of ['shortBond','longBond','balanced','tdf','equityEtf'] as const) {
  const d=dom(renderProductHelp(id));expect(d.querySelectorAll('dt')).toHaveLength(3);expect(d.textContent).toContain('원금 손실이 가능');
 }
 expect(renderProductHelp('deposit')).toContain('중도해지하면 이자가 줄고');
 const reference=dom(renderLearningReference());expect(reference.querySelectorAll('.product-help')).toHaveLength(6);
 expect(reference.textContent).toContain('학습 카드를 모으지 않아도');expect(reference.textContent).toContain('1에 가까울수록 위험이 커');
});
it('미리보기와 접수·가격확정 시간표는 실제 주문의 날짜와 상태를 따른다',()=>{
 const before=g(), copy=structuredClone(before), result=buyProduct(before,'shortBond',1000000),o=result.state.pendingOrders[0];
 expect(before).toEqual(copy);const preview=dom(renderTradePreview(before,result));
 expect(preview.querySelector('[aria-current="step"]')).toBeNull();expect(preview.textContent).toContain('2턴 예정');expect(preview.textContent).toContain('3턴 예정');
 expect(dom(renderOrderTimeline(o)).querySelector('[aria-current="step"]')!.textContent).toContain('주문 접수');
 expect(dom(renderOrderTimeline({...o,stage:'priced'})).querySelector('[aria-current="step"]')!.textContent).toContain('가격 확정');
 expect(dom(renderOrderTimeline(o)).textContent).toContain('결제가 끝나면 보유 상품');
 expect(dom(renderOrderTimeline({...o,side:'sell'})).textContent).toContain('IRP 대기자금으로');
});
it('즉시·연결 주문·마지막 턴은 가상의 추가 시장 턴을 약속하지 않는다',()=>{
 const before=g();expect(renderTradePreview(before,buyProduct(before,'deposit',1000000))).toContain('data-order-stage="instant"');
 const from=buyProduct(before,'shortBond',1000000).state;
 const linked=switchProduct({...before,holdings:[...before.holdings,{productId:'shortBond',amount:1000000,principal:1000000,depositTurnsHeld:0}]},'shortBond','tdf',1000000);
 expect(linked.ok).toBe(true);const html=renderTradePreview(before,linked);expect(html).toContain('조건부 일정');expect(html).toContain('접수 3턴 → 기준가 4턴 → 결제 5턴');
 const final=renderOrderTimeline({...from.pendingOrders[0],submittedTurn:12,priceTurn:13,settlesTurn:14});
 expect(final).toContain('최종 정산');expect(final).not.toContain('13턴');expect(final).not.toContain('14턴');
});
it('결제 완료된 주문은 진행 중 목록에서 사라지고 상품·현금에서 확인한다',()=>{
 let s=buyProduct(g(),'shortBond',1000000).state;
 for(let i=0;i<2;i++){s=performAction({...s,currentEventId:null},{kind:'hold'}).state;s=startTurn(s,1).state;}
 expect(s.pendingOrders).toHaveLength(0);const d=dom(renderPortfolio(s));
 expect(d.querySelector('.portfolio-orders')!.textContent).toContain('처리 중인 주문이 없어요');expect(d.querySelector('.portfolio-orders .order-clock')).toBeNull();
});
it('실습은 부족자금·0원·대기주문·만기에 맞춰 가능한 조회나 운용만 고른다',()=>{
 const base=g(), pending=buyProduct({...base,irpCash:1000000},'shortBond',1000000).state;
 const states=[base,{...base,irpCash:0},{...base,cash:0,irpCash:0},pending,{...base,livingDebt:500000}, {...base,defaultLifecycle:{...base.defaultLifecycle!,cycles:[{id:'m1',depositLotId:'d1',maturityTurn:1,originalAmount:1000000,remaining:1000000,state:'waiting' as const}]}}];
 for(const state of states){const before=structuredClone(state),choice=practiceChoice(state)!;expect(choice).toBeTruthy();if('operation' in choice)expect(actionAvailability(state,choice.operation).enabled).toBe(true);renderPractice(state,beginPractice(state));expect(state).toEqual(before);}
 expect(practiceChoice({...base,cash:0,irpCash:0})).toMatchObject({portfolio:'overview'});
 expect(practiceChoice(pending)).toMatchObject({portfolio:'orders'});
 expect(practiceChoice({...base,currentEventId:'life'})).toBeUndefined();expect(renderPractice({...base,turn:3},beginPractice(base),true)).toBe('');
});
it('실습 진행은 턴2에서 다시 돈 확인부터, 건너뛰기는 유지하며 잘못된 저장은 무시한다',()=>{
 const base=g(),p={...beginPractice(base)!,step:'done' as const};
 expect(normalizePractice(p,{...base,turn:2})).toMatchObject({turn:2,step:'money'});
 expect(normalizePractice({...p,mode:'off'},{...base,turn:2})).toMatchObject({mode:'off'});
 for(const raw of [{version:'x'},null,[],{...p,turn:3},{...p,step:'trade'},{...p,mode:'forced'}])expect(normalizePractice(raw,base)).toBeUndefined();
});
it('새 통지는 접지 않고 표시하며 이미 확인한 통지는 요약만, 대상액은 만기 잔액만 센다',()=>{
 const state=maturity(),copy=structuredClone(state), first=dom(renderMaturitySummary(state));
 expect(first.querySelector('[data-default-notice]')).not.toBeNull();expect(first.querySelector('[data-default-notice]')!.closest('details')).toBeNull();expect(first.textContent).toContain('운용보수');expect(state).toEqual(copy);
 const seen=presentMaturityNotices(state), again=dom(renderMaturitySummary(seen));expect(again.querySelector('[data-default-notice]')).toBeNull();expect(again.textContent).toContain('통지 후 대기');
 const small={...seen,irpCash:99999999,defaultLifecycle:{...seen.defaultLifecycle!,cycles:seen.defaultLifecycle!.cycles.map(c=>({...c,remaining:500000}))}};
 const view=dom(renderMaturitySummary(small));expect(view.querySelector('.default-stage-row')!.textContent).toContain('남은 자동운용 대상 500,000원');expect(view.textContent).not.toContain('99,999,999원');
});
it('서로 다른 만기·통지 단계, 차단 및 종료 상태를 합쳐 잘못 안내하지 않는다',()=>{
 const state=presentMaturityNotices(maturity()), first=state.defaultLifecycle!.cycles[0];
 const mixed={...state,defaultLifecycle:{...state.defaultLifecycle!,cycles:[first,{...first,id:'other',maturityTurn:4,state:'waiting' as const,notifiedTurn:undefined,presentedTurn:undefined,eligibleTurn:undefined}]}};
 expect(dom(renderMaturitySummary(mixed)).querySelectorAll('.default-stage-row')).toHaveLength(2);
 expect(dom(renderMaturitySummary({...mixed,defaultLifecycle:{...mixed.defaultLifecycle,cycles:[{...first,state:'blocked',blockedReason:'사전지정 필요'}]}})).textContent).toContain('조건 확인 필요');
 expect(renderMaturitySummary({...state,status:'finished'})).toContain('추가 자동주문 없음');
});
