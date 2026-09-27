import type { GameState } from '../types';
import { portfolioValue } from '../engine/portfolio-engine';
import { activeCycle } from '../engine/maturity-cash';
import { formatWon, signedWon } from './format';
import { operationIcon } from './design-system';

/** Disjoint ledger buckets. Maturity cash is a subset of irpCash, never a fifth bucket. */
export function moneyFlowData(state: GameState) {
  return {
    life: state.cash,
    cash: state.irpCash,
    held: state.holdings.reduce((sum, holding) => sum + holding.amount, 0),
    pending: state.pendingOrders.reduce((sum, order) => sum + order.amount, 0),
    maturity: state.defaultLifecycle?.cycles.filter(activeCycle).reduce((sum, cycle) => sum + cycle.remaining, 0) ?? 0,
    total: portfolioValue(state)
  };
}

/** Preview uses the existing engine quote, never projects a future settlement or market price. */
export function renderMoneyFlow(state: GameState, preview?: GameState): string {
  const before = moneyFlowData(state), after = preview ? moneyFlowData(preview) : before;
  const labels = { life: '생활 지갑', cash: '대기자금', held: '보유상품', pending: '처리 중' };
  const keys = Object.keys(labels) as Array<keyof typeof labels>;
  const from = keys.filter(key => after[key] < before[key] - .005).map(key => labels[key]);
  const to = keys.filter(key => after[key] > before[key] + .005).map(key => labels[key]);
  const route = preview && from.length && to.length ? `<p class="money-flow-route"><small>이번 지시의 이동</small><strong>${from.join(' · ')} → ${to.join(' · ')}</strong></p>` : '';
  const node = (key: 'life' | 'cash' | 'held' | 'pending', title: string, copy: string, icon: string) => {
    const change = after[key] - before[key], changed = !!preview && Math.abs(change) >= .005;
    return `<div class="money-flow-node money-flow-${key}${changed ? ' money-flow-changed' : ''}" data-money-bucket="${key}" data-amount="${after[key]}">
      <span class="money-flow-icon" aria-hidden="true">${operationIcon(icon)}</span><strong>${title}</strong><b class="money-flow-amount">${formatWon(after[key])}</b>
      ${changed ? `<small class="money-flow-change">현재 ${formatWon(before[key])}<br>변화 ${signedWon(change)}</small>` : ''}
      <small>${copy}</small></div>`;
  };
  const pending = before.pending > .005 || after.pending > .005;
  return `<section class="money-flow${preview ? ' money-flow-preview' : ''}" aria-label="${preview ? '확정 직후 돈의 위치' : '내 돈의 위치'}">
    <header><h3>${preview ? '확정하면 돈은 이렇게 이동해요' : '내 돈의 위치'}</h3><small>${preview ? '확정 직후 미리보기 · 아직 실행되지 않았어요' : '생활자금과 연금통장을 나누어 보세요'}</small></header>
    ${route}
    <div class="money-flow-map">${node('life', '생활 지갑', '생활비에 쓸 돈 · IRP 밖', 'cash')}
      <div class="money-flow-deposit"><span aria-hidden="true">→</span><b>추가납입</b></div>
      <div class="money-flow-account"><div class="money-flow-account-title"><strong>IRP 계좌 안</strong><span>합계 ${formatWon(after.total)}</span></div>
        <div class="money-flow-invest">${node('cash', '대기자금', '상품을 살 수 있는 돈', 'cash')}<div class="money-flow-trade"><span>매수 →</span><span>← 매도대금</span></div>${node('held', '보유상품', '직접 운용 + 디폴트옵션 보유분', 'default')}</div>
        ${pending ? `${node('pending', '처리 중', '미결제 주문 · 지금 다시 쓸 수 없어요', 'switch')}<p class="money-flow-note">주문 중인 금액은 보유상품·대기자금과 따로 세었어요. 결제 뒤 상품이나 대기자금으로 옮겨지며, 환매 후 연결 매수가 진행될 수도 있어요.</p>` : ''}
        ${after.maturity > .005 ? `<p class="money-flow-note">대기자금 중 만기 자동운용 대기 ${formatWon(after.maturity)} · 위 합계에 이미 포함돼 있어요.</p>` : ''}
      </div>
    </div><p class="money-flow-boundary">납입은 상품 매수가 아니에요. 상품을 팔아도 돈은 IRP 안에 남아요. 생활 지갑으로 꺼내는 중도인출·해지는 별도 조건을 확인해야 해요.</p>
  </section>`;
}
