import { allowedPortfolios, defaultPortfolio } from '../data/default-portfolios';
import { products } from '../data/content';
import type { ActionResult, DefaultOptionId, DefaultScope, GameState, ProductId } from '../types';
import { buyProduct, portfolioValue, sellProduct } from './portfolio-engine';
import { defaultScopes, scopedHolding } from './position-engine';

export interface DefaultTradeDraft {
  tab: 'in' | 'out'; optionId: DefaultOptionId; amount: number; fraction: .5 | 1;
}
export interface DefaultTradePlan {
  ok: boolean; message: string; state: GameState;
  scope?: DefaultScope; amount: number; costs: number;
  legs: Array<{productId:ProductId;amount:number}>;
}
export function nextDefaultCommand(state: GameState): string {
  return `default-${state.turn}-${state.actionsLeft}-${state.defaultTrading?.groups.length??0}`;
}
function blocked(state: GameState): string | null {
  if(!state.defaultTrading || state.rulesetVersion!=='2026-09-10-e') return '이전 규칙으로 진행 중인 판입니다. 새 판에서 디폴트옵션 직접매매를 이용하세요.';
  if(state.status!=='playing'||!state.awaitingAction||state.currentEventId||state.actionsLeft<1) return '이번 턴 운용지시 시점에 실행할 수 있습니다.';
  if(state.rebalancePlan) return '리밸런싱 주문 처리 중입니다. 결제 후 다시 지시하세요.';
  if(state.pendingOrders.some(o=>o.defaultScope)) return '디폴트옵션 주문 처리 중입니다. 결제 후 다시 지시하세요.';
  return null;
}
function failed(state: GameState, message: string): DefaultTradePlan {return {ok:false,message,state,amount:0,costs:0,legs:[]};}
export function previewDefaultOptIn(state: GameState, optionId: DefaultOptionId, amount: number): DefaultTradePlan {
  const error=blocked(state);if(error) return failed(state,error);
  const option=allowedPortfolios(state.profileId).find(p=>p.id===optionId);
  if(!option) return failed(state,'투자성향에 맞는 디폴트옵션을 선택하세요.');
  if(!Number.isFinite(amount)||!Number.isInteger(amount)||amount<100000) return failed(state,'매수 묶음은 10만원 이상, 원 단위로 입력하세요.');
  if(amount>state.irpCash) return failed(state,'주문 가능한 IRP 대기자금이 부족합니다. 미결제 대금은 사용할 수 없습니다.');
  const existing=defaultScopes(state);
  if(existing.length>1||existing.some(s=>s.optionId!==optionId)) return failed(state,'보유 중인 옵션만 추가 매수할 수 있습니다. 다른 옵션은 전체 환매·결제 후 선택하세요.');
  const scope: DefaultScope=existing[0]??{mandateId:`mandate-${state.defaultTrading!.groups.length}`,optionId,optionVersion:'e1'};
  let remaining=amount;
  const legs=option.products.map((productId,i)=>{
    const part=i===option.products.length-1?remaining:Math.floor(amount*option.weights[productId]!);
    remaining-=part;return {productId,amount:part};
  });
  let next=state;
  for(const leg of legs) {
    const result=buyProduct(next,leg.productId,leg.amount,false,scope);
    if(!result.ok) return failed(state,result.message);
    next=result.state;
  }
  return {ok:true,message:`옵트인 · ${option.name} ${amount.toLocaleString('ko-KR')}원 매수 지시. ${timing(legs)} 사전지정은 바뀌지 않습니다.`,state:next,scope,amount,costs:Math.max(0,portfolioValue(state)-portfolioValue(next)),legs};
}
export function previewDefaultOptOut(state: GameState, fraction: number): DefaultTradePlan {
  const error=blocked(state);if(error) return failed(state,error);
  if(fraction!==.5&&fraction!==1) return failed(state,'환매 비율은 50% 또는 100%를 선택하세요.');
  const scopes=defaultScopes(state);
  if(scopes.length!==1) return failed(state,'환매할 디폴트옵션 보유분이 없습니다.');
  const scope=scopes[0],option=defaultPortfolio(scope.optionId);
  const legs=option.products.map(productId=>({productId,amount:scopedHolding(state,productId,scope).amount*fraction})).filter(l=>l.amount>0.0000001);
  if(!legs.length) return failed(state,'환매할 디폴트옵션 보유분이 없습니다.');
  let next=state;
  for(const leg of legs) {
    const result=sellProduct(next,leg.productId,leg.amount,false,scope);
    if(!result.ok) return failed(state,result.message);
    next=result.state;
  }
  const amount=legs.reduce((s,l)=>s+l.amount,0),costs=Math.max(0,portfolioValue(state)-portfolioValue(next));
  return {ok:true,message:`옵트아웃 · ${option.name} 보유분 ${fraction*100}% 환매 지시(평가액 약 ${Math.round(amount).toLocaleString('ko-KR')}원). ${timing(legs)} 대금은 IRP 안에 남고 사전지정은 유지됩니다.${costs>.001?` 예금 중도해지 이자 조정 ${Math.round(costs).toLocaleString('ko-KR')}원.`:''}`,state:next,scope,amount,costs,legs};
}
function timing(legs: DefaultTradePlan['legs']): string {
  const fund=legs.some(l=>products.find(p=>p.id===l.productId)?.kind==='fund');
  const deposit=legs.some(l=>l.productId==='deposit');
  return `${deposit?'예금은 이번 턴 반영. ':''}${fund?'펀드는 다음 턴 기준가 확정 → 그다음 턴 결제(게임 시간).':''}`;
}
export function executeDefaultTrade(state: GameState, draft: DefaultTradeDraft, commandId?: string): ActionResult {
  if(!commandId||commandId!==nextDefaultCommand(state)||state.defaultTrading?.groups.some(g=>g.commandId===commandId)) return {ok:false,message:'이미 접수했거나 상태가 변경된 지시입니다. 거래 내용을 다시 확인하세요.',state};
  const plan=draft.tab==='in'?previewDefaultOptIn(state,draft.optionId,draft.amount):previewDefaultOptOut(state,draft.fraction);
  if(!plan.ok||!plan.scope) return {ok:false,message:plan.message,state};
  const id=`default-group-${state.defaultTrading!.groups.length}`;
  const orderIds=plan.state.pendingOrders.filter(o=>!state.pendingOrders.some(old=>old.id===o.id)).map(o=>o.id);
  return {ok:true,message:plan.message,state:{...plan.state,
    pendingOrders:plan.state.pendingOrders.map(o=>orderIds.includes(o.id)?{...o,groupId:id}:o),
    defaultTrading:{version:'e1',groups:[...state.defaultTrading!.groups,{id,commandId,kind:draft.tab,scope:plan.scope,turn:state.turn,amount:plan.amount,orderIds}]},
    record:{...plan.state.record,defaultOptionRuns:plan.state.record.defaultOptionRuns+(draft.tab==='in'?1:0)}}};
}
