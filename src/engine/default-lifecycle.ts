import { balanceConfig } from '../data/content';
import { defaultPortfolio, DEPOSIT_MATURITY_POLICY } from '../data/default-portfolios';
import type { ActionResult, GameState, MaturityCycle } from '../types';
import { automaticDefaultPurchase } from './default-trade-engine';
import { activeCycle, MATURITY_RULESET } from './maturity-cash';
import { aggregateHolding, positionsOf } from './position-engine';

export function initializeDefaultLifecycle(state: GameState): GameState {
  let sequence = 0;
  const holdings = state.holdings.map(h => h.productId !== 'deposit' ? h : aggregateHolding(h.productId,
    positionsOf(h).map(p => ({ ...p, lots: p.lots?.map(l => ({ ...l, id: `deposit-${sequence++}` })) }))));
  return { ...state, holdings, defaultLifecycle: { version: 'g1', lotSequence: sequence, cycles: [], renewals: [] } };
}

/** Called after the final contractual interest and the market attribution snapshot. */
export function matureDeposits(state: GameState): GameState {
  if (!state.defaultLifecycle || state.rulesetVersion !== MATURITY_RULESET) return state;
  let sequence = state.defaultLifecycle.lotSequence, cash = 0;
  const cycles = [...state.defaultLifecycle.cycles], renewals = [...state.defaultLifecycle.renewals], logs = [...state.logs];
  const rate = balanceConfig.market.depositBase + balanceConfig.market.depositPerRatePct * state.lastMarket.ratePct;
  const holdings = state.holdings.map(h => {
    if (h.productId !== 'deposit') return h;
    const positions = positionsOf(h).map(p => {
      const lots = (p.lots ?? []).flatMap(lot => {
        if (lot.maturityTurn > state.turn) return [lot];
        if (!lot.id) throw new Error('New-rule deposit is missing its contract ID');
        // Educational contracts: mixed options renew internally; deposit-only options redeem.
        if (p.scope && DEPOSIT_MATURITY_POLICY[p.scope.optionId] === 'renew') {
          const id = `deposit-${sequence++}`;
          const maturityTurn = state.turn + balanceConfig.depositMaturityTurns;
          renewals.push({ lotId: lot.id, turn: state.turn, amount: lot.amount, optionId: p.scope.optionId, rate, maturityTurn });
          logs.push({ turn: state.turn, type: 'deposit-renewal', message: `${defaultPortfolio(p.scope.optionId).name} 안의 예금 재예치 · 새 약정 턴당 ${(rate*100).toFixed(2)}% · ${maturityTurn}턴 만기. 가상 계약 조건입니다.` });
          return [{ ...lot, id, principal: lot.amount, openedTurn: state.turn, maturityTurn, ratePerTurn: rate }];
        }
        if (cycles.some(c => c.depositLotId === lot.id)) throw new Error('Matured contract has already been redeemed');
        cash += lot.amount;
        cycles.push({ id: `maturity-${lot.id}`, depositLotId: lot.id, maturityTurn: state.turn,
          originalAmount: lot.amount, remaining: lot.amount, state: 'waiting' });
        logs.push({ turn: state.turn, type: 'deposit-maturity', message: `예금 만기 · 원리금 ${Math.round(lot.amount).toLocaleString('ko-KR')}원이 IRP 대기자금으로 이동했습니다. 수익·외부 납입으로 중복 집계하지 않습니다.` });
        return [];
      });
      const amount = lots.reduce((sum, l) => sum + l.amount, 0);
      return { ...p, lots, amount, principal: lots.reduce((sum, l) => sum + l.principal, 0), units: amount / state.prices.deposit };
    }).filter(p => p.amount > .0000001);
    return aggregateHolding(h.productId, positions);
  });
  return { ...state, holdings, irpCash: state.irpCash + cash, logs,
    defaultLifecycle: { ...state.defaultLifecycle, lotSequence: sequence, cycles, renewals } };
}

function notify(cycle: MaturityCycle, state: GameState): MaturityCycle {
  return { ...cycle, state: 'notified', optionId: state.defaultOption!, notifiedTurn: state.turn,
    presentedTurn: undefined, eligibleTurn: undefined, blockedReason: undefined };
}

/** Changing a designation never trades; a new notice gets its own waiting stage. */
export function resetMaturityDesignation(state: GameState): GameState {
  if (!state.defaultLifecycle) return state;
  return { ...state, defaultLifecycle: { ...state.defaultLifecycle, cycles: state.defaultLifecycle.cycles.map(c => {
    if (!activeCycle(c)) return c;
    const reset: MaturityCycle = { ...c, state: 'waiting', optionId: undefined, notifiedTurn: undefined,
      presentedTurn: undefined, eligibleTurn: undefined, blockedReason: undefined };
    return state.defaultOption && state.turn > c.maturityTurn ? notify(reset, state) : reset;
  }) } };
}

/** Delivery is recorded only when the notice is presented by the UI (or simulation driver). */
export function presentMaturityNotices(state: GameState): GameState {
  if (!state.defaultLifecycle?.cycles.some(c => activeCycle(c) && c.notifiedTurn !== undefined && c.presentedTurn === undefined)) return state;
  return { ...state, defaultLifecycle: { ...state.defaultLifecycle, cycles: state.defaultLifecycle.cycles.map(c =>
    activeCycle(c) && c.notifiedTurn !== undefined && c.presentedTurn === undefined
      ? { ...c, presentedTurn: state.turn, eligibleTurn: state.turn + 1 } : c) } };
}

/** Game-stage clock, never wall-clock time. Run once at the beginning of a turn. */
export function advanceDefaultLifecycle(state: GameState): GameState {
  if (!state.defaultLifecycle || state.status !== 'playing' || state.turn > 12) return state;
  let next = state;
  for (const id of state.defaultLifecycle.cycles.map(c => c.id)) {
    const cycle = next.defaultLifecycle!.cycles.find(c => c.id === id)!;
    if (!activeCycle(cycle) || next.turn <= cycle.maturityTurn) continue;
    let updated = cycle;
    if (!next.defaultOption) {
      updated = { ...cycle, state: 'blocked', optionId: undefined, notifiedTurn: undefined,
        presentedTurn: undefined, eligibleTurn: undefined, blockedReason: '사전지정 필요 · 추천 옵션을 임의로 매수하지 않습니다.' };
    } else if (cycle.notifiedTurn === undefined || cycle.optionId !== next.defaultOption) {
      updated = notify(cycle, next);
      next = { ...next, logs: [...next.logs, { turn: next.turn, type: 'default-notice',
        message: `만기자금 자동운용 통지 · ${defaultPortfolio(next.defaultOption).name}. 실제 제도는 통지 후 2주 무지시 시 적용하며, 게임은 통지가 표시된 다음 턴 단계에서 적용합니다.` }] };
    } else if (cycle.presentedTurn !== undefined && cycle.eligibleTurn! <= next.turn) {
      const result = automaticDefaultPurchase(next, id);
      if (result.ok) { next = result.state; continue; }
      updated = { ...cycle, state: 'blocked', blockedReason: result.message };
    }
    next = { ...next, defaultLifecycle: { ...next.defaultLifecycle!, cycles: next.defaultLifecycle!.cycles.map(c => c.id === id ? updated : c) } };
  }
  return next;
}

/** Explicit instruction, called through performAction so it consumes exactly one action. */
export function keepMaturityCash(state: GameState, cycleId?: string): ActionResult {
  const cycle = state.defaultLifecycle?.cycles.find(c => c.id === cycleId);
  if (!cycle || !activeCycle(cycle)) return { ok: false, message: '현재 대기 중인 만기자금을 확인하세요.', state };
  return { ok: true, message: `만기자금 ${Math.round(cycle.remaining).toLocaleString('ko-KR')}원 현금 유지 지시 · 이 만기 건은 자동운용에서 제외합니다. 다른 만기 건과 사전지정은 유지합니다.`,
    state: { ...state, defaultLifecycle: { ...state.defaultLifecycle!, cycles: state.defaultLifecycle!.cycles.map(c => c.id === cycleId
      ? { ...c, directedAmount: c.remaining, directedTurn: state.turn, remaining: 0, state: 'directed', blockedReason: undefined } : c) } } };
}
