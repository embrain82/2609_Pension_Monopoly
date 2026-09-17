import { MATURITY_RULESET, accrueMaturityCash } from './maturity-cash';
import { investorProfiles, products } from '../data/content';
import type { CashInterest, GameState, ProductId, ProfileId } from '../types';

export const FINANCE_RULESET = '2026-09-15-f' as const;
export const CASH_RATE_PER_TURN = 0.001;

/** Starting examples are versioned separately from the long-term rebalance targets. */
export function startingAllocation(profileId: ProfileId, updated = false): Record<ProductId, number> {
  const original = investorProfiles.find(p => p.id === profileId)!.startingAllocation;
  return updated && profileId === 'aggressive'
    ? { ...original, deposit: .35, balanced: .20, equityEtf: .45 } : { ...original };
}

export function newFinanceRules(profileId: ProfileId, maturity = false): NonNullable<GameState['financeRules']> {
  return { version: maturity ? 'f2' : 'f1', startingAllocation: startingAllocation(profileId, true), cashRatePerTurn: CASH_RATE_PER_TURN, lastInterestTurn: 0 };
}

/** Called only in the market phase, before order settlements and this turn's cash flows. */
export function accrueWaitingCash(state: GameState): GameState {
  const rules = state.financeRules;
  if (!hasCashInterestRules(state) || !rules || state.turn < 1 || state.turn > 12 || rules.lastInterestTurn >= state.turn) return state;
  const interest: CashInterest = { turn: state.turn, opening: state.irpCash, rate: rules.cashRatePerTurn, amount: state.irpCash * rules.cashRatePerTurn };
  return { ...accrueMaturityCash(state, rules.cashRatePerTurn), irpCash: state.irpCash + interest.amount,
    financeRules: { ...rules, lastInterestTurn: state.turn },
    ledger: { ...state.ledger, cashInterest: interest } };
}

export function validCashInterest(value: unknown): value is CashInterest {
  if (!value || typeof value !== 'object') return false;
  const v = value as CashInterest;
  return Number.isInteger(v.turn) && v.turn >= 1 && v.turn <= 12 &&
    Number.isFinite(v.opening) && v.opening >= 0 && v.rate === CASH_RATE_PER_TURN &&
    Number.isFinite(v.amount) && v.amount >= 0 && Math.abs(v.amount - v.opening * v.rate) < .000001;
}

/** Reject inconsistent new/old rules, including embedded chapter snapshots. */
export function validFinanceRules(game: Omit<GameState, 'campaign'>): boolean {
  const r = game.financeRules;
  if (!hasCashInterestRules(game)) return r === undefined && game.ledger.cashInterest === undefined;
  if (!r || r.version !== (game.rulesetVersion === MATURITY_RULESET ? 'f2' : 'f1') || r.cashRatePerTurn !== CASH_RATE_PER_TURN || r.lastInterestTurn !== game.turn ||
      !r.startingAllocation || !investorProfiles.some(p => p.id === game.profileId)) return false;
  const expected = startingAllocation(game.profileId, true);
  if (!products.every(p => r.startingAllocation[p.id] === expected[p.id]) || Object.keys(r.startingAllocation).length !== products.length) return false;
  return game.turn === 0 ? game.ledger.cashInterest === undefined
    : validCashInterest(game.ledger.cashInterest) && game.ledger.cashInterest.turn === game.turn;
}

export function hasCashInterestRules(state: Pick<GameState,'rulesetVersion'>): boolean { return state.rulesetVersion === FINANCE_RULESET || state.rulesetVersion === MATURITY_RULESET; }
