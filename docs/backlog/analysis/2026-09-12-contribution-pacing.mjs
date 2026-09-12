/** Planning experiment only. No game source or saved game is modified.
 * Run from the project root: node --import tsx docs/backlog/analysis/2026-09-12-contribution-pacing.mjs
 * The caller limits requested contributions; this does NOT implement engine enforcement.
 */
import { writeFileSync } from 'node:fs';
import { URL } from 'node:url';
import process from 'node:process';
import { createGame, startTurn, performAction, resolveLifeEvent } from '../../../src/engine/game-engine.ts';
import { diceStepsForTurn } from '../../../src/engine/random-engine.ts';
import { portfolioValue } from '../../../src/engine/portfolio-engine.ts';
import { monthlyPension, calculateScore } from '../../../src/engine/scoring-engine.ts';
import { SCENARIOS } from '../../../src/engine/scenario-engine.ts';
import { policyRules } from '../../../src/data/content.ts';

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
        let game = createGame(seed, profile, 500_000, { scenario, mission: 'pension', defaultTrading: true, ghost: false });
        let firstGoalTurn = null, contributionActions = 0;
        while (game.status === 'playing') {
          game = checked(startTurn(game, diceStepsForTurn(game.seed, game.turn + 1)), 'startTurn');
          if (game.currentEventId) game = checked(resolveLifeEvent(game, 'cash'), 'life cash');
          let turnActions = 0;
          while (game.awaitingAction) {
            if (++turnActions > 2) throw new Error('Unexpected action count');
            const used = game.cashFlows.filter(f => f.turn === game.turn && f.kind === 'contribution').reduce((sum, f) => sum + f.amount, 0);
            const available = Math.floor(Math.max(0, Math.min(game.cash, policyRules.annualContributionLimit - game.contributionTotal, cap === null ? Infinity : cap - used)));
            const action = available >= 100_000 ? { kind: 'contribute', amount: available } : { kind: 'hold' };
            const before = game.contributionTotal;
            game = checked(performAction(game, action), action.kind);
            if (game.contributionTotal > before) contributionActions++;
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
  date: '2026-09-12', sourceCommit: '932faf28d9d655f5c1a2c7a235809517da7971a4',
  method: {
    purpose: 'Compare contribution pacing candidates, not implementation validation or human-play win rates.',
    games: cases.length, pairedCasesPerCap: 1000, seedCount: 50, scenarios: Object.keys(SCENARIOS), profiles,
    strategy: 'Each action contributes the largest eligible amount, otherwise holds. All life events choose cash. No product trading, no quiz answers, default option unset; board effects enabled.',
    capApplication: 'Per-turn sum enforced by the experiment caller only. Production engine unchanged.',
    goalDefinition: 'First end-of-turn IRP / 240 >= 500,000 KRW; final goal uses calculateScore with the default annuity choice.',
    limitations: ['No bonus contribution or retirement transfer chosen; these paths require dedicated implementation tests.', 'Same seed is paired across caps; scenarios and profiles share 50 seeds, so 1000 cases are not 1000 independent market paths.', 'Maximum-contribution strategy measures the reported shortcut, not optimal or representative play.', 'Earlier goal attainment may be lost later; final attainment is reported separately.']
  },
  screenshotCase: { openingIrp:108_000_000, marketGain:1_534_447, contribution:13_400_000, target:500_000,
    candidates: caps.map(cap => ({ cap, contribution: cap === null ? 13_400_000 : cap, monthly: Math.round(monthlyPension(109_534_447 + (cap === null ? 13_400_000 : cap))) })) },
  summary: caps.map(cap => ({ cap, ...summarize(cases.filter(r => r.cap === cap)) })),
  byScenario: Object.keys(SCENARIOS).map(scenario => ({ scenario, values: caps.map(cap => ({ cap, ...summarize(cases.filter(r => r.scenario === scenario && r.cap === cap)) })) }))
};
writeFileSync(new URL('./2026-09-12-contribution-pacing.json', import.meta.url), `${JSON.stringify(report, null, 2)}\n`);
process.stdout.write(`${JSON.stringify(report.summary, null, 2)}\n`);
