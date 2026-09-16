import { renderMaturitySummary, renderMaturityDetails } from './maturity-view';
import { cashInterestRule } from './cash-interest-view';
import { products } from '../data/content';
import { sourceBalances } from '../engine/account-engine';
import { actionAvailability, defaultTabAvailability } from '../engine/action-availability';
import { defaultScopes, positionsOf, scopedHolding } from '../engine/position-engine';
import { depositLots, portfolioValue } from '../engine/portfolio-engine';
import { equityExposureRatio, riskAssetRatio } from '../engine/policy-engine';
import type { GameState } from '../types';
import { renderDefaultHoldings } from './default-trade-view';
import { formatWon, signedPercent } from './format';
import { orderSchedule, orderScope } from './trade-preview';
const pct=(value:number)=>`${(value*100).toFixed(1)}%`;
const ratePct=(value:number)=>`${(value*100).toFixed(2)}%`;
export function depositStatus(state:GameState) {
 const holding=state.holdings.find(h=>h.productId==='deposit');
 return holding?positionsOf(holding).flatMap(p=>depositLots(state,{...p,productId:'deposit'}).map(lot=>({...lot,scope:p.scope,status:state.turn>=lot.maturityTurn?'matured' as const:'active' as const}))):[];
}
export function renderMaturityNotice(state:GameState):string {
 if(state.defaultLifecycle)return renderMaturitySummary(state);
 const lots=depositStatus(state).filter(l=>l.maturityTurn===state.turn);
 if(!lots.length)return '';
 return `<aside class="maturity-notice"><strong>◷ 이번 턴 예금 약정 만료 · ${lots.length}건</strong><p>남은 평가액 ${formatWon(lots.reduce((s,l)=>s+l.amount,0))}은 예금 보유분에 있습니다. 다음 턴부터 추가 약정 이자가 붙지 않습니다. 자동으로 현금화하거나 재가입하지 않습니다.</p><button class="secondary" data-action="open-portfolio">만기 예금 확인</button></aside>`;
}
function depositActions(state:GameState):string {
 const lots=depositStatus(state);if(!lots.some(l=>l.status==='matured'))return '';
 const manual=lots.some(l=>!l.scope&&l.status==='matured');const option=lots.some(l=>l.scope&&l.status==='matured');
 const rows=([...(manual?['sell','switch']:[]),...(option?['default']:[])] as const).map(view=>{
  const available=view==='default'?defaultTabAvailability(state).out:scopedHolding(state,'deposit').amount<100000?{enabled:false as const,reason:'직접 운용 예금이 최소 거래금액 10만원 미만입니다.'}:actionAvailability(state,view as 'sell'|'switch');
  return `<div><button class="secondary" data-action="review-deposit" data-view="${view}" ${available.enabled?'':`disabled aria-describedby="deposit-${view}-reason"`}>${view==='default'?'옵션 묶음 환매 검토':view==='sell'?'예금 매도 검토':'예금 교체 검토'}</button>${available.enabled?'':`<p class="availability-reason" id="deposit-${view}-reason">${available.reason}</p>`}</div>`;
 }).join('');
 return `<div class="deposit-actions"><p>직접 운용 예금은 가입 순서대로 매도합니다. 옵션 안의 예금은 옵션 묶음으로 환매합니다. 아래 버튼은 조회만 하며 확인 전에는 거래되지 않습니다.</p>${rows}</div>`;
}
/** Disjoint categories; option pending orders stay in pending, never in held twice. */
export function portfolioComposition(state: GameState) {
 const direct = products.reduce((sum, product) => sum + scopedHolding(state, product.id).amount, 0);
 const held = state.holdings.reduce((sum, holding) => sum + holding.amount, 0);
 return [
  { id: 'direct', label: '직접 운용 보유분', amount: direct, color: '#72a887' },
  { id: 'default', label: '디폴트옵션 보유분', amount: Math.max(0, held - direct), color: '#9cbada' },
  { id: 'pending', label: '미결제 주문 · 사용 불가', amount: state.pendingOrders.reduce((sum, order) => sum + order.amount, 0), color: '#e4bc7b' },
  { id: 'cash', label: '주문 가능 IRP 대기자금', amount: state.irpCash, color: '#d9e6dd' }
 ];
}
export function renderPortfolio(state:GameState):string {
 const total=portfolioValue(state),held=state.holdings.reduce((s,h)=>s+h.amount,0),pending=state.pendingOrders.reduce((s,o)=>s+o.amount,0);
 const basis=sourceBalances(total,state.accountBasis);
 const values=products.map(product=>({product,amount:scopedHolding(state,product.id).amount}));
 const group=(items:typeof values)=>{
  const data=items.map(({product,amount})=>{
   const manual=scopedHolding(state,product.id).amount;
   return {product,amount,share:total?pct(amount/total):'0.0%',source:`직접 운용분 ${formatWon(manual)}`,ret:product.id==='deposit'?'가입 건별 약정':signedPercent(state.lastMarket.returns[product.id]??0)};
  });
  const cards=data.map(d=>`<li class="holding-card"><header><strong>${d.product.principal_guaranteed?'●':'▲'} ${d.product.shortName}</strong><span>IRP의 ${d.share}</span></header><p class="holding-value">${formatWon(d.amount)}</p><p>${d.source}</p><dl><dt>위험</dt><dd>${d.product.riskLabel}</dd><dt>이번 턴 시장 예시</dt><dd class="${d.ret.startsWith('-')?'negative':''}">${d.ret}</dd></dl></li>`).join('');
  const table=data.map(d=>`<tr><th scope="row">${d.product.principal_guaranteed?'●':'▲'} ${d.product.shortName}<small>${d.product.riskLabel}</small></th><td>${formatWon(d.amount)}<small>${d.source}</small></td><td>${d.share}</td><td class="${d.ret.startsWith('-')?'negative':''}">${d.ret}</td></tr>`).join('');
  return `<div class="portfolio-desktop"><table><caption class="sr-only">상품별 보유분 · 비중 분모는 현금과 미결제를 포함한 IRP 총액</caption><thead><tr><th scope="col">상품</th><th scope="col">평가액·출처</th><th scope="col">IRP 비중</th><th scope="col">이번 턴 시장 예시</th></tr></thead><tbody>${table}</tbody></table></div><ul class="portfolio-mobile holding-cards">${cards}</ul>`;
 };
 const lots=depositStatus(state);
 const lotRows=lots.map(l=>`<li><strong>${l.status==='matured'?'◷ 만기 완료 · 재운용 대기':'● 약정 운용 중'}</strong><p>${formatWon(l.amount)} · ${orderScope(l.scope)}</p><small>가입 ${l.openedTurn}턴 · 만기 ${l.maturityTurn>12?`${l.maturityTurn}턴(판 종료 이후)`:l.maturityTurn+'턴'} · 약정 턴당 ${ratePct(l.ratePerTurn)}${l.status==='active'?` · 현재 ${l.maturityTurn-state.turn}턴 남음`:' · 추가 약정 이자 없음'}</small></li>`).join('');
 const orders=state.pendingOrders.map(o=>`<li><strong>${products.find(p=>p.id===o.productId)!.shortName} ${o.side==='buy'?'매수':'환매'} · ${o.stage==='received'?'접수 / 가격확정 대기':'가격확정 / 결제 대기'}</strong><p>${o.side==='sell'&&o.stage==='received'?'평가액 약 ':''}${formatWon(o.amount)} · ${orderScope(o.defaultScope)}</p><small>${orderSchedule(o)}${o.targetProductId?` · 결제 후 ${products.find(p=>p.id===o.targetProductId)!.shortName} 연결 매수 검토`:''}</small></li>`).join('');
 const composition=portfolioComposition(state);
 let end=0;
 const gradient=composition.map(item=>{const start=end;end+=total>0?item.amount/total*100:0;return `${item.color} ${start}% ${end}%`;}).join(',');
 const summary=composition.map(item=>`<div class="portfolio-category" data-category="${item.id}" data-amount="${item.amount}"><span class="category-dot" style="background:${item.color}" aria-hidden="true"></span><span>${item.label}</span><strong>${formatWon(item.amount)}<small>IRP의 ${pct(total>0?item.amount/total:0)}</small></strong></div>`).join('');
 return `<header class="order-heading"><p class="eyebrow">포트폴리오 · 조회는 행동 횟수 차감 없음</p><h2>내 자산은 어디에 있을까요?</h2><p>IRP와 생활자금은 서로 다른 주머니예요.</p></header>
 <div class="portfolio-split"><section class="portfolio-overview" aria-label="계좌 합계와 분류"><div class="portfolio-total-card"><small>IRP 평가액</small><h3 class="portfolio-total">${formatWon(total)}</h3><p class="outside-cash">생활자금 ${formatWon(state.cash)} · IRP 밖 자금</p></div>
 <div class="portfolio-composition"><div class="portfolio-donut" style="background:${total>0?`conic-gradient(${gradient})`:'#e3ebe5'}" aria-hidden="true"><span>IRP 구성<b>${total>0?'100%':'0원'}</b></span></div><div class="portfolio-categories">${summary}</div></div>
 <p class="cash-rule">${cashInterestRule(state)}. 예약된 매수금·미결제 매도대금은 제외합니다.</p>
 <details class="portfolio-fund-breakdown" data-preserve-open><summary>합계 계산 확인</summary><section class="portfolio-funds" aria-label="IRP 합계 구성"><div><small>보유 상품</small><strong>${formatWon(held)}</strong></div><div><small>미결제 주문 · 사용 불가</small><strong>${formatWon(pending)}</strong></div><div class="available-cash"><small>주문 가능 IRP 대기자금</small><strong>${formatWon(state.irpCash)}</strong></div></section>
 <p class="hint">보유 + 미결제 + 대기자금 = 위 IRP 총액. 상품·옵션 내역은 이 합계의 세부 내역입니다.</p></details>
 <div class="portfolio-risk"><strong>전체 IRP의 규제 위험자산 ${pct(riskAssetRatio(state))}</strong><p>기초 주식 노출 ${pct(equityExposureRatio(state))}</p><small>위험자산 한도와 실제 주식 노출은 다른 기준입니다. 적격 TDF 한도 예외는 무위험을 뜻하지 않습니다.</small></div>
 </section><div class="portfolio-detail" aria-label="분류별 상세"><section class="portfolio-direct"><h3>직접 운용 보유 상품</h3>${values.some(v=>v.amount>.001)?group(values.filter(v=>v.amount>.001)):'<p>직접 운용 보유 상품이 없습니다. 디폴트옵션·대기자금·미결제 주문을 확인하세요.</p>'}
 ${values.some(v=>v.amount<=.001)?`<details class="empty-holdings"><summary>직접 미보유 상품 ${values.filter(v=>v.amount<=.001).length}개 살펴보기</summary>${group(values.filter(v=>v.amount<=.001))}</details>`:''}
 <p class="hint">상품별 수익률은 시장 예시이며 실제 보유분 성과와 다를 수 있습니다. 비중 분모는 현금·미결제·옵션을 포함한 전체 IRP입니다.</p></section>
 ${renderMaturityDetails(state)}${renderDefaultHoldings(state)}<section class="portfolio-orders"><h3>미결제 주문 ${state.pendingOrders.length}건</h3><ul class="trade-timeline">${orders||'<li>대기 주문 없음</li>'}</ul>${state.rebalancePlan?'<p>매도 결제 후 직접 운용분 목표비중을 다시 계산해 매수합니다.</p>':''}</section>
 <section class="deposit-status"><h3>예금 약정 ${lots.length}건</h3><p class="hint">${state.defaultLifecycle ? '일반 예금과 예금 100% 옵션은 만기에 IRP 현금으로 이동합니다. 혼합 옵션 안의 예금은 새 금리로 재예치합니다. 이 게임의 가상 계약 조건이며 실제 상품별 조건은 다를 수 있습니다.' : '게임에서는 만기 이후 보유분을 자동 현금화하거나 재가입하지 않습니다. 실제 상품의 만기 처리 조건은 상품별로 확인해야 합니다.'}</p><ul class="trade-timeline">${lotRows||'<li>예금 보유 없음</li>'}</ul>${depositActions(state)}</section>
 <details class="account-sources"><summary>자금 원천과 수령 계산 기준</summary><p>퇴직급여 ${formatWon(basis.retirement)} · 미공제 원금 ${formatWon(basis.nonDeducted)} · 공제 원금 ${formatWon(basis.deducted)} · 운용수익 ${formatWon(basis.earnings)}</p><p>위 IRP 총액을 원천별로 나눈 값입니다.</p></details>${defaultScopes(state).length?'<p class="hint">사전지정 변경은 보유 옵션 매매와 별개입니다.</p>':''}</div></div>`;
}
