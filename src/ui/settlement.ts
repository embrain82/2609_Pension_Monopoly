import { formatWon } from './format';
import { marketExplanation } from '../engine/market-explanation';
import { renderMarketImpacts } from './market-impact-view';
import { products } from '../data/content';
import type { MarketStep, Milestone, TurnSummary } from '../types';
import { renderGhostSettleLine } from './ghost';
import { renderLifeSettleBlock } from './life-view';
import { percent, signedPercent } from './market-view';
import { renderSpeech } from './speech';
import { renderTileEffects } from './tile-effects-view';
import type { ScenePace } from './fx';
import { renderBenchmarkSettleLine } from './performance-view';

export interface SettlementOptions {
  optionalLearning?: boolean;
  /** 구 저장 정산의 헤드라인도 이미 공개된 숫자로 복원한다. */
  market?: MarketStep;
  characters: boolean;
  /** 설정 "그대로 둔 나" 비교. 끄면 고스트 줄을 숨긴다 */
  ghost?: boolean;
  /** 동작 줄이기. 켜면 100% 컨페티·자동 진행 막대를 그리지 않는다 */
  reducedMotion?: boolean;
  /** 12턴째 정산. 다음 턴이 없으니 버튼이 마무리(퀴즈·수령 방식)로 이어진다 */
  final?: boolean;
  /** 「자세히」(상품별·내가 한 일·칸 효과·다음 판단) 펼침 상태. 저장이 기억한다 */
  expanded?: boolean;
  /** 자동 진행이 예약됐으면 그 길이(ms). 버튼 문구와 진행 막대에 쓴다 */
  autoSettleMs?: number | null;
  /** 후반 가속. fast면 막대·상품별 연출이 절반 길이 */
  pace?: ScenePace;
}

/** 정산 자동 진행 대기 시간 */
export const AUTO_SETTLE_MS = 2500;
/** 다음 턴 버튼 문구. 자동 진행이 취소되면 app이 이 문구로 되돌린다 */
export const SETTLE_CTA_NEXT = '다음 턴 준비';
export const SETTLE_CTA_AUTO = '다음 턴 준비 · 자동 진행';
export const SETTLE_CTA_FINAL = '마무리로 · 퀴즈와 수령 방식';

/**
 * 자동 진행이 허용되는 턴인가. 마지막 턴(마무리로 이어짐)·충격·이정표·생활사건 턴은 읽어야 할 것이 있어
 * 손으로 넘긴다.
 */
export function canAutoSettle(summary: TurnSummary, final: boolean): boolean {
  return !final && !summary.shock && (summary.milestones ?? []).length === 0 && !summary.lifeEvent;
}

/** 이정표 배너. 목표 100%는 컨페티(동작 줄이기면 없음), 낙폭 경고는 다른 색 */
export function renderMilestoneBanner(milestone: Milestone, reducedMotion = false): string {
  const confetti = milestone.id === 'goal-100' && !reducedMotion
    ? `<div class="confetti" aria-hidden="true">${Array.from({ length: 14 }, (_, index) => `<i style="--i:${index}"></i>`).join('')}</div>`
    : '';
  return `<div class="milestone-banner ${milestone.tone} ${milestone.id}" role="status">${confetti}<span class="milestone-mark" aria-hidden="true">${milestone.tone === 'cheer' ? '★' : '!'}</span><div><strong>${milestone.title}</strong><p>${milestone.detail}</p></div></div>`;
}

const signedWon = (value: number) => `${value > 0 ? '+' : ''}${formatWon(value)}`;
const RETURN_BAR_CAP = 0.15;

const tone = (delta: number) => (delta < 0 ? 'neg' : delta > 0 ? 'pos' : '');

/**
 * 막대 3개: 턴 시작 → 시장 반영 → 내 행동 후. 시장 예시와 내 보유분과 내가 한 일을 금액으로 나눠 보인다.
 * 생활사건이 IRP를 건드렸으면(중도인출·매도 충당) 그 줄도 덧붙인다.
 */
function irpBars(summary: TurnSummary): string {
  const max = Math.max(summary.irpOpen, summary.irpAfterMarket, summary.irpAfter, 1);
  const width = (value: number) => ((value / max) * 100).toFixed(1);
  const total = summary.irpAfter - summary.irpOpen;
  const rate = summary.irpOpen > 0 ? total / summary.irpOpen : 0;
  const flows = summary.capitalFlow !== undefined && summary.tradingDelta !== undefined
    ? `<span class="action ${tone(summary.capitalFlow)}">외부 입출금 ${signedWon(summary.capitalFlow)}</span> · <span class="${tone(summary.tradingDelta)}">매매·정산 ${signedWon(summary.tradingDelta)}</span>`
    : `<span>시장 이후 변화 ${signedWon(summary.irpAfter - summary.irpAfterMarket)} (입출금·거래 포함)</span>`;
  return `<div class="settle-bars three">
      <strong>정산 요약</strong>
      <div class="settle-bar open"><span>턴 시작</span><i style="--w:${width(summary.irpOpen)}%"></i><b>${formatWon(summary.irpOpen)}</b></div>
      <div class="settle-bar market ${tone(summary.marketDelta)}"><span>시장 반영</span><i style="--w:${width(summary.irpAfterMarket)}%"></i><b>${formatWon(summary.irpAfterMarket)}</b></div>
      <div class="settle-bar after ${tone(total)}"><span>정산 후</span><i style="--w:${width(summary.irpAfter)}%"></i><b>${formatWon(summary.irpAfter)}</b></div>
      <p class="settle-delta ${tone(total)}"><small>IRP 잔액 변화</small> ${signedWon(total)} <small>(${signedPercent(rate)})</small></p>
      <p class="settle-split"><span class="market ${tone(summary.marketDelta)}">시장 손익 ${signedWon(summary.marketDelta)}</span> · ${flows}</p>
    </div>`;
}

function returnBars(summary: TurnSummary): string {
  const rows = products.map((product, index) => {
    const value = summary.productReturns[product.id] ?? 0;
    const width = (Math.min(Math.abs(value), RETURN_BAR_CAP) / RETURN_BAR_CAP) * 50;
    const side = value < 0 ? 'down' : value > 0 ? 'up' : 'flat';
    const held = (summary.holdingShares[product.id] ?? 0) > 0;
    const classes = ['settle-return', side, held ? 'held' : ''].filter(Boolean).join(' ');
    return `<li class="${classes}" style="--i:${index}"><span>${product.shortName}</span><div class="track"><i style="--w:${width.toFixed(1)}%"></i></div><b>${signedPercent(value)}</b><small>${held ? percent(summary.holdingShares[product.id]) : '—'}</small></li>`;
  }).join('');
  return `<ul class="settle-returns">${rows}</ul>`;
}

function actionBlock(summary: TurnSummary): string {
  const lines = summary.actionLines.length > 1
    ? `<ol class="settle-actions">${summary.actionLines.map((line) => `<li>${line}</li>`).join('')}</ol>`
    : `<p>${summary.actionLine}</p>`;
  const moves = summary.productDeltas.length
    ? `<ul class="settle-moves">${summary.productDeltas.map((item) => `<li>${item.name} <strong class="${item.delta < 0 ? 'neg' : ''}">${signedWon(item.delta)}</strong></li>`).join('')}</ul>`
    : '<p>보유 구성은 크게 변하지 않았습니다.</p>';
  return `<div class="preview-box settle-mine"><strong>내가 한 일${summary.actionLines.length > 1 ? ` · 행동 ${summary.actionLines.length}회` : ''}</strong>${lines}
      <p>위험비중 ${percent(summary.riskBefore)} → ${percent(summary.riskAfter)}</p>
      ${moves}
    </div>`;
}

export function renderSettlementModal(summary: TurnSummary, options: SettlementOptions = { characters: true }): string {
  const shock = summary.shock ? '<span class="settle-shock">충격</span>' : '';
  const alert = summary.alert
    ? `<div class="preview-box settle-alert level-${summary.alert.level}"><strong>다음 턴 신호</strong><p>${summary.alert.text}</p></div>`
    : '';
  const ghost = options.ghost === false ? '' : renderGhostSettleLine(summary);
  const milestones = (summary.milestones ?? []).map((milestone) => renderMilestoneBanner(milestone, options.reducedMotion)).join('');
  const cheer = (summary.milestones ?? []).find((milestone) => milestone.tone === 'cheer');
  const reactionTone = cheer ? 'positive' : summary.shock ? 'shock' : 'default';
  const auto = options.autoSettleMs ?? null;
  const cta = options.final ? (options.optionalLearning ? '수령 방식 비교로' : SETTLE_CTA_FINAL) : auto ? SETTLE_CTA_AUTO : SETTLE_CTA_NEXT;
  const autoBar = auto && !options.reducedMotion ? `<i class="auto-bar" style="--ms:${auto}ms" aria-hidden="true"></i>` : '';
  const hints = options.final
    ? [options.optionalLearning ? '12턴이 끝났습니다. 이 화면의 관련 문제는 선택 학습입니다. 수령 방식 비교로 넘어가 연금 또는 일시금을 고르면 결과가 열립니다.' : '12턴이 끝났습니다. 배운 카드에서 마무리 퀴즈(최대 3문항)를 풀고, 연금과 일시금 중 수령 방식을 정하면 결과 리포트가 열립니다.']
    : summary.nextHints;
  const hintsBlock = renderSpeech('coach', `<ul class="settle-hints">${hints.map((hint) => `<li>${hint}</li>`).join('')}</ul>`, { characters: options.characters, title: options.final ? '남은 일' : '다음 판단' });
  const details = `<details class="settle-more"${options.expanded ? ' open' : ''}>
      <summary><span>자세히</span><small>상품별 수익률 · 내가 한 일${summary.tileEffects.length ? ' · 칸 효과' : ''}${options.final ? '' : ' · 다음 판단'}</small></summary>
      <div class="preview-box settle-market"><strong>시장 예시와 내 보유분 · 상품별 이번 턴</strong><p class="settle-note">상품별 시장 예시(보수 전)입니다. 오른쪽은 정산 후 비중이며 위의 실제 영향과 기준이 다릅니다.</p>${returnBars(summary)}</div>
      ${actionBlock(summary)}
      ${renderTileEffects(summary.tileEffects, { heading: '칸 효과' })}
      ${options.final ? '' : hintsBlock}
    </details>`;
  return `<div class="settle-scene${options.pace === 'fast' ? ' fast' : ''}">
    <p class="eyebrow">${summary.turn}턴 정산${shock}${options.final ? '<span class="settle-final">마지막 턴</span>' : ''}</p>
    <h2>무엇이 바뀌었나요?</h2>
    <p class="settle-headline">${options.market?.turn === summary.turn ? marketExplanation(options.market).headline : summary.marketHeadline}</p>
    ${milestones}
    ${irpBars(summary)}
    ${renderMarketImpacts(summary.marketEffects, summary.turn)}
    ${renderBenchmarkSettleLine(summary)}
    ${ghost ? `<details class="settle-comparison"><summary>생활 선택까지 다른 고스트 경로 비교</summary>${ghost}</details>` : ''}
    ${renderLifeSettleBlock(summary.lifeEvent)}
    ${alert}
    <div class="settle-reaction">${renderSpeech('coach', `<p>${options.final ? '마지막 시장과 주문 정산이 끝났습니다. 최종 자금과 수령 방식의 차이를 비교해 보세요.' : summary.marketEffects !== undefined ? summary.reaction : '이번 시장의 변화와 내 보유분 수익을 구분해 확인하세요. 다음 턴 방향은 확정되지 않았습니다.'}</p>`, { characters: options.characters, title: '한 줄 정리', tone: reactionTone })}</div>
    ${options.final ? hintsBlock : ''}
    <div class="settle-cta${auto ? ' auto' : ''}"><button class="primary jumbo" data-action="dismiss-settle">${cta}</button>${autoBar}</div>
    ${details}
  </div>`;
}
