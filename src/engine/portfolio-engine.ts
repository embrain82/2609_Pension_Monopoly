import { allowedPortfolios, validDefaultScope } from '../data/default-portfolios';
import { scopedHolding, putScopedHolding, manualPortfolioValue } from './position-engine';
import { balanceConfig, investorProfiles, products } from '../data/content';
import type { ActionResult, DefaultScope, DepositLot, GameState, Holding, PendingOrder, ProductId } from '../types';
import { canBuyForProfile, canBuyRiskAsset, effectiveRiskRatio, maxBuyWithinRiskLimit, riskAssetRatio } from './policy-engine';

export function portfolioValue(state: Pick<GameState, 'holdings' | 'irpCash'> & Partial<Pick<GameState, 'pendingOrders'>>): number {
  return state.irpCash + (state.pendingOrders?.reduce((sum, order) => sum + order.amount, 0) ?? 0)
    + state.holdings.reduce((sum, holding) => sum + holding.amount, 0);
}

export function depositLots(state: GameState, holding: Holding): DepositLot[] {
  if (holding.lots?.length && Math.abs(holding.lots.reduce((s, l) => s + l.amount, 0) - holding.amount) < 0.01) return holding.lots.map(l => ({ ...l }));
  return holding.amount <= 0 ? [] : [{ principal: Math.min(holding.principal, holding.amount), amount: holding.amount,
    openedTurn: state.turn - holding.depositTurnsHeld,
    maturityTurn: state.turn - holding.depositTurnsHeld + balanceConfig.depositMaturityTurns,
    ratePerTurn: balanceConfig.market.depositBase + balanceConfig.market.depositPerRatePct * state.lastMarket.ratePct }];
}

function invalid(state: GameState, amount: number, internal: boolean): string | null {
  if (!Number.isFinite(amount) || amount <= 0) return '거래 금액은 유한한 양수여야 합니다.';
  if (!internal && state.rebalancePlan) return '리밸런싱 주문 처리 중입니다. 정산 후 다시 거래하세요.';
  return null;
}
function orderFor(state: GameState, side: 'buy' | 'sell', productId: ProductId, amount: number): PendingOrder {
  return { id: `order-${state.orderSequence}`, side, productId, amount, submittedTurn: state.turn,
    priceTurn: state.turn + 1, settlesTurn: state.turn + 2, stage: 'received',
    ...(side === 'sell' ? { units: amount / state.prices[productId] } : {}) };
}
function addHolding(state: GameState, productId: ProductId, amount: number, scope?: DefaultScope): GameState {
  const current = scopedHolding(state, productId, scope);
  const next: Holding = { ...current, amount: current.amount + amount, principal: current.principal + amount,
    units: (current.amount + amount) / state.prices[productId] };
  if (productId === 'deposit') {
    next.lots = [...depositLots(state, current), { amount, principal: amount, openedTurn: state.turn,
      maturityTurn: state.turn + balanceConfig.depositMaturityTurns,
      ratePerTurn: balanceConfig.market.depositBase + balanceConfig.market.depositPerRatePct * state.lastMarket.ratePct }];
  }
  return { ...state, holdings: putScopedHolding(state, next, scope) };
}

export function buyProduct(state: GameState, productId: ProductId, requestedAmount = balanceConfig.tradeAmount, internal = false, scope?: DefaultScope): ActionResult {
  const error = invalid(state, requestedAmount, scope ? false : internal);
  if (error) return { ok: false, message: error, state };
  const product = products.find(p => p.id === productId);
  if (!product) return { ok: false, message: '상품을 찾을 수 없습니다.', state };
  if (scope && (!state.defaultTrading || !validDefaultScope(scope, productId) || !allowedPortfolios(state.profileId).some(p=>p.id===scope.optionId))) return {ok:false,message:'허용된 디폴트옵션 구성과 성향을 확인하세요.',state};
  const amount = Math.min(requestedAmount, state.irpCash);
  if (amount < (scope || internal ? 0.01 : 100000)) return { ok: false, message: 'IRP 대기자금이 부족합니다.', state };
  const suitability = scope ? {ok:true,reason:'포트폴리오 성향 확인'} : canBuyForProfile(state.profileId, productId);
  if (!suitability.ok) return { ok: false, message: suitability.reason, state };
  const check = scope ? {ok:true,ratio:0,reason:'승인유형 한도 예외 모사'} : canBuyRiskAsset(state, productId, amount);
  if (!check.ok) return { ok: false, message: check.reason, state, expectedRiskRatio: check.ratio };
  let next = { ...state, irpCash: state.irpCash - amount, riskBuyCount: state.riskBuyCount + (product.regulatoryRisk ? 1 : 0) };
  if (product.kind === 'fund') {
    next = { ...next, pendingOrders: [...state.pendingOrders, {...orderFor(state, 'buy', productId, amount), ...(scope ? {defaultScope:scope} : {})}], orderSequence: state.orderSequence + 1 };
  } else next = addHolding(next, productId, amount, scope);
  return { ok: true, state: next, expectedRiskRatio: scope ? riskAssetRatio(next) : check.ratio,
    message: product.kind === 'fund' ? `${product.shortName} 매수 접수 → 다음 턴 기준가 확정 → 그다음 턴 결제(게임 시간)`
      : `${product.shortName} ${product.kind === 'deposit' ? '신규 약정 가입' : '표시가격 체결(게임 가정)'} · IRP 안에서 운용됩니다.` };
}

/** FIFO 가입 건별 해지. 중도해지는 발생 이자의 50%만 지급하는 가상 약정이며 원금은 차감하지 않는다. */
export function depositSale(state: GameState, requested: number, scope?: DefaultScope) {
  const holding = scopedHolding(state, 'deposit', scope);
  let remaining = Math.min(requested, holding.amount), penalty = 0, principalSold = 0;
  const lots = depositLots(state, holding).map(lot => {
    const take = Math.min(remaining, lot.amount);
    const fraction = lot.amount > 0 ? take / lot.amount : 0;
    remaining -= take;
    principalSold += lot.principal * fraction;
    if (state.turn < lot.maturityTurn) penalty += Math.max(0, lot.amount - lot.principal) * fraction * 0.5;
    return { ...lot, amount: lot.amount - take, principal: lot.principal * (1 - fraction) };
  }).filter(lot => lot.amount > 0.001);
  return { amount: Math.min(requested, holding.amount), penalty, principalSold, lots };
}

export function sellProduct(state: GameState, productId: ProductId, requestedAmount = balanceConfig.tradeAmount, internal = false, scope?: DefaultScope): ActionResult {
  const error = invalid(state, requestedAmount, scope ? false : internal);
  if (error) return { ok: false, message: error, state };
  const product = products.find(p => p.id === productId);
  const current = scopedHolding(state, productId, scope);
  if (scope && (!state.defaultTrading || !validDefaultScope(scope,productId))) return {ok:false,message:'디폴트옵션 보유 출처를 확인하세요.',state};
  const amount = Math.min(requestedAmount, current.amount);
  if (!product || amount < (scope ? 0.0000001 : internal ? 0.01 : 100000)) return { ok: false, message: '매도할 잔고가 부족합니다.', state };
  const fraction = amount / current.amount;
  const updated: Holding = { ...current, amount: current.amount - amount, principal: current.principal * (1 - fraction),
    units: (current.amount - amount) / state.prices[productId] };
  let penalty = 0;
  if (productId === 'deposit') {
    const sale = depositSale(state, amount, scope);
    penalty = sale.penalty;
    updated.lots = sale.lots;
    updated.principal = Math.max(0, current.principal - sale.principalSold);
  }
  const next = { ...state, holdings: putScopedHolding(state, updated, scope) };
  if (product.kind === 'fund') return { ok: true,
    message: `${product.shortName} 환매 수량 예약 → 다음 턴 가격 확정 → 그다음 턴 IRP 대기자금 결제`,
    state: { ...next, pendingOrders: [...state.pendingOrders, {...orderFor(state, 'sell', productId, amount), ...(scope ? {defaultScope:scope} : {})}], orderSequence: state.orderSequence + 1 } };
  return { ok: true, message: `${product.shortName} 매도 대금이 IRP 대기자금에 반영되었습니다.${penalty > 0 ? ` 중도해지 이자 조정 ${Math.round(penalty).toLocaleString('ko-KR')}원.` : ''}`,
    state: { ...next, irpCash: next.irpCash + amount - penalty, understandingPoints: next.understandingPoints + (scope || internal ? 0 : 1) } };
}

export function switchProduct(state: GameState, fromId: ProductId, toId: ProductId, amount = balanceConfig.tradeAmount): ActionResult {
  if (fromId === toId) return { ok: false, message: '서로 다른 상품을 선택하세요.', state };
  const suitability = canBuyForProfile(state.profileId, toId);
  if (!suitability.ok) return { ok: false, message: suitability.reason, state };
  const sold = sellProduct(state, fromId, amount);
  if (!sold.ok) return sold;
  if (sold.state.pendingOrders.length > state.pendingOrders.length) {
    const orders = sold.state.pendingOrders.map((o, i) => i === sold.state.pendingOrders.length - 1 ? { ...o, targetProductId: toId, groupId: `switch-${o.id}` } : o);
    return { ...sold, message: '환매 가격·대금이 확정된 뒤 같은 교체 주문의 매수가 이어집니다.', state: { ...sold.state, pendingOrders: orders } };
  }
  const proceeds = sold.state.irpCash - state.irpCash;
  const cap = maxBuyWithinRiskLimit(sold.state, toId, proceeds);
  const bought = cap >= 100000 ? buyProduct(sold.state, toId, cap) : null;
  return { ok: true, state: bought?.ok ? bought.state : sold.state,
    message: `교체매매: ${sold.message} ${bought?.ok ? bought.message : '새 매수는 제한되어 대금이 대기자금으로 남았습니다.'}` };
}

function fundRebalance(state: GameState): GameState {
  if (!state.rebalancePlan || state.pendingOrders.some(o => o.side === 'sell')) return state;
  let next = state;
  const shares = state.rebalancePlan;
  const total = manualPortfolioValue(state);
  // 안전자산을 먼저 매수하고 실제 규제상 여유 안에서 위험자산을 주문한다.
  for (const product of [...products].sort((a, b) => Number(a.regulatoryRisk) - Number(b.regulatoryRisk))) {
    const reserved = next.pendingOrders.filter(o => o.side === 'buy' && o.productId === product.id).reduce((s, o) => s + o.amount, 0);
    const need = total * shares[product.id] - scopedHolding(next, product.id).amount - reserved;
    const amount = maxBuyWithinRiskLimit(next, product.id, Math.min(Math.max(0, need), next.irpCash));
    if (amount >= 100000) next = buyProduct(next, product.id, amount, true).state;
  }
  return { ...next, rebalancePlan: null };
}

/** 시장 반영 후 호출. 미확정 매수는 가격 확정 전 수익을 얻지 않고, 환매는 확정 전까지 가격 위험을 가진다. */
export function settleOrders(state: GameState): GameState {
  let next: GameState = { ...state, pendingOrders: [] };
  const switches: PendingOrder[] = [];
  for (const original of state.pendingOrders) {
    let order = { ...original };
    if (order.stage === 'received' && (order.priceTurn ?? order.settlesTurn) <= state.turn) {
      order = { ...order, stage: 'priced', units: order.side === 'buy' ? order.amount / state.prices[order.productId] : order.units };
    }
    if (order.settlesTurn > state.turn) { next.pendingOrders.push(order); continue; }
    if (order.side === 'buy') next = addHolding(next, order.productId, order.amount, order.defaultScope);
    else {
      next.irpCash += order.amount;
      if (order.targetProductId) switches.push(order);
    }
  }
  // 미처리 주문 예약을 모두 복원한 뒤 연결 주문의 매수 여력을 검증한다.
  for (const order of switches) {
    const target = order.targetProductId!;
    const amount = maxBuyWithinRiskLimit(next, target, Math.min(order.amount, next.irpCash));
    const result = amount >= 100000 ? buyProduct(next, target, amount, true) : null;
    if (result?.ok) {
      next = { ...result.state, pendingOrders: result.state.pendingOrders.map(o => o.id === `order-${next.orderSequence}` ? { ...o, groupId: order.groupId ?? order.id } : o) };
      if (amount < order.amount - 1) next = { ...next, logs: [...next.logs, { turn: state.turn, type: 'settle', message: '위험한도까지 교체 매수 · 남은 환매 대금은 대기자금으로 보관됩니다.' }] };
    }
    else next = { ...next, logs: [...next.logs, { turn: state.turn, type: 'settle', message: '교체 매수 제한 · 환매 대금은 IRP 대기자금에 보관됩니다.' }] };
  }
  return fundRebalance(next);
}

/** 마지막 시장 가격을 고정한 정산 전용 시간. 시장·급여·공제·게임 턴은 추가하지 않는다. */
export function settleAllOrders(state: GameState): GameState {
  const gameTurn = state.turn;
  let next = state;
  for (let tick = 0; tick < 8 && (next.pendingOrders.length || next.rebalancePlan); tick++) {
    const due = next.pendingOrders.length ? Math.min(...next.pendingOrders.map(o => o.settlesTurn)) : next.turn;
    next = settleOrders({ ...next, turn: Math.max(next.turn, due) });
  }
  if (next.pendingOrders.length || next.rebalancePlan) throw new Error('정산 전용 단계에 미결 주문이 남았습니다.');
  return { ...next, turn: gameTurn };
}

export function rebalanceShares(profileId: GameState['profileId']): Record<ProductId, number> {
  return { ...investorProfiles.find(p => p.id === profileId)!.allocation };
}
export function rebalanceTargetRisk(profileId: GameState['profileId']): number {
  const shares = rebalanceShares(profileId);
  return products.reduce((s, p) => s + shares[p.id] * effectiveRiskRatio(p.id), 0);
}
export function rebalancePortfolio(state: GameState): ActionResult {
  if (state.pendingOrders.length || state.rebalancePlan) return { ok: false, message: '접수한 주문 정산 후 리밸런싱할 수 있습니다. 기존 주문은 보존됩니다.', state };
  const total = manualPortfolioValue(state);
  if (total <= 0) return { ok: false, message: '리밸런싱할 자산이 없습니다.', state };
  const shares = rebalanceShares(state.profileId);
  let next: GameState = { ...state, rebalancePlan: shares };
  for (const product of products) {
    const surplus = scopedHolding(next, product.id).amount - total * shares[product.id];
    if (surplus >= 100000) next = sellProduct(next, product.id, surplus, true).state;
  }
  next = fundRebalance(next);
  return { ok: true, message: `${state.defaultTrading ? '직접 운용분 대상 · ' : ''}리밸런싱 차액 주문 접수 · 매도 대금 결제 후 목표비중 매수. 예금 약정과 기존 잔고는 필요한 만큼만 변경됩니다.`,
    state: { ...next, rebalanceCount: next.rebalanceCount + 1, understandingPoints: next.understandingPoints + 3 } };
}
