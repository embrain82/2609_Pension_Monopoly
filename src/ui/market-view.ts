import { explainMarketStep } from '../engine/market-explanation';
import { renderMarketImpacts } from './market-impact-view';
import { balanceConfig, products } from '../data/content';
import { formatRateDelta } from '../engine/market-engine';
import { isUrgent } from '../engine/milestones';
import type { GameState, MarketStep } from '../types';
import { isCompletedTurn, isRevealedTurn, isUpcomingSpoiler } from './dice';

export function percent(value: number): string {
  return `${(value * 100).toFixed(1)}%`;
}

export function signedPercent(value: number): string {
  return `${value > 0 ? '+' : ''}${(value * 100).toFixed(1)}%`;
}

export function renderProductReturns(state: GameState): string {
  const rows = products.map((product) => {
    const ret = state.lastMarket.returns[product.id] ?? 0;
    return `<li class="${ret < 0 ? 'down' : ret > 0 ? 'up' : ''}"><span>${product.shortName}</span><b>${signedPercent(ret)}</b><small>시장 예시</small></li>`;
  }).join('');
  return `<p class="market-note">상품별 시장 예시 · 보수 전 · 실제 보유분 수익과 다름</p><ul class="product-returns">${rows}</ul>`;
}

function deltaClass(value: number): string {
  return value > 1e-9 ? 'up' : value < -1e-9 ? 'down' : 'flat';
}

function marketBars(step: MarketStep, muted = false): string {
  if (muted) {
    return `<div class="market-bars muted"><span>금리 <i></i>—</span><span>물가 <i></i>—</span><span>주가 <i></i>—</span></div>`;
  }
  return `<div class="market-bars">
      <span>금리 <i style="--level:${step.rate}"></i><b>${step.ratePct.toFixed(2)}%</b><em class="${deltaClass(step.rateDeltaPct)}">${formatRateDelta(step.rateDeltaPct)}</em></span>
      <span>물가 <i style="--level:${step.inflation}"></i><b>${step.inflationPct.toFixed(1)}%</b></span>
      <span>주가 <i style="--level:${step.stocks}"></i><b>${step.stockIndex.toFixed(1)}</b><em class="${deltaClass(step.stockReturn)}">${signedPercent(step.stockReturn)}</em></span>
    </div>
    <p class="market-note">교육용 가상 금리 · 실제 금리 전망이 아닙니다</p>`;
}

export function renderMarketAlert(step: MarketStep): string {
  if (!step.alert) return '';
  return `<div class="market-alert level-${step.alert.level}" role="status"><strong>다음 턴 신호</strong><span>${step.alert.text}</span><small>${step.alert.hint}</small></div>`;
}

export function renderMarketCard(state: GameState, pending: boolean): string {
  state = { ...state, lastMarket: explainMarketStep(state.lastMarket) };
  if (pending && state.turn === 0) {
    return `<article class="market-card pending">
            <div class="card-label">TURN 01 · 시장 대기</div>
            <h2>주사위를 굴려 시장을 확인하세요</h2>
            <p class="signal">주사위 눈의 합만큼 말이 이동한 뒤 브리핑이 공개됩니다.</p>
            <p>시장 국면은 이번 판 시드마다 달라지고, 말은 나온 숫자만큼 보드를 돕니다.</p>
            ${marketBars(state.lastMarket, true)}
            ${renderMarketImpacts(state.ledger.marketEffects, state.turn)}
            ${renderProductReturns(state)}
          </article>`;
  }
  if (pending) {
    const nextTurn = Math.min(state.turn + 1, balanceConfig.maxTurns);
    return `<article class="market-card">
            <div class="card-label">TURN ${String(state.turn).padStart(2, '0')} · 정산 완료</div>
            <h2>${state.lastMarket.headline}</h2>
            <p class="signal">${state.lastMarket.signal}</p>
            <p>${state.lastMarket.reason}</p>
            <p>주사위를 굴려 다음 턴(${nextTurn}턴) 시장을 확인하세요. 시장 국면은 이번 판 시드마다 달라집니다.</p>
            ${renderMarketAlert(state.lastMarket)}
            ${marketBars(state.lastMarket)}
            ${renderMarketImpacts(state.ledger.marketEffects, state.turn)}
            ${renderProductReturns(state)}
          </article>`;
  }
  return `<article class="market-card${state.lastMarket.shock ? ' shock' : ''}">
            <div class="card-label">TURN ${String(state.turn).padStart(2, '0')} · 시장 브리핑${state.lastMarket.shock ? ' · 충격' : ''}</div>
            <h2>${state.lastMarket.headline}</h2>
            <p class="signal">${state.lastMarket.signal}</p>
            <p>${state.lastMarket.reason}</p>
            ${renderMarketAlert(state.lastMarket)}
            ${marketBars(state.lastMarket)}
            ${renderMarketImpacts(state.ledger.marketEffects, state.turn)}
            ${renderProductReturns(state)}
            <p class="market-note applied-note">내 보유분은 턴 시작 수량과 약정으로 계산한 실제 영향입니다. 지금 주문한 금액으로 이전 수익을 다시 계산하지 않습니다. 펀드·TDF는 원금 손실이 가능합니다.</p>
          </article>`;
}

export function renderSettingsEntry(profileName?: string): string {
  const label = profileName ? `${profileName} · 설정` : '성향 · 설정';
  return `<button class="settings-entry" data-action="open-settings" type="button">${label}</button>`;
}

/** 지금 턴보다 뒤에 예정된 생활사건 수. 어느 턴인지는 말하지 않고 개수만 예고한다(칸 도착 추가 사건은 예정에 없다) */
export function remainingLifeEvents(state: GameState): number {
  return state.lifeEventSchedule.filter((item) => item.turn > state.turn).length;
}

export function renderTurnTrack(state: GameState, waiting: boolean): string {
  const lifeTurns = new Set(state.lifeEventSchedule.map((item) => item.turn));
  const alertedTurns = new Set(
    state.marketPath
      .filter((step) => step.alert && !isUpcomingSpoiler(step.turn, state.turn))
      .map((step) => step.turn + 1)
  );
  const cells = state.marketPath.map((step) => {
    const current = isRevealedTurn(step.turn, state.turn, waiting);
    const past = isCompletedTurn(step.turn, state.turn, waiting);
    const spoiler = isUpcomingSpoiler(step.turn, state.turn);
    const showShock = Boolean(step.shock) && !spoiler;
    const alerted = spoiler && alertedTurns.has(step.turn);
    const classes = [
      current ? 'current' : '',
      past ? 'past' : '',
      showShock ? 'shock' : '',
      !spoiler && lifeTurns.has(step.turn) ? 'life' : '',
      alerted ? 'alert' : ''
    ].filter(Boolean).join(' ');
    const label = spoiler
      ? `${step.turn}턴${alerted ? ' · 신호' : ''}`
      : `${step.phase}${showShock ? ' · 충격' : ''}`;
    return `<i class="${classes}" title="${label}">${step.turn}</i>`;
  }).join('');
  const urgent = isUrgent(state);
  const remaining = remainingLifeEvents(state);
  const note = remaining > 0 ? `사건 ${remaining}회 남음` : '예정 사건 없음';
  const aria = `${waiting
    ? `12턴 중 ${state.turn}턴 정산 후 시장 대기`
    : `12턴 중 ${state.turn}턴, 현재 국면 ${state.phase}`}${urgent ? ' · 남은 턴이 적고 목표 미달' : ''} · ${note}`;
  return `<div class="turn-track-wrap"><div class="turn-track ${urgent ? 'urgent' : ''}" role="img" aria-label="${aria}">${cells}</div><span class="track-note ${remaining > 0 ? 'has-life' : ''}" aria-hidden="true"><i>♥</i>${note}</span></div>`;
}

export function renderMarketTimeline(state: GameState | null, waiting: boolean): string {
  const currentTurn = state?.turn ?? 0;
  const path = state?.marketPath ?? [];
  return `<p class="eyebrow">시장 흐름 · 금리의 두 얼굴</p><h2>12턴 타임라인</h2><div class="timeline">${path.map((storedStep) => {
    const step = explainMarketStep(storedStep);
    const current = isRevealedTurn(step.turn, currentTurn, waiting);
    const past = isCompletedTurn(step.turn, currentTurn, waiting);
    const spoiler = isUpcomingSpoiler(step.turn, currentTurn);
    const showShock = Boolean(step.shock) && !spoiler;
    const body = spoiler
      ? `<p><strong>${step.turn}턴</strong>시장은 주사위가 멈춘 뒤에 공개됩니다.</p>`
      : `<p><strong>${step.phase}${showShock ? ' · 충격' : ''}</strong>${step.headline}<small>${step.signal}</small></p>`;
    return `<div class="${current ? 'current' : past ? 'past' : ''}${showShock ? ' shock' : ''}"><span>${step.turn}</span>${body}</div>`;
  }).join('')}</div><div class="why-box"><strong>교육용 단순화</strong><p>실제 시장은 여러 요인이 동시에 작용합니다. 이 흐름은 전망이나 투자 권유가 아니라 금리·채권 관계를 체험하기 위한 가정입니다. 시장 경로는 게임 시드마다 달라집니다.</p></div>`;
}
