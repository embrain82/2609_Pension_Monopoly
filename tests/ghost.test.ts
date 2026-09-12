import { describe, expect, it } from 'vitest';
import { lifeEvents, policyRules } from '../src/data/content';
import { autoplay, createGame, defaultLifeChoice, ghostTrackFor, performAction, resolveLifeEvent, startTurn } from '../src/engine/game-engine';
import { diceStepsForTurn } from '../src/engine/random-engine';
import { monthlyPension } from '../src/engine/scoring-engine';
import type { TileEffect } from '../src/types';
import { ghostVerdict, renderGhostSettleLine, renderGhostVerdict } from '../src/ui/ghost';
import { TILE_EFFECT_GLYPHS, isHighlightedEffect, renderTileEffects } from '../src/ui/tile-effects-view';

describe('고스트 "그대로 둔 나"', () => {
  it('고스트 최종값은 같은 시드의 passive 자동 플레이와 같고, 길이는 13이다', () => {
    const seed = 'ghost-eq';
    const game = createGame(seed, 'balanced', 500_000);
    const passive = autoplay(seed, 'passive', 'balanced', { ghost: false, goalMonthly: 500_000 });
    expect(game.ghost).not.toBeNull();
    expect(game.ghost!.irpHistory).toHaveLength(13);
    expect(game.ghost!.irpHistory).toEqual(passive.irpHistory);
    expect(game.ghost!.finalCash).toBe(passive.cash);
    expect(ghostTrackFor(seed, 'balanced', 500_000, true)).toEqual(game.ghost);
  });

  it('플레이어가 매 턴 "그대로"만 고르고 사건을 생활자금 쪽(cash)으로만 풀면 내 이력과 고스트 이력이 완전히 같다', () => {
    for (const seed of ['ghost-mirror-1', 'ghost-mirror-2', 'ghost-mirror-3']) {
      let state = createGame(seed, 'balanced', 500_000);
      while (state.status === 'playing') {
        state = startTurn(state, diceStepsForTurn(state.seed, state.turn)).state;
        if (state.currentEventId) {
          const event = lifeEvents.find((item) => item.id === state.currentEventId)!;
          expect(defaultLifeChoice(state, event)).toBe('cash');
          state = resolveLifeEvent(state, 'cash').state;
        }
        while (state.status === 'playing' && state.awaitingAction) state = performAction(state, { kind: 'hold' }).state;
      }
      expect(state.irpHistory).toHaveLength(13);
      expect(state.irpHistory).toEqual(state.ghost!.irpHistory);
      expect(state.cash).toBe(state.ghost!.finalCash);
      expect(ghostVerdict(state)).toMatchObject({ beat: true, pensionGap: 0, totalGap: 0 });
    }
  });

  it('판단의 값어치는 월 연금 차이와 총자산 차이로 계산되고 이김·짐을 가른다', () => {
    const base = createGame('ghost-verdict', 'balanced', 500_000);
    const ghost = base.ghost!;
    const ahead = { ...base, turn: 12, cash: 10_000_000, irpHistory: ghost.irpHistory.map((value, index) => (index ? value + 2_400_000 : value)) };
    const verdict = ghostVerdict(ahead)!;
    expect(verdict.beat).toBe(true);
    expect(verdict.pensionGap).toBeCloseTo(monthlyPension(2_400_000), 6);
    expect(verdict.pensionGap).toBeCloseTo(2_400_000 / policyRules.receivingMonths, 6);
    expect(verdict.totalGap).toBeCloseTo(2_400_000 + 10_000_000 - ghost.finalCash, 6);
    expect(verdict.widestTurn?.gap).toBeCloseTo(2_400_000, 6);
    const behind = { ...base, turn: 12, cash: ghost.finalCash, irpHistory: ghost.irpHistory.map((value, index) => (index === 5 ? value - 5_000_000 : index ? value - 1_000_000 : value)) };
    const lost = ghostVerdict(behind)!;
    expect(lost.beat).toBe(false);
    expect(lost.widestTurn).toEqual({ turn: 5, gap: -5_000_000 });
    expect(lost.totalGap).toBeCloseTo(-1_000_000, 6);
    expect(ghostVerdict({ ...base, ghost: null })).toBeNull();
    expect(ghostVerdict(base)).toBeNull();
  });

  it('고스트 비교는 경로 차이를 표시하고 투자 판단의 우열로 단정하지 않는다', () => {
    const base = createGame('ghost-block', 'balanced', 500_000);
    const ghost = base.ghost!;
    const win = { ...base, turn: 12, status: 'finished' as const, irpHistory: ghost.irpHistory.map((value, index) => (index ? value + 1_000_000 : value)) };
    const winHtml = renderGhostVerdict(win);
    expect(winHtml).toContain('ghost-badge beat');
    expect(winHtml).toContain('내 IRP가 더 큽니다');
    expect(winHtml).toContain('경로 간 차이');
    expect(winHtml).not.toContain('가장 벌어진 턴');
    const lose = { ...base, turn: 12, status: 'finished' as const, irpHistory: ghost.irpHistory.map((value, index) => (index === 7 ? value - 3_000_000 : index ? value - 500_000 : value)) };
    const loseHtml = renderGhostVerdict(lose);
    expect(loseHtml).not.toContain('고스트 격파');
    expect(loseHtml).toContain('가장 벌어진 턴: 7턴');
    expect(loseHtml).toContain('-3,000,000원');
    expect(renderGhostVerdict({ ...base, ghost: null })).toBe('');
  });

  it('정산 비교 줄은 앞서면 ahead, 뒤지면 behind, 고스트 없으면 빈 문자열', () => {
    const summary = { irpAfter: 101_000_000, ghostIrp: 100_000_000 } as never;
    expect(renderGhostSettleLine(summary)).toContain('settle-ghost ahead');
    expect(renderGhostSettleLine(summary)).toContain('(+1,000,000원)');
    expect(renderGhostSettleLine({ irpAfter: 99_000_000, ghostIrp: 100_000_000 } as never)).toContain('settle-ghost behind');
    expect(renderGhostSettleLine({ irpAfter: 1, ghostIrp: null } as never)).toBe('');
  });

  it('정산 요약의 ghostIrp는 그 턴 고스트 이력과 같다', () => {
    let state = createGame('ghost-summary', 'balanced', 500_000);
    state = startTurn(state, 3).state;
    if (state.currentEventId) state = { ...state, currentEventId: null, awaitingAction: true };
    const result = performAction(state, { kind: 'hold' });
    expect(result.summary?.ghostIrp).toBe(state.ghost!.irpHistory[1]);
  });
});

describe('칸 효과 스트립', () => {
  const effects: TileEffect[] = [
    { kind: 'tax-refund', tileIndex: 0, title: '연말정산 통과', detail: '환급', amount: 50_000 },
    { kind: 'double-action', tileIndex: 5, title: '행동 2회', detail: '두 번' }
  ];

  it('열 종류 모두 글리프가 있고, 최대 2개만 그린다', () => {
    expect(Object.keys(TILE_EFFECT_GLYPHS)).toHaveLength(10);
    const html = renderTileEffects([...effects, { kind: 'outlook', tileIndex: 12, title: '셋째', detail: '…' }], { heading: '칸 효과' });
    expect(html.match(/class="tile-effect /g)?.length).toBe(2);
    expect(html).toContain('칸 효과');
    expect(html).toContain('₩');
    expect(html).toContain('×2');
    expect(renderTileEffects([])).toBe('');
  });

  it('환급은 금액이 있을 때만, 추가 사건은 실제로 났을 때만, 행동 2회는 늘 강조한다', () => {
    expect(isHighlightedEffect(effects[0])).toBe(true);
    expect(isHighlightedEffect({ ...effects[0], amount: 0 })).toBe(false);
    expect(isHighlightedEffect(effects[1])).toBe(true);
    expect(isHighlightedEffect({ kind: 'extra-life', tileIndex: 4, title: '', detail: '' })).toBe(false);
    expect(isHighlightedEffect({ kind: 'extra-life', tileIndex: 4, title: '', detail: '', eventId: 'x' })).toBe(true);
    expect(isHighlightedEffect({ kind: 'spotlight', tileIndex: 1, title: '', detail: '' })).toBe(false);
  });
});
