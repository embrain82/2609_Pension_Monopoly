import { products } from '../data/content';
import { defaultPortfolio } from '../data/default-portfolios';
import { portfolioValue } from '../engine/portfolio-engine';
import type { ActionResult, DefaultScope, GameState, PendingOrder, ProductId } from '../types';
import { formatWon, signedWon } from './format';
export const turnLabel=(turn:number):string=>turn>12?'최종 정산':`${turn}턴`;
export const orderScope=(scope?:DefaultScope):string=>scope?`디폴트옵션 · ${defaultPortfolio(scope.optionId).name}`:'직접 운용분';
export function orderSchedule(order:PendingOrder):string {
 return `접수 ${turnLabel(order.submittedTurn)} → 기준가 ${turnLabel(order.priceTurn??order.settlesTurn)} → 결제 ${turnLabel(order.settlesTurn)}`;
}
interface PreviewLeg {productId:ProductId;side:'buy'|'sell';amount:number;scope?:DefaultScope;order?:PendingOrder;}
/** 실제 실행 함수의 불변 결과를 읽는다. 예측을 위해 별도 매매·수수료 계산을 복제하지 않는다. */
export function tradePreviewData(before:GameState,result:ActionResult,scope?:DefaultScope) {
 const next=result.state;
 const orders=next.pendingOrders.filter(o=>!before.pendingOrders.some(old=>old.id===o.id));
 const legs:PreviewLeg[]=orders.map(order=>({productId:order.productId,side:order.side,amount:order.amount,scope:order.defaultScope,order}));
 for(const product of products.filter(p=>p.kind!=='fund')) {
  const delta=next.holdings.filter(h=>h.productId===product.id).reduce((s,h)=>s+h.amount,0)-before.holdings.filter(h=>h.productId===product.id).reduce((s,h)=>s+h.amount,0);
  if(Math.abs(delta)>.001)legs.push({productId:product.id,side:delta>0?'buy':'sell',amount:Math.abs(delta),scope});
 }
 return {legs,cash:next.irpCash,cashChange:next.irpCash-before.irpCash,cost:Math.max(0,portfolioValue(before)-portfolioValue(next)),orders};
}
export function renderTradePreview(before:GameState,result:ActionResult,scope?:DefaultScope):string {
 if(!result.ok)return '';
 const data=tradePreviewData(before,result,scope);
 const legs=data.legs.map(l=>{
  const product=products.find(p=>p.id===l.productId)!;
  const schedule=l.order?orderSchedule(l.order):`접수·가격확정·결제 ${turnLabel(before.turn)} · ${product.kind==='deposit'?(l.side==='buy'?'새 약정 가입':'가입 건별 만기·중도해지 조건 반영'):'표시가격 체결'}`;
  return `<li><b>${product.shortName} ${l.side==='buy'?'매수':'매도'} · ${l.order?.side==='sell'?'평가액 약 ':''}${formatWon(l.amount)}</b><small class="scope-label">${orderScope(l.scope)}</small><small>${schedule}</small></li>`;
 }).join('');
 const linked=data.orders.filter(o=>o.targetProductId).map(o=>{
  const product=products.find(p=>p.id===o.targetProductId)!;
  const schedule=product.kind==='fund'?`접수 ${turnLabel(o.settlesTurn)} → 기준가 ${turnLabel(o.settlesTurn+1)} → 결제 ${turnLabel(o.settlesTurn+2)}`:`접수·가격확정·결제 ${turnLabel(o.settlesTurn)}`;
  return `<li><b>이어서 ${product.shortName} 매수 · 결제대금 범위 내</b><small>직접 운용분 · 조건부 연결 주문</small><small>${schedule}</small><small>환매 결제 당시 가격·위험한도·최소금액을 다시 확인합니다. 매수되지 않는 금액은 IRP 대기자금에 남습니다.</small></li>`;
 }).join('');
 const selling=data.orders.filter(o=>o.side==='sell');
 const due=selling.length?Math.max(...selling.map(o=>o.settlesTurn)):before.turn;
 const rebalance=result.state.rebalancePlan?`<li><b>이어서 목표비중 매수 · 결제 시 금액 재계산</b><small>직접 운용분 · 매도 결제 ${turnLabel(due)} 후 부족한 상품만 매수</small><small>예금·ETF: ${turnLabel(due)} 체결 · 펀드: 기준가 ${turnLabel(due+1)} → 결제 ${turnLabel(due+2)}</small><small>목표와 실제 비중은 시장 변동·위험한도·최소 주문금액 때문에 다를 수 있습니다.</small></li>`:'';
 const closing=data.orders.some(o=>o.settlesTurn>12||o.targetProductId&&o.settlesTurn+(products.find(p=>p.id===o.targetProductId)?.kind==='fund'?2:0)>12)||!!rebalance&&due+2>12;
 return `<section class="trade-preview" aria-label="공통 거래 미리보기"><h3>거래 미리보기</h3><p class="preview-disclaimer">지금은 조회 · 행동 0회 / 성공적으로 확정하면 행동 1회</p><ol class="trade-timeline">${legs}${linked}${rebalance}</ol><dl><dt>접수 직후 주문 가능 자금</dt><dd>${formatWon(data.cash)} (${signedWon(data.cashChange)})</dd><dt>예금 중도해지 이자 조정</dt><dd>${formatWon(data.cost)}</dd><dt>게임 내 별도 매매수수료</dt><dd>0원 · 실제 비용과 다를 수 있음</dd></dl><p class="preview-disclaimer">상품 운용보수는 시장 반영 때 차감하며 위 매매수수료와 구분합니다. 펀드는 실제 영업일을 줄인 게임 시간입니다. 아직 가격이 확정되지 않은 환매 금액은 달라집니다. 대금은 IRP 안에 남습니다.${closing?' 12턴을 넘는 단계는 추가 시장·급여 없이 종료 가격으로 최종 정산합니다.':''}</p></section>`;
}
