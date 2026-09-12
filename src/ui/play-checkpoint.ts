import { validRoute } from '../engine/route-engine';
import { validLearningFlow } from '../engine/quiz-engine';
import { normalizeMissionMilestones } from '../engine/milestones';
import { SCENARIOS, MISSIONS, type Campaign } from '../engine/scenario-engine';
import { products } from '../data/content';
import { emptyMarketStep } from '../engine/market-engine';
import { createGame } from '../engine/game-engine';
import type { GameState, MarketHoldingEffect, TurnSummary } from '../types';
import { validDefaultLedger } from './default-checkpoint';
import type { DefaultTradeDraft } from '../engine/default-trade-engine';
import { isDefaultOptionId } from '../engine/default-option';
import { DEFAULT_PORTFOLIOS } from '../data/default-portfolios';
import { validContributionPacing } from '../engine/contribution-engine';
export const CHECKPOINT_KEY = 'pension-road-play-c1';
export interface PlayCheckpoint {
  version: 'c2' | 'c3';
  actionContext?: { view: 'menu' | 'default'; draft: DefaultTradeDraft | null; portfolioReturn: boolean };
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
// 설정 저장과 분리한다. 기존 저장 키를 유지하고 새 거래 장부는 c3으로 구분한다.
function shape(template: unknown, value: unknown): boolean {
  if (template === null) return value === null || typeof value === 'object' || typeof value === 'string' || typeof value === 'number';
  if (Array.isArray(template)) return Array.isArray(value);
  if (typeof template === 'object') return value !== null && typeof value === 'object' && Object.entries(template as object).every(([k,v]) => shape(v, (value as Record<string, unknown>)[k]));
  return typeof value === typeof template && (typeof value !== 'number' || Number.isFinite(value));
}
function validCampaign(d: Campaign, depth = 0, pacing?: GameState['contributionPacing'], routeVersion?: GameState['route']['version']): boolean {
  if (!d || !Object.hasOwn(SCENARIOS,d.scenario) || !Object.hasOwn(MISSIONS,d.mission) || typeof d.weekly !== 'boolean') return false;
  if (![d.priceIndex,d.index,d.peak,d.drawdown,d.open,d.afterMarket,d.flowStart,d.benchmark,d.benchmarkOpen,d.startingGoal].every(Number.isFinite) || d.priceIndex <= 0 || d.index < 0 || d.peak <= 0) return false;
  if (!['stable','stableGrowth','balanced','growth','aggressive'].includes(d.startingProfile)) return false;
  if (!products.every(p=>Number.isFinite(d.baselineWeights[p.id]) && d.baselineWeights[p.id]>=0)) return false;
  if (!Array.isArray(d.reviews) || d.reviews.length>12 || !d.reviews.every(r=>Number.isInteger(r.turn) && r.turn>=1 && r.turn<=12 && [r.irp,r.flow,r.market,r.costs,r.cash,r.index,r.realIndex,r.benchmark].every(Number.isFinite) && typeof r.headline==='string' && Array.isArray(r.actions) && r.actions.every(a=>typeof a==='string') && Array.isArray(r.holdings) && r.holdings.every(h=>products.some(p=>p.id===h.productId) && Number.isFinite(h.amount) && h.amount>=0))) return false;
  if (!d.reviews.every(r =>
    (r.defaultHoldings === undefined || (Array.isArray(r.defaultHoldings) && r.defaultHoldings.every(h => products.some(p => p.id === h.productId) && DEFAULT_PORTFOLIOS.some(p => p.id === h.optionId) && Number.isFinite(h.amount) && h.amount >= 0))) &&
    (r.defaultOrders === undefined || (Array.isArray(r.defaultOrders) && r.defaultOrders.every(o => typeof o.id === 'string' && ['buy','sell'].includes(o.side) && ['received','priced'].includes(o.stage) && Number.isFinite(o.amount) && o.amount >= 0)))
  )) return false;
  if (!Array.isArray(d.branches) || d.branches.length>3 || (depth>0 && d.branches.length)) return false;
  return d.branches.every(b=>[3,6,9].includes(b.turn) && b.state.turn===b.turn && b.state.status==='playing' && shape(createGame('validate','balanced',500000,{ghost:false}),b.state) && validMarketEffects(b.state.ledger.marketEffects) && validDefaultLedger(b.state) && validContributionPacing(b.state) && validLearningFlow(b.state) && validRoute(b.state.route) && b.state.route.version === routeVersion &&
    b.state.contributionPacing?.version === pacing?.version && b.state.contributionPacing?.perTurnLimit === pacing?.perTurnLimit && validCampaign({...b.progress,branches:[]},depth+1,pacing,routeVersion));
}
/** 새 표시 내역만 검증한다. 없는 구 저장에는 보유 영향을 추정하지 않는다. */
function validMarketEffects(value: unknown): boolean {
  if (value === undefined) return true;
  if (!Array.isArray(value) || value.length > products.length) return false;
  return new Set(value.map(e => e?.productId)).size === value.length && value.every((effect: Partial<MarketHoldingEffect> | null) =>
    effect && products.some(p => p.id === effect.productId) && typeof effect.opening === 'number' && Number.isFinite(effect.opening) && effect.opening > 0 &&
    typeof effect.delta === 'number' && Number.isFinite(effect.delta) && typeof effect.returnRate === 'number' && Number.isFinite(effect.returnRate) &&
    Math.abs(effect.delta / effect.opening - effect.returnRate) < 1e-8);
}

export function parseCheckpoint(raw: string | null): PlayCheckpoint | null {
  try {
    if (!raw || raw.length > 1000000) return null;
    const legacy = JSON.parse(raw);
    if (!['c1', 'c2', 'c3'].includes(legacy.version) || !legacy.game?.route) return null;
    if (legacy.version === 'c1' && (legacy.routePending || legacy.modal === 'route')) legacy.modal = null;
    const { visits, badges, reflections, version } = legacy.game.route;
    const data: PlayCheckpoint = { ...legacy, version: legacy.version==='c3'?'c3':'c2', game: { ...legacy.game, route: { visits, badges, reflections, ...(version === undefined ? {} : { version }) } } };
    delete (data as PlayCheckpoint & { routePending?: boolean }).routePending;
    if (!shape(createGame('validate', 'balanced', 500000, { ghost: false }), data.game)) return null;
    const g = data.game;
    if (!validMarketEffects(g.ledger.marketEffects) || !validMarketEffects(data.lastSummary?.marketEffects)) return null;
    if(!validLearningFlow(g) || !validContributionPacing(g) || (g.campaign && !validCampaign(g.campaign,0,g.contributionPacing,g.route.version))) return null;
    const finite = (n: unknown): n is number => typeof n === 'number' && Number.isFinite(n);
    if (g.rulesetVersion !== (data.version==='c3' ? '2026-09-10-e' : g.campaign ? '2026-09-10-d' : '2026-09-10-c')) return null;
    if(!validDefaultLedger(g)) return null;
    if(data.actionContext) {
      const c=data.actionContext,d=c.draft;
      if(!g.defaultTrading||!['menu','default'].includes(c.view)||typeof c.portfolioReturn!=='boolean') return null;
      if(d&&(!['in','out'].includes(d.tab)||!isDefaultOptionId(d.optionId)||!finite(d.amount)||d.amount<0||![.5,1].includes(d.fraction))) return null;
      if(c.view==='default'&&!d) return null;
    }
    if (!g.holdings.every(h => h && products.some(p => p.id === h.productId) && finite(h.amount) && h.amount >= 0 && finite(h.principal))) return null;
    if (!g.pendingOrders.every(o => o && products.some(p => p.id === o.productId) && ['buy','sell'].includes(o.side) && finite(o.amount) && finite(o.settlesTurn))) return null;
    if (!g.marketPath.every(m => shape(emptyMarketStep(),m)) || !shape(emptyMarketStep(),g.lastMarket)) return null;
    if (!g.logs.every(l => l && finite(l.turn) && typeof l.type === 'string' && typeof l.message === 'string')) return null;
    if (!g.irpHistory.every(finite) || !g.unlockedCards.every(id => typeof id === 'string')) return null;
    if (!validRoute(g.route)) return null;
    if (!finite(data.finalQuizTotal) || data.finalQuizTotal < 0 || data.finalQuizTotal > 3 ||
      !(data.quizCardId === null || typeof data.quizCardId === 'string') || !(data.quizPicked === null || [0,1,2].includes(data.quizPicked))) return null;
    if (!['playing','finished'].includes(g.status) || !Number.isInteger(g.turn) || g.turn < 0 || g.turn > 12 || !Number.isInteger(g.position) || g.position < 0 || g.position >= 24 || g.cash < 0 || g.irpCash < 0 || g.actionsLeft < 0 || g.actionsLeft > 2) return null;
    if (!['stable','stableGrowth','balanced','growth','aggressive'].includes(g.profileId) || !['stable','stableGrowth','balanced','growth','aggressive'].includes(g.avatarId)) return null;
    if (!Array.isArray(data.finalQuizQueue) || typeof data.finishing !== 'boolean' || typeof data.defaultOptionAsk !== 'boolean') return null;
    if (![null,'life','action','portfolio','market','cards','settings','howto','news','tile','settle','quiz','payout','default-option','explore'].includes(data.modal)) return null;
    if (data.modal === 'settle' && (!data.lastSummary || !finite(data.lastSummary.turn) || !Array.isArray(data.lastSummary.milestones) || !finite(data.lastSummary.irpAfter))) return null;
    const normalized = normalizeMissionMilestones(data.game);
    if (normalized !== data.game) return { ...data, game: normalized,
      lastSummary: data.lastSummary ? { ...data.lastSummary, milestones: (data.lastSummary.milestones ?? []).filter(m => m.id === 'drawdown-12') } : null };
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
