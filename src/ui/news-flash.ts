import { explainMarketStep } from '../engine/market-explanation';
import { renderMarketImpacts } from './market-impact-view';
import { balanceConfig, marketShocks, products } from '../data/content';
import { formatRateDelta } from '../engine/market-engine';
import type { BoardTile, MarketStep, TileEffect, TurnLedger } from '../types';
import { renderMarketAlert, signedPercent } from './market-view';
import { renderSpeech } from './speech';
import { renderTileEffects } from './tile-effects-view';
import type { ScenePace } from './fx';

const DIAL_SWEEP_DEG = 120;

export const COACH_MARKET_FIRST = '뉴스를 본 순간 가격은 이미 움직였어요. 투자상품 수익률은 턴 시작에 보유분에 들어갔고, 지금 고르는 행동은 다음 턴 흐름에 거는 거예요.';

export interface NewsFlashOptions {
  characters: boolean;
  /** 턴 시작 → 시장 반영 IRP. 있으면 "내 IRP에 반영" 줄을 그린다 */
  ledger?: Pick<TurnLedger, 'open' | 'afterMarket' | 'marketEffects'>;
  /** 이번 턴 도착·통과 칸 효과(최대 2개) */
  tileEffects?: TileEffect[];
  /** 1턴에만 나오는 코치 말풍선 */
  coach?: boolean;
  /** 후반 가속. fast면 헤드라인 타이핑·다이얼·화살표 연출이 절반 길이 */
  pace?: ScenePace;
}

const formatWon = (value: number) => `${Math.round(value).toLocaleString('ko-KR')}원`;
const signedWon = (value: number) => `${value > 0 ? '+' : ''}${formatWon(value)}`;

export function dialAngle(ratePct: number, minPct: number, maxPct: number): number {
  if (maxPct <= minPct) return 0;
  const ratio = Math.min(1, Math.max(0, (ratePct - minPct) / (maxPct - minPct)));
  return Math.round((ratio * 2 - 1) * DIAL_SWEEP_DEG * 100) / 100;
}

function arrowMagnitude(value: number): number {
  return Math.min(1, Math.abs(value) / 0.1);
}

/** 속보 화살표 아래 "내 IRP에 반영 +N원(+x%)" 한 줄. 시장이 먼저 움직였다는 사실을 금액으로 보인다. */
export function renderIrpApplied(ledger: { open: number; afterMarket: number }): string {
  const delta = ledger.afterMarket - ledger.open;
  const rate = ledger.open > 0 ? delta / ledger.open : 0;
  const tone = delta < 0 ? 'neg' : delta > 0 ? 'pos' : 'flat';
  return `<p class="news-irp ${tone}"><span>내 IRP에 반영</span><b>${signedWon(delta)}</b><small>(${signedPercent(rate)})</small><em>이미 잔고에 들어갔어요 · 지금 행동은 다음 턴에 걸립니다</em></p>`;
}

export function renderNewsFlash(step: MarketStep, prev: MarketStep, tile: BoardTile, options: NewsFlashOptions = { characters: true }): string {
  step = explainMarketStep(step);
  const market = balanceConfig.market;
  const shock = step.shockId ? marketShocks.find((item) => item.id === step.shockId) : undefined;
  const live = tile.kind === 'market' ? '<span class="news-live">현장 연결</span>' : '';
  const reason = renderSpeech('anchor', `<p class="news-reason">${step.reason}</p>`, {
    characters: options.characters,
    tone: step.shock ? (shock?.positive ? 'positive' : 'shock') : 'default'
  });
  const classes = ['news-flash', step.shock ? 'shock' : '', shock?.positive ? 'positive' : '', options.pace === 'fast' ? 'fast' : ''].filter(Boolean).join(' ');
  const from = dialAngle(prev.turn === step.turn - 1 && prev.turn > 0 ? prev.ratePct : step.ratePct - step.rateDeltaPct, market.rateMinPct, market.rateMaxPct);
  const to = dialAngle(step.ratePct, market.rateMinPct, market.rateMaxPct);
  const arrows = products.map((product, index) => {
    const value = step.returns[product.id];
    const direction = value > 0.0005 ? 'up' : value < -0.0005 ? 'down' : 'flat';
    return `<li class="news-arrow ${direction}" style="--i:${index};--mag:${arrowMagnitude(value).toFixed(2)}"><span>${product.id === 'deposit' ? '예금 예시' : product.shortName}</span><i aria-hidden="true"></i><b>${signedPercent(value)}</b></li>`;
  }).join('');
  const applied = options.ledger ? renderIrpApplied(options.ledger) : '';
  const coach = options.coach
    ? renderSpeech('coach', `<p>${COACH_MARKET_FIRST}</p>`, { characters: options.characters, title: '코치 · 첫 턴 한마디' })
    : '';
  const effects = renderTileEffects(options.tileEffects ?? [], { compact: true });
  return `<div class="${classes}">
    <div class="news-tape"><span class="news-badge">${step.shock ? '속보 · 충격' : '속보'}</span><span>TURN ${String(step.turn).padStart(2, '0')}</span><span class="news-phase">${step.phase}</span>${live}</div>
    <h2 class="news-headline">${step.headline}</h2>
    <div class="news-dial" style="--from:${from}deg;--to:${to}deg" role="img" aria-label="교육용 가상 금리 ${step.ratePct.toFixed(2)}%, 변화 ${formatRateDelta(step.rateDeltaPct)}">
      <svg viewBox="0 0 200 120" aria-hidden="true">
        <path class="dial-track" d="M20 110 A80 80 0 0 1 180 110"></path>
        <g class="dial-needle"><line x1="100" y1="110" x2="100" y2="38"></line><circle cx="100" cy="110" r="6"></circle></g>
      </svg>
      <p><small>교육용 가상 금리</small><b>${step.ratePct.toFixed(2)}%</b><em>${formatRateDelta(step.rateDeltaPct)}</em></p>
    </div>
    ${applied}
    ${renderMarketImpacts(options.ledger?.marketEffects, step.turn)}
    <p class="market-note">상품별 시장 예시 · 보수 전 · 내 보유분 수익과 다름</p><ul class="news-arrows">${arrows}</ul>
    ${reason}<p class="hint">예금은 가입 건별 약정·만기를 따릅니다. 펀드·TDF는 원금 손실이 가능합니다. 실제 보유분은 위의 원화 영향으로 확인하세요.</p>
    ${coach}
    ${renderMarketAlert(step)}
    <p class="news-arrival">도착 · ${String(tile.index + 1).padStart(2, '0')} ${tile.label}</p>
    ${effects}
    <div class="button-stack compact">
      <button class="primary jumbo" data-action="dismiss-news">계속</button>
      <button class="text-button" data-action="open-tile">칸 설명 보기</button>
    </div>
  </div>`;
}
