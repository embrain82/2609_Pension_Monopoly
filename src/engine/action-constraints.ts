import { policyRules } from '../data/content';
import { allowedPortfolios, defaultPortfolio } from '../data/default-portfolios';
import type { DefaultOptionId, GameState } from '../types';
import { defaultScopes, manualPortfolioValue, scopedHolding } from './position-engine';

export const MIN_TRADE_AMOUNT = 100_000;
export type BlockCode = 'timing' | 'legacy' | 'rebalance-pending' | 'orders-pending' | 'default-pending' | 'cash' | 'contribution-limit' | 'holdings' | 'suitability' | 'risk-limit' | 'amount' | 'no-default' | 'default-choice' | 'no-assets';
export type Availability = { enabled: true; hint?: string } | { enabled: false; code: BlockCode; reason: string };
export const enabled: Availability = { enabled: true };
export const unavailable = (code: BlockCode, reason: string): Availability => ({ enabled: false, code, reason });
export const blockReason = (result: Availability): string | null => result.enabled ? null : result.reason;

export function actionTiming(state: GameState): Availability {
  return state.status !== 'playing' || !state.awaitingAction || !!state.currentEventId || state.actionsLeft < 1
    ? unavailable('timing', '이번 턴 시장을 확인하고 생활사건을 해결한 뒤 운용지시할 수 있습니다.') : enabled;
}

export function tradeLock(state: GameState): Availability {
  return state.rebalancePlan ? unavailable('rebalance-pending', '리밸런싱 주문 처리 중입니다. 정산 후 다시 거래하세요.') : enabled;
}
export function tradeAmountConstraint(state: GameState, amount: number, internal: boolean): Availability {
  if (!Number.isFinite(amount) || amount <= 0) return unavailable('amount', '거래 금액은 유한한 양수여야 합니다.');
  return internal ? enabled : tradeLock(state);
}
export function acceptedContribution(state: GameState, requested: number): number {
  return Math.min(requested, state.cash, Math.max(0, policyRules.annualContributionLimit - state.contributionTotal));
}
export function contributionConstraint(state: GameState, requested: number): Availability {
  if (!Number.isFinite(requested) || requested <= 0) return unavailable('amount', '납입 금액은 유한한 양수여야 합니다.');
  if (acceptedContribution(state, requested) >= MIN_TRADE_AMOUNT) return enabled;
  if (policyRules.annualContributionLimit - state.contributionTotal < MIN_TRADE_AMOUNT) return unavailable('contribution-limit', '연간 납입 가능 한도가 10만원 미만입니다.');
  return unavailable('cash', '납입할 생활자금 또는 선택 금액이 10만원 미만입니다.');
}
export function rebalanceConstraint(state: GameState): Availability {
  if (state.pendingOrders.length || state.rebalancePlan) return unavailable('orders-pending', '접수한 주문 정산 후 리밸런싱할 수 있습니다. 기존 주문은 보존됩니다.');
  return manualPortfolioValue(state) > 0 ? enabled : unavailable('no-assets', '리밸런싱할 직접 운용 자산과 대기자금이 없습니다.');
}
export function defaultTradeConstraint(state: GameState): Availability {
  if (!state.defaultTrading || state.rulesetVersion !== '2026-09-10-e') return unavailable('legacy', '이전 규칙으로 진행 중인 판입니다. 새 판에서 디폴트옵션 직접매매를 이용하세요.');
  const timing = actionTiming(state);
  if (!timing.enabled) return timing;
  const lock = tradeLock(state);
  if (!lock.enabled) return lock;
  return state.pendingOrders.some(o => o.defaultScope)
    ? unavailable('default-pending', '디폴트옵션 주문 처리 중입니다. 결제 후 다시 지시하세요.') : enabled;
}

export function defaultInConstraint(state: GameState, optionId: DefaultOptionId, amount: number): Availability {
  const common = defaultTradeConstraint(state);
  if (!common.enabled) return common;
  if (!allowedPortfolios(state.profileId).some(p => p.id === optionId)) return unavailable('suitability', '투자성향에 맞는 디폴트옵션을 선택하세요.');
  if (!Number.isFinite(amount) || !Number.isInteger(amount) || amount < MIN_TRADE_AMOUNT) return unavailable('amount', '매수 묶음은 10만원 이상, 원 단위로 입력하세요.');
  if (amount > state.irpCash) return unavailable('cash', '주문 가능한 IRP 대기자금이 부족합니다. 미결제 대금은 사용할 수 없습니다.');
  const scopes = defaultScopes(state);
  return scopes.length > 1 || scopes.some(s => s.optionId !== optionId)
    ? unavailable('default-choice', '보유 중인 옵션만 추가 매수할 수 있습니다. 다른 옵션은 전체 환매·결제 후 선택하세요.') : enabled;
}
export function defaultOutConstraint(state: GameState, fraction: number): Availability {
  const common = defaultTradeConstraint(state);
  if (!common.enabled) return common;
  if (fraction !== .5 && fraction !== 1) return unavailable('amount', '환매 비율은 50% 또는 100%를 선택하세요.');
  const scopes = defaultScopes(state), scope = scopes[0];
  return scopes.length === 1 && defaultPortfolio(scope.optionId).products.some(id => scopedHolding(state, id, scope).amount * fraction > .0000001)
    ? enabled : unavailable('no-default', '환매할 디폴트옵션 보유분이 없습니다.');
}
