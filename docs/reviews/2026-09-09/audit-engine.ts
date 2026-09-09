// Read-only audit harness. Run from the project root with:
// npx tsx docs/reviews/2026-09-09/audit-engine.ts
import { writeFileSync } from 'node:fs';
import { AUTO_STRATEGIES, autoplay, createGame, performAction } from '../../../src/engine/game-engine';
import { resolveLifeChoice } from '../../../src/engine/life-engine';
import { buyProduct, sellProduct, portfolioValue, rebalancePortfolio, rebalanceTargetRisk } from '../../../src/engine/portfolio-engine';
import { calculateScore, payoutPlan } from '../../../src/engine/scoring-engine';
import { applyMarketStep, emptyMarketStep } from '../../../src/engine/market-engine';
import { investorProfiles, learningCards, lifeEvents, products } from '../../../src/data/content';
import type { GameState } from '../../../src/types';

const base = () => createGame('audit-repro-20260909', 'balanced', 500000, { ghost: false });
const money = (n: number) => Math.round(n);
const incident: GameState = { ...base(), cash: 0, currentEventId: 'moving' };
const cash = resolveLifeChoice(incident, 'cash');
const deposit = resolveLifeChoice(incident, 'deposit');
const early = sellProduct(base(), 'deposit', 1_000_000);
const queued = buyProduct({ ...base(), irpCash: 1_000_000 }, 'shortBond', 1_000_000).state;
const rebalanced = rebalancePortfolio(queued).state;
const sellPending = sellProduct(base(), 'balanced', 1_000_000).state;
const down = { ...emptyMarketStep(), returns: { ...emptyMarketStep().returns, balanced: -0.1 } };
const downState = applyMarketStep(sellPending, down);
const transferred = { ...base(), irpCash: 6_000_000 };
const pendingOnly: GameState = { ...base(), holdings: [], irpCash: 0, currentEventId: 'medical', pendingOrders: [{ id: 'audit-pending', side: 'buy', productId: 'shortBond', amount: 6_000_000, submittedTurn: 1, settlesTurn: 2, stage: 'received' }] };
const withdrawn = resolveLifeChoice(pendingOnly, 'withdraw');
const finalState: GameState = { ...base(), turn: 12, awaitingAction: true, actionsLeft: 1 };
const finalSwitch = performAction(finalState, { kind: 'switch', fromProductId: 'balanced', toProductId: 'tdf', amount: 1_000_000 });

const reproductions = {
  illegalCashFallback: { event: 'moving', eligible: false, ok: cash.ok, irpLost: money(portfolioValue(incident) - portfolioValue(cash.state)), message: cash.message },
  illegalDepositRoute: { event: 'moving', eligible: false, ok: deposit.ok, irpLost: money(portfolioValue(incident) - portfolioValue(deposit.state)) },
  earlyPrincipalPenalty: { noInterestYet: true, sold: 1_000_000, received: money(early.state.irpCash), lost: money(1_000_000 - early.state.irpCash) },
  rebalanceBypassesPending: { beforePending: queued.pendingOrders.length, afterPending: rebalanced.pendingOrders.length, irpChange: money(portfolioValue(rebalanced) - portfolioValue(queued)) },
  redemptionPriceFrozen: { before: sellPending.pendingOrders[0].amount, after10PercentFall: downState.pendingOrders[0].amount },
  transferCountedAsReturn: { transferred: 6_000_000, investmentReturnRate: calculateScore(transferred).investmentReturnRate },
  unfundedWithdrawal: { ok: withdrawn.ok, irpBefore: portfolioValue(pendingOnly), irpAfter: portfolioValue(withdrawn.state), eventCleared: withdrawn.state.currentEventId === null },
  finalSwitchLeavesPending: { ok: finalSwitch.ok, status: finalSwitch.state.status, pendingOrders: finalSwitch.state.pendingOrders },
  uniformTaxExample: { annuity: payoutPlan(6_000_000, 'annuity20'), lumpSum: payoutPlan(6_000_000, 'lumpSum') },
  profileTargets: investorProfiles.map(p => ({ id: p.id, statedExpectedRisk: p.expectedRiskRatio, rebalanceTarget: rebalanceTargetRisk(p.id) })),
  counts: { products: products.length, lifeEvents: lifeEvents.length, quizzes: learningCards.length }
};

const pairedStrategies = AUTO_STRATEGIES.map(strategy => {
  const scores = Array.from({ length: 100 }, (_, i) => calculateScore(autoplay(`audit-paired-${i}`, strategy)));
  return { strategy, runs: 100, goalRate: scores.filter(s => s.goalMet).length / 100, threeStarRate: scores.filter(s => s.stars === 3).length / 100, averageDrawdown: scores.reduce((a,s) => a + s.maxDrawdown, 0) / 100 };
});
const evidence = { reviewedAt: '2026-09-09', commit: 'e4a6e950ddd0812845636ee0ae1f3a0ffeb1d97f', method: '100 identical seeds per strategy; default strategy-specific profiles; quiz none; payout default annuity20. Strategy packages, not isolated causal effects.', reproductions, pairedStrategies };
writeFileSync(new URL('./engine-evidence.json', import.meta.url), JSON.stringify(evidence, null, 2) + '\n');
console.log(JSON.stringify(evidence, null, 2));
