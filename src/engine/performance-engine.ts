import { SCENARIO_CLOCK } from './scenario-engine';
import { portfolioValue } from './portfolio-engine';
import { products } from '../data/content';
import type { GameState } from '../types';

/** 시장 구간: 외부유입이 일어나기 전에 평가액 비율을 연결한다. */
export function beginPerformance(before: GameState, after: GameState): GameState {
  if (!before.campaign) return after;
  const d=before.campaign, open=portfolioValue(before), value=portfolioValue(after);
  const index=d.index*(open>0 ? value/open : 1);
  const peak=Math.max(d.peak,index);
  // 같은 유입 비교는 매 턴 초기 비중으로 재조정하는 마찰 없는 기준 지수. 실제 상품 주문의 재현이 아니다.
  const ret=products.reduce((s,p)=>s+d.baselineWeights[p.id]*((1+after.lastMarket.returns[p.id])*(1-p.feeRate)-1),0);
  return {...after,maxDrawdown:Math.max(d.drawdown,1-index/peak),campaign:{...d,index,peak,drawdown:Math.max(d.drawdown,1-index/peak),
    priceIndex:d.priceIndex*(1+after.lastMarket.inflationPct/100)**SCENARIO_CLOCK.yearsPerTurn,open,afterMarket:value,
    flowStart:before.cashFlows.length,benchmarkOpen:d.benchmark*(1+ret)}};
}
export function finishPerformance(state: GameState): GameState {
  const d=state.campaign;
  if(!d || d.reviews.some(r=>r.turn===state.turn)) return state;
  const value=portfolioValue(state),flow=state.cashFlows.slice(d.flowStart).reduce((s,f)=>s+f.amount,0);
  const costs=value-d.afterMarket-flow;
  // 입출금은 시장 반영 뒤 발생한다. 비용은 외부유입과 분리해 기말 원본으로 보정한다.
  const capital=Math.max(d.afterMarket+flow,1),index=d.index*Math.max(0,1+costs/capital),peak=Math.max(d.peak,index);
  const benchmark=d.benchmarkOpen+flow;
  return {...state,maxDrawdown:Math.max(d.drawdown,1-index/peak),campaign:{...d,index,peak,drawdown:Math.max(d.drawdown,1-index/peak),benchmark,
    reviews:[...d.reviews,{turn:state.turn,tile:state.position,headline:state.lastMarket.headline,actions:[...state.turnActionLines],
      irp:value,flow,market:d.afterMarket-d.open,costs,cash:state.cash-state.livingDebt,index,realIndex:index/d.priceIndex,benchmark,chapter:state.turn%3===0,holdings:state.holdings.map(h=>({productId:h.productId,amount:h.amount}))}]}};
}
