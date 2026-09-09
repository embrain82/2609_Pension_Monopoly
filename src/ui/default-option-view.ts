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
 * 디폴트옵션 지정 모달. 「그대로」를 고르면 대기자금이 이 옵션으로 균등 매수된다는 규칙을 먼저 말하고,
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
    <p class="modal-lead">현재 게임은 지정옵션을 직접 실행하는 <b>옵트인 체험</b>입니다. 운용 메뉴에서 실행을 선택하면 IRP 대기자금이 정한 상품으로 <b>자동 균등 매수</b>됩니다. 실제 디폴트옵션 자동 적용의 사전지정·통지·대기 시간은 이 체험과 다릅니다. 위험한도를 넘는 만큼은 사지 않고 남깁니다.</p>
    ${renderDefaultOptionCards(view)}
    ${renderSpeech('coach', '<p>실제 제도에서도 가입자가 사전지정운용방법을 정해 두고, 일정 기간 운용지시가 없으면 그 방법으로 운용됩니다. 납입만 하고 매수를 잊는 실수를 제도가 막아 주지만, 어떤 옵션이냐는 여전히 내 판단입니다.</p>', { characters: view.characters, title: '왜 있나요' })}
    <div class="button-stack">
      <button class="primary jumbo" data-action="confirm-default-option">${cta}</button>
      ${skip}
    </div>`;
}
