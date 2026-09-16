import type { GameState, MaturityCycle } from '../types';

export const MATURITY_RULESET = '2026-09-16-g' as const;
export const activeCycle = (cycle: MaturityCycle): boolean =>
  ['waiting', 'notified', 'blocked'].includes(cycle.state) && cycle.remaining > 0;

/** Subledger only: cash is held once in irpCash, never added to portfolioValue. */
export function consumeMaturityCash(state: GameState, amount: number, cycleId?: string): GameState {
  if (!state.defaultLifecycle) return state;
  let left = amount;
  const cycles = state.defaultLifecycle.cycles.map(cycle => {
    if (!activeCycle(cycle) || (cycleId && cycle.id !== cycleId) || left <= 0) return cycle;
    const used = Math.min(left, cycle.remaining);
    left -= used;
    const remaining = Math.max(0, cycle.remaining - used);
    return { ...cycle, remaining, ...(remaining < .0000001 ? { remaining: 0, state: 'exhausted' as const } : {}) };
  });
  return { ...state, defaultLifecycle: { ...state.defaultLifecycle, cycles } };
}

/** Accrued once alongside opening-cash interest, not on freshly matured cash. */
export function accrueMaturityCash(state: GameState, rate: number): GameState {
  if (!state.defaultLifecycle) return state;
  return { ...state, defaultLifecycle: { ...state.defaultLifecycle,
    cycles: state.defaultLifecycle.cycles.map(c => activeCycle(c) ? { ...c, remaining: c.remaining * (1 + rate) } : c) } };
}
