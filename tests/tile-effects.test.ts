import { describe, expect, it } from 'vitest';
import { balanceConfig, boardTiles, learningCards, lifeEvents, policyRules, products, validateContent } from '../src/data/content';
import { autoplay, createGame, performAction, resolveLifeEvent, startTurn } from '../src/engine/game-engine';
import { portfolioValue } from '../src/engine/portfolio-engine';
import { EXTRA_LIFE_EVENT_CAP, REBALANCE_TILE_BONUS, applyTileArrival, outlookRange, pickExtraLifeEvent, rebalanceGapLine, refundTaxCredit } from '../src/engine/tile-effects';
import type { GameState, TileEffectKind } from '../src/types';

const NO_GHOST = { ghost: false };

function tileIndex(effect: TileEffectKind, nth = 0): number {
  return boardTiles.filter((tile) => tile.effect === effect)[nth].index;
}

/** 시드 일정에 `turn`이 없는 시드를 찾는다(추가 사건·2회 행동 테스트를 스케줄과 분리). */
function seedWithoutEventAt(turn: number, prefix = 'tile'): string {
  for (let index = 0; index < 200; index += 1) {
    const seed = `${prefix}-${index}`;
    if (!createGame(seed, 'balanced', balanceConfig.defaultGoal, NO_GHOST).lifeEventSchedule.some((item) => item.turn === turn)) return seed;
  }
  throw new Error('시드를 찾지 못했습니다.');
}

function holding(state: GameState, productId: string): number {
  return state.holdings.find((item) => item.productId === productId)?.amount ?? 0;
}

/** 1턴을 `steps`만큼 이동해 열고 생활사건이 있으면 생활자금으로 해결한다. */
function landOn(seed: string, steps: number, profile: 'balanced' | 'aggressive' = 'balanced'): GameState {
  let state = startTurn(createGame(seed, profile, balanceConfig.defaultGoal, NO_GHOST), steps).state;
  if (state.currentEventId) state = resolveLifeEvent(state, 'cash').state;
  return state;
}

describe('3.1 칸이 규칙이 되는 보드 — 데이터', () => {
  it('24칸 모두 효과가 있고 상품 거리 6칸은 상품 6종을 하나씩 가리킨다', () => {
    expect(() => validateContent()).not.toThrow();
    expect(boardTiles).toHaveLength(24);
    expect(boardTiles[0].effect).toBe('tax-refund');
    const spotlights = boardTiles.filter((tile) => tile.effect === 'spotlight').map((tile) => tile.productId).sort();
    expect(spotlights).toEqual(products.map((product) => product.id).sort());
    expect(boardTiles.filter((tile) => tile.kind === 'market').every((tile) => tile.effect === 'signal-preview')).toBe(true);
    expect(boardTiles.filter((tile) => tile.kind === 'life').every((tile) => tile.effect === 'extra-life')).toBe(true);
    expect(boardTiles.filter((tile) => tile.kind === 'trade').every((tile) => tile.effect === 'double-action')).toBe(true);
  });
});

describe('연말정산 칸 — 세액공제는 통과할 때 환급 장면으로', () => {
  it('납입 시 공제 효과는 보류되고 생활자금은 납입액만 줄어든다', () => {
    const state = landOn('refund-hold', 1);
    const cash = state.cash;
    const result = performAction(state, { kind: 'contribute', amount: 1_000_000 });
    expect(result.ok).toBe(true);
    expect(result.state.cash).toBeCloseTo(cash - 1_000_000, 6);
    expect(result.state.pendingTaxCredit).toBeCloseTo(1_000_000 * policyRules.taxCreditRate, 6);
    expect(result.state.taxCreditRefunded).toBe(0);
    expect(result.message).toContain('연말정산 칸');
  });

  it('출발 칸을 지나면 보류분이 생활자금으로 돌아오고 tax-refund 효과가 첫 줄에 남는다', () => {
    const state = landOn('refund-cross', 20);
    const contributed = performAction(state, { kind: 'contribute', amount: 2_000_000 }).state;
    const pending = contributed.pendingTaxCredit;
    expect(pending).toBeGreaterThan(0);
    const crossed = startTurn(contributed, 6).state;
    expect(crossed.position).toBe(2);
    expect(crossed.pendingTaxCredit).toBe(0);
    expect(crossed.taxCreditRefunded).toBeCloseTo(pending, 6);
    expect(crossed.cash).toBeCloseTo(contributed.cash + balanceConfig.salarySurplusPerTurn + pending, 6);
    expect(crossed.tileEffects[0]).toMatchObject({ kind: 'tax-refund', amount: Math.round(pending) });
    expect(crossed.tileEffects[0].detail).toContain('환급');
    expect(crossed.tileEffects).toHaveLength(2);
    expect(crossed.tileEffects[1].kind).toBe('signal-preview');
    expect(crossed.logs.some((log) => log.type === 'refund')).toBe(true);
  });

  it('출발 칸에 정확히 멈추면 환급 장면은 한 번만 열린다', () => {
    const state = landOn('refund-land', 12);
    const landed = startTurn(performAction(state, { kind: 'hold' }).state, 12).state;
    expect(landed.position).toBe(0);
    expect(landed.tileEffects).toHaveLength(1);
    expect(landed.tileEffects[0].kind).toBe('tax-refund');
    expect(landed.tileEffects[0].amount).toBe(0);
    expect(landed.tileEffects[0].detail).toContain('납입이 없어');
  });

  it('납입이 없어도 통과 장면은 열리고, 판이 끝나면 미정산분이 일괄 환급되어 총 혜택이 같다', () => {
    const state = landOn('refund-none', 12);
    const crossed = startTurn(performAction(state, { kind: 'hold' }).state, 13).state;
    expect(crossed.tileEffects[0]).toMatchObject({ kind: 'tax-refund', amount: 0 });
    for (const tileEffects of [true, false]) {
      const done = autoplay('refund-total', 'contributor', undefined, { tileEffects });
      expect(done.pendingTaxCredit).toBe(0);
      expect(done.taxCreditRefunded).toBeCloseTo(done.taxCreditBenefit, 4);
      expect(done.taxCreditBenefit).toBeGreaterThan(0);
    }
  });

  it('refundTaxCredit는 상태를 바꾸지 않고 새 상태를 돌려준다', () => {
    const state = { ...createGame('refund-pure', 'balanced', balanceConfig.defaultGoal, NO_GHOST), pendingTaxCredit: 132_000, contributionTotal: 1_000_000 };
    const applied = refundTaxCredit(state);
    expect(state.pendingTaxCredit).toBe(132_000);
    expect(applied.state.cash).toBe(state.cash + 132_000);
    expect(applied.effect?.amount).toBe(132_000);
  });
});

describe('운용지시 칸 — 행동 2회', () => {
  it('첫 행동은 턴을 열어 두고 두 번째 행동 뒤에 정산한다. 그대로는 남은 행동을 모두 쓴다', () => {
    const seed = seedWithoutEventAt(1, 'double');
    const state = landOn(seed, tileIndex('double-action'));
    expect(state.actionsLeft).toBe(2);
    expect(state.tileEffects.some((effect) => effect.kind === 'double-action')).toBe(true);
    const first = performAction({ ...state, cash: 5_000_000 }, { kind: 'contribute', amount: 1_000_000 });
    expect(first.ok).toBe(true);
    expect(first.summary).toBeUndefined();
    expect(first.state.awaitingAction).toBe(true);
    expect(first.state.actionsLeft).toBe(1);
    expect(first.message).toContain('1회 더');
    const second = performAction(first.state, { kind: 'buy', productId: 'deposit', amount: 1_000_000 });
    expect(second.ok).toBe(true);
    expect(second.summary?.actionLines).toHaveLength(2);
    expect(second.summary?.actionLine).toContain(' · ');
    expect(second.summary?.irpBefore).toBeCloseTo(portfolioValue(state), 6);
    expect(second.summary?.actionDelta).toBeCloseTo(1_000_000, 6);
    expect(second.summary?.productDeltas.find((item) => item.productId === 'deposit')?.delta).toBeCloseTo(1_000_000, 6);
    expect(second.state.awaitingAction).toBe(false);

    const held = performAction(state, { kind: 'hold' });
    expect(held.summary).toBeDefined();
    expect(held.state.awaitingAction).toBe(false);
  });

  it('보통 칸에서는 행동이 한 번이다', () => {
    const state = landOn(seedWithoutEventAt(1, 'single'), 1);
    expect(state.actionsLeft).toBe(1);
    const acted = performAction(state, { kind: 'hold' });
    expect(acted.summary).toBeDefined();
    expect(acted.state.actionsLeft).toBe(0);
  });
});

describe('상품 거리 — 스포트라이트', () => {
  it('혼합형 거리도 일반 펀드 결제를 지키고 정보 보상만 추가한다', () => {
    const state = { ...landOn(seedWithoutEventAt(1, 'spot'), 8), irpCash: 1_000_000 };
    expect(state.spotlightProductId).toBe('balanced');
    const before = holding(state, 'balanced');
    const bought = performAction(state, { kind: 'buy', productId: 'balanced', amount: 1_000_000 });
    expect(bought.ok).toBe(true);
    expect(bought.state.pendingOrders).toHaveLength(1);
    expect(holding(bought.state, 'balanced')).toBeCloseTo(before, 6);
    expect(bought.state.understandingPoints).toBe(state.understandingPoints + 1);
    expect(bought.message).toContain('이해 +1');
    expect(bought.state.spotlightProductId).toBeNull();
  });

  it('다른 칸에서는 펀드가 평소처럼 다음 턴 체결이다', () => {
    const state = { ...landOn(seedWithoutEventAt(1, 'nospot'), 2), irpCash: 1_000_000 };
    const bought = performAction(state, { kind: 'buy', productId: 'balanced', amount: 1_000_000 });
    expect(bought.state.pendingOrders).toHaveLength(1);
  });

  it('예금 거리에서도 동일한 중도해지 이자 조정이 적용된다', () => {
    const state = landOn(seedWithoutEventAt(1, 'depo'), 1);
    const normal = { ...state, spotlightProductId: null };
    const spotlight = performAction(state, { kind: 'sell', productId: 'deposit', amount: 1_000_000 });
    const elsewhere = performAction(normal, { kind: 'sell', productId: 'deposit', amount: 1_000_000 });
    expect(spotlight.ok).toBe(true);
    expect(spotlight.state.irpCash).toBeCloseTo(elsewhere.state.irpCash, 6);
    expect(spotlight.state.irpCash).toBeLessThan(1_000_000);
  });
});

describe('시장 뉴스·금리 전망길 — 신호 미리 보기', () => {
  it('다음 턴 스텝의 신호를 한 턴 먼저 보여 주고, 없으면 없다고 말한다', () => {
    const state = landOn('preview', 2);
    const effect = state.tileEffects.find((item) => item.kind === 'signal-preview')!;
    const nextAlert = state.marketPath[state.turn].alert ?? null;
    expect(effect.alert).toEqual(nextAlert);
    expect(effect.detail).toContain(nextAlert ? '한 턴 먼저' : '특별한 신호가 없습니다');
    if (nextAlert) expect(state.unlockedCards).toContain('signal-vs-forecast');
  });

  it('금리 전망길도 같은 효과다', () => {
    const state = landOn('preview-rate', 19);
    expect(state.tileEffects.find((item) => item.kind === 'signal-preview')?.tileIndex).toBe(19);
  });
});

describe('생활 사건 칸 — 사건 하나 더(판당 1회)', () => {
  it('일정에 없는 턴에 도착하면 시드로 정한 사건이 열리고, 두 번째부터는 열리지 않는다', () => {
    const seed = seedWithoutEventAt(2, 'extra');
    let state = performAction(landOn(seed, 1), { kind: 'hold' }).state;
    state = startTurn(state, 3).state;
    expect(state.position).toBe(4);
    expect(boardTiles[4].effect).toBe('extra-life');
    expect(state.currentEventId).toBe(pickExtraLifeEvent(seed, 2));
    expect(state.extraLifeEvents).toBe(1);
    expect(state.awaitingAction).toBe(false);
    expect(state.eventHistory).toContain(state.currentEventId);
    expect(state.tileEffects.find((item) => item.kind === 'extra-life')?.eventId).toBe(state.currentEventId);
    expect(lifeEvents.some((event) => event.id === state.currentEventId)).toBe(true);

    state = performAction(resolveLifeEvent(state, 'cash').state, { kind: 'hold' }).state;
    const scheduledAt3 = state.lifeEventSchedule.some((item) => item.turn === 3);
    state = startTurn(state, 11).state;
    expect(state.position).toBe(15);
    expect(state.extraLifeEvents).toBe(EXTRA_LIFE_EVENT_CAP);
    if (!scheduledAt3) expect(state.currentEventId).toBeNull();
    expect(state.tileEffects.find((item) => item.kind === 'extra-life')?.detail).toContain(scheduledAt3 ? '이미 시드 일정' : '한 판에 한 번');
  });

  it('첫 턴에는 추가 사건이 나지 않는다', () => {
    const state = landOn(seedWithoutEventAt(1, 'extra-first'), 4);
    expect(state.currentEventId).toBeNull();
    expect(state.extraLifeEvents).toBe(0);
    expect(state.tileEffects.find((item) => item.kind === 'extra-life')?.detail).toContain('첫 턴');
  });
});

describe('제도 안내 · 리밸런싱 · 분산 광장 · 성향 점검', () => {
  it('제도 안내는 안 열린 제도 카드 1장을 열고 이해 +1', () => {
    const state = landOn(seedWithoutEventAt(1, 'policy'), 7);
    const effect = state.tileEffects.find((item) => item.kind === 'policy-brief')!;
    expect(effect.cardId).toBeDefined();
    expect(learningCards.find((card) => card.id === effect.cardId)?.category).toBe('제도');
    expect(state.unlockedCards).toContain(effect.cardId);
    expect(state.understandingPoints).toBe(1);
  });

  it('리밸런싱 칸에서 리밸런싱하면 보너스 이해 포인트가 붙고 스트립에 지금→목표가 있다', () => {
    const state = landOn(seedWithoutEventAt(1, 'rebal'), 10);
    expect(state.rebalanceBonusTurn).toBe(1);
    const effect = state.tileEffects.find((item) => item.kind === 'rebalance-bonus')!;
    expect(effect.detail).toContain('→');
    expect(rebalanceGapLine(state)).toContain('예금');
    const rebalanced = performAction(state, { kind: 'rebalance' });
    expect(rebalanced.state.understandingPoints).toBe(state.understandingPoints + 3 + REBALANCE_TILE_BONUS);
    expect(rebalanced.message).toContain(`이해 +${REBALANCE_TILE_BONUS}`);
    const plain = performAction(landOn(seedWithoutEventAt(1, 'rebal2'), 2), { kind: 'rebalance' });
    expect(plain.message).not.toContain('보너스');
  });

  it('분산 광장은 시작 구성(2종)에서는 분산 카드를 열고, 3종 이상이면 이해 +1', () => {
    const two = landOn(seedWithoutEventAt(1, 'div'), 17);
    expect(two.tileEffects.find((item) => item.kind === 'diversify-check')?.understanding).toBe(0);
    expect(two.unlockedCards).toContain('diversification');
    const base = createGame(seedWithoutEventAt(1, 'div3'), 'balanced', balanceConfig.defaultGoal, NO_GHOST);
    const spread = { ...base, holdings: [...base.holdings, { productId: 'shortBond' as const, amount: 20_000_000, principal: 20_000_000, depositTurnsHeld: 0 }] };
    const three = applyTileArrival(spread, { position: 17, crossedStart: false, scheduledEvent: false });
    expect(three.tileEffects[0].understanding).toBe(1);
    expect(three.understandingPoints).toBe(1);
  });

  it('성향 점검은 진단·행동 성향을 비교하고 정렬돼 있으면 이해 +1', () => {
    const state = landOn(seedWithoutEventAt(1, 'prof'), 20);
    const effect = state.tileEffects.find((item) => item.kind === 'profile-check')!;
    expect(effect.detail).toContain('진단');
    expect(effect.detail).toContain('행동');
    expect(state.unlockedCards).toContain('profile');
    expect([0, 1]).toContain(effect.understanding);
  });
});

describe('은퇴 전망대', () => {
  it('분기 20개로 월 연금 하위·중위·상위를 결정적으로 계산한다', () => {
    const state = landOn('outlook', 12);
    const range = outlookRange(state);
    expect(range.low).toBeLessThanOrEqual(range.mid);
    expect(range.mid).toBeLessThanOrEqual(range.high);
    expect(range.low).toBeGreaterThan(300_000);
    expect(range.high).toBeLessThan(800_000);
    expect(outlookRange(state)).toEqual(range);
    const effect = state.tileEffects.find((item) => item.kind === 'outlook')!;
    expect(effect.range).toEqual(range);
    expect(effect.detail).toContain('중간');
    expect(state.unlockedCards).toContain('pension-assumption');
  });

  it('실제 경로가 아닌 분기를 쓴다 — 실제 최종값이 범위와 같을 필요는 없지만 계산이 미래를 읽지 않는다', () => {
    const state = landOn('outlook-fork', 12);
    const changed = { ...state, marketPath: state.marketPath.map((step) => ({ ...step, returns: { ...step.returns, balanced: 0.2 } })) };
    expect(outlookRange(changed)).toEqual(outlookRange(state));
  });
});

describe('결정성과 끄기', () => {
  it('같은 시드·같은 주사위는 같은 칸 효과·같은 사건을 만든다', () => {
    const a = autoplay('same-tiles', 'balanced');
    const b = autoplay('same-tiles', 'balanced');
    expect(a.eventHistory).toEqual(b.eventHistory);
    expect(a.taxCreditRefunded).toBe(b.taxCreditRefunded);
    expect(a.logs.filter((log) => log.type === 'refund')).toEqual(b.logs.filter((log) => log.type === 'refund'));
    expect(portfolioValue(a)).toBeCloseTo(portfolioValue(b), 6);
  });

  it('칸 효과를 끄면 스트립이 비고 행동은 늘 한 번이며 사건은 시드 일정 3회만이다', () => {
    let state = createGame('tiles-off', 'balanced', balanceConfig.defaultGoal, { ghost: false, tileEffects: false });
    let events = 0;
    while (state.status === 'playing') {
      state = startTurn(state, 5).state;
      expect(state.tileEffects).toEqual([]);
      expect(state.actionsLeft).toBe(1);
      if (state.currentEventId) {
        events += 1;
        state = resolveLifeEvent(state, 'cash').state;
      }
      state = performAction(state, { kind: 'hold' }).state;
    }
    expect(events).toBe(3);
    expect(state.extraLifeEvents).toBe(0);
  });
});
