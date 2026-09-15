import { actionAvailability, type Operation } from '../engine/action-availability';
import type { GameState } from '../types';
import { formatWon } from './format';

export type GeneralOrder = 'buy' | 'sell' | 'switch' | 'rebalance' | 'contribute';
const orderNames: Record<GeneralOrder, string> = { buy: '매수', sell: '매도', switch: '바꾸기', rebalance: '리밸런싱', contribute: '추가납입' };

export function renderOrderTabs(state: GameState, selected: GeneralOrder): string {
  return `<nav class="order-tabs" aria-label="일반 운용 종류">${(Object.keys(orderNames) as GeneralOrder[]).map(kind => {
    const availability = actionAvailability(state, kind as Operation);
    return `<div><button data-action="action-view" data-view="${kind}" aria-pressed="${selected === kind}" ${availability.enabled ? '' : `disabled aria-describedby="order-tab-${kind}-reason"`}>${orderNames[kind]}</button>${availability.enabled ? '' : `<small class="availability-reason" id="order-tab-${kind}-reason">${availability.reason}</small>`}</div>`;
  }).join('')}</nav>`;
}

/** Layout only: callers supply the existing engine quote and existing confirmation actions. */
export function renderOrderLayout(state: GameState, options: {
  kind: GeneralOrder; title: string; subtitle?: string; inputs: string; preview: string; actions: string;
}): string {
  return `<button class="text-button" data-action="action-view" data-view="menu">← 운용지시 목록</button>
    <header class="order-heading"><p class="eyebrow">TURN ${state.turn} · 남은 행동 ${state.actionsLeft}회 · 확정 시 1회</p><h2>${options.title}</h2><p>입력과 미리보기는 조회예요. 확정해야 지시가 실행됩니다.</p></header>
    ${renderOrderTabs(state, options.kind)}
    <div class="order-split"><section class="order-input" aria-labelledby="order-input-title"><h3 id="order-input-title"><span>01</span> ${options.kind === 'rebalance' ? '목표 확인' : '지시 입력'}</h3>
    <div class="order-balances"><div><small>주문 가능 · IRP 대기자금</small><b>${formatWon(state.irpCash)}</b></div><div><small>생활자금 · IRP 밖</small><b>${formatWon(state.cash)}</b></div></div>
    ${options.subtitle ? `<p class="order-subtitle">${options.subtitle}</p>` : ''}${options.inputs}</section>
    <section class="order-review" aria-labelledby="order-review-title"><h3 id="order-review-title"><span>02</span> 미리보기·확정</h3>${options.preview}<div class="order-confirm">${options.actions}</div></section></div>`;
}
