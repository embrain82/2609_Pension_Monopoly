import { expect, it } from 'vitest';
import { createGame } from '../src/engine/game-engine';
import { avatarEmotion, CHARACTER_IDS } from '../src/ui/avatars';
import type { GameState, TileEffect } from '../src/types';

function market(rate = 0): GameState {
  return { ...createGame('emotion', 'balanced', 500000, { ghost: false }), turn: 1, position: 5,
    ledger: { open: 1000000, afterMarket: 1000000 * (1 + rate), beforeAction: null,
      marketEffects: [{ productId: 'equityEtf', opening: 1000000, delta: 1000000 * rate, returnRate: rate }] } };
}
function tile(kind: TileEffect['kind'], extra: Partial<TileEffect> = {}): TileEffect {
  return { kind, tileIndex: 5, title: '', detail: '', ...extra };
}

it.each([[-.01001, 'tense'], [-.01, 'tense'], [-.00999, 'calm'], [0, 'calm'], [.00999, 'calm'], [.01, 'happy'], [.01001, 'happy']] as const)('이번 턴 운용수익률 %s 경계를 판단한다', (rate, mood) => {
  expect(avatarEmotion(market(rate)).mood).toBe(mood);
});
it('시장 충격/뉴스와 과거 입출금보다 내 현재 운용 손익을 본다', () => {
  const state = market(.02);
  state.lastMarket.shock = true; state.irpHistory = [108000000, 60000000];
  expect(avatarEmotion(state)).toEqual({ mood: 'happy', reason: '이번 턴 운용 +2.0%' });
  expect(avatarEmotion({ ...market(), lastMarket: state.lastMarket }).mood).toBe('calm');
  expect(avatarEmotion({ ...market(-.02), irpHistory: [108000000, 200000000] }).mood).toBe('tense');
});
it('현재 대기 이자는 포함하지만 납입/결제 후 잔액이나 지난 턴 이자는 수익으로 세지 않는다', () => {
  const state = market(-.012);
  state.ledger.cashInterest = { turn: 1, opening: 100000, rate: .03, amount: 3000 };
  state.ledger.afterMarket = 2000000;
  expect(avatarEmotion(state).mood).toBe('calm');
  state.ledger.cashInterest.turn = 0;
  expect(avatarEmotion(state).mood).toBe('tense');
});
it('도착 보상은 실제 발생한 효과만 사용하며 통과 환급과 미래 보상은 제외한다', () => {
  const state = market();
  for (const effect of [tile('tax-refund', { amount: 100 }), tile('double-action'), tile('policy-brief', { understanding: 1 }), tile('profile-check', { understanding: 1 }), tile('diversify-check', { understanding: 1 })]) {
    expect(avatarEmotion({ ...state, tileEffects: [effect] }).mood).toBe('happy');
  }
  for (const effect of [tile('tax-refund', { amount: 0 }), tile('tax-refund', { amount: 100, tileIndex: 0 }), tile('rebalance-bonus', { understanding: 2 }), tile('profile-check', { understanding: 0 }), tile('diversify-check'), tile('extra-life')]) {
    expect(avatarEmotion({ ...state, tileEffects: [effect] }).mood).toBe('calm');
  }
});
it('실제 생활 사건은 손익보다 먼저 반응하고 해결 뒤에는 손익으로 복귀한다', () => {
  const state = { ...market(.02), currentEventId: 'medical', tileEffects: [tile('double-action')] };
  expect(avatarEmotion(state)).toEqual({ mood: 'tense', reason: '생활 사건이 생겼어요' });
  expect(avatarEmotion({ ...state, currentEventId: null }).mood).toBe('happy');
});
it('큰 손실은 도착 보상과 목표 달성보다 우선한다', () => {
  const state = { ...market(-.02), goalMonthly: 100000, tileEffects: [tile('double-action')] };
  expect(avatarEmotion(state).mood).toBe('tense');
});
it('목표 최초 달성 턴만 기뻐하고 다음 턴부터 현재 상황으로 돌아간다', () => {
  const state = { ...market(), goalMonthly: 100000 };
  expect(avatarEmotion(state).reason).toContain('처음 도달');
  state.milestonesHit.push('goal-100');
  state.turnMilestones = [{ id: 'goal-100', tone: 'cheer', title: '', detail: '', turn: 1 }];
  expect(avatarEmotion(state).mood).toBe('happy');
  expect(avatarEmotion({ ...state, turn: 2 }).mood).toBe('calm');
});
it('구 저장의 합산 잔액만으로 수익률을 추정하지 않으며 0원/시작 전도 안전하다', () => {
  const state = market(.1); delete state.ledger.marketEffects;
  expect(avatarEmotion(state).mood).toBe('calm');
  expect(avatarEmotion({ ...state, tileEffects: [tile('double-action')] }).mood).toBe('happy');
  expect(avatarEmotion({ ...market(.1), ledger: { ...market(.1).ledger, open: 0 } }).mood).toBe('calm');
  expect(avatarEmotion({ ...market(.1), turn: 0, currentEventId: 'medical' }).mood).toBe('calm');
});
it('캐릭터 외형이 판정을 바꾸지 않고 금융 상태를 그대로 둔다', () => {
  const state = market(.02), before = structuredClone(state);
  for (const avatarId of CHARACTER_IDS) expect(avatarEmotion({ ...state, avatarId })).toEqual(avatarEmotion(state));
  expect(state).toEqual(before);
});
