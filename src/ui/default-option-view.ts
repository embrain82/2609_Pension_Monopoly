import { DEFAULT_PORTFOLIOS, defaultPortfolio } from '../data/default-portfolios';
import { defaultOptions, products } from '../data/content';
import { allowedDefaultOptions, suggestDefaultOption } from '../engine/default-option';
import type { DefaultOptionId, ProfileId } from '../types';
import { renderSpeech } from './speech';

export interface DefaultOptionViewOptions {
  profileId: ProfileId;
  /** 모달을 열 때 초기화한 선택 초안. null은 명시적인 미지정이다. */
  current: DefaultOptionId | null;
  characters: boolean;
  /** 선택 상품명을 포함한 시작 또는 저장 버튼 */
  mode: 'start' | 'settings';
  modern?: boolean;
  notice?: string;
}

export function defaultOptionName(id: DefaultOptionId | null, modern = false): string {
  return (modern ? DEFAULT_PORTFOLIOS : defaultOptions).find((option) => option.id === id)?.name ?? '지정 안 함';
}

export function defaultOptionProducts(id: DefaultOptionId | null, modern = false): string {
  const option = (modern ? DEFAULT_PORTFOLIOS : defaultOptions).find((item) => item.id === id);
  if (!option) return '';
  if(modern) return option.products.map(id=>`${products.find(p=>p.id===id)?.shortName} ${defaultPortfolio(option.id).weights[id]!*100}%`).join(' · ');
  return option.products.map((productId) => products.find((product) => product.id === productId)?.shortName ?? productId).join(' · ');
}

/** 옵션 카드 4장. 성향 밖은 잠기고 이유가 보인다 */
export function renderDefaultOptionCards(view: DefaultOptionViewOptions): string {
  const allowed = new Set(allowedDefaultOptions(view.profileId, view.modern).map((option) => option.id));
  const suggested = suggestDefaultOption(view.profileId, view.modern);
  const picked = view.current;
  return `<div class="default-option-grid" role="radiogroup" aria-label="디폴트옵션">${(view.modern ? DEFAULT_PORTFOLIOS : defaultOptions).map((option) => {
    const ok = allowed.has(option.id);
    const grade = view.modern ? defaultPortfolio(option.id).riskGrade : Math.min(...option.products.map((productId) => products.find((product) => product.id === productId)?.riskGrade ?? 1));
    const tags = [option.id === picked ? '<span class="tag selected">✓ 현재 선택됨</span>' : '', option.id === suggested ? '<span class="tag suggest">성향 추천</span>' : '', ok ? '' : `<span class="tag locked">성향 밖 · ${grade}등급</span>`].join('');
    return `<button type="button" role="radio" aria-checked="${picked === option.id}" tabindex="${picked === option.id || (picked === null && option.id === suggested) ? 0 : -1}" class="default-option-card ${picked === option.id ? 'picked' : ''} ${ok ? '' : 'locked'}" data-action="pick-default-option" data-option="${option.id}" ${ok ? '' : 'disabled'}>
        <span class="default-option-name">${option.name}${tags}</span>
        <strong>${defaultOptionProducts(option.id,view.modern)}</strong>
        <small>${option.blurb}</small>
      </button>`;
  }).join('')}</div>`;
}

/**
 * 디폴트옵션 지정 모달. 진행 중인 판의 규칙에 맞춰 지정과 운용 방법을 안내하고,
 * 성향 안 옵션만 고를 수 있게 한다. "지정 안 함"도 남겨 두어 납입만 하고 매수를 잊는 흔한 실수를 체험할 수 있다.
 */
export function renderDefaultOptionModal(view: DefaultOptionViewOptions): string {
  const cta = `${view.current ? defaultOptionName(view.current, view.modern) : '지정 안 함'}으로 ${view.mode === 'start' ? '시작' : '저장'}`;
  const skip = view.mode === 'start'
    ? '<button class="text-button" data-action="skip-default-option">지정 안 함 · 대기자금은 내가 직접 매수</button>'
    : '<button class="text-button" data-action="skip-default-option">지정 해제</button>';
  return `<div class="modal-icon default">⚙</div>
    <p class="eyebrow">${view.mode === 'start' ? '판 시작 · 사전지정운용' : '설정 · 사전지정운용'}</p>
    <h2>디폴트옵션을 정해 두세요</h2>
    ${view.modern ? '<p class="modal-lead">사전지정은 선호하는 운용방법을 저장합니다. <b>지정만으로 매수되지 않습니다.</b> 운용지시의 <b>디폴트옵션 옵트인/아웃</b>에서 직접 매수·환매하세요. 이 버전은 직접 거래 체험이며 통지·대기 후 자동운용은 실행하지 않습니다. 아래 상품과 위험등급은 교육용 가정입니다.</p>' : `<p class="modal-lead">현재 게임은 지정옵션을 직접 실행하는 <b>옵트인 체험</b>입니다. 운용 메뉴에서 실행을 선택하면 IRP 대기자금이 정한 상품으로 <b>자동 균등 매수</b>됩니다. 실제 디폴트옵션 자동 적용의 사전지정·통지·대기 시간은 이 체험과 다릅니다. 위험한도를 넘는 만큼은 사지 않고 남깁니다.</p>`}
    ${view.notice ? `<p class="hint" role="status">${view.notice}</p>` : ''}
    ${renderDefaultOptionCards(view)}
    <p class="default-option-selection" aria-live="polite">현재 선택: <strong>${defaultOptionName(view.current, view.modern)}</strong> · 추천 표시는 선택을 바꾸지 않습니다.</p>
    ${renderSpeech('coach', '<p>실제 제도에서도 가입자가 사전지정운용방법을 정해 두고, 일정 기간 운용지시가 없으면 그 방법으로 운용됩니다. 납입만 하고 매수를 잊는 실수를 제도가 막아 주지만, 어떤 옵션이냐는 여전히 내 판단입니다.</p>', { characters: view.characters, title: '왜 있나요' })}
    <div class="button-stack">
      <button class="primary jumbo" data-action="confirm-default-option">${cta}</button>
      ${skip}
    </div>`;
}

/** 새 판에서만 미지정 저장값에 추천을 제안한다. 설정의 null은 그대로 유지한다. */
export function initialDefaultOption(profileId: ProfileId, current: DefaultOptionId | null, mode: 'start' | 'settings', modern: boolean): { value: DefaultOptionId | null; notice?: string } {
  if (current === null) return { value: mode === 'start' ? suggestDefaultOption(profileId, modern) : null };
  if (allowedDefaultOptions(profileId, modern).some(p => p.id === current)) return { value: current };
  return { value: suggestDefaultOption(profileId, modern), notice: '이전에 저장한 옵션이 현재 투자성향 범위 밖이어서 추천 옵션을 선택해 두었습니다. 확인 후 확정하세요.' };
}
