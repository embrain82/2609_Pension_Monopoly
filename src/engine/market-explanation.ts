import type { MarketStep } from '../types';

const direction = (value: number) => value > 1e-9 ? '상승' : value < -1e-9 ? '하락' : '보합';
const percent = (value: number) => `${value > 0 ? '+' : ''}${(value * 100).toFixed(1)}%`;

/** 공개된 이번 턴의 숫자만 해석한다. 시드·난수·미래 경로를 읽거나 변경하지 않는다. */
export function marketExplanation(step: MarketStep): Pick<MarketStep, 'headline' | 'signal' | 'reason' | 'phase'> {
  if (step.turn === 0) return { headline: step.headline, signal: step.signal, reason: step.reason, phase: step.phase };
  const frozen = Math.abs(step.rateDeltaPct) < 1e-9;
  const rate = frozen ? '동결' : step.rateDeltaPct > 0 ? '상승' : '하락';
  const rateText = frozen ? '변화 없음' : `${step.rateDeltaPct > 0 ? '+' : ''}${step.rateDeltaPct.toFixed(2)}%p`;
  const principle = frozen
    ? '이번 턴 가상 금리는 바뀌지 않았습니다. 채권·주식 수익에는 이자와 다른 시장 요인도 반영됩니다.'
    : `다른 조건이 같다면 금리 ${rate}은 기존 채권 가격에 ${step.rateDeltaPct > 0 ? '하락' : '상승'} 요인입니다. 만기가 긴 채권은 더 민감할 수 있지만 실제 수익은 다른 요인도 함께 반영합니다.`;
  // 상·하한에 막힌 충격을 실제 금리 인상/인하가 발생한 것으로 부르지 않는다.
  const phase = frozen && ['rate-bigstep', 'emergency-cut'].includes(step.shockId ?? '') ? '금리 충격 시나리오' : step.phase;
  return {
    phase,
    headline: `가상 금리 ${rate} · 주가 ${direction(step.stockReturn)}`,
    signal: `금리 ${step.ratePct.toFixed(2)}% (${rateText}) · 주가 ${percent(step.stockReturn)}`,
    reason: `${principle} 다음 턴 방향은 확정되지 않았습니다.`
  };
}

/** 구 저장의 고정 국면 문구도 현재 숫자로 표시하되 금융 필드는 그대로 둔다. */
export function explainMarketStep(step: MarketStep): MarketStep {
  return { ...step, ...marketExplanation(step) };
}
