import type { GameState } from '../types';
export type PlayScene = 'rolling' | 'moving' | 'decision' | 'resolving' | 'recap' | 'next' | 'result' | 'setup';
export function playScene(game: GameState | null, screen: string, modal: string | null, rolling: boolean, moving: boolean): PlayScene {
  if (screen === 'result') return 'result';
  if (!game || screen !== 'game') return 'setup';
  if (rolling) return 'rolling';
  if (moving) return 'moving';
  if (modal === 'settle') return 'recap';
  if (game.currentEventId || ['quiz','payout','default-option','howto','news'].includes(modal ?? '')) return 'resolving';
  return game.awaitingAction ? 'decision' : 'next';
}
