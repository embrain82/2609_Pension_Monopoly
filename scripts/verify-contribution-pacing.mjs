/** Reproduce the approved candidate experiment with engine-enforced 2m pacing,
 * then verify mixed trading, life events and checkpoint compatibility.
 * Run: node --import tsx scripts/verify-contribution-pacing.mjs
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { URL } from 'node:url';
import process from 'node:process';
import assert from 'node:assert/strict';
import { autoplay, AUTO_STRATEGIES, createGame, startTurn, performAction, resolveLifeEvent } from '../src/engine/game-engine.ts';
import { diceStepsForTurn } from '../src/engine/random-engine.ts';
import { portfolioValue } from '../src/engine/portfolio-engine.ts';
import { monthlyPension, calculateScore } from '../src/engine/scoring-engine.ts';
import { SCENARIOS, MISSIONS, missionResult } from '../src/engine/scenario-engine.ts';
import { policyRules } from '../src/data/content.ts';

import { validContributionPacing } from '../src/engine/contribution-engine.ts';
import { validDefaultLedger } from '../src/ui/default-checkpoint.ts';
import { parseCheckpoint } from '../src/ui/play-checkpoint.ts';
import { lifeChoicesFor } from '../src/engine/life-engine.ts';
import { defaultScopes } from '../src/engine/position-engine.ts';
import { nextDefaultCommand } from '../src/engine/default-trade-engine.ts';
import { suggestDefaultOption } from '../src/engine/default-option.ts';

const profiles = ['stable', 'stableGrowth', 'balanced', 'growth', 'aggressive'];
const caps = [null, 1_000_000, 2_000_000, 3_000_000, 5_000_000];
const cases = [];
function checked(result, context) {
  if (!result.ok) throw new Error(`${context}: ${result.message}`);
  return result.state;
}
for (const scenario of Object.keys(SCENARIOS)) {
  for (const profile of profiles) {
    for (let seedIndex = 0; seedIndex < 50; seedIndex++) {
      const seed = `pacing-review-20260912-${seedIndex}`;
      for (const cap of caps) {
        let game = createGame(seed, profile, 500_000, { scenario, mission: 'pension', defaultTrading: true, ghost: false, contributionPacing: cap === 2_000_000 });
        let firstGoalTurn = null, contributionActions = 0;
        while (game.status === 'playing') {
          game = checked(startTurn(game, diceStepsForTurn(game.seed, game.turn + 1)), 'startTurn');
          if (game.currentEventId) game = checked(resolveLifeEvent(game, 'cash'), 'life cash');
          let turnActions = 0;
          while (game.awaitingAction) {
            if (++turnActions > 2) throw new Error('Unexpected action count');
            const used = game.cashFlows.filter(f => f.turn === game.turn && f.kind === 'contribution').reduce((sum, f) => sum + f.amount, 0);
            const available = Math.floor(Math.max(0, Math.min(game.cash, policyRules.annualContributionLimit - game.contributionTotal, cap === null ? Infinity : cap - used)));
            const action = available >= 100_000 ? { kind: 'contribute', amount: cap === 2_000_000 ? game.cash : available } : { kind: 'hold' };
            const before = game.contributionTotal;
            game = checked(performAction(game, action), action.kind);
            if (game.contributionTotal > before) {
              contributionActions++;
              assert.equal(game.contributionTotal - before, available, 'Engine accepted a different amount');
            }
            assert(validContributionPacing(game), 'Invalid per-turn contribution ledger');
          }
          if (firstGoalTurn === null && monthlyPension(portfolioValue(game)) >= 500_000) firstGoalTurn = game.turn;
          if (game.turn > 12) throw new Error('Unexpected turn count');
        }
        const score = calculateScore(game);
        cases.push({ scenario, profile, seed, cap, firstGoalTurn, finalGoalMet: score.goalMet, contributionActions, totalContribution: game.contributionTotal, finalMonthly: score.monthlyPension, cashShortages: game.cashShortages, livingDebt: game.livingDebt });
      }
    }
  }
}
const mean = values => values.reduce((sum, value) => sum + value, 0) / values.length;
const median = values => { const sorted = [...values].sort((a,b) => a-b), mid = Math.floor(sorted.length/2); return sorted.length ? sorted.length % 2 ? sorted[mid] : (sorted[mid-1]+sorted[mid])/2 : null; };
function summarize(rows) {
  const reached = rows.filter(r => r.firstGoalTurn !== null);
  const percent = count => Number((100 * count / rows.length).toFixed(1));
  return {
    n: rows.length,
    firstTurnGoalPct: percent(rows.filter(r => r.firstGoalTurn === 1).length),
    byThirdTurnGoalPct: percent(rows.filter(r => r.firstGoalTurn !== null && r.firstGoalTurn <= 3).length),
    everGoalPct: percent(reached.length),
    finalGoalPct: percent(rows.filter(r => r.finalGoalMet).length),
    medianFirstGoalTurnAmongReached: median(reached.map(r => r.firstGoalTurn)),
    meanContributionActions: Number(mean(rows.map(r => r.contributionActions)).toFixed(2)),
    meanTotalContribution: Math.round(mean(rows.map(r => r.totalContribution))),
    anyCashShortagePct: percent(rows.filter(r => r.cashShortages > 0).length),
    finalLivingDebtPct: percent(rows.filter(r => r.livingDebt > 0).length)
  };
}
const report = {
  date: '2026-09-12', version: '1.6.0', baselineCommit: '932faf28d9d655f5c1a2c7a235809517da7971a4',
  method: {
    purpose: 'Verify engine pacing against the approved planning experiment; not human-play win rates.',
    games: cases.length, pairedCasesPerCap: 1000, seedCount: 50, scenarios: Object.keys(SCENARIOS), profiles,
    strategy: 'Each action contributes the largest eligible amount, otherwise holds. All life events choose cash. No product trading, no quiz answers, default option unset; board effects enabled.',
    capApplication: '2m candidate enforced by the engine while requesting the entire cash balance (1000 games). Other 4000 games retain caller-limited candidate inputs.',
    goalDefinition: 'First end-of-turn IRP / 240 >= 500,000 KRW; final goal uses calculateScore with the default annuity choice.',
    limitations: ['No bonus contribution or retirement transfer chosen; these paths require dedicated implementation tests.', 'Same seed is paired across caps; scenarios and profiles share 50 seeds, so 1000 cases are not 1000 independent market paths.', 'Maximum-contribution strategy measures the reported shortcut, not optimal or representative play.', 'Earlier goal attainment may be lost later; final attainment is reported separately.']
  },
  screenshotCase: { openingIrp:108_000_000, marketGain:1_534_447, contribution:13_400_000, target:500_000,
    candidates: caps.map(cap => ({ cap, contribution: cap === null ? 13_400_000 : cap, monthly: Math.round(monthlyPension(109_534_447 + (cap === null ? 13_400_000 : cap))) })) },
  summary: caps.map(cap => ({ cap, ...summarize(cases.filter(r => r.cap === cap)) })),
  byScenario: Object.keys(SCENARIOS).map(scenario => ({ scenario, values: caps.map(cap => ({ cap, ...summarize(cases.filter(r => r.scenario === scenario && r.cap === cap)) })) }))
};
const baseline = JSON.parse(readFileSync(new URL('../docs/backlog/analysis/2026-09-12-contribution-pacing.json', import.meta.url), 'utf8'));
assert.deepEqual(report.summary, baseline.summary, 'Candidate results changed');
assert.deepEqual(report.byScenario, baseline.byScenario, 'Scenario results changed');
report.matchesPlanningBaseline = true;
writeFileSync(new URL('../docs/implementation/2026-09-12-pacing-candidate-verification.json', import.meta.url), `${JSON.stringify(report, null, 2)}\n`);
process.stdout.write(`${JSON.stringify(report.summary, null, 2)}\n`);

// Repeat the existing 5600-run strategy/trading shape with the new rule.
// Mix bonus/transfer/withdrawal choices and three goals; these are invariants,
// not a population estimate or a comparison of strategy performance.
const coverage = { bonusContributions: 0, transfers: 0, withdrawals: 0, checkpoints: 0, branches: 0 };
const goals = [350_000, 500_000, 700_000];
function lifeChoice(state, event, n) {
  const options = lifeChoicesFor(state, event);
  const desired = event.kind === 'bonus' ? (n % 2 ? 'contribute-half' : 'contribute-all')
    : event.kind === 'transfer' ? 'transfer-irp'
      : event.eligibleWithdrawal && n % 2 ? 'withdraw' : 'cash';
  const chosen = options.find(o => o.id === desired && o.enabled)
    ?? options.find(o => o.id === 'contribute-all' && o.enabled)
    ?? options.find(o => o.id === 'cash' && o.enabled);
  assert(chosen, `No eligible choice for ${event.id}`);
  if (chosen.id.startsWith('contribute')) coverage.bonusContributions++;
  return chosen.id;
}
function verifyGame(game) {
  assert.equal(game.status, 'finished'); assert.equal(game.turn, 12);
  assert.equal(game.pendingOrders.length, 0); assert(!game.rebalancePlan);
  assert.equal(game.campaign.reviews.length, 12);
  assert(game.contributionPacing?.perTurnLimit === 2_000_000 && validContributionPacing(game));
  assert(validDefaultLedger(game));
  assert([game.cash, game.irpCash, game.livingDebt, game.campaign.index].every(n => Number.isFinite(n) && n >= 0));
  coverage.transfers += game.cashFlows.filter(f => f.kind === 'transfer').length;
  coverage.withdrawals += game.cashFlows.filter(f => f.kind === 'withdrawal').length;
  for (const branch of game.campaign.branches) {
    assert(validContributionPacing(branch.state) && validDefaultLedger(branch.state)); coverage.branches++;
  }
  assert(parseCheckpoint(JSON.stringify({ version: 'c3', game, modal: null, lastSummary: null,
    quizCardId: null, quizPicked: null, finalQuizQueue: [], finalQuizTotal: 0, finishing: false, defaultOptionAsk: false })), 'Checkpoint rejected');
  coverage.checkpoints++;
  const score = calculateScore(game);
  for (const mission of Object.keys(MISSIONS)) {
    assert.equal(typeof missionResult({ ...game, campaign: { ...game.campaign, mission } }, score.monthlyPension).passed, 'boolean');
  }
}
let matrixGames = 0, extraGames = 0;
for (const scenario of Object.keys(SCENARIOS)) for (const profile of profiles) for (const strategy of AUTO_STRATEGIES) for (let n = 0; n < 20; n++) {
  const game = autoplay(`d-matrix-${n}`, strategy, profile, { scenario, defaultTrading: true, contributionPacing: true,
    goalMonthly: goals[n % goals.length], mission: Object.keys(MISSIONS)[n % 3],
    quiz: ['correct', 'wrong', 'none'][n % 3], lifeChoice: (state, event) => lifeChoice(state, event, n) });
  verifyGame(game); matrixGames++;
}
const extraModes = ['partial', 'mixed', 'lastTurn'];
for (const scenario of Object.keys(SCENARIOS)) for (const profile of profiles) for (const mode of extraModes) for (let n = 0; n < 20; n++) {
  let game = createGame(`e-extra-${n}`, profile, goals[n % goals.length], { ghost: false, scenario, defaultTrading: true,
    contributionPacing: true, defaultOption: suggestDefaultOption(profile, true) });
  while (game.status === 'playing') {
    game = checked(startTurn(game, 3), 'extra start');
    if (game.currentEventId) game = checked(resolveLifeEvent(game, 'cash'), 'extra life');
    while (game.awaitingAction) {
      const scope = defaultScopes(game)[0];
      let action;
      if (mode === 'lastTurn' && game.turn < 12) action = { kind: 'contribute', amount: 100_000 };
      else if (mode === 'partial' && scope && game.turn % 3 === 0 && !game.pendingOrders.some(o => o.defaultScope)) action = { kind: 'default-opt-out', fraction: .5, commandId: nextDefaultCommand(game) };
      else if (mode === 'mixed' && game.turn % 3 === 0 && game.irpCash >= 100_000) action = { kind: 'buy', productId: 'tdf', amount: 100_000 };
      else if (game.irpCash >= 100_000) action = { kind: 'default-opt-in', optionId: game.defaultOption, amount: Math.floor(game.irpCash), commandId: nextDefaultCommand(game) };
      else action = { kind: 'contribute', amount: 100_000 };
      const result = performAction(game, action);
      game = result.ok ? result.state : checked(performAction(game, { kind: 'hold' }), 'extra fallback');
      assert(validContributionPacing(game) && validDefaultLedger(game));
    }
  }
  verifyGame(game); extraGames++;
}
assert(coverage.bonusContributions > 0 && coverage.transfers > 0 && coverage.withdrawals > 0, 'Missing life-event coverage');
const matrix = { version: '1.6.0', games: matrixGames + extraGames, matrixGames, extraGames, goals,
  scenarios: Object.keys(SCENARIOS), profiles, strategies: AUTO_STRATEGIES, extraModes, coverage, errors: 0,
  limitations: 'Deterministic invariant checks, not human-play win rates. Mission and goal samples are not evenly distributed.' };
writeFileSync(new URL('../docs/implementation/2026-09-12-pacing-matrix.json', import.meta.url), `${JSON.stringify(matrix, null, 2)}\n`);
process.stdout.write(`${JSON.stringify(matrix, null, 2)}\n`);
