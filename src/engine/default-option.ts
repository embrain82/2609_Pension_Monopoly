import { DEFAULT_CLOCK, keepCash, registerCash, spendCashLots } from './cash-ledger';
import { defaultOptions } from '../data/content';
import type { DefaultOption, DefaultOptionId, GameState, ProductId, ProfileId } from '../types';
import { buyProduct, depositLots, sellProduct } from './portfolio-engine';
import { canBuyForProfile } from './policy-engine';

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

/** 명시적 옵트인 또는 통지 후 대상 자금만 가상 승인형 포트폴리오로 주문한다. */
export function applyDefaultOption(state: GameState, requested = state.irpCash, cashIds?: number[]): DefaultOptionApplied {
  const option = defaultOptions.find(item => item.id === state.defaultOption);
  if (!option || !allowedDefaultOptions(state.profileId).some(o => o.id === option.id)
    || state.pendingOrders.length || state.rebalancePlan || !Number.isFinite(requested)) return { state, bought: [], message: '' };
  const amount = Math.min(requested, state.irpCash);
  if (amount < 100_000) return { state, bought: [], message: '' };
  // 승인형 포트폴리오의 고정 구성 계약. 소액이라고 특정 구성품으로 몰아주지 않는다.
  let next = state;
  const bought: DefaultOptionApplied['bought'] = [];
  for (const productId of option.products) {
    const part = amount * (option.weights[productId] ?? 0);
    if (part <= 0) continue;
    const result = buyProduct(next, productId, part, true, option.id);
    if (!result.ok) return { state, bought: [], message: result.message }; // 원자적 실패
    next = result.state;
    bought.push({ productId, amount: part });
  }
  next = spendCashLots(next, amount, cashIds);
  return { state: { ...next, record: { ...next.record, defaultOptionRuns: next.record.defaultOptionRuns + 1 } }, bought,
    message: `디폴트옵션(${option.name}) ${Math.round(amount).toLocaleString('ko-KR')}원 고정 비중 주문 · 펀드는 다음 턴 가격 확정, 그다음 턴 결제. 가상 승인형 편입분만 70% 한도 예외이며 손실 위험은 남습니다.` };
}

/** 만기된 가입 건만 현금화한다. 신규 약정과 중도해지 조건은 그대로 보존한다. */
export function releaseMaturedDeposits(state: GameState): GameState {
  let next = state;
  const holdings = state.holdings.map(h => {
    if (h.productId !== 'deposit') return h;
    const lots = depositLots(state, h);
    const matured = lots.filter(l => l.maturityTurn <= state.turn);
    if (!matured.length) return h;
    const amount = matured.reduce((s, l) => s + l.amount, 0);
    next = registerCash({ ...next, irpCash: next.irpCash + amount }, amount, 'maturity');
    next = { ...next, logs: [...next.logs, { turn: state.turn, type: 'maturity', message: `예금 만기 ${Math.round(amount).toLocaleString('ko-KR')}원 → IRP 대기자금. 별도 운용지시가 없으면 2턴 대기 후 통지, 추가 1턴 뒤 지정옵션 적용.` }] };
    const remaining = lots.filter(l => l.maturityTurn > state.turn);
    return { ...h, lots: remaining, amount: remaining.reduce((s, l) => s + l.amount, 0),
      principal: remaining.reduce((s, l) => s + l.principal, 0),
      defaultAmount: remaining.filter(l => l.defaultOptionId).reduce((s, l) => s + l.amount, 0) };
  });
  return { ...next, holdings };
}

/** 매 턴 시장·결제 이후 한 번. 옵션 변경은 통지를 다시 시작하고 미지정/현금지시는 자동매수하지 않는다. */
export function advanceDefaultOption(state: GameState): GameState {
  let next = state;
  const selected = state.defaultOption;
  const lots = state.defaultCashLots.map(lot => {
    if (!lot.eligibility || lot.explicitCashInstruction || state.defaultOptedOut) return lot;
    if (!selected) return { ...lot, status: 'unassigned' as const, optionId: null, noticeAt: null, activateAt: null };
    const waitUntil = lot.createdTurn + (lot.cashOrigin === 'maturity' ? DEFAULT_CLOCK.maturityWait : 0);
    let updated = lot;
    if (lot.optionId !== selected) updated = { ...lot, optionId: selected, status: 'waiting', noticeAt: null, activateAt: null };
    if (state.turn >= waitUntil && updated.noticeAt === null) {
      updated = { ...updated, status: 'notified', noticeAt: state.turn, activateAt: state.turn + DEFAULT_CLOCK.noticeWait };
      next = { ...next, logs: [...next.logs, { turn: state.turn, type: 'default-notice', message: `디폴트옵션 통지 · ${Math.round(lot.amount).toLocaleString('ko-KR')}원, ${state.turn + 1}턴 적용 예정. 직접 매수하거나 현금 유지 지시로 중단할 수 있습니다.` }] };
    }
    return updated;
  });
  next = { ...next, defaultCashLots: lots };
  const ready = lots.filter(l => l.eligibility && !l.explicitCashInstruction && !state.defaultOptedOut
    && l.optionId === selected && selected !== null && l.activateAt !== null && l.activateAt <= state.turn);
  const amount = ready.reduce((sum, l) => sum + l.amount, 0);
  if (amount >= 100_000) {
    const applied = applyDefaultOption(next, amount, ready.map(l => l.id));
    next = applied.state;
    if (applied.bought.length) next = { ...next, logs: [...next.logs, { turn: state.turn, type: 'default-active', message: `통지 후 자동운용 · ${applied.message}` }] };
  }
  return next;
}

/** 자동운용 중단 후 해당 편입분만 공통 매도 엔진으로 환매한다. 다른 보유분/주문은 보존한다. */
export function optOutDefaultOption(state: GameState) {
  if (state.pendingOrders.length || state.rebalancePlan) return { ok: false, state, message: '접수 주문이 결제된 뒤 옵트아웃할 수 있습니다.' };
  let next = keepCash({ ...state, defaultOptedOut: true });
  for (const holding of state.holdings) {
    if ((holding.defaultAmount ?? 0) < 0.01) continue;
    const result = sellProduct(next, holding.productId, holding.defaultAmount, true, true);
    if (!result.ok) return { ok: false, state, message: result.message };
    next = result.state;
  }
  return { ok: true, state: next, message: '옵트아웃 · 자동운용 중단, 지정옵션 편입분 환매 접수. 펀드 결제 후 IRP 대기자금으로 보관됩니다.' };
}
