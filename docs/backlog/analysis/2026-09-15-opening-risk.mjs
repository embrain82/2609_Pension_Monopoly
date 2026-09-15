// Plan-only experiment: changes cloned states in memory, never game data or saves.
// Run from repository root: node --import tsx docs/backlog/analysis/2026-09-15-opening-risk.mjs
import { log } from 'node:console';
import { createGame } from '../../../src/engine/game-engine.ts';
import { applyMarketStep } from '../../../src/engine/market-engine.ts';
import { riskAssetRatio } from '../../../src/engine/policy-engine.ts';
import { portfolioValue } from '../../../src/engine/portfolio-engine.ts';
import { mapHoldingBalances } from '../../../src/engine/position-engine.ts';
import { investorProfiles } from '../../../src/data/content.ts';
import { SCENARIOS } from '../../../src/engine/scenario-engine.ts';

const trials = 1000;
const rows = [];
for (const scenario of Object.keys(SCENARIOS)) {
  for (const profile of investorProfiles) {
    for (const candidate of profile.id === 'aggressive' ? ['current70', 'proposed65'] : ['current']) {
      let exceeded = 0, maxRatio = 0, minRatio = 1;
      for (let i = 0; i < trials; i++) {
        let game = createGame(`opening-risk-plan-${i}`, profile.id, 500000,
          { scenario, ghost: false, defaultTrading: true, contributionPacing: true });
        if (candidate === 'proposed65') {
          game = { ...game, holdings: game.holdings.map(h => {
            const factor = h.productId === 'deposit' ? 35/30 : h.productId === 'equityEtf' ? 45/50 : 1;
            return mapHoldingBalances(h, b => ({ ...b, amount: b.amount * factor, principal: b.principal * factor,
              ...(b.units !== undefined ? { units: b.units * factor } : {}),
              ...(b.lots ? { lots: b.lots.map(l => ({ ...l, principal: l.principal * factor, amount: l.amount * factor })) } : {}) }));
          }) };
        }
        if (Math.abs(portfolioValue(game) - 108000000) > .01) throw new Error('Starting capital changed');
        const after = applyMarketStep({ ...game, turn: 1 }, game.marketPath[0]);
        const ratio = riskAssetRatio(after);
        exceeded += Number(after.marketLimitExceeded);
        maxRatio = Math.max(maxRatio, ratio); minRatio = Math.min(minRatio, ratio);
      }
      rows.push({ scenario, profile: profile.id, candidate, trials, exceeded,
        exceededPercent: exceeded / trials * 100, minRiskPercent: minRatio * 100, maxRiskPercent: maxRatio * 100 });
    }
  }
}
log(JSON.stringify({ purpose: 'Implementation-plan comparison; not implementation QA', date: '2026-09-15',
  trialsPerCell: trials, seedPattern: 'opening-risk-plan-0..999',
  scope: 'First market step only. Same seeds across profiles/candidates; no dice arrival, trades, contributions, or later turns.',
  proposal: { aggressive: { deposit: .35, balanced: .2, equityEtf: .45 } }, rows }, null, 2));
