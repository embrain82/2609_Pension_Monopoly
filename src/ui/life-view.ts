import type { GameState, LifeChoiceOption, LifeEvent, LifeResolution } from '../types';
import { lifeChoicesFor } from '../engine/life-engine';

const formatWon = (value: number) => `${Math.round(value).toLocaleString('ko-KR')}원`;
const signedWon = (value: number) => `${value > 0 ? '+' : ''}${formatWon(value)}`;

export function lifeEyebrow(event: LifeEvent): string {
  if (event.kind === 'bonus') return '생활 사건 · 목돈이 들어왔습니다';
  if (event.kind === 'transfer') return '생활 사건 · 퇴직급여를 어디로';
  return `생활 사건 · ${event.eligibleWithdrawal ? '중도인출 가능 사유 가정' : '중도인출 제한 체험'}`;
}

export function lifeCostLabel(event: LifeEvent): string {
  if (event.kind === 'cost') return '필요 금액';
  if (event.kind === 'bonus') return '들어온 금액';
  return '퇴직급여';
}

/** 선택지 한 장. 비활성이면 이유를 보이고 버튼을 잠근다 */
export function renderLifeChoice(option: LifeChoiceOption, index: number): string {
  const classes = ['life-choice', option.enabled ? '' : 'disabled'].filter(Boolean).join(' ');
  const reason = option.enabled ? '' : `<p class="life-reason">${option.reason ?? '지금은 고를 수 없습니다.'}</p>`;
  return `<button type="button" class="${classes}" data-action="resolve-life" data-choice="${option.id}" ${option.enabled ? '' : 'disabled'} aria-describedby="life-choice-${index}">
      <span class="choice-index">${String.fromCharCode(65 + index)}</span>
      <span class="life-choice-body" id="life-choice-${index}">
        <strong>${option.label}</strong>
        <small class="now">지금: ${option.immediate}</small>
        <small class="later">나중: ${option.longTerm}</small>
        ${reason}
      </span>
    </button>`;
}

/**
 * 생활사건 3지선다. 사건 본문 → 금액 → 선택지(즉시/장기 비용표) 순서. 모든 선택지는 엔진(`lifeChoicesFor`)이
 * 계산한 그대로 그리고, 여기서는 문구만 붙인다.
 */
export function renderLifeModal(state: GameState, event: LifeEvent): string {
  const choices = lifeChoicesFor(state, event);
  const cashChoice = choices.find(choice => choice.id === 'cash');
  const coverNote = cashChoice?.payment && cashChoice.payment.unpaid > 0
    ? `<p class="note">「${cashChoice.label}」: ${cashChoice.immediate}. IRP 대기자금·보유 상품은 그대로입니다.</p>`
    : '';
  const icon = event.kind === 'cost' ? '♥' : event.kind === 'bonus' ? '✦' : '⇄';
  return `<div class="modal-icon life ${event.kind}">${icon}</div>
    <p class="eyebrow">${lifeEyebrow(event)}</p>
    <h2>${event.title}</h2>
    <p class="modal-lead">${event.body}</p>
    <div class="event-cost">${lifeCostLabel(event)} <strong>${formatWon(Math.abs(event.cost))}</strong></div>
    ${coverNote}
    <p class="life-prompt">어떻게 할까요? 선택마다 생활자금과 IRP에 미치는 영향이 다릅니다.</p>
    <div class="life-choices">${choices.map((option, index) => renderLifeChoice(option, index)).join('')}</div>`;
}

/** 정산 「사건」 블록. 무엇을 골랐고 무엇이 움직였는지, 다른 선택이었다면 한 줄 */
export function renderLifeSettleBlock(resolution: LifeResolution | null): string {
  if (!resolution) return '';
  const rows: string[] = [];
  if (Math.abs(resolution.cashDelta) >= 1) rows.push(`생활자금 <b class="${resolution.cashDelta < 0 ? 'neg' : 'pos'}">${signedWon(resolution.cashDelta)}</b>`);
  if (Math.abs(resolution.irpDelta) >= 1) rows.push(`IRP <b class="${resolution.irpDelta < 0 ? 'neg' : 'pos'}">${signedWon(resolution.irpDelta)}</b>`);
  if (resolution.penalty >= 1) rows.push(`불이익 <b class="neg">−${formatWon(resolution.penalty)}</b>`);
  if (resolution.fee >= 1) rows.push(`${resolution.kind === 'transfer' ? '세금' : '세금·비용'} <b class="neg">−${formatWon(resolution.fee)}</b>`);
  if (resolution.sales.length) rows.push(`매도 ${resolution.sales.length}건`);
  if (resolution.shortage) rows.push('<b class="neg">생활자금 부족 +1</b>');
  const alternative = resolution.alternative ? `<p class="life-alt">${resolution.alternative}</p>` : '';
  return `<div class="preview-box settle-life kind-${resolution.kind}"><strong>사건 · ${resolution.title}</strong>
      <p class="life-picked">내 선택: <b>${resolution.choiceLabel}</b></p>
      <p class="life-rows">${rows.join(' · ') || '자산 변화 없음'}</p>
      <p>${resolution.message}</p>
      ${alternative}
    </div>`;
}
