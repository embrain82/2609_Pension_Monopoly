import { tdfEquity } from './scenario-engine';
import { investorProfiles, policyRules, products } from '../data/content';
import type { GameState, LifeEvent, ProductId, ProfileId } from '../types';
import { portfolioValue } from './portfolio-engine';

export function effectiveRiskRatio(productId: ProductId): number {
  const product = products.find((item) => item.id === productId);
  if (!product) throw new Error(`알 수 없는 상품: ${productId}`);
  return product.regulatoryRisk && !product.tdf_exception_eligible ? 1 : 0;
}

export function riskAssetValue(state: GameState): number {
  const holdingRisk = state.holdings.reduce((sum, holding) => sum + holding.amount * effectiveRiskRatio(holding.productId), 0);
  const pendingBuyRisk = state.pendingOrders
    .filter((order) => order.side === 'buy' || order.stage === 'received')
    .reduce((sum, order) => sum + order.amount * effectiveRiskRatio(order.productId), 0);
  return holdingRisk + pendingBuyRisk;
}

export function riskAssetRatio(state: GameState): number {
  const total = portfolioValue(state);
  return total <= 0 ? 0 : riskAssetValue(state) / total;
}

export function expectedRiskAfterBuy(state: GameState, productId: ProductId, amount: number): number {
  const total = portfolioValue(state);
  if (total <= 0) return 0;
  return (riskAssetValue(state) + amount * effectiveRiskRatio(productId)) / total;
}

export function canBuyRiskAsset(state: GameState, productId: ProductId, amount: number): { ok: boolean; ratio: number; reason: string } {
  const current = riskAssetRatio(state);
  const addedRisk = effectiveRiskRatio(productId);
  const ratio = expectedRiskAfterBuy(state, productId, amount);
  if (addedRisk > 0 && current > policyRules.riskAssetLimit) {
    return { ok: false, ratio, reason: '시장 상승으로 현재 위험비중이 한도를 넘었습니다. 예금·채권 매수나 리밸런싱이 먼저 필요합니다.' };
  }
  if (ratio > policyRules.riskAssetLimit + 0.00001) {
    if (ratio <= current + 0.00001) {
      return {
        ok: true,
        ratio,
        reason: `매수 후 예상 위험자산 비중 ${(ratio * 100).toFixed(1)}%. 시장 초과 상태는 유지되지만 비중을 더 키우지 않습니다.`
      };
    }
    return { ok: false, ratio, reason: `예상 위험자산 비중이 ${(ratio * 100).toFixed(1)}%로 교육용 한도 ${(policyRules.riskAssetLimit * 100).toFixed(0)}%를 넘습니다.` };
  }
  return { ok: true, ratio, reason: `매수 후 예상 위험자산 비중 ${(ratio * 100).toFixed(1)}%` };
}

export function canBuyForProfile(profileId: ProfileId, productId: ProductId): { ok: boolean; reason: string } {
  const profile = investorProfiles.find((item) => item.id === profileId);
  const product = products.find((item) => item.id === productId);
  if (!profile || !product) return { ok: false, reason: '성향 또는 상품을 찾을 수 없습니다.' };
  if (product.riskGrade >= profile.minRiskGrade) {
    return { ok: true, reason: `${profile.name} 성향은 ${profile.minRiskGrade}~6등급 범위에서 매수할 수 있습니다.` };
  }
  return {
    ok: false,
    reason: `${profile.name} 성향은 ${profile.minRiskGrade}~6등급 범위에서 매수할 수 있습니다. ${product.shortName}(${product.riskGrade}등급)은 교육용 적합성 확인에서 제한됩니다.`
  };
}

export type BuyLimitDecision =
  | { kind: 'execute'; amount: number }
  | {
    kind: 'confirm';
    requested: number;
    capped: number;
    leftover: number;
    fullRatio: number;
    cappedRatio: number;
    message: string;
  }
  | { kind: 'reject'; message: string; ratio?: number };

/** 대기자금 매수가 한도를 넘으면 70%까지 금액을 제안하고, 넘지 않으면 바로 실행한다. */
export function decideBuyAgainstRiskLimit(state: GameState, productId: ProductId, requested: number): BuyLimitDecision {
  const amount = Math.min(Math.floor(requested), Math.floor(state.irpCash));
  if (amount < 100000) return { kind: 'reject', message: 'IRP 대기자금이 부족합니다.' };
  const suitability = canBuyForProfile(state.profileId, productId);
  if (!suitability.ok) return { kind: 'reject', message: suitability.reason };
  const full = canBuyRiskAsset(state, productId, amount);
  if (full.ok) return { kind: 'execute', amount };
  const capped = maxBuyWithinRiskLimit(state, productId, amount);
  if (capped < 100000) return { kind: 'reject', message: full.reason, ratio: full.ratio };
  const leftover = amount - capped;
  return {
    kind: 'confirm',
    requested: amount,
    capped,
    leftover,
    fullRatio: full.ratio,
    cappedRatio: canBuyRiskAsset(state, productId, capped).ratio,
    message: `요청액은 위험비중 ${(full.ratio * 100).toFixed(1)}%로 교육용 한도 ${(policyRules.riskAssetLimit * 100).toFixed(0)}%를 넘습니다. 한도까지는 ${Math.round(capped).toLocaleString('ko-KR')}원입니다. 거기까지만 매수할까요?`
  };
}

/** 위험자산 한도를 넘지 않고 살 수 있는 최대 금액. 한도가 없거나 최소 단위 미만이면 0. */
export function maxBuyWithinRiskLimit(state: GameState, productId: ProductId, requested: number): number {
  const want = Math.floor(requested);
  if (want < 100000) return 0;
  if (canBuyRiskAsset(state, productId, want).ok) return want;

  const risk = effectiveRiskRatio(productId);
  if (risk <= 0) return 0;
  const room = policyRules.riskAssetLimit * portfolioValue(state) - riskAssetValue(state);
  if (room <= 0) return 0;

  let capped = Math.min(want, Math.floor(room / risk));
  if (capped >= 100000 && !canBuyRiskAsset(state, productId, capped).ok) {
    let lo = 0;
    let hi = capped;
    while (lo < hi) {
      const mid = Math.ceil((lo + hi) / 2);
      if (canBuyRiskAsset(state, productId, mid).ok) lo = mid;
      else hi = mid - 1;
    }
    capped = lo;
  }
  return capped < 100000 ? 0 : capped;
}

export function contributionCredit(currentContribution: number, amount: number): { eligible: number; benefit: number } {
  const availableContribution = Math.max(0, policyRules.annualContributionLimit - currentContribution);
  const accepted = Math.min(amount, availableContribution);
  const alreadyEligible = Math.min(currentContribution, policyRules.annualTaxCreditLimit);
  const eligible = Math.min(accepted, Math.max(0, policyRules.annualTaxCreditLimit - alreadyEligible));
  return { eligible, benefit: eligible * policyRules.taxCreditRate };
}

export function canWithdrawForEvent(event: LifeEvent): boolean {
  return event.eligibleWithdrawal;
}

/** 규제 한도와 별개인 가상 기초 주식 노출. 채권의 금리·신용 위험까지 요약하는 지표는 아니다. */
export function equityExposureRatio(state: GameState): number {
  const exposure = (id: ProductId) => id === 'tdf' && state.campaign ? tdfEquity(state.turn) : products.find(p => p.id === id)!.equityExposure;
  const held = state.holdings.reduce((sum, h) => sum + h.amount * exposure(h.productId), 0);
  const pending = state.pendingOrders.filter(o => o.side === 'sell' ? o.stage === 'received' : o.stage === 'priced')
    .reduce((sum, o) => sum + o.amount * exposure(o.productId), 0);
  const total = portfolioValue(state);
  return total > 0 ? (held + pending) / total : 0;
}
