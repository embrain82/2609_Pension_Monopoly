import { balanceConfig } from '../data/content';
import type { GameState } from '../types';

const GOAL_STEP = 50_000;

export function clampGoalMonthly(value: number): number {
  if (!Number.isFinite(value)) return balanceConfig.defaultGoal;
  const stepped = Math.round(value / GOAL_STEP) * GOAL_STEP;
  return Math.min(balanceConfig.maxGoal, Math.max(balanceConfig.minGoal, stepped));
}

export function applyGoalToGame(game: GameState, goalMonthly: number): GameState {
  if (game.campaign) return game; // 시작 전에 정한 미션 목표 고정
  const next = clampGoalMonthly(goalMonthly);
  return game.goalMonthly === next ? game : { ...game, goalMonthly: next };
}
