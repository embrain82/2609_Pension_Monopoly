import { investorProfiles } from '../src/data/content';
import { autoplay } from '../src/engine/game-engine';
import { calculateScore } from '../src/engine/scoring-engine';
import { portfolioValue } from '../src/engine/portfolio-engine';

// 성향별 목표 45만원, 기존 계좌, 같은 40개 시드. 각 경우를 결정적으로 재현한다.
const results = [];
for (const profile of investorProfiles) {
  {
    let threeStars = 0;
    for (let seed = 0; seed < 40; seed++) {
      const state = autoplay(`stage-b-${seed}`, 'steward', profile.id, { goalMonthly: 450000 });
      if (state.status !== 'finished' || state.pendingOrders.length || state.rebalancePlan || !Number.isFinite(portfolioValue(state))) throw Error('미종료/비정상 주문');
      if (state.irpCash < -.01 || state.holdings.some(h => h.amount < -.01)) throw Error('잔고 보존 오류');
      if (calculateScore(state).stars === 3) threeStars++;
    }
    results.push({ profile: profile.name, games: 40, threeStars });
  }
}
console.log(JSON.stringify({ games: 200, errors: 0, goalMonthly: 450000, strategy: 'steward', results }, null, 2));
