import { marketExplanation } from '../engine/market-explanation';
import type { MarketStep, TurnSummary } from '../types';

/** 이미 공개된 같은 턴의 데이터만 연결한다. 과거 저장에 없는 금액을 역산하지 않는다. */
export function settlementMarketContext(summary: TurnSummary, market?: MarketStep) {
  const matched = market?.turn === summary.turn && [market.ratePct, market.rateDeltaPct, market.stockReturn].every(Number.isFinite);
  if (!matched || !market) return { headline: summary.marketHeadline, rate: null,
    explanation: '이전 저장에는 이 턴의 금리 비교 정보가 없습니다. 보유분 손익과 상품별 시장 예시는 기준이 다릅니다.' };
  const frozen = Math.abs(market.rateDeltaPct) < 1e-9;
  return {
    headline: marketExplanation(market).headline,
    rate: { before: market.ratePct - market.rateDeltaPct, after: market.ratePct, delta: market.rateDeltaPct, stock: market.stockReturn },
    explanation: frozen
      ? '금리는 동결됐습니다. 아래 보유분 손익에는 이자·주가·보수 등도 함께 반영됩니다.'
      : `다른 조건이 같다면 금리 ${market.rateDeltaPct > 0 ? '상승은 기존 채권 가격에 하락' : '하락은 기존 채권 가격에 상승'} 요인입니다. 아래 손익에는 주가·보수 등도 함께 반영됩니다.`
  };
}
