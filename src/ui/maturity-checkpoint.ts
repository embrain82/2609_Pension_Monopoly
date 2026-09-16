import { balanceConfig } from '../data/content';
import { DEFAULT_PORTFOLIOS } from '../data/default-portfolios';
import { MATURITY_RULESET, activeCycle } from '../engine/maturity-cash';
import { positionsOf } from '../engine/position-engine';
import type { GameState } from '../types';

const nonnegative = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v) && v >= 0;
const turn = (v: unknown, max: number): v is number => Number.isInteger(v) && Number(v) >= 1 && Number(v) <= max;
const unique = (xs: string[]) => new Set(xs).size === xs.length;

export function validDefaultLifecycle(g: Omit<GameState,'campaign'>): boolean {
  const d = g.defaultLifecycle;
  if (g.rulesetVersion !== MATURITY_RULESET) return d === undefined;
  if (!d || d.version !== 'g1' || !g.defaultTrading || g.learningContentVersion !== '2026-09-16-situations' ||
      !Number.isInteger(d.lotSequence) || d.lotSequence < 1 || d.lotSequence > 512 ||
      !Array.isArray(d.cycles) || d.cycles.length > 256 || !Array.isArray(d.renewals) || d.renewals.length > 256) return false;
  const lotId = (id: unknown): id is string => typeof id === 'string' && /^deposit-\d+$/.test(id) && Number(id.slice(8)) < d.lotSequence;
  const option = (id: unknown) => DEFAULT_PORTFOLIOS.some(p => p.id === id);
  if (!d.cycles.every(c => c && lotId(c.depositLotId) && c.id === `maturity-${c.depositLotId}` &&
      turn(c.maturityTurn,g.turn) && nonnegative(c.originalAmount) && c.originalAmount > 0 && nonnegative(c.remaining) &&
      ['waiting','notified','blocked','ordered','directed','exhausted'].includes(c.state) &&
      (c.optionId === undefined || option(c.optionId)) &&
      (c.notifiedTurn === undefined || turn(c.notifiedTurn,g.turn) && c.notifiedTurn > c.maturityTurn && option(c.optionId)) &&
      (c.presentedTurn === undefined ? c.eligibleTurn === undefined : turn(c.presentedTurn,g.turn) && c.notifiedTurn !== undefined && c.presentedTurn >= c.notifiedTurn && c.eligibleTurn === c.presentedTurn + 1) &&
      (c.blockedReason === undefined || typeof c.blockedReason === 'string' && c.blockedReason.length < 300) &&
      (c.state !== 'notified' || c.notifiedTurn !== undefined) &&
      (['ordered','directed','exhausted'].includes(c.state) ? c.remaining === 0 : c.remaining > 0))) return false;
  if (!unique(d.cycles.map(c => c.id))) return false;
  if (d.cycles.reduce((s,c) => s + (activeCycle(c) ? c.remaining : 0),0) > g.irpCash + .00001) return false;
  for (const c of d.cycles) {
    if (c.state === 'directed' ? !nonnegative(c.directedAmount) || c.directedAmount <= 0 || !turn(c.directedTurn,g.turn) || c.directedTurn < c.maturityTurn : c.directedAmount !== undefined || c.directedTurn !== undefined) return false;
    const group = g.defaultTrading.groups.find(x => x.cycleId === c.id);
    if (c.state === 'ordered') {
      if (!turn(c.orderedTurn,g.turn) || c.eligibleTurn === undefined || c.orderedTurn < c.eligibleTurn ||
          !Number.isInteger(c.orderedAmount) || c.orderedAmount! < 1 || c.commandId !== `auto-${c.id}` ||
          !Array.isArray(c.orderIds) || !unique(c.orderIds) || !group || group.source !== 'automatic' || group.commandId !== c.commandId ||
          group.turn !== c.orderedTurn || group.amount !== c.orderedAmount || group.scope.optionId !== c.optionId ||
          JSON.stringify(group.orderIds) !== JSON.stringify(c.orderIds)) return false;
    } else if (group || c.commandId !== undefined || c.orderedTurn !== undefined || c.orderedAmount !== undefined || c.orderIds !== undefined) return false;
  }
  if (!g.defaultTrading.groups.every(x => x.source === undefined ? x.cycleId === undefined :
      x.source === 'automatic' && x.kind === 'in' && d.cycles.some(c => c.id === x.cycleId && c.state === 'ordered'))) return false;
  const lots = g.holdings.filter(h => h.productId === 'deposit').flatMap(h => positionsOf(h).flatMap(p => p.lots ?? []));
  if (!lots.every(l => lotId(l.id)) || !unique(lots.map(l => l.id!))) return false;
  if (lots.some(l => d.cycles.some(c => c.depositLotId === l.id))) return false;
  return d.renewals.every(r => r && lotId(r.lotId) && turn(r.turn,g.turn) && nonnegative(r.amount) && r.amount > 0 &&
    option(r.optionId) && r.optionId !== 'principal' && nonnegative(r.rate) && r.maturityTurn === r.turn + balanceConfig.depositMaturityTurns) &&
    unique(d.renewals.map(r => r.lotId)) && !d.renewals.some(r => lots.some(l => l.id === r.lotId) || d.cycles.some(c => c.depositLotId === r.lotId));
}
