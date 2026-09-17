import { blockReason, defaultInConstraint, defaultOutConstraint } from './action-constraints';
import { allowedPortfolios, defaultPortfolio } from '../data/default-portfolios';
import { products } from '../data/content';
import type { ActionResult, DefaultOptionId, DefaultScope, GameState, ProductId } from '../types';
import { buyProduct, fundTiming, portfolioValue, sellProduct } from './portfolio-engine';
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
function failed(state: GameState, message: string): DefaultTradePlan {return {ok:false,message,state,amount:0,costs:0,legs:[]};}
export function previewDefaultOptIn(state: GameState, optionId: DefaultOptionId, amount: number): DefaultTradePlan {
  const error=blockReason(defaultInConstraint(state,optionId,amount));if(error) return failed(state,error);
  return planDefaultPurchase(state, optionId, amount);
}

/** Shared atomic order plan. Callers validate user timing or automatic eligibility. */
function planDefaultPurchase(state: GameState, optionId: DefaultOptionId, amount: number, cycleId?: string): DefaultTradePlan {
  const option=defaultPortfolio(optionId);
  const existing=defaultScopes(state);
  const scope: DefaultScope=existing[0]??{mandateId:`mandate-${state.defaultTrading!.groups.length}`,optionId,optionVersion:'e1'};
  let remaining=amount;
  const legs=option.products.map((productId,i)=>{
    const part=i===option.products.length-1?remaining:Math.floor(amount*option.weights[productId]!);
    remaining-=part;return {productId,amount:part};
  }).filter(leg => leg.amount > 0);
  let next=state;
  for(const leg of legs) {
    const result=buyProduct(next,leg.productId,leg.amount,false,scope,cycleId);
    if(!result.ok) return failed(state,result.message);
    next=result.state;
  }
  return {ok:true,message:`옵트인 · ${option.name} ${amount.toLocaleString('ko-KR')}원 매수 지시. ${timing(legs,state.turn)} 사전지정은 바뀌지 않습니다.`,state:next,scope,amount,costs:Math.max(0,portfolioValue(state)-portfolioValue(next)),legs};
}
export function previewDefaultOptOut(state: GameState, fraction: number): DefaultTradePlan {
  const error=blockReason(defaultOutConstraint(state,fraction));if(error) return failed(state,error);
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
  return {ok:true,message:`옵트아웃 · ${option.name} 보유분 ${fraction*100}% 환매 지시(평가액 약 ${Math.round(amount).toLocaleString('ko-KR')}원). ${timing(legs,state.turn)} 대금은 IRP 안에 남고 사전지정은 유지됩니다.${costs>.001?` 예금 중도해지 이자 조정 ${Math.round(costs).toLocaleString('ko-KR')}원.`:''}`,state:next,scope,amount,costs,legs};
}
function timing(legs: DefaultTradePlan['legs'],turn:number): string {
  const fund=legs.some(l=>products.find(p=>p.id===l.productId)?.kind==='fund');
  const deposit=legs.some(l=>l.productId==='deposit');
  return `${deposit?'예금은 이번 턴 반영. ':''}${fund?`펀드는 ${fundTiming(turn)}.`:''}`;
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

/** Automatic execution never consumes a player's action or grants a manual-trade reward. */
export function automaticDefaultPurchase(state: GameState, cycleId: string): ActionResult {
  const cycle = state.defaultLifecycle?.cycles.find(c => c.id === cycleId);
  const optionId = cycle?.optionId;
  const amount = Math.floor(cycle?.remaining ?? 0);
  const fail = (message: string): ActionResult => ({ ok: false, message, state });
  if (!state.defaultTrading || !cycle || !optionId || optionId !== state.defaultOption || !cycle.presentedTurn ||
      !cycle.eligibleTurn || state.turn < cycle.eligibleTurn || state.status !== 'playing' || state.turn > 12 ||
      !['notified','blocked'].includes(cycle.state)) return fail('통지·대기 절차를 확인하고 있습니다.');
  if (state.rebalancePlan || state.pendingOrders.some(o => !state.defaultTrading!.groups.some(g => g.source === 'automatic' && g.turn === state.turn && g.scope.optionId === optionId && g.orderIds.includes(o.id)))) return fail('기존 주문 결제 후 자동운용을 다시 확인합니다.');
  if (!allowedPortfolios(state.profileId).some(p => p.id === optionId)) return fail('성향에 맞는 사전지정을 확인하세요.');
  if (defaultScopes(state).length > 1 || defaultScopes(state).some(s => s.optionId !== optionId)) return fail('다른 옵션 보유 · 운용 선택이 필요합니다.');
  if (amount < 1 || amount > state.irpCash) return fail('자동운용 가능한 원 단위 잔액이 부족합니다.');
  const commandId = `auto-${cycleId}`;
  if (state.defaultTrading.groups.some(g => g.commandId === commandId)) return fail('이미 처리한 자동주문입니다.');
  const plan = planDefaultPurchase(state, optionId, amount, cycleId);
  if (!plan.ok || !plan.scope) return fail(plan.message);
  const id = `default-group-${state.defaultTrading.groups.length}`;
  const orderIds = plan.state.pendingOrders.filter(o => !state.pendingOrders.some(old => old.id === o.id)).map(o => o.id);
  const message = `만기자금 자동운용 · ${defaultPortfolio(optionId).name} ${amount.toLocaleString('ko-KR')}원 주문. ${timing(plan.legs,state.turn)} 행동 차감 없음.`;
  return { ok: true, message, state: { ...plan.state, riskBuyCount: state.riskBuyCount,
    pendingOrders: plan.state.pendingOrders.map(o => orderIds.includes(o.id) ? { ...o, groupId: id } : o),
    defaultTrading: { ...state.defaultTrading, groups: [...state.defaultTrading.groups,
      { id, commandId, kind: 'in', source: 'automatic', cycleId, scope: plan.scope, turn: state.turn, amount, orderIds }] },
    defaultLifecycle: { ...plan.state.defaultLifecycle!, cycles: plan.state.defaultLifecycle!.cycles.map(c => c.id === cycleId
      ? { ...c, remaining: 0, state: 'ordered', orderedTurn: state.turn, orderedAmount: amount, commandId, orderIds, blockedReason: undefined } : c) },
    logs: [...plan.state.logs, { turn: state.turn, type: 'default-auto', message }] } };
}
