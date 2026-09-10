import { scopedHolding } from '../engine/position-engine';
import { products } from '../data/content';
import type { GameState, ProductId } from '../types';

/** 매도·교체의 최소 거래 단위. 엔진(portfolio-engine)이 "잔고 부족"으로 거절하는 기준과 같다. */
export const MIN_TRADE_AMOUNT = 100_000;

type Holdings = Pick<GameState, 'holdings'>;

/** 최소 거래 단위 이상 들고 있는 상품을 상품 목록 순서대로 돌려준다. 매도·교체 '기존 상품' 셀렉트의 항목과 같다. */
export function heldProductIds(state: Holdings): ProductId[] {
  return products
    .filter((product) => scopedHolding(state,product.id).amount >= MIN_TRADE_AMOUNT)
    .map((product) => product.id);
}

/**
 * 매도·교체 '기존 상품' 선택값을 실제 보유 상품에 맞춘다.
 * 전액 매도·교체·중도인출 뒤에도 선택값이 옛 상품에 남아 있으면, 셀렉트는 첫 보유 상품을 보여주는데
 * 금액은 옛 상품(잔고 0) 기준으로 계산되어 "0원 매도/교체"가 되는 문제를 막는다.
 */
export function pickHeldProduct(state: Holdings, preferred: ProductId): ProductId {
  const held = heldProductIds(state);
  if (held.includes(preferred)) return preferred;
  return held[0] ?? preferred;
}

/** 매도·교체 실행 버튼을 막아야 하면 그 이유를, 실행 가능하면 null을 돌려준다. */
export function tradeBlockReason(state: Holdings, kind: 'sell' | 'switch', amount: number): string | null {
  const verb = kind === 'sell' ? '매도' : '교체';
  if (heldProductIds(state).length === 0) {
    return `${verb}할 보유 상품이 없습니다. 대기자금은 매수로, 생활자금은 납입으로 움직일 수 있습니다.`;
  }
  if (amount < MIN_TRADE_AMOUNT) {
    return `${verb}는 10만원부터 가능합니다. 금액 버튼을 바꾸거나 다른 상품을 고르세요.`;
  }
  return null;
}
