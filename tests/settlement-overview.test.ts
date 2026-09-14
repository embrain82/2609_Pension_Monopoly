// @vitest-environment happy-dom
import {expect,it} from 'vitest';
import {createGame,startTurn,performAction} from '../src/engine/game-engine';
import {settlementMarketContext} from '../src/ui/settlement-view-model';
import {renderSettlementModal} from '../src/ui/settlement';
function fixture() {
 const started=startTurn(createGame('overview','aggressive',500000,{defaultTrading:true,settlementLearning:true}),5).state;
 const game={...started,currentEventId:null,actionsLeft:1};
 const result=performAction(game,{kind:'hold'});
 return {summary:result.summary!,market:game.lastMarket,game:result.state};
}
it.each([-.25,0,.25])('금리 %p와 주가 %를 같은 턴에서만 계산하고 금리 단독 손익을 주장하지 않는다 (%s)',delta=>{
 const {summary,market}=fixture(); const state={...market,ratePct:3,rateDeltaPct:delta,stockReturn:-.02};
 const before=JSON.stringify({summary,state});const ctx=settlementMarketContext(summary,state);
 expect(ctx.rate).toEqual({before:3-delta,after:3,delta,stock:-.02});expect(ctx.explanation).toContain('함께 반영');
 expect(ctx.explanation).toContain(delta===0?'동결':delta>0?'가격에 하락':'가격에 상승');expect(JSON.stringify({summary,state})).toBe(before);
});
it('다른 턴·없는 시장 데이터는 과거 금리와 실제 손익을 만들어내지 않는다',()=>{
 const {summary,market}=fixture();
 for(const value of [undefined,{...market,turn:999},{...market,ratePct:NaN}])expect(settlementMarketContext(summary,value).rate).toBeNull();
 const root=document.createElement('div');root.innerHTML=renderSettlementModal({...summary,marketEffects:undefined},{characters:false});
 expect(root.querySelector('.settle-rate-strip')).toBeNull();expect(root.textContent).toContain('이전 저장에는');
});
it('요약·실제 보유분·학습·다음 진행 순서이며 비교와 전체 상품만 상세에 둔다',()=>{
 const {summary,market}=fixture();const root=document.createElement('div');root.innerHTML=renderSettlementModal(summary,{characters:true,market,learningHtml:'<aside class="optional-learning">퀴즈</aside>',importantHtml:'<aside class="closing-settlement">미결 주문</aside>'});
 const overview=root.querySelector('.settle-overview')!,details=root.querySelector('.settle-more')!;
 expect(overview.querySelector('.settle-rate-strip')).not.toBeNull();expect(overview.querySelector('.settle-bars')).not.toBeNull();
 expect(overview.querySelector('.actual-market-impact')).not.toBeNull();expect(overview.querySelector('.settle-market')).toBeNull();
 expect(details.querySelectorAll('.settle-return')).toHaveLength(6);expect(details.textContent).toContain('보수 전');expect(details.textContent).toContain('정산 후 비중');
 for(const css of ['.optional-learning','.closing-settlement','.settle-overview'])expect(root.querySelector(css)!.compareDocumentPosition(root.querySelector('.settle-cta')!)&Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
 expect(root.querySelector('.settle-cta')!.compareDocumentPosition(details)&Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
 expect(overview.querySelectorAll('.change-row')).toHaveLength(3);
 expect(summary.marketDelta+summary.capitalFlow!+summary.tradingDelta!).toBeCloseTo(summary.irpAfter-summary.irpOpen,4);
 expect(root.textContent).toContain('납입은 운용 수익이 아닙니다');
});
it('주요 보유분은 절대 손익 상위 두 개이며 손실과 0원·미노출 상태를 유지한다',()=>{
 const {summary,market}=fixture();const root=document.createElement('div');
 root.innerHTML=renderSettlementModal({...summary,marketEffects:[{productId:'equityEtf',delta:-3e6,returnRate:-.1},{productId:'longBond',delta:2e6,returnRate:.04},{productId:'deposit',delta:100,returnRate:0}] as typeof summary.marketEffects},{characters:false,market});
 expect(root.querySelectorAll('.actual-market-impact li')).toHaveLength(2);expect(root.querySelector('.actual-market-impact')!.textContent).toContain('-3,000,000원');expect(root.querySelector('.actual-market-impact ul')!.textContent).not.toContain('예금');
 root.innerHTML=renderSettlementModal({...summary,marketEffects:[]},{characters:false,market});expect(root.textContent).toContain('노출된 보유분·주문 없음');
});
