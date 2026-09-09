import type { DefaultCashLot, GameState } from '../types';

/** 디폴트옵션 절차만 1턴=2주로 압축한다. 납입 과세연도/시장 시간과 별개. */
export const DEFAULT_CLOCK = { maturityWait: 2, noticeWait: 1 };

export function registerCash(state: GameState, amount: number, cashOrigin: DefaultCashLot['cashOrigin']): GameState {
  if (amount <= 0) return state;
  const eligibility = cashOrigin === 'maturity' || cashOrigin === 'newAccount';
  const lot: DefaultCashLot = { id: state.cashSequence, amount, cashOrigin, createdTurn: state.turn,
    eligibility, explicitCashInstruction: false, noticeAt: null, activateAt: null,
    optionId: null, status: eligibility ? 'unassigned' : 'cash' };
  return { ...state, cashSequence: state.cashSequence + 1, defaultCashLots: [...state.defaultCashLots, lot] };
}

/** 실제 매수/인출에 사용된 현금만 FIFO 차감. 자동운용은 선택한 대상 자금만 차감한다. */
export function spendCashLots(state: GameState, amount: number, ids?: number[]): GameState {
  let left = amount;
  const defaultCashLots = state.defaultCashLots.map(lot => {
    if (ids && !ids.includes(lot.id)) return lot;
    const used = Math.min(left, lot.amount); left -= used;
    return { ...lot, amount: lot.amount - used };
  }).filter(lot => lot.amount > 0.001);
  return { ...state, defaultCashLots };
}

export function keepCash(state: GameState): GameState {
  return { ...state, defaultCashLots: state.defaultCashLots.map(lot => ({ ...lot,
    explicitCashInstruction: true, status: 'cash', noticeAt: null, activateAt: null })) };
}
