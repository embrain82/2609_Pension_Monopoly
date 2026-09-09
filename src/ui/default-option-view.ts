import { defaultOptions, products } from '../data/content';
import { allowedDefaultOptions, suggestDefaultOption } from '../engine/default-option';
import type { DefaultOptionId, ProfileId } from '../types';
import { renderSpeech } from './speech';

export interface DefaultOptionViewOptions {
  profileId: ProfileId;
  /** 지금 지정값. 없으면 추천값을 눌러 둔다 */
  current: DefaultOptionId | null;
  characters: boolean;
  /** 판 시작 모달이면 "이 옵션으로 시작", 설정이면 "저장" */
  mode: 'start' | 'settings';
}

export function defaultOptionName(id: DefaultOptionId | null): string {
  return defaultOptions.find((option) => option.id === id)?.name ?? '지정 안 함';
}

export function defaultOptionProducts(id: DefaultOptionId | null): string {
  const option = defaultOptions.find((item) => item.id === id);
  if (!option) return '';
  return option.products.map((productId) => products.find((product) => product.id === productId)?.shortName ?? productId).join(' · ');
}

/** 옵션 카드 4장. 성향 밖은 잠기고 이유가 보인다 */
export function renderDefaultOptionCards(view: DefaultOptionViewOptions): string {
  const allowed = new Set(allowedDefaultOptions(view.profileId).map((option) => option.id));
  const suggested = suggestDefaultOption(view.profileId);
  const picked = view.current ?? suggested;
  return `<div class="default-option-grid" role="radiogroup" aria-label="디폴트옵션">${defaultOptions.map((option) => {
    const ok = allowed.has(option.id);
    const grade = Math.min(...option.products.map((productId) => products.find((product) => product.id === productId)?.riskGrade ?? 1));
    const tags = [option.id === suggested ? '<span class="tag suggest">성향 추천</span>' : '', ok ? '' : `<span class="tag locked">성향 밖 · ${grade}등급</span>`].join('');
    return `<button type="button" role="radio" aria-checked="${picked === option.id}" class="default-option-card ${picked === option.id ? 'picked' : ''} ${ok ? '' : 'locked'}" data-action="pick-default-option" data-option="${option.id}" ${ok ? '' : 'disabled'}>
        <span class="default-option-name">${option.name}${tags}</span>
        <strong>${defaultOptionProducts(option.id)}</strong>
        <small>${option.blurb}</small>
      </button>`;
  }).join('')}</div>`;
}

/**
 * 디폴트옵션 지정 모달. 통지·대기와 직접 옵트인을 구분하고,
 * 성향 안 옵션만 고를 수 있게 한다. "지정 안 함"도 남겨 두어 납입만 하고 매수를 잊는 흔한 실수를 체험할 수 있다.
 */
export function renderDefaultOptionModal(view: DefaultOptionViewOptions): string {
  const cta = view.mode === 'start' ? '이 옵션으로 시작' : '이 옵션으로 저장';
  const skip = view.mode === 'start'
    ? '<button class="text-button" data-action="skip-default-option">지정 안 함 · 대기자금은 내가 직접 매수</button>'
    : '<button class="text-button" data-action="skip-default-option">지정 해제</button>';
  return `<div class="modal-icon default">⚙</div>
    <p class="eyebrow">${view.mode === 'start' ? '판 시작 · 사전지정운용' : '설정 · 사전지정운용'}</p>
    <h2>디폴트옵션을 정해 두세요</h2>
    <p class="modal-lead">만기 자금은 <b>2턴 대기 → 통지 → 1턴 대기 → 자동운용</b>으로 진행됩니다. 신규가입 초기입금은 통지 후 1턴을 기다립니다. 「그대로 두기」는 즉시 매수하지 않습니다. 지금 운용하려면 별도 <b>옵트인</b>을 선택하세요.</p>
    <p class="hint">실제 만기 절차의 4주+2주를 게임에서 압축했습니다. 아래는 승인형 포트폴리오를 모사한 가상 상품으로 실제 승인 상품이 아닙니다. 정해진 구성 전체의 편입분만 한도 예외로 계산하며, 일반 상품 직접 매수에는 70% 한도가 적용됩니다. 예외가 손실 위험을 없애지는 않습니다.</p>
    ${renderDefaultOptionCards(view)}
    ${renderSpeech('coach', '<p>실제 제도에서도 가입자가 사전지정운용방법을 정해 두고, 일정 기간 운용지시가 없으면 그 방법으로 운용됩니다. 납입만 하고 매수를 잊는 실수를 제도가 막아 주지만, 어떤 옵션이냐는 여전히 내 판단입니다.</p>', { characters: view.characters, title: '왜 있나요' })}
    <div class="button-stack">
      <button class="primary jumbo" data-action="confirm-default-option">${cta}</button>
      ${skip}
    </div>`;
}

export function renderDefaultStatus(state: import('../types').GameState): string {
  const origin = { maturity: '예금 만기', newAccount: '신규가입 초기입금', contribution: '추가납입', transfer: '퇴직급여 이전', sale: '매도 대금' };
  const rows = state.defaultCashLots.map(lot => {
    const status = state.defaultOptedOut || lot.explicitCashInstruction ? '현금 유지 지시'
      : !lot.eligibility ? '직접 운용 대상'
      : !state.defaultOption ? '옵션 미지정 · 자동운용 없음'
      : lot.noticeAt !== null ? `통지 ${lot.noticeAt}턴 → ${lot.activateAt}턴 적용 예정${state.turn >= lot.activateAt! ? ' · 주문 결제/최소금액 확인 중' : ''}`
      : lot.cashOrigin === 'maturity' ? `${lot.createdTurn + 2}턴부터 통지 예정` : '다음 턴 통지 예정';
    return `<li>${origin[lot.cashOrigin]} ${Math.round(lot.amount).toLocaleString('ko-KR')}원 · ${status}</li>`;
  }).join('');
  const ordered = state.pendingOrders.some(o => o.side === 'buy' && o.defaultOptionId);
  const held = state.holdings.reduce((sum, h) => sum + (h.defaultAmount ?? 0), 0);
  return `<section class="default-status"><h3>자동운용 시계 · ${defaultOptionName(state.defaultOption)}</h3>
    <p>${ordered ? '지정옵션 매수 주문 결제 중' : held > 0 ? `지정옵션 운용 중 ${Math.round(held).toLocaleString('ko-KR')}원` : '아직 지정옵션 운용분 없음'}</p>
    ${rows ? `<ul>${rows}</ul>` : '<p>운용지시를 기다리는 현금 없음</p>'}
    <p class="hint">절차만 1턴=2주로 압축. 만기 2턴 대기 + 통지 후 1턴, 신규가입 초기입금은 통지 후 1턴. 일반 추가납입·매도 대금은 자동 적용하지 않습니다.</p></section>`;
}
