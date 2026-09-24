import type { PendingOrder } from '../types';

export const turnLabel = (turn: number): string => turn > 12 ? '최종 정산' : `${turn}턴`;
export function orderSchedule(order: PendingOrder): string {
  return `접수 ${turnLabel(order.submittedTurn)} → 기준가 ${turnLabel(order.priceTurn ?? order.settlesTurn)} → 결제 ${turnLabel(order.settlesTurn)}`;
}
interface TimelineOptions { preview?: boolean; conditional?: boolean }
/** Dates come from the order returned by the engine, never from the render-time clock. */
export function renderOrderTimeline(order: PendingOrder, options: TimelineOptions = {}): string {
  const preview = options.preview ?? false;
  const current = preview ? -1 : order.stage === 'received' ? 0 : 1;
  const steps = [
    { label: '주문 접수', turn: order.submittedTurn },
    { label: '가격 확정', turn: order.priceTurn ?? order.settlesTurn },
    { label: '결제 완료', turn: order.settlesTurn }
  ];
  const money = order.side === 'buy'
    ? '매수금은 주문에 묶여 있어요. 결제가 끝나면 보유 상품에 들어와요.'
    : '매도대금은 아직 쓸 수 없어요. 결제가 끝나면 IRP 대기자금으로 들어와요.';
  return `<div class="order-clock" data-order-stage="${preview ? 'preview' : order.stage}" aria-label="${orderSchedule(order)}">
    <p class="order-clock-label">${options.conditional ? '앞선 매도 결제 후 · 조건부 일정' : preview ? '확정하면 이 순서로 진행돼요' : '지금 주문은 여기까지 왔어요'}</p>
    <ol>${steps.map((step, index) => `<li class="${index < current ? 'complete' : index === current ? 'current' : 'planned'}" ${index === current ? 'aria-current="step"' : ''}><span aria-hidden="true">${index < current ? '✓' : index + 1}</span><strong>${step.label}</strong><small>${turnLabel(step.turn)}${index === current ? ' · 현재' : preview ? ' 예정' : index < current ? ' 완료' : ' 예정'}</small></li>`).join('')}</ol>
    <p class="order-clock-money">${options.conditional ? '연결 매수가 접수되면 ' : preview ? '확정 후 ' : ''}${money}${order.side === 'sell' && order.stage === 'received' ? ' 가격 확정 전 금액은 달라질 수 있어요.' : ''}</p>
    ${order.settlesTurn > 12 ? '<p class="order-clock-note">12턴 이후 단계는 추가 시장·급여 없이 종료 가격으로 최종 정산해요.</p>' : ''}
    <small class="order-clock-note">게임 시간표예요. 실제 상품의 영업일·기준가·결제일은 별도 확인해요.</small></div>`;
}

export function renderInstantTimeline(turn: number, side: 'buy' | 'sell', conditional = false): string {
  return `<div class="order-clock instant" data-order-stage="instant"><p class="order-clock-label">${conditional ? '앞선 매도 결제 후 · 조건 충족 시' : '확정하면'} ${turnLabel(turn)}에 즉시 처리</p><ol>${['주문 접수', '가격 확정', '결제 완료'].map((label, i) => `<li class="planned"><span aria-hidden="true">${i + 1}</span><strong>${label}</strong><small>같은 턴</small></li>`).join('')}</ol><p class="order-clock-money">${side === 'buy' ? '대기자금이 줄고 보유 상품에 들어와요.' : '보유 상품이 줄고 IRP 대기자금으로 들어와요.'}</p><small class="order-clock-note">예금·ETF의 게임 처리 가정이며 실제 거래 일정과 다를 수 있어요.</small></div>`;
}
