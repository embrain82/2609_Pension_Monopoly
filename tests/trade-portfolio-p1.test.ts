import type { GameState } from '../src/types';
import { expect,it } from 'vitest';
import { createGame,startTurn } from '../src/engine/game-engine';
import { buyProduct,sellProduct,switchProduct,rebalancePortfolio,settleAllOrders,portfolioValue } from '../src/engine/portfolio-engine';
import { previewDefaultOptIn } from '../src/engine/default-trade-engine';
import { renderTradePreview,tradePreviewData } from '../src/ui/trade-preview';
import { depositStatus,renderMaturityNotice,renderPortfolio } from '../src/ui/portfolio-view';
const open=():GameState=>({...startTurn(createGame('p1-preview','growth',500000,{ghost:false,defaultTrading:true,scenario:'classic'}),5).state,irpCash:10000000,currentEventId:null,actionsLeft:2,awaitingAction:true});
it('미리보기는 엔진의 예약액·현금·이자 조정과 일치하고 원본은 바꾸지 않는다',()=>{
 const g=open(),snapshot=structuredClone(g);
 for(const action of [buyProduct(g,'tdf',1000000),sellProduct(g,'deposit',1000000),switchProduct(g,'deposit','tdf',1000000),rebalancePortfolio(g)]) {
  expect(action.ok).toBe(true);const d=tradePreviewData(g,action);
  expect(d.cash).toBe(action.state.irpCash);expect(d.cost).toBe(Math.max(0,portfolioValue(g)-portfolioValue(action.state)));
  expect(d.orders).toEqual(action.state.pendingOrders.filter(o=>!g.pendingOrders.some(old=>old.id===o.id)));
  expect(renderTradePreview(g,action)).toContain('행동 0회');expect(g).toEqual(snapshot);
 }
});
it('펀드 교체는 환매 결제 뒤 매수의 두 시간표와 조건을 표시한다',()=>{
 const g=open(),trade=switchProduct(g,'balanced','tdf',1000000),html=renderTradePreview(g,trade);
 expect(html).toContain('접수 1턴 → 기준가 2턴 → 결제 3턴');expect(html).toContain('접수 3턴 → 기준가 4턴 → 결제 5턴');expect(html).toContain('조건부 연결 주문');
});
it('마지막 두 턴 일반·옵션 주문 모두 가상 13·14턴을 약속하지 않는다',()=>{
 for(const turn of [11,12]) {
  const g={...open(),turn};const plans=[buyProduct(g,'tdf',1000000),sellProduct(g,'balanced',1000000),switchProduct(g,'balanced','tdf',1000000),rebalancePortfolio(g),previewDefaultOptIn(g,'highRisk',1000000)];
  for(const p of plans) {expect(p.ok).toBe(true);if(p.message.includes('매수 접수')||p.message.includes('환매 수량 예약')||p.message.includes('옵트인')) {expect(p.message).toContain('최종 정산');expect(p.message).not.toContain('그다음 턴');}const html=renderTradePreview(g,p);expect(html).toContain('최종 정산');expect(html).not.toMatch(/(?:접수|기준가|결제) 1[3-6]턴/);}
 }
});
it('가입 건별 만기는 직접·옵션 출처를 구분하고 해당 턴에만 안내한다',()=>{
 let g=open();g=settleAllOrders(previewDefaultOptIn(g,'principal',1000000).state);
 const lots=depositStatus(g);expect(lots.some(l=>!l.scope)).toBe(true);expect(lots.some(l=>!!l.scope)).toBe(true);
 const due=lots[0].maturityTurn;
 expect(renderMaturityNotice({...g,turn:due-1})).toBe('');expect(renderMaturityNotice({...g,turn:due})).toContain('이번 턴 예금 약정 만료');
 expect(depositStatus({...g,turn:due+2}).every(l=>l.status==='matured')).toBe(true);expect(renderMaturityNotice({...g,turn:due+2})).toBe('');
 const html=renderPortfolio({...g,turn:due+2,awaitingAction:false,actionsLeft:0});expect(html).toContain('재운용 대기');expect(html).toContain('data-view="sell" disabled');expect(html).toContain('data-view="default" disabled');
});
it('포트폴리오 합계는 현금·보유·미결제를 중복 합산하지 않고 원 단위를 유지한다',()=>{
 const g=buyProduct(open(),'tdf',1234567).state,html=renderPortfolio(g);
 expect(html).toContain('1,234,567원');expect(html).toContain('미결제 주문 · 사용 불가');expect(html).toContain('IRP 밖 자금');expect(html).toContain('미보유 상품');expect(html).toContain('portfolio-mobile');expect(html).toContain('portfolio-desktop');
});
