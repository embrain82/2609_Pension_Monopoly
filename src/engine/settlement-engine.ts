import { marketExplanation } from './market-explanation';
import { products } from '../data/content';
import type { GameState, ProductId, TurnSummary } from '../types';
import { portfolioValue } from './portfolio-engine';
import { riskAssetRatio } from './policy-engine';

export const HINT_OVER_LIMIT = '위험자산 추가 매수는 막힙니다. 예금·채권으로 대기자금을 옮기거나 리밸런싱하세요.';
export const HINT_PENDING_FUND = '펀드는 접수 → 다음 턴 가격 확정 → 그다음 턴 결제입니다(게임 시간).';
export const HINT_NEAR_LIMIT = '위험한도에 가깝습니다. 가능액 매수 전에 미리보기를 보세요.';
export const HINT_DEFAULT = '다음 턴 시장을 보고 납입·매매·그대로 중 하나를 고르세요.';

export const REACTION_LONG_BOND_DROP = '시장 예시에서 장기채가 크게 하락했습니다. 내 보유분의 실제 영향과 구분해 보세요.';
export const REACTION_EQUITY_DROP = '시장 예시에서 주식이 크게 하락했습니다. 반등 시점은 알 수 없으니 생활자금과 위험비중을 점검하세요.';
export const REACTION_EQUITY_RALLY = '시장 예시에서 주식이 크게 올랐습니다. 보유 중이라면 현재 위험비중을 확인하세요.';
export const REACTION_LONG_BOND_RALLY = '시장 예시에서 장기채가 크게 올랐습니다. 실제 보유분과 다음 턴의 불확실성을 함께 확인하세요.';
export const REACTION_CONTRIBUTE = '납입으로 IRP 자금이 늘었습니다. 투자 수익과 구분하고 생활자금 여유도 확인하세요.';
export const REACTION_DRAWDOWN = '이번 시장에서 내 평가액이 줄었습니다. 다음 턴 방향을 단정하지 말고 생활자금과 분산을 점검하세요.';
export const REACTION_DEFAULT = '이번 시장의 변화는 이미 반영됐습니다. 다음 턴 방향을 단정하지 말고 내 구성과 생활자금을 점검하세요.';

export function reactionLine(before: GameState, after: GameState, actionLine: string): string {
  const returns = after.lastMarket.returns;
  const shock = Boolean(after.lastMarket.shock);
  if (shock && returns.longBond <= -0.05) return REACTION_LONG_BOND_DROP;
  if (shock && returns.equityEtf <= -0.06) return REACTION_EQUITY_DROP;
  if (returns.equityEtf >= 0.05) return REACTION_EQUITY_RALLY;
  if (returns.longBond >= 0.04) return REACTION_LONG_BOND_RALLY;
  if (actionLine.includes('추가납입')) return REACTION_CONTRIBUTE;
  // 인출·납입으로 생긴 잔액 변화가 아닌, 시장 구간의 실제 영향만 읽는다.
  const effects = after.ledger.marketEffects;
  const marketDelta = effects ? effects.reduce((sum, e) => sum + e.delta, 0) : before.ledger.afterMarket - before.ledger.open;
  const irpOpen = before.ledger?.open ?? portfolioValue(before);
  if (irpOpen > 0 && marketDelta / irpOpen <= -0.02) return REACTION_DRAWDOWN;
  return REACTION_DEFAULT;
}

function holdingAmount(state: GameState, productId: ProductId): number {
  return state.holdings.find((holding) => holding.productId === productId)?.amount ?? 0;
}

export function holdingsMap(state: GameState): Record<ProductId, number> {
  return Object.fromEntries(products.map((product) => [product.id, holdingAmount(state, product.id)])) as Record<ProductId, number>;
}

function nextHints(after: GameState, riskAfter: number): string[] {
  const hints: string[] = [];
  if (after.lastMarket.alert) hints.push(after.lastMarket.alert.hint);
  if (after.marketLimitExceeded) hints.push(HINT_OVER_LIMIT);
  if (after.pendingOrders.length > 0) hints.push(HINT_PENDING_FUND);
  if (riskAfter > 0.62 && !after.marketLimitExceeded) hints.push(HINT_NEAR_LIMIT);
  if (hints.length === 0) hints.push(HINT_DEFAULT);
  return hints.slice(0, 2);
}

/**
 * 턴 정산 요약. `before`는 마지막 행동 직전 상태(행동 2회 칸이면 두 번째 행동 직전)이고, 첫 행동 직전
 * 스냅샷은 `before.ledger.beforeAction`에 있다. 시장은 턴 시작에 이미 반영됐으므로 "시장이 한 일"은
 * 장부의 open→afterMarket, "내가 한 일"은 첫 행동 직전→after다.
 */
export function summarizeTurn(before: GameState, after: GameState, actionLine: string): TurnSummary {
  const ledger = before.ledger ?? { open: portfolioValue(before), afterMarket: portfolioValue(before), beforeAction: null };
  const snapshot = ledger.beforeAction ?? { irp: portfolioValue(before), risk: riskAssetRatio(before), holdings: holdingsMap(before) };
  const productDeltas = products
    .map((product) => ({
      productId: product.id,
      name: product.shortName,
      delta: holdingAmount(after, product.id) - snapshot.holdings[product.id]
    }))
    .filter((item) => Math.abs(item.delta) >= 1000)
    .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta))
    .slice(0, 4);
  const riskAfter = riskAssetRatio(after);
  const irpAfter = portfolioValue(after);
  const capitalFlow = after.cashFlows.filter(flow => flow.turn === before.turn).reduce((sum, flow) => sum + flow.amount, 0);
  const holdingShares = Object.fromEntries(products.map((product) => [
    product.id,
    irpAfter > 0 ? holdingAmount(after, product.id) / irpAfter : 0
  ])) as Record<ProductId, number>;
  const productReturns = { ...after.lastMarket.returns };
  const marketEffects = ledger.marketEffects;
  const biggestMover = marketEffects?.length
    ? [...marketEffects].sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta))[0].productId : null;
  const actionLines = after.turnActionLines?.length ? after.turnActionLines : [actionLine];
  return {
    turn: before.turn,
    actionLine,
    actionLines,
    irpOpen: ledger.open,
    irpAfterMarket: ledger.afterMarket,
    irpBefore: snapshot.irp,
    irpAfter,
    marketDelta: ledger.afterMarket - ledger.open,
    lifeDelta: snapshot.irp - ledger.afterMarket,
    actionDelta: irpAfter - snapshot.irp,
    capitalFlow,
    tradingDelta: irpAfter - ledger.afterMarket - capitalFlow,
    benchmarkIrp: after.campaign?.benchmark ?? null,
    ...(marketEffects ? { marketEffects } : {}),
    riskBefore: snapshot.risk,
    riskAfter,
    tileEffects: before.tileEffects ?? [],
    ghostIrp: after.ghost?.irpHistory[after.turn] ?? null,
    lifeEvent: before.lifeResolution ?? null,
    milestones: after.turnMilestones ?? [],
    marketHeadline: marketExplanation(after.lastMarket).headline,
    shock: Boolean(after.lastMarket.shock),
    alert: after.lastMarket.alert,
    marketLimitExceeded: after.marketLimitExceeded,
    productDeltas,
    nextHints: nextHints(after, riskAfter),
    productReturns,
    holdingShares,
    biggestMover,
    reaction: reactionLine(before, after, actionLine)
  };
}
