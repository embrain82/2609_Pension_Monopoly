import { describe, expect, it } from 'vitest';
import { createGame, performAction, resolveLifeEvent, startTurn } from '../src/engine/game-engine';
import { LATE_GAME_TURN, scaleMs, scenePace, speedScale } from '../src/ui/fx';
import { DICE_ROLL_DURATION_MS, renderDiceMarkup } from '../src/ui/dice';
import { HOP_MS, LAND_MS, hopPlan } from '../src/ui/token3d';
import { remainingLifeEvents, renderTurnTrack } from '../src/ui/market-view';
import { AUTO_SETTLE_MS, canAutoSettle, renderSettlementModal } from '../src/ui/settlement';
import { renderNewsFlash } from '../src/ui/news-flash';
import { boardTiles } from '../src/data/content';
import { emptyMarketStep } from '../src/engine/market-engine';
import { defaultSave, loadSave } from '../src/ui/ui-state';
import type { TurnSummary } from '../src/types';

function playTurns(seed: string, turns: number) {
  let state = createGame(seed, 'balanced', 500_000, { ghost: false });
  let summary: TurnSummary | null = null;
  for (let index = 0; index < turns; index += 1) {
    state = startTurn(state, 7).state;
    // 사건은 항상 생활자금으로 처리해 행동 대기로 넘어간다
    if (state.currentEventId) state = resolveLifeEvent(state, 'cash').state;
    const result = performAction(state, { kind: 'hold' });
    state = result.state;
    summary = result.summary ?? summary;
  }
  return { state, summary: summary! };
}

describe('속도 스케일과 후반 가속', () => {
  it('speedScale은 1×=1, 2×=0.5이고 scaleMs는 정수 ms를 돌려준다', () => {
    expect(speedScale(1)).toBe(1);
    expect(speedScale(2)).toBe(0.5);
    expect(scaleMs(1120, 1)).toBe(1120);
    expect(scaleMs(1120, 2)).toBe(560);
    expect(scaleMs(261, 2)).toBe(131);
  });

  it('scenePace는 7턴부터 빠르고, 충격·이정표 턴은 정속이다', () => {
    expect(LATE_GAME_TURN).toBe(7);
    expect(scenePace(1, false)).toBe('normal');
    expect(scenePace(6, false)).toBe('normal');
    expect(scenePace(7, false)).toBe('fast');
    expect(scenePace(12, false)).toBe('fast');
    expect(scenePace(9, true)).toBe('normal');
    expect(scenePace(9, false, 1)).toBe('normal');
    expect(scenePace(9, false, 0)).toBe('fast');
  });

  it('주사위 마크업은 넘긴 ms를 --dice-ms에 쓴다', () => {
    expect(renderDiceMarkup([3, 4], true)).toContain(`--dice-ms:${DICE_ROLL_DURATION_MS}ms`);
    expect(renderDiceMarkup([3, 4], true, 560)).toContain('--dice-ms:560ms');
    expect(renderDiceMarkup([3, 4], true, 560)).not.toContain(`--dice-ms:${DICE_ROLL_DURATION_MS}ms`);
  });

  it('hopPlan에 스케일을 넘기면 길이만 줄고 착지 시점 비율은 같다', () => {
    const normal = hopPlan(true);
    const fast = hopPlan(true, 0.5);
    expect(normal.duration).toBe(HOP_MS * 0.7 + LAND_MS);
    expect(fast.duration).toBeCloseTo(normal.duration / 2, 6);
    expect(fast.land).toBeCloseTo(normal.land, 6);
    expect(hopPlan(false, 0.5).duration).toBeCloseTo(HOP_MS / 2, 6);
  });

  it('속보 카드는 pace가 fast면 .fast 클래스를 단다', () => {
    const state = startTurn(createGame('pace-news', 'balanced', 500_000, { ghost: false }), 5).state;
    const prev = emptyMarketStep();
    const normal = renderNewsFlash(state.lastMarket, prev, boardTiles[state.position], { characters: false, pace: 'normal' });
    const fast = renderNewsFlash(state.lastMarket, prev, boardTiles[state.position], { characters: false, pace: 'fast' });
    expect(normal).not.toMatch(/class="news-flash[^"]*fast/);
    expect(fast).toMatch(/class="news-flash[^"]*\bfast\b/);
  });
});

describe('턴 트랙 남은 예정 사건', () => {
  it('remainingLifeEvents는 지금 턴보다 뒤의 예정 사건만 센다', () => {
    const game = createGame('remain-1', 'balanced', 500_000, { ghost: false });
    expect(remainingLifeEvents(game)).toBe(3);
    const turns = game.lifeEventSchedule.map((item) => item.turn).sort((a, b) => a - b);
    const played = playTurns('remain-1', turns[0]).state;
    expect(remainingLifeEvents(played)).toBe(2);
    const all = playTurns('remain-1', 12).state;
    expect(remainingLifeEvents(all)).toBe(0);
  });

  it('턴 트랙 끝에 「사건 N회 남음」 또는 「예정 사건 없음」이 붙고 어느 턴인지는 숨긴다', () => {
    const game = createGame('remain-2', 'balanced', 500_000, { ghost: false });
    const track = renderTurnTrack(game, true);
    expect(track).toContain('track-note');
    expect(track).toContain('사건 3회 남음');
    const spoilerTurns = game.lifeEventSchedule.map((item) => item.turn);
    for (const turn of spoilerTurns) {
      expect(track).not.toMatch(new RegExp(`<i class="[^"]*life[^"]*"[^>]*>${turn}</i>`));
    }
    const done = playTurns('remain-2', 12).state;
    expect(renderTurnTrack(done, true)).toContain('예정 사건 없음');
  });
});

describe('정산 창 접기와 자동 진행', () => {
  const { summary } = playTurns('settle-fold', 2);

  it('기본은 상품별·내가 한 일·다음 판단이 <details>에 접히고 버튼이 그 앞에 있다', () => {
    const html = renderSettlementModal(summary, { characters: false });
    expect(html).toContain('<details class="settle-more"');
    expect(html).not.toMatch(/<details class="settle-more"[^>]*open/);
    const cta = html.indexOf('data-action="dismiss-settle"');
    const details = html.indexOf('<details class="settle-more"');
    expect(cta).toBeGreaterThan(0);
    expect(cta).toBeLessThan(details);
    // 접힌 부분에 상품별 막대와 내가 한 일이 들어간다
    const folded = html.slice(details);
    expect(folded).toContain('settle-returns');
    expect(folded).toContain('settle-mine');
    expect(folded).toContain('settle-hints');
    // 첫 화면에는 막대 3개와 한 줄 정리가 남는다
    const head = html.slice(0, details);
    expect(head).toContain('settle-bars');
    expect(head).toContain('한 줄 정리');
  });

  it('expanded면 details가 열린 채 그려진다', () => {
    const html = renderSettlementModal(summary, { characters: false, expanded: true });
    expect(html).toMatch(/<details class="settle-more"[^>]*\sopen/);
  });

  it('마지막 턴은 「남은 일」을 접지 않는다', () => {
    const html = renderSettlementModal(summary, { characters: false, final: true });
    const details = html.indexOf('<details class="settle-more"');
    expect(html.slice(0, details)).toContain('남은 일');
  });

  it('autoSettleMs를 넘기면 버튼 문구와 진행 막대가 붙고, 동작 줄이기면 막대는 없다', () => {
    const html = renderSettlementModal(summary, { characters: false, autoSettleMs: AUTO_SETTLE_MS });
    expect(html).toContain('auto-bar');
    expect(html).toContain(`--ms:${AUTO_SETTLE_MS}ms`);
    expect(html).toContain('자동 진행');
    const reduced = renderSettlementModal(summary, { characters: false, autoSettleMs: AUTO_SETTLE_MS, reducedMotion: true });
    expect(reduced).not.toContain('auto-bar');
    expect(reduced).toContain('자동 진행');
    expect(renderSettlementModal(summary, { characters: false })).not.toContain('자동 진행');
  });

  it('canAutoSettle은 마지막·충격·이정표·사건 턴에서 false', () => {
    const plain: TurnSummary = { ...summary, shock: false, milestones: [], lifeEvent: null };
    expect(canAutoSettle(plain, false)).toBe(true);
    expect(canAutoSettle(plain, true)).toBe(false);
    expect(canAutoSettle({ ...plain, shock: true }, false)).toBe(false);
    expect(canAutoSettle({ ...plain, milestones: [{ id: 'goal-50', turn: 2, title: '', detail: '', tone: 'cheer' }] }, false)).toBe(false);
    expect(canAutoSettle({ ...plain, lifeEvent: { eventId: 'repair', title: '', kind: 'cost', choice: 'cash', choiceLabel: '', cost: 1, cashDelta: -1, irpDelta: 0, penalty: 0, fee: 0, sales: [], shortage: false, alternative: '', message: '' } }, false)).toBe(false);
  });

  it('pace가 fast면 정산 루트에 .fast가 붙는다', () => {
    expect(renderSettlementModal(summary, { characters: false, pace: 'fast' })).toMatch(/class="settle-scene fast"/);
    expect(renderSettlementModal(summary, { characters: false })).toMatch(/class="settle-scene"/);
  });
});

describe('저장 v6', () => {
  it('기본 저장은 v6이고 속도 1×·자동 진행 끔·정산 접힘·업적 없음·컬렉션 0', () => {
    expect(defaultSave.version).toBe(7);
    expect(defaultSave.settings.speed).toBe(1);
    expect(defaultSave.settings.autoSettle).toBe(false);
    expect(defaultSave.settings.settleExpanded).toBe(false);
    expect(defaultSave.achievements).toEqual([]);
    expect(defaultSave.collection.balanced).toEqual({ plays: 0, bestStars: 0 });
    expect(Object.keys(defaultSave.collection)).toHaveLength(5);
  });

  it('v5 저장은 새 설정 기본값과 빈 업적으로 올라온다', () => {
    const v5 = { getItem: () => JSON.stringify({ version: 5, settings: { reducedMotion: false, sound: false, characters: true, ghost: false }, unlockedCards: [], bestScore: 1, lastSeed: 'x', defaultOption: 'lowRisk' }) };
    const loaded = loadSave(v5);
    expect(loaded.version).toBe(7);
    expect(loaded.settings.ghost).toBe(false);
    expect(loaded.settings.speed).toBe(1);
    expect(loaded.settings.autoSettle).toBe(false);
    expect(loaded.defaultOption).toBe('lowRisk');
    expect(loaded.achievements).toEqual([]);
    expect(loaded.collection.stable.plays).toBe(0);
  });

  it('v6 저장은 속도·자동 진행·업적·컬렉션을 유지하고 잘못된 값은 기본값으로', () => {
    const good = {
      getItem: () => JSON.stringify({
        version: 6,
        settings: { reducedMotion: false, sound: false, characters: true, ghost: true, speed: 2, autoSettle: true, settleExpanded: true },
        unlockedCards: [], bestScore: 1, lastSeed: 'x', defaultOption: null,
        achievements: ['goal-reached', 'nope', 'three-stars'],
        collection: { balanced: { plays: 3, bestStars: 2 }, stable: { plays: -1, bestStars: 9 } }
      })
    };
    const loaded = loadSave(good);
    expect(loaded.settings.speed).toBe(2);
    expect(loaded.settings.autoSettle).toBe(true);
    expect(loaded.settings.settleExpanded).toBe(true);
    expect(loaded.achievements).toEqual(['goal-reached', 'three-stars']);
    expect(loaded.collection.balanced).toEqual({ plays: 3, bestStars: 2 });
    expect(loaded.collection.stable).toEqual({ plays: 0, bestStars: 0 });
    expect(loaded.collection.growth).toEqual({ plays: 0, bestStars: 0 });
    const badSpeed = { getItem: () => JSON.stringify({ version: 6, settings: { reducedMotion: false, sound: false, characters: true, ghost: true, speed: 3 }, unlockedCards: [], bestScore: 1, lastSeed: 'x' }) };
    expect(loadSave(badSpeed).settings.speed).toBe(1);
  });
});
