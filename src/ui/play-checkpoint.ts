import { SCENARIOS, MISSIONS, type Campaign } from '../engine/scenario-engine';
import { products } from '../data/content';
import { emptyMarketStep } from '../engine/market-engine';
import { createGame } from '../engine/game-engine';
import type { GameState, TurnSummary } from '../types';
export const CHECKPOINT_KEY = 'pension-road-play-c1';
export interface PlayCheckpoint {
  version: 'c2';
  game: GameState;
  modal: string | null;
  lastSummary: TurnSummary | null;
  quizCardId: string | null;
  quizPicked: number | null;
  finalQuizQueue: string[];
  finalQuizTotal: number;
  finishing: boolean;
  defaultOptionAsk: boolean;
}
// 설정 저장과 분리한다. c1 저장 키를 유지해 기존 진행을 c2로 변환한다.
function shape(template: unknown, value: unknown): boolean {
  if (template === null) return value === null || typeof value === 'object' || typeof value === 'string' || typeof value === 'number';
  if (Array.isArray(template)) return Array.isArray(value);
  if (typeof template === 'object') return value !== null && typeof value === 'object' && Object.entries(template as object).every(([k,v]) => shape(v, (value as Record<string, unknown>)[k]));
  return typeof value === typeof template && (typeof value !== 'number' || Number.isFinite(value));
}
function validCampaign(d: Campaign, depth = 0): boolean {
  if (!d || !Object.hasOwn(SCENARIOS,d.scenario) || !Object.hasOwn(MISSIONS,d.mission) || typeof d.weekly !== 'boolean') return false;
  if (![d.priceIndex,d.index,d.peak,d.drawdown,d.open,d.afterMarket,d.flowStart,d.benchmark,d.benchmarkOpen,d.startingGoal].every(Number.isFinite) || d.priceIndex <= 0 || d.index < 0 || d.peak <= 0) return false;
  if (!['stable','stableGrowth','balanced','growth','aggressive'].includes(d.startingProfile)) return false;
  if (!products.every(p=>Number.isFinite(d.baselineWeights[p.id]) && d.baselineWeights[p.id]>=0)) return false;
  if (!Array.isArray(d.reviews) || d.reviews.length>12 || !d.reviews.every(r=>Number.isInteger(r.turn) && r.turn>=1 && r.turn<=12 && [r.irp,r.flow,r.market,r.costs,r.cash,r.index,r.realIndex,r.benchmark].every(Number.isFinite) && typeof r.headline==='string' && Array.isArray(r.actions) && r.actions.every(a=>typeof a==='string') && Array.isArray(r.holdings) && r.holdings.every(h=>products.some(p=>p.id===h.productId) && Number.isFinite(h.amount) && h.amount>=0))) return false;
  if (!Array.isArray(d.branches) || d.branches.length>3 || (depth>0 && d.branches.length)) return false;
  return d.branches.every(b=>[3,6,9].includes(b.turn) && b.state.turn===b.turn && b.state.status==='playing' && shape(createGame('validate','balanced',500000,{ghost:false}),b.state) && validCampaign({...b.progress,branches:[]},depth+1));
}
export function parseCheckpoint(raw: string | null): PlayCheckpoint | null {
  try {
    if (!raw || raw.length > 1000000) return null;
    const legacy = JSON.parse(raw);
    if (!['c1', 'c2'].includes(legacy.version) || !legacy.game?.route) return null;
    if (legacy.version === 'c1' && (legacy.routePending || legacy.modal === 'route')) legacy.modal = null;
    const { visits, badges, reflections } = legacy.game.route;
    const data: PlayCheckpoint = { ...legacy, version: 'c2', game: { ...legacy.game, route: { visits, badges, reflections } } };
    delete (data as PlayCheckpoint & { routePending?: boolean }).routePending;
    if (!shape(createGame('validate', 'balanced', 500000, { ghost: false }), data.game)) return null;
    const g = data.game;
    if(g.campaign && !validCampaign(g.campaign)) return null;
    const finite = (n: unknown): n is number => typeof n === 'number' && Number.isFinite(n);
    if (g.rulesetVersion !== (g.campaign ? '2026-09-10-d' : '2026-09-10-c')) return null;
    if (!g.holdings.every(h => h && products.some(p => p.id === h.productId) && finite(h.amount) && h.amount >= 0 && finite(h.principal))) return null;
    if (!g.pendingOrders.every(o => o && products.some(p => p.id === o.productId) && ['buy','sell'].includes(o.side) && finite(o.amount) && finite(o.settlesTurn))) return null;
    if (!g.marketPath.every(m => shape(emptyMarketStep(),m)) || !shape(emptyMarketStep(),g.lastMarket)) return null;
    if (!g.logs.every(l => l && finite(l.turn) && typeof l.type === 'string' && typeof l.message === 'string')) return null;
    if (!g.irpHistory.every(finite) || !g.unlockedCards.every(id => typeof id === 'string')) return null;
    if (!g.route.visits.every(i => Number.isInteger(i) && i >= 0 && i < 24) ||
      !g.route.badges.every(i => Number.isInteger(i) && i >= 0 && i < 4) ||
      !g.route.reflections.every(r => r && Number.isInteger(r.region) && r.region >= 0 && r.region < 4 && Number.isInteger(r.reason) && r.reason >= 0 && r.reason < 4)) return null;
    if (!finite(data.finalQuizTotal) || data.finalQuizTotal < 0 || data.finalQuizTotal > 3 ||
      !(data.quizCardId === null || typeof data.quizCardId === 'string') || !(data.quizPicked === null || [0,1,2].includes(data.quizPicked))) return null;
    if (!['playing','finished'].includes(g.status) || !Number.isInteger(g.turn) || g.turn < 0 || g.turn > 12 || !Number.isInteger(g.position) || g.position < 0 || g.position >= 24 || g.cash < 0 || g.irpCash < 0 || g.actionsLeft < 0 || g.actionsLeft > 2) return null;
    if (!['stable','stableGrowth','balanced','growth','aggressive'].includes(g.profileId) || !['stable','stableGrowth','balanced','growth','aggressive'].includes(g.avatarId)) return null;
    if (!Array.isArray(data.finalQuizQueue) || typeof data.finishing !== 'boolean' || typeof data.defaultOptionAsk !== 'boolean') return null;
    if (![null,'life','action','portfolio','market','cards','settings','howto','news','tile','settle','quiz','payout','default-option','explore'].includes(data.modal)) return null;
    if (data.modal === 'settle' && (!data.lastSummary || !finite(data.lastSummary.turn) || !Array.isArray(data.lastSummary.milestones) || !finite(data.lastSummary.irpAfter))) return null;
    return data;
  } catch { return null; }
}
export function readCheckpoint(): PlayCheckpoint | null {
  try { return parseCheckpoint(localStorage.getItem(CHECKPOINT_KEY)); } catch { return null; }
}
export function writeCheckpoint(data: PlayCheckpoint): boolean {
  try { localStorage.setItem(CHECKPOINT_KEY, JSON.stringify(data)); return true; } catch { return false; }
}
export function clearCheckpoint(): void { try { localStorage.removeItem(CHECKPOINT_KEY); } catch { /* 저장소 차단 */ } }
