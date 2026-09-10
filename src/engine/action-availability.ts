import { products } from '../data/content';
import { allowedPortfolios } from '../data/default-portfolios';
import type { GameState, ProductId } from '../types';
import { actionTiming, contributionConstraint, defaultInConstraint, defaultOutConstraint, defaultTradeConstraint, enabled, MIN_TRADE_AMOUNT, rebalanceConstraint, tradeAmountConstraint, tradeLock, unavailable, type Availability } from './action-constraints';
import { canBuyForProfile, decideBuyAgainstRiskLimit, type BuyLimitDecision } from './policy-engine';
import { scopedHolding } from './position-engine';

export type Operation = 'contribute' | 'buy' | 'sell' | 'switch' | 'rebalance' | 'default' | 'hold';
export function buyDecision(state: GameState, productId: ProductId, amount: number): BuyLimitDecision {
  const guard = actionTiming(state), trade = tradeAmountConstraint(state, amount, false);
  if (!guard.enabled) return { kind: 'reject', message: guard.reason };
  if (!trade.enabled) return { kind: 'reject', message: trade.reason };
  return decideBuyAgainstRiskLimit(state, productId, amount);
}

export function defaultTabAvailability(state: GameState): Record<'in' | 'out', Availability> {
  const common = defaultTradeConstraint(state);
  if (!common.enabled) return { in: common, out: common };
  const candidates = allowedPortfolios(state.profileId).map(p => defaultInConstraint(state, p.id, MIN_TRADE_AMOUNT));
  const optIn = candidates.find(c => c.enabled) ?? candidates[0] ?? unavailable('suitability', '성향에 맞는 옵션이 없습니다.');
  return { in: optIn, out: defaultOutConstraint(state, 1) };
}

/** 메뉴는 가능한 조합이 하나라도 있는지 판단한다. 현재 입력 초안은 사용하지 않는다. */
export function actionAvailability(state: GameState, operation: Operation): Availability {
  const timing = actionTiming(state);
  if (!timing.enabled) return timing;
  if (operation === 'hold') return enabled;
  if (operation === 'contribute') return contributionConstraint(state, Math.max(MIN_TRADE_AMOUNT, state.cash));
  if (operation === 'rebalance') return rebalanceConstraint(state);
  if (operation === 'default') {
    const tabs = defaultTabAvailability(state);
    if (tabs.in.enabled || tabs.out.enabled) return enabled;
    return tabs.in.code === tabs.out.code ? tabs.in : unavailable(tabs.in.code, `매수: ${tabs.in.reason} · 환매: ${tabs.out.reason}`);
  }
  const lock = tradeLock(state);
  if (!lock.enabled) return lock;
  if (operation === 'buy') {
    if (state.irpCash < MIN_TRADE_AMOUNT) return unavailable('cash', '주문 가능한 IRP 대기자금이 10만원 미만입니다. 미결제 대금은 사용할 수 없습니다.');
    return products.some(p => buyDecision(state, p.id, state.irpCash).kind !== 'reject')
      ? enabled : unavailable('risk-limit', '성향·위험한도 안에서 10만원 이상 매수할 수 있는 상품이 없습니다.');
  }
  const holdings = products.filter(p => scopedHolding(state, p.id).amount >= MIN_TRADE_AMOUNT);
  if (!holdings.length) return unavailable('holdings', '10만원 이상 거래할 직접 보유 상품이 없습니다. 디폴트옵션 보유분과 미결제 주문은 제외됩니다.');
  if (operation === 'sell') return enabled;
  return holdings.some(from => products.some(to => from.id !== to.id && canBuyForProfile(state.profileId, to.id).ok))
    ? enabled : unavailable('suitability', '성향에 맞는 다른 교체 상품이 없습니다.');
}
