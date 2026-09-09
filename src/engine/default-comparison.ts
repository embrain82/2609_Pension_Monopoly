import { createGame, performAction, resolveLifeEvent, startTurn } from './game-engine';
import { portfolioValue } from './portfolio-engine';
import { suggestDefaultOption } from './default-option';
import type { ProfileId } from '../types';

/** 별도 통제 실험: 동일 초기입금·시장·사건·추가납입 0, 운용 방식만 다르다. */
export function compareDefaultModes(seed: string, profileId: ProfileId) {
  return (['direct', 'default', 'cash'] as const).map(mode => {
    let state = createGame(seed, profileId, 500000, { newAccount: true, ghost: false,
      defaultOption: mode === 'default' ? suggestDefaultOption(profileId) : null });
    while (state.status === 'playing') {
      state = startTurn(state, 0).state;
      if (state.currentEventId) state = resolveLifeEvent(state, 'cash').state;
      while (state.awaitingAction) {
        const result = performAction(state, { kind: mode === 'direct' && !state.pendingOrders.length && !state.rebalancePlan ? 'rebalance' : 'hold' });
        state = result.ok ? result.state : performAction(state, { kind: 'hold' }).state;
      }
    }
    return { mode, value: portfolioValue(state), cash: state.cash, contributions: state.contributionTotal };
  });
}
