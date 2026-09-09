import { defaultOptions, products } from '../data/content';
import type { DefaultOption, DefaultOptionId, GameState, ProductId, ProfileId } from '../types';
import { buyProduct } from './portfolio-engine';
import { canBuyForProfile, maxBuyWithinRiskLimit } from './policy-engine';

/** 성향 허용 등급을 상품 모두가 통과하는 옵션만. 상품 목록 순서를 지킨다. */
export function allowedDefaultOptions(profileId: ProfileId): DefaultOption[] {
  return defaultOptions.filter((option) => option.products.every((productId) => canBuyForProfile(profileId, productId).ok));
}

const SUGGESTION: Record<ProfileId, DefaultOptionId> = {
  stable: 'principal',
  stableGrowth: 'lowRisk',
  balanced: 'midRisk',
  growth: 'highRisk',
  aggressive: 'highRisk'
};

/** 성향별 추천 옵션. 허용 범위를 벗어나면 허용되는 가장 높은 것. */
export function suggestDefaultOption(profileId: ProfileId): DefaultOptionId {
  const allowed = allowedDefaultOptions(profileId);
  const wanted = SUGGESTION[profileId];
  if (allowed.some((option) => option.id === wanted)) return wanted;
  return allowed.at(-1)?.id ?? 'principal';
}

/** 지정값이 성향 밖이거나 없으면 추천값으로. createGame과 설정이 같은 규칙을 쓴다. */
export function normalizeDefaultOption(profileId: ProfileId, wanted: DefaultOptionId | null | undefined): DefaultOptionId {
  if (wanted && allowedDefaultOptions(profileId).some((option) => option.id === wanted)) return wanted;
  return suggestDefaultOption(profileId);
}

export function isDefaultOptionId(value: unknown): value is DefaultOptionId {
  return typeof value === 'string' && defaultOptions.some((option) => option.id === value);
}

export interface DefaultOptionApplied {
  state: GameState;
  bought: Array<{ productId: ProductId; amount: number }>;
  /** 정산 행동 줄에 그대로 쓰는 문장. 산 게 없으면 빈 문자열 */
  message: string;
}

/**
 * 「그대로」를 골랐을 때 디폴트옵션이 대기자금을 운용한다. 상품 수로 균등 나누되 몫이 10만원 미만이면
 * 첫 상품에 전액. 위험한도를 넘기는 만큼은 사지 않고 대기자금으로 남긴다(규칙 위반은 아니다). 펀드는
 * 평소 규칙대로 다음 턴 체결이다.
 */
export function applyDefaultOption(state: GameState): DefaultOptionApplied {
  const option = defaultOptions.find((item) => item.id === state.defaultOption);
  if (!option || state.irpCash < 100_000) return { state, bought: [], message: '' };
  const total = Math.floor(state.irpCash);
  const share = Math.floor(total / option.products.length);
  const plan: Array<{ productId: ProductId; amount: number }> = share >= 100_000
    ? option.products.map((productId, index) => ({ productId, amount: index === option.products.length - 1 ? total - share * (option.products.length - 1) : share }))
    : [{ productId: option.products[0], amount: total }];

  let next = state;
  const bought: Array<{ productId: ProductId; amount: number }> = [];
  for (const item of plan) {
    const capped = maxBuyWithinRiskLimit(next, item.productId, Math.min(item.amount, next.irpCash));
    if (capped < 100_000) continue;
    const result = buyProduct(next, item.productId, capped);
    if (!result.ok) continue;
    next = result.state;
    bought.push({ productId: item.productId, amount: capped });
  }
  if (bought.length === 0) return { state, bought, message: '' };
  const spent = bought.reduce((sum, item) => sum + item.amount, 0);
  const names = bought.map((item) => products.find((product) => product.id === item.productId)?.shortName ?? item.productId).join('·');
  const fundNote = bought.some((item) => products.find((product) => product.id === item.productId)?.kind === 'fund') ? ' 펀드는 다음 턴 체결.' : '';
  const leftover = next.irpCash >= 100_000 ? ` 위험한도 때문에 ${Math.round(next.irpCash).toLocaleString('ko-KR')}원은 대기자금으로 남겼습니다.` : '';
  return {
    state: next,
    bought,
    message: `디폴트옵션(${option.name})이 대기자금 ${Math.round(spent).toLocaleString('ko-KR')}원을 ${names}로 운용했습니다.${fundNote}${leftover}`
  };
}
