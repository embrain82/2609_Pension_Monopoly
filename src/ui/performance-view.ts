import type { GameState, TurnSummary } from '../types';
import { portfolioValue } from '../engine/portfolio-engine';

const won = (n: number) => `${Math.round(n).toLocaleString('ko-KR')}원`;
const signed = (n: number) => `${n > 0 ? '+' : ''}${won(n)}`;
export const BENCHMARK_NOTE = '초기 상품 비중을 매 턴 복원하고 같은 입출금을 턴 말 반영하는 가상 비교입니다. 실제 예금 약정·거래비용·결제 대기는 재현하지 않습니다.';

export function renderBenchmarkSettleLine(summary: Pick<TurnSummary, 'irpAfter' | 'benchmarkIrp'>): string {
  if (summary.benchmarkIrp == null) return '';
  const gap = summary.irpAfter - summary.benchmarkIrp;
  return `<div class="preview-box benchmark-summary"><strong>같은 입출금으로 비교</strong>
    <p>내 IRP ${won(summary.irpAfter)} · 기준 지수 ${won(summary.benchmarkIrp)}<br>기준 지수와 차이 <b class="${gap < 0 ? 'neg' : 'pos'}">${signed(gap)}</b></p>
    <small>${BENCHMARK_NOTE}</small></div>`;
}

export function renderBenchmarkResult(state: GameState): string {
  if (!state.campaign) return '';
  return renderBenchmarkSettleLine({ irpAfter: portfolioValue(state), benchmarkIrp: state.campaign.benchmark });
}
