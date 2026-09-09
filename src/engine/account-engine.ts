import { registerCash } from './cash-ledger';
import type { AccountBasis, GameState, PayoutChoice, PayoutPlan } from '../types';
import { policyRules } from '../data/content';

/** 가상 퇴직소득 원천징수영수증의 세액. 일반 퇴직소득세율이 아니다. */
export const TRANSFER_TAX_NOTICE = { gross: 6_000_000, tax: 60_000 };
export const SCENARIO_CLOCK = {
  maxTurns: 12, assessmentYears: 1, pensionStartAge: 55, accountAgeYears: 5,
  description: '12턴은 압축 체험입니다. 납입·공제 한도는 1년분, 결제 대기는 게임 시간입니다. 연금은 55세부터 20년·가입 5년 이상·다른 연금소득 없음으로 계산합니다.'
};

export function addAccountFlow(state: GameState, amount: number, kind: 'contribution' | 'transfer', deductible = 0): GameState {
  const basis = { ...state.accountBasis };
  if (kind === 'transfer') {
    basis.retirement += amount;
    basis.retirementTax += amount / TRANSFER_TAX_NOTICE.gross * TRANSFER_TAX_NOTICE.tax;
  } else {
    basis.deducted += deductible;
    basis.nonDeducted += amount - deductible;
  }
  return registerCash({ ...state, accountBasis: basis, cashFlows: [...state.cashFlows, { turn: state.turn, kind, amount }] }, amount, kind);
}

/** 손실 시 원금을 비례 축소하는 교육 모형. 운용수익은 잔액과 원금의 차액. */
export function sourceBalances(value: number, basis: AccountBasis) {
  const principal = basis.retirement + basis.deducted + basis.nonDeducted;
  const scale = principal > 0 ? Math.min(1, Math.max(0, value) / principal) : 1;
  return {
    nonDeducted: basis.nonDeducted * scale,
    retirement: basis.retirement * scale,
    deducted: basis.deducted * scale,
    earnings: Math.max(0, value - principal),
    retirementTax: basis.retirementTax * scale
  };
}

/** 인출 순서: 미공제 원금 → 이연퇴직소득 → 공제 원금·운용수익. */
export function withdrawalTax(value: number, basis: AccountBasis, gross: number, pensionYear = 0, age = 55) {
  const available = sourceBalances(value, basis);
  gross = Math.max(0, Math.min(value, gross));
  let remaining = gross;
  let tax = 0;
  const used = { nonDeducted: 0, retirement: 0, deducted: 0, earnings: 0 };
  for (const key of ['nonDeducted', 'retirement', 'deducted', 'earnings'] as const) {
    const take = Math.min(available[key], remaining);
    used[key] = take;
    remaining -= take;
    if (key === 'retirement') {
      const fraction = pensionYear > 20 ? 0.5 : pensionYear > 10 ? 0.6 : pensionYear > 0 ? 0.7 : 1;
      tax += available.retirement > 0 ? take / available.retirement * available.retirementTax * fraction : 0;
    } else if (key !== 'nonDeducted') {
      tax += take * (pensionYear > 0 ? age >= 80 ? 0.033 : age >= 70 ? 0.044 : 0.055 : policyRules.lumpSumTaxRate);
    }
  }
  const retiredTaxUsed = available.retirement > 0 ? used.retirement / available.retirement * available.retirementTax : 0;
  const nextBasis: AccountBasis = {
    retirement: available.retirement - used.retirement,
    retirementTax: available.retirementTax - retiredTaxUsed,
    deducted: available.deducted - used.deducted,
    nonDeducted: available.nonDeducted - used.nonDeducted
  };
  return { gross: gross - remaining, tax, net: gross - remaining - tax, nextBasis, used };
}

export function grossForNet(value: number, basis: AccountBasis, need: number): number {
  if (withdrawalTax(value, basis, value).net + 0.001 < need) return Infinity;
  let lo = 0, hi = value;
  for (let i = 0; i < 60; i++) {
    const mid = (lo + hi) / 2;
    if (withdrawalTax(value, basis, mid).net < need) lo = mid;
    else hi = mid;
  }
  return hi;
}

export function accountPayout(value: number, choice: PayoutChoice, basis: AccountBasis): PayoutPlan {
  const annuityTax = () => {
    let remaining = value, current = basis, total = 0;
    for (let year = 1; year <= 20; year++) {
      const payment = withdrawalTax(remaining, current, value / 20, year, 54 + year);
      total += payment.tax;
      remaining -= payment.gross;
      current = payment.nextBasis;
    }
    return total;
  };
  const pensionTax = annuityTax();
  const tax = choice === 'annuity20' ? pensionTax : withdrawalTax(value, basis, value).tax;
  const net = value - tax;
  const factor = value > pensionTax ? net / (value - pensionTax) : 1;
  return { choice, taxRate: value > 0 ? tax / value : 0, tax, net,
    monthlyNet: net / policyRules.receivingMonths,
    monthlyBasis: value / policyRules.receivingMonths * (choice === 'annuity20' ? 1 : factor) };
}
