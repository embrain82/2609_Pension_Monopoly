import { explainMarketStep } from './market-explanation';
import { mapHoldingBalances } from './position-engine';
import { balanceConfig, marketShocks, policyRules, products } from '../data/content';
import type { GameState, MarketConfig, MarketShock, MarketStep, MarketHoldingEffect, ProductId, Regime } from '../types';
import { hashSeed } from './random-engine';
import { depositLots, portfolioValue } from './portfolio-engine';
import { riskAssetRatio } from './policy-engine';
import {
  applyMacroMove, createRng, initialMacro, levelFromIndex, levelFromPct, nextRegime, pickWeighted, regimeMove, triangular,
  type MacroState, type Rng
} from './regime-engine';
import { productReturns, rateShockReturn } from './return-model';

export { rateShockReturn };

const ZERO_RETURNS: Record<ProductId, number> = {
  deposit: 0,
  shortBond: 0,
  longBond: 0,
  balanced: 0,
  equityEtf: 0,
  tdf: 0
};

const FIRST_SLOT_WEIGHTS: Record<string, number> = { 'rate-bigstep': 0.45, 'equity-crash': 0.35, 'inflation-surprise': 0.2 };
const SECOND_AFTER_RATE: Record<string, number> = { 'equity-crash': 0.6, 'melt-up': 0.4 };
const SECOND_AFTER_EQUITY: Record<string, number> = { 'rate-bigstep': 0.5, 'inflation-surprise': 0.2, 'emergency-cut': 0.2, 'credit-rally': 0.1 };
const THIRD_POSITIVE_RATE = 0.7;

export const WEAK_ALERT_TEXT = '시장 경계감이 커집니다 · 방향은 불확실';
export const WEAK_ALERT_HINT = '신호는 예측이 아니라 대비할 이유입니다. 분산과 생활자금을 점검하세요.';
export const ALERT_CARD_ID = 'signal-vs-forecast';

export function emptyMarketStep(): MarketStep {
  const config = balanceConfig.market;
  return {
    turn: 0,
    phase: '시작 전',
    headline: '아직 시장이 공개되지 않았습니다',
    signal: '주사위 대기',
    reason: '주사위를 굴리면 이번 판의 시장 경로가 한 턴씩 공개됩니다.',
    rate: 0,
    inflation: 0,
    stocks: 0,
    ratePct: config.rateStartPct,
    rateDeltaPct: 0,
    inflationPct: config.inflationStartPct,
    stockIndex: config.stockStartIndex,
    stockReturn: 0,
    regime: 'hold',
    returns: { ...ZERO_RETURNS }
  };
}

function shockById(id: string): MarketShock {
  const shock = marketShocks.find((item) => item.id === id);
  if (!shock) throw new Error(`알 수 없는 시장 충격: ${id}`);
  return shock;
}

function slotTurn(rng: Rng, slot: [number, number]): number {
  return slot[0] + Math.floor(rng.next() * (slot[1] - slot[0] + 1));
}

export function planShocks(rng: Rng, config: MarketConfig = balanceConfig.market): Map<number, MarketShock> {
  const count = rng.next() < config.shockCountWeights[1] ? 3 : 2;
  const plan = new Map<number, MarketShock>();
  const first = shockById(pickWeighted(rng, FIRST_SLOT_WEIGHTS, 'rate-bigstep'));
  plan.set(slotTurn(rng, config.shockSlots[0]), first);
  const second = shockById(pickWeighted(rng, first.family === 'rate' ? SECOND_AFTER_RATE : SECOND_AFTER_EQUITY, first.family === 'rate' ? 'equity-crash' : 'rate-bigstep'));
  plan.set(slotTurn(rng, config.shockSlots[1]), second);
  if (count === 3) {
    const used = new Set([first.id, second.id]);
    const positive = rng.next() < THIRD_POSITIVE_RATE;
    const pool = marketShocks.filter((shock) => shock.positive === positive && !used.has(shock.id));
    const candidates = pool.length ? pool : marketShocks.filter((shock) => !used.has(shock.id));
    plan.set(slotTurn(rng, config.shockSlots[2]), candidates[Math.floor(rng.next() * candidates.length)]);
  }
  return plan;
}

export function formatRateDelta(deltaPct: number): string {
  if (Math.abs(deltaPct) < 1e-9) return '→';
  return `${deltaPct > 0 ? '▲' : '▼'}${Math.abs(deltaPct).toFixed(2)}`;
}

function regimeBriefing(rng: Rng, regime: Regime, config: MarketConfig): Pick<MarketStep, 'phase' | 'headline' | 'signal' | 'reason'> {
  // 구 버전의 헤드라인 추첨 1회를 유지해야 이후 시장·충격·신호의 난수 순서가 같다.
  rng.next();
  return { phase: config.regimes[regime].phase, headline: '', signal: '', reason: '' };
}

export function generateMarketPath(seed: string, config: MarketConfig = balanceConfig.market, origin?: MarketStep): MarketStep[] {
  const rng = createRng(hashSeed(`${seed}:market`));
  const plan = planShocks(rng, config);
  let macro: MacroState = origin ? { ratePct: origin.ratePct, inflationPct: origin.inflationPct, stockIndex: origin.stockIndex, regime: origin.regime } : initialMacro(config, rng);
  let recoveryLeft = 0;
  const path: MarketStep[] = [];

  for (let turn = (origin?.turn ?? 0) + 1; turn <= balanceConfig.maxTurns; turn += 1) {
    const regime = macro.regime;
    const shock = plan.get(turn);
    const move = regimeMove(rng, config.regimes[regime], config);
    let rateDeltaPct = move.rateDeltaPct;
    let inflationDeltaPct = move.inflationDeltaPct;
    let stockReturn = move.stockDrift + (recoveryLeft > 0 ? config.recoveryDrift : 0) + triangular(rng, config.stockNoise);
    if (shock) {
      rateDeltaPct = shock.rateDeltaPct[Math.floor(rng.next() * shock.rateDeltaPct.length)];
      inflationDeltaPct += shock.inflationDeltaPct;
      stockReturn += shock.stockMovePct;
    }
    const moved = applyMacroMove(macro, { rateDeltaPct, inflationDeltaPct, stockReturn }, config);
    const next: MacroState = {
      ...moved,
      inflationPct: Math.round(moved.inflationPct * 10) / 10,
      stockIndex: Math.round(moved.stockIndex * 10) / 10
    };
    const actualDelta = Math.round((next.ratePct - macro.ratePct) * 1000) / 1000;
    const returns = productReturns(rng, { ratePct: next.ratePct, rateDeltaPct: actualDelta, stockReturn, shock }, config);
    const briefing = shock
      ? { phase: shock.phase, headline: shock.headline, signal: shock.signal, reason: shock.reason }
      : regimeBriefing(rng, regime, config);
    path.push({
      turn,
      ...briefing,
      rate: levelFromPct(next.ratePct, config.rateMinPct, config.rateMaxPct),
      inflation: levelFromPct(next.inflationPct, config.inflationMinPct, config.inflationMaxPct),
      stocks: levelFromIndex(next.stockIndex),
      ratePct: next.ratePct,
      rateDeltaPct: actualDelta,
      inflationPct: next.inflationPct,
      stockIndex: next.stockIndex,
      stockReturn,
      regime,
      returns,
      ...(shock ? { shock: true, shockId: shock.id } : {})
    });

    let regimeAfter: Regime;
    if (shock?.regimeAfter && rng.next() < (shock.regimeAfterChance ?? 1)) regimeAfter = shock.regimeAfter;
    else regimeAfter = nextRegime(rng, regime, config);
    if (shock?.recovery) recoveryLeft = config.recoveryTurns;
    else if (recoveryLeft > 0) recoveryLeft -= 1;
    macro = { ...next, regime: regimeAfter };
  }
  return attachAlerts(rng, path, config).map(explainMarketStep);
}

/** 충격 턴 t의 신호는 t−1 스텝에 붙는다. 충격 앞이 아닌 턴에도 낮은 확률로 약한 신호가 온다. */
export function attachAlerts(rng: Rng, path: MarketStep[], config: MarketConfig = balanceConfig.market): MarketStep[] {
  return path.map((step, index) => {
    const next = path[index + 1];
    if (!next) return step;
    if (next.shock && next.shockId) {
      const shock = shockById(next.shockId);
      const alert = rng.next() < config.alertStrongRate
        ? { level: 2 as const, text: shock.alertStrong, hint: shock.alertHint }
        : { level: 1 as const, text: WEAK_ALERT_TEXT, hint: WEAK_ALERT_HINT };
      return { ...step, alert };
    }
    if (rng.next() < config.alertFakeRate) {
      return { ...step, alert: { level: 1 as const, text: WEAK_ALERT_TEXT, hint: WEAK_ALERT_HINT } };
    }
    return step;
  });
}

export function marketPathOf(state: Pick<GameState, 'seed' | 'marketPath'>): MarketStep[] {
  return state.marketPath?.length === balanceConfig.maxTurns ? state.marketPath.map(explainMarketStep) : generateMarketPath(state.seed);
}

export function applyMarketStep(state: GameState, market: MarketStep): GameState {
  market = explainMarketStep(market);
  const prices = { ...state.prices };
  for (const product of products) prices[product.id] *= (1 + market.returns[product.id]) * (1 - product.feeRate);
  const holdings = state.holdings.map((entry) => mapHoldingBalances(entry, (holding) => {
    const product = products.find((item) => item.id === holding.productId);
    if (!product) return holding;
    if (holding.productId === 'deposit') {
      const lots = depositLots(state, holding).map(lot => ({ ...lot,
        amount: lot.amount + (state.turn <= lot.maturityTurn ? lot.principal * lot.ratePerTurn : 0) }));
      return { ...holding, lots, amount: lots.reduce((sum, lot) => sum + lot.amount, 0), depositTurnsHeld: holding.depositTurnsHeld + 1 };
    }
    const gross = holding.amount * (1 + market.returns[holding.productId]);
    const fee = Math.max(0, gross * product.feeRate);
    return {
      ...holding,
      amount: Math.max(0, gross - fee),
      units: Math.max(0, gross - fee) / prices[holding.productId],
      depositTurnsHeld: holding.depositTurnsHeld
    };
  }));
  const pendingOrders = state.pendingOrders.map(order => {
    const exposed = (order.side === 'sell' && order.stage === 'received') || (order.side === 'buy' && order.stage === 'priced');
    return exposed ? { ...order, amount: order.amount * (1 + market.returns[order.productId]) * (1 - products.find(p => p.id === order.productId)!.feeRate) } : { ...order };
  });
  let next = { ...state, prices, pendingOrders, holdings, lastMarket: market };
  const value = portfolioValue(next);
  const maxIrpValue = Math.max(state.maxIrpValue, value);
  const drawdown = maxIrpValue <= 0 ? 0 : Math.max(0, (maxIrpValue - value) / maxIrpValue);
  next = {
    ...next,
    maxIrpValue,
    maxDrawdown: Math.max(state.maxDrawdown, drawdown),
    marketLimitExceeded: riskAssetRatio(next) > policyRules.riskAssetLimit + 0.00001
  };
  return next;
}

/** applyMarketStep 직후·settleOrders 직전에만 비교한다. 자산 재분류를 시장 손익으로 잡지 않는다. */
export function marketHoldingEffects(before: GameState, after: GameState): MarketHoldingEffect[] {
  const exposedOrder = (order: GameState['pendingOrders'][number]) =>
    (order.side === 'sell' && order.stage === 'received') || (order.side === 'buy' && order.stage === 'priced');
  return products.flatMap(product => {
    const amounts = (state: GameState) => (state.holdings.find(h => h.productId === product.id)?.amount ?? 0) +
      state.pendingOrders.filter(o => o.productId === product.id && exposedOrder(o)).reduce((sum, o) => sum + o.amount, 0);
    const opening = amounts(before);
    if (opening <= 0) return [];
    const delta = amounts(after) - opening;
    return [{ productId: product.id, opening, delta, returnRate: delta / opening }];
  });
}
