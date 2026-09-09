import { spendCashLots } from './cash-ledger';
import { addAccountFlow, grossForNet, withdrawalTax, TRANSFER_TAX_NOTICE } from './account-engine';
import { lifeEvents, policyRules } from '../data/content';
import type { ActionResult, GameState, LifeChoice, LifeChoiceOption, LifeEvent, LifeResolution } from '../types';
import { sellProduct, portfolioValue } from './portfolio-engine';
import { contributionCredit } from './policy-engine';

const won = (value: number) => `${Math.round(value).toLocaleString('ko-KR')}원`;

export const LIFE_CHOICE_LABELS: Record<LifeChoice, string> = {
  cash: '생활자금으로 해결',
  deposit: 'IRP 예금 현금화 후 중도인출',
  withdraw: 'IRP 중도인출',
  'contribute-all': '전액 IRP 납입',
  'contribute-half': '절반 납입 · 절반 생활자금',
  'transfer-irp': 'IRP로 이전'
};

/** 사건 종류별 `cash` 선택지 이름. 뜻은 늘 "IRP는 그대로, 생활자금 쪽으로" */
export const CASH_CHOICE_LABELS: Record<LifeEvent['kind'], string> = {
  cost: '생활자금으로 해결',
  bonus: '생활자금으로 두기',
  transfer: '지금 받기(일시 수령)'
};

/** 원천별 세금과 공통 매도 규칙으로 인출을 미리 계산한다. 미결 펀드는 생활비로 쓸 수 없다. */
function withdrawalPlan(state: GameState, event: LifeEvent, depositOnly = false): ActionResult {
  if (!event.eligibleWithdrawal) return { ok: false, message: '법정 중도인출 사유가 아닙니다.', state };
  if (state.rebalancePlan || state.pendingOrders.length) return { ok: false, message: '접수한 주문 정산 전에는 인출할 수 없습니다. 생활비 분할 지급을 선택할 수 있습니다.', state };
  if (depositOnly && !state.holdings.some(h => h.productId === 'deposit' && h.amount > 0)) return { ok: false, message: '현금화할 예금이 없습니다.', state };
  let next = state;
  const amount = Math.abs(event.cost);
  const covers = (candidate: GameState) => withdrawalTax(portfolioValue(candidate), candidate.accountBasis, candidate.irpCash).net >= amount;
  for (const id of (depositOnly ? ['deposit'] : ['deposit', 'equityEtf']) as Array<'deposit' | 'equityEtf'>) {
    if (covers(next)) break;
    const holding = next.holdings.find(h => h.productId === id);
    if (!holding || holding.amount <= 0) continue;
    const full = sellProduct(next, id, holding.amount, true);
    if (!full.ok) continue;
    if (!covers(full.state)) { next = full.state; continue; }
    let low = 0, high = holding.amount;
    for (let i = 0; i < 48; i++) {
      const mid = (low + high) / 2;
      const candidate = sellProduct(next, id, mid, true);
      if (candidate.ok && covers(candidate.state)) high = mid;
      else low = mid;
    }
    next = sellProduct(next, id, high, true).state;
  }
  const gross = grossForNet(portfolioValue(next), next.accountBasis, amount);
  if (!Number.isFinite(gross) || next.irpCash + 0.001 < gross) return { ok: false, message: '결제된 IRP 자금이 부족합니다. 펀드·대기주문을 즉시 인출할 수 없습니다.', state };
  const tax = withdrawalTax(portfolioValue(next), next.accountBasis, gross);
  next = { ...spendCashLots(next, gross), irpCash: Math.max(0, next.irpCash - gross), accountBasis: tax.nextBasis,
    cashFlows: [...next.cashFlows, { turn: state.turn, kind: 'withdrawal', amount: -gross }] };
  return { ok: true, message: `허용 사유를 확인한 인출 · 생활비 ${won(amount)} + 재원별 세금 ${won(tax.tax)}. 계좌 내 매도와 계좌 밖 인출을 별도 처리했습니다.`, state: next };
}

function contributionRoom(state: GameState): number {
  return Math.max(0, policyRules.annualContributionLimit - state.contributionTotal);
}

/** 선택지와 비용표. 모달이 그대로 그린다. 비활성 선택지도 이유와 함께 돌려준다 */
export function lifeChoicesFor(state: GameState, event: LifeEvent): LifeChoiceOption[] {
  const amount = Math.abs(event.cost);
  const monthly = (value: number) => won(value / policyRules.receivingMonths);
  if (event.kind === 'cost') {
    const shortage = Math.max(0, amount - state.cash);
    const cashLine = shortage > 0
      ? `생활자금 ${won(state.cash)} 사용 · 부족 ${won(shortage)}는 미지급 생활비로 기록, 다음 급여에서 우선 지급`
      : `생활자금 −${won(amount)}`;
    const withdraw = withdrawalPlan(state, event);
    const deposit = withdrawalPlan(state, event, true);
    return [
      { id: 'cash', label: shortage ? '생활비 분할 지급' : LIFE_CHOICE_LABELS.cash, enabled: true,
        immediate: cashLine, longTerm: 'IRP는 그대로. 미지급 생활비가 있으면 안정성 평가에 반영됩니다.' },
      { id: 'deposit', label: 'IRP 예금 현금화 후 중도인출', enabled: deposit.ok, reason: deposit.ok ? undefined : deposit.message,
        immediate: deposit.message, longTerm: '허용 사유·결제 자금·재원별 세금 확인 후 인출. 중도해지는 발생 이자의 일부만 조정합니다.' },
      { id: 'withdraw', label: LIFE_CHOICE_LABELS.withdraw, enabled: withdraw.ok, reason: withdraw.ok ? undefined : withdraw.message,
        immediate: withdraw.message, longTerm: '미공제 원금 → 퇴직급여 → 공제 원금·수익 순서. 의료비 세법상 특별 감면은 별도 요건이므로 이 사례에는 가정하지 않습니다.' }
    ];
  }
  if (event.kind === 'bonus') {
    const room = contributionRoom(state);
    const all = Math.min(amount, room);
    const half = Math.min(Math.floor(amount / 2), room);
    const creditAll = contributionCredit(state.contributionTotal, all).benefit;
    const creditHalf = contributionCredit(state.contributionTotal, half).benefit;
    return [
      {
        id: 'contribute-all', label: LIFE_CHOICE_LABELS['contribute-all'], enabled: all >= 100_000, reason: all >= 100_000 ? undefined : '연간 납입 한도가 남지 않았습니다.',
        immediate: `IRP 대기자금 +${won(all)}${all < amount ? ` (한도 밖 ${won(amount - all)}는 생활자금)` : ''} · 세액공제 ${won(creditAll)} 환급 대기`,
        longTerm: `월 연금 +${monthly(all)}. 생활자금은 늘지 않습니다.`
      },
      {
        id: 'contribute-half', label: LIFE_CHOICE_LABELS['contribute-half'], enabled: half >= 100_000, reason: half >= 100_000 ? undefined : '연간 납입 한도가 남지 않았습니다.',
        immediate: `IRP +${won(half)} · 생활자금 +${won(amount - half)} · 세액공제 ${won(creditHalf)} 환급 대기`,
        longTerm: `월 연금 +${monthly(half)}. 비상자금도 조금 늘어납니다.`
      },
      { id: 'cash', label: CASH_CHOICE_LABELS.bonus, enabled: true, immediate: `생활자금 +${won(amount)}`, longTerm: 'IRP·월 연금 변화 없음. 다음 턴에 납입할 수 있습니다.' }
    ];
  }
  const tax = amount / TRANSFER_TAX_NOTICE.gross * TRANSFER_TAX_NOTICE.tax;
  return [
    {
      id: 'transfer-irp', label: LIFE_CHOICE_LABELS['transfer-irp'], enabled: true,
      immediate: `IRP 대기자금 +${won(amount)} · 세금 없음(과세 이연)`,
      longTerm: `월 연금 +${monthly(amount)}. 대기자금은 매수나 디폴트옵션으로 운용됩니다. 납입 한도와 무관.`
    },
    {
      id: 'cash', label: CASH_CHOICE_LABELS.transfer, enabled: true,
      immediate: `가상 원천징수영수증의 퇴직소득세 ${won(tax)} 차감 → 생활자금 +${won(amount - tax)}`,
      longTerm: '연금 재원이 늘지 않습니다. 생활자금이 넉넉해지지만 세금은 돌아오지 않습니다.'
    }
  ];
}

function alternativeLine(options: LifeChoiceOption[], chosen: LifeChoice): string {
  const others = options.filter((option) => option.id !== chosen && option.enabled);
  if (others.length === 0) return '';
  return `다른 선택이었다면: ${others.map((option) => `${option.label} — ${option.immediate}`).join(' / ')}`;
}

function resolutionBase(event: LifeEvent, choice: LifeChoice, options: LifeChoiceOption[]): Pick<LifeResolution, 'eventId' | 'title' | 'kind' | 'choice' | 'choiceLabel' | 'cost' | 'alternative'> {
  return {
    eventId: event.id,
    title: event.title,
    kind: event.kind,
    choice,
    choiceLabel: options.find((option) => option.id === choice)?.label ?? LIFE_CHOICE_LABELS[choice],
    cost: event.cost,
    alternative: alternativeLine(options, choice)
  };
}

function unlockCard(state: GameState, cardId: string): GameState {
  return state.unlockedCards.includes(cardId) ? state : { ...state, unlockedCards: [...state.unlockedCards, cardId] };
}

function finish(state: GameState, event: LifeEvent, resolution: LifeResolution, extraCard?: string): ActionResult {
  let next: GameState = {
    ...state,
    currentEventId: null,
    awaitingAction: true,
    lifeResolution: resolution,
    record: { ...state.record, lifeChoices: [...state.record.lifeChoices, { eventId: event.id, choice: resolution.choice }] },
    logs: [...state.logs, { turn: state.turn, type: 'life', message: `${event.title}: ${resolution.message}`, impact: -event.cost }]
  };
  next = unlockCard(next, event.learningCardId);
  if (extraCard) next = unlockCard(next, extraCard);
  return { ok: true, message: resolution.message, state: next };
}

/** 생활사건 선택 실행. 선택지가 사건 종류·상태에 맞지 않으면 거절한다 */
export function resolveLifeChoice(state: GameState, choice: LifeChoice): ActionResult {
  const event = lifeEvents.find((item) => item.id === state.currentEventId);
  if (!event) return { ok: false, message: '해결할 생활사건이 없습니다.', state };
  const options = lifeChoicesFor(state, event);
  const option = options.find((item) => item.id === choice);
  if (!option) return { ok: false, message: '이 사건에서 고를 수 없는 선택입니다.', state };
  if (!option.enabled) return { ok: false, message: option.reason ?? '지금은 고를 수 없는 선택입니다.', state };
  const amount = Math.abs(event.cost);
  const irpBefore = portfolioValue(state);
  const base = resolutionBase(event, choice, options);

  if (event.kind === 'cost') {
    if (choice === 'withdraw' || choice === 'deposit') {
      const out = withdrawalPlan(state, event, choice === 'deposit');
      if (!out.ok) return out;
      const flow = out.state.cashFlows.at(-1)!;
      const penalty = Math.max(0, irpBefore - portfolioValue(out.state) + flow.amount);
      return finish(out.state, event, { ...base, cashDelta: 0, irpDelta: portfolioValue(out.state) - irpBefore,
        penalty, fee: -flow.amount - amount, sales: [], shortage: false, message: out.message });
    }
    const paid = Math.min(state.cash, amount);
    const unpaid = amount - paid;
    const next = { ...state, cash: state.cash - paid, livingDebt: state.livingDebt + unpaid,
      cashShortages: state.cashShortages + (unpaid > 0 ? 1 : 0), safeActionCount: state.safeActionCount + (unpaid > 0 ? 0 : 1) };
    return finish(next, event, { ...base, cashDelta: -paid, irpDelta: 0, penalty: 0, fee: 0, sales: [], shortage: unpaid > 0,
      message: unpaid > 0 ? `생활비 ${won(paid)} 지급 · 미지급 ${won(unpaid)}는 다음 급여에서 우선 지급합니다. IRP는 인출하지 않았습니다.` : '생활자금으로 해결해 IRP를 지켰습니다.' });
  }

  if (event.kind === 'bonus') {
    if (choice === 'cash') {
      const next: GameState = { ...state, cash: state.cash + amount };
      return finish(next, event, { ...base, cashDelta: amount, irpDelta: 0, penalty: 0, fee: 0, sales: [], shortage: false, message: '보너스를 생활자금에 반영했습니다.' });
    }
    const room = contributionRoom(state);
    const wanted = choice === 'contribute-all' ? amount : Math.floor(amount / 2);
    const accepted = Math.min(wanted, room);
    const credit = contributionCredit(state.contributionTotal, accepted);
    const next: GameState = {
      ...state,
      cash: state.cash + (amount - accepted),
      irpCash: state.irpCash + accepted,
      contributionTotal: state.contributionTotal + accepted,
      taxCreditEligible: state.taxCreditEligible + credit.eligible,
      taxCreditBenefit: state.taxCreditBenefit + credit.benefit,
      pendingTaxCredit: state.pendingTaxCredit + credit.benefit,
      understandingPoints: state.understandingPoints + 1
    };
    const message = `보너스 ${won(accepted)}을 IRP에 납입했습니다${amount - accepted > 0 ? ` (나머지 ${won(amount - accepted)}는 생활자금)` : ''}. 세액공제 ${won(credit.benefit)}은 연말정산 칸을 지날 때 돌아옵니다.`;
    return finish(addAccountFlow(next, accepted, 'contribution', credit.eligible), event, { ...base, cashDelta: amount - accepted, irpDelta: accepted, penalty: 0, fee: 0, sales: [], shortage: false, message }, 'tax-credit');
  }

  // transfer
  if (choice === 'transfer-irp') {
    const next: GameState = { ...state, irpCash: state.irpCash + amount, understandingPoints: state.understandingPoints + 1 };
    return finish(addAccountFlow(next, amount, 'transfer'), event, { ...base, cashDelta: 0, irpDelta: amount, penalty: 0, fee: 0, sales: [], shortage: false, message: `퇴직급여 ${won(amount)}을 IRP 대기자금으로 옮겼습니다. 세금은 수령 때까지 미뤄집니다.` }, 'default-option');
  }
  const tax = amount / TRANSFER_TAX_NOTICE.gross * TRANSFER_TAX_NOTICE.tax;
  const next: GameState = { ...state, cash: state.cash + amount - tax };
  return finish(next, event, { ...base, cashDelta: amount - tax, irpDelta: 0, penalty: 0, fee: tax, sales: [], shortage: false, message: `퇴직급여를 지금 받아 교육용 세금 ${won(tax)}를 뗀 ${won(amount - tax)}이 생활자금이 됐습니다.` });
}
