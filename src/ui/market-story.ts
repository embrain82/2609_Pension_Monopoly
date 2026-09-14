import { explainMarketStep } from '../engine/market-explanation';
import { formatRateDelta } from '../engine/market-engine';
import type { MarketStep, TurnLedger } from '../types';
import { formatWon } from './format';
import { signedPercent } from './market-view';
import { renderMarketImpacts } from './market-impact-view';
import { renderSpeech } from './speech';

export type MarketStoryLedger = Pick<TurnLedger, 'open' | 'afterMarket' | 'marketEffects'>;

/** 시장 구간의 기록만 표시한다. 현재 잔액·납입액으로 과거 손익을 역산하지 않는다. */
export function renderIrpApplied(ledger: { open: number; afterMarket: number }, final = false): string {
  const delta = ledger.afterMarket - ledger.open;
  const rate = ledger.open > 0 ? delta / ledger.open : 0;
  const tone = delta < 0 ? 'neg' : delta > 0 ? 'pos' : 'flat';
  return `<p class="news-irp ${tone}"><span>내 IRP에 반영 · 시장 손익</span><b>${delta > 0 ? '+' : ''}${formatWon(delta)}</b><small>(${signedPercent(rate)})</small><em>이미 잔고에 들어갔어요 · ${final ? '마지막 주문은 추가 시장 없이 최종 정산합니다' : '지금 행동은 다음 턴에 걸립니다'}</em></p>`;
}

/** 04-3: 공개된 같은 턴의 금리 → 원리 → 보유 손익. 금융 상태는 변경하지 않는다. */
export function renderMarketStory(raw: MarketStep, ledger?: MarketStoryLedger, characters = false): string {
  const step = explainMarketStep(raw);
  const delta = Math.abs(step.rateDeltaPct) < 1e-9 ? '0.00' : formatRateDelta(step.rateDeltaPct);
  const direction = step.rateDeltaPct > 1e-9 ? '인상' : step.rateDeltaPct < -1e-9 ? '인하' : '동결';
  return `<div class="market-story" aria-label="시장 변화의 원인과 내 보유분 영향">
    <section class="market-story-step market-story-rate"><h3><span aria-hidden="true">01</span> 이번 턴 시장 변화</h3>
      <div class="story-market-grid"><div><span class="story-label">가상 시장금리</span><div class="story-rate-values"><span>${(step.ratePct-step.rateDeltaPct).toFixed(2)}%</span><span aria-label="에서">→</span><strong>${step.ratePct.toFixed(2)}%</strong></div><span class="story-rate-delta">${direction} · ${delta}%p</span></div><div class="story-stock"><span class="story-label">이번 턴 주가</span><strong class="${step.stockReturn<0?'neg':'pos'}">${signedPercent(step.stockReturn)}</strong><small>시장 지수 변화</small></div></div>
    </section>
    <section class="market-story-step market-story-reason"><h3><span aria-hidden="true">02</span> 왜 영향을 받나요?</h3>${renderSpeech('anchor',`<p class="news-reason">${step.reason}</p>`,{characters})}</section>
    <section class="market-story-step market-story-holdings"><h3><span aria-hidden="true">03</span> 내 보유분에 반영</h3>${ledger ? renderIrpApplied(ledger,step.turn===12) : '<p class="hint">이전 저장에는 이 턴의 시장 손익 합계가 없습니다.</p>'}${renderMarketImpacts(ledger?.marketEffects,step.turn,false,true)}<p class="story-basis">시장 구간만 비교합니다. 추가납입·매매 결과는 포함하지 않습니다.</p></section>
  </div>`;
}
