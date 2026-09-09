import { balanceConfig, investorProfiles, products } from '../data/content';
import type { GameState, ProfileId } from '../types';

export const PROFILE_IDS: ProfileId[] = ['stable', 'stableGrowth', 'balanced', 'growth', 'aggressive'];

export function isProfileId(value: unknown): value is ProfileId {
  return typeof value === 'string' && PROFILE_IDS.includes(value as ProfileId);
}

export function profileFromScore(score: number): ProfileId {
  return investorProfiles.find((profile) => score >= profile.minScore && score <= profile.maxScore)?.id ?? 'balanced';
}

export function applyProfileToGame(game: GameState, profileId: ProfileId): GameState {
  if (game.campaign) return game;
  if (game.profileId === profileId) return game;
  const unlocked = game.unlockedCards.includes('profile') ? game.unlockedCards : [...game.unlockedCards, 'profile'];
  return { ...game, profileId, unlockedCards: unlocked,
    ...(game.turn === 0 && game.holdings.length ? { holdings: initialHoldings(profileId) } : {}),
    logs: [...game.logs, { turn: game.turn, type: 'profile', message: '투자성향 변경 · 캐릭터는 유지. 진행 중 보유 상품은 자동 매도하지 않습니다.' }] };
}

/** 구성 차이의 절반: 목표로 돌아가기 위해 옮겨야 하는 자산 비중. 현금도 차이에 포함. */
export function profileDistance(state: GameState, profileId = state.profileId): number {
  const target = investorProfiles.find(p => p.id === profileId)!.allocation;
  const total = state.irpCash + state.holdings.reduce((s, h) => s + h.amount, 0) + state.pendingOrders.reduce((s, o) => s + o.amount, 0);
  if (total <= 0) return 1;
  let difference = state.irpCash / total;
  for (const id of Object.keys(target) as Array<keyof typeof target>) {
    const held = state.holdings.filter(h => h.productId === id).reduce((s, h) => s + h.amount, 0);
    const orders = state.pendingOrders.filter(o => o.productId === id).reduce((s, o) => s + o.amount, 0);
    difference += Math.abs((held + orders) / total - target[id]);
  }
  return difference / 2;
}
export function profileLimits(state: GameState) {
  return investorProfiles.find(p => p.id === state.profileId)!;
}

export function initialHoldings(profileId: ProfileId) {
  const allocation = investorProfiles.find(p => p.id === profileId)!.startingAllocation;
  return products
    .filter((product) => allocation[product.id] > 0)
    .map((product) => ({
      productId: product.id,
      amount: balanceConfig.startingIrp * allocation[product.id],
      principal: balanceConfig.startingIrp * allocation[product.id],
      depositTurnsHeld: 0,
      ...(product.id === 'deposit' ? { lots: [{ principal: balanceConfig.startingIrp * allocation.deposit, amount: balanceConfig.startingIrp * allocation.deposit, openedTurn: 0, maturityTurn: balanceConfig.depositMaturityTurns, ratePerTurn: balanceConfig.market.depositBase + balanceConfig.market.depositPerRatePct * balanceConfig.market.rateStartPct }] } : {})
    }));
}
