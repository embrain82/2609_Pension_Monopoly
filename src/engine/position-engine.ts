import type { DefaultScope, GameState, Holding, HoldingPosition, ProductId } from '../types';

export function positionsOf(holding: Holding): HoldingPosition[] {
  if(holding.positions) return holding.positions;
  const {productId,positions: _positions,...balance}=holding;
  void _positions;
  return holding.amount>0 ? [{...balance,id:`manual-${productId}`,source:'manual'}] : [];
}
export function aggregateHolding(productId: ProductId, positions: HoldingPosition[]): Holding {
  return {productId,positions,amount:positions.reduce((s,p)=>s+p.amount,0),principal:positions.reduce((s,p)=>s+p.principal,0),
    units:positions.reduce((s,p)=>s+(p.units??0),0),depositTurnsHeld:Math.max(0,...positions.map(p=>p.depositTurnsHeld)),
    ...(productId==='deposit' ? {lots:positions.flatMap(p=>p.lots??[])} : {})};
}
export function initializePositions(state: GameState): GameState {
  return {...state,holdings:state.holdings.map(h=>aggregateHolding(h.productId,positionsOf(h)))};
}
function inScope(position: HoldingPosition, scope?: DefaultScope): boolean {
  return scope ? position.source==='default' && position.scope?.mandateId===scope.mandateId : position.source==='manual';
}
/** 매매 대상 출처만 집계한다. 상품별 전체 평가액과 구분한다. */
export function scopedHolding(state: Pick<GameState,'holdings'>, productId: ProductId, scope?: DefaultScope): Holding {
  const holding=state.holdings.find(h=>h.productId===productId);
  if(!holding) return {productId,amount:0,principal:0,depositTurnsHeld:0};
  if(!holding.positions && !scope) return holding;
  return aggregateHolding(productId,positionsOf(holding).filter(p=>inScope(p,scope)));
}
export function putScopedHolding(state: GameState, updated: Holding, scope?: DefaultScope): Holding[] {
  let holding=updated;
  if(state.defaultTrading) {
    const current=state.holdings.find(h=>h.productId===updated.productId);
    const others=current ? positionsOf(current).filter(p=>!inScope(p,scope)) : [];
    const {productId,positions: _positions,...balance}=updated; void _positions;
    const own: HoldingPosition[] = updated.amount>0.0000001 ? [{...balance,id:scope ? `${scope.mandateId}-${productId}` : `manual-${productId}`,source:scope?'default':'manual',...(scope?{scope}:{})}] : [];
    holding=aggregateHolding(productId,[...others,...own]);
  }
  return state.holdings.some(h=>h.productId===holding.productId)
    ? state.holdings.map(h=>h.productId===holding.productId ? holding : h) : [...state.holdings,holding];
}
export function mapHoldingBalances(holding: Holding, change: (balance: Holding)=>Holding): Holding {
  if(!holding.positions) return change(holding);
  return aggregateHolding(holding.productId,holding.positions.map(position=>{
    const changed=change({...position,productId:holding.productId});
    const {productId:_productId,positions:_positions,...balance}=changed;void _productId;void _positions;
    return {...position,...balance};
  }));
}
export function manualPortfolioValue(state: GameState): number {
  return state.irpCash+state.holdings.reduce((s,h)=>s+scopedHolding(state,h.productId).amount,0)
    +state.pendingOrders.filter(o=>!o.defaultScope).reduce((s,o)=>s+o.amount,0);
}
export function defaultScopes(state: Pick<GameState,'holdings'|'pendingOrders'>): DefaultScope[] {
  const scopes=[...state.holdings.flatMap(h=>positionsOf(h).filter(p=>p.source==='default'&&p.amount>0).map(p=>p.scope!)),
    ...state.pendingOrders.flatMap(o=>o.defaultScope?[o.defaultScope]:[])];
  return [...new Map(scopes.map(s=>[s.mandateId,s])).values()];
}
export function defaultValue(state: Pick<GameState,'holdings'|'pendingOrders'>, scope?: DefaultScope): number {
  return state.holdings.flatMap(positionsOf).filter(p=>p.source==='default'&&(!scope||p.scope?.mandateId===scope.mandateId)).reduce((s,p)=>s+p.amount,0)
    +state.pendingOrders.filter(o=>o.defaultScope&&(!scope||o.defaultScope.mandateId===scope.mandateId)).reduce((s,o)=>s+o.amount,0);
}
