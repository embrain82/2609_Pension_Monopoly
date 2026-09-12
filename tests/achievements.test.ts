import { describe, expect, it } from 'vitest';
import { balanceConfig, policyRules } from '../src/data/content';
import {
  ACHIEVEMENTS,
  CALM_SEAS_DRAWDOWN,
  GHOST_CRUSH_GAP,
  achievementDef,
  evaluateGame,
  evaluateMeta,
  ghostPensionGap,
  isAchievementId,
  isWeeklySeed,
  newlyUnlocked,
  rebalancedBeforeShock,
  recordCollection,
  resultShareText,
  weeklyLabel,
  weeklySeed
} from '../src/engine/achievements';
import { AUTO_STRATEGIES, autoplay, choosePayout, createGame, performAction, resolveLifeEvent, startTurn, type AutoStrategy } from '../src/engine/game-engine';
import { diceStepsForTurn } from '../src/engine/random-engine';
import { calculateScore } from '../src/engine/scoring-engine';
import { emptyCollection } from '../src/ui/ui-state';
import type { AchievementId, GameState, LifeChoice } from '../src/types';

/** 시드 결정적 손 플레이. 매 턴 `act`가 돌려준 행동을 하고 사건은 `life`로 푼다 */
function play(seed: string, act: (state: GameState) => Parameters<typeof performAction>[1], life: LifeChoice = 'cash', options: Parameters<typeof createGame>[3] = {}): GameState {
  let state = createGame(seed, 'balanced', 500_000, { ghost: false, ...options });
  while (state.status === 'playing') {
    state = startTurn(state, diceStepsForTurn(state.seed, state.turn)).state;
    if (state.currentEventId) {
      const resolved = resolveLifeEvent(state, life);
      state = resolved.ok ? resolved.state : resolveLifeEvent(state, 'cash').state;
    }
    while (state.status === 'playing' && state.awaitingAction) {
      const acted = performAction(state, act(state));
      state = acted.ok ? acted.state : performAction(state, { kind: 'hold' }).state;
    }
  }
  return state;
}

describe('업적 정의', () => {
  it('12개이고 id가 겹치지 않으며 누적 업적은 하나(all-profiles)다', () => {
    expect(ACHIEVEMENTS).toHaveLength(12);
    expect(new Set(ACHIEVEMENTS.map((item) => item.id)).size).toBe(12);
    expect(ACHIEVEMENTS.filter((item) => item.scope === 'meta').map((item) => item.id)).toEqual(['all-profiles']);
    for (const item of ACHIEVEMENTS) {
      expect(item.title.length).toBeGreaterThan(1);
      expect(item.detail.length).toBeGreaterThan(5);
      expect(achievementDef(item.id)).toBe(item);
    }
    expect(isAchievementId('goal-reached')).toBe(true);
    expect(isAchievementId('nope')).toBe(false);
    expect(isAchievementId(3)).toBe(false);
  });
});

describe('판 업적 판정', () => {
  it('진행 중인 판은 업적이 없다', () => {
    const state = startTurn(createGame('ach-playing', 'balanced', 500_000, { ghost: false }), 5).state;
    expect(evaluateGame(state)).toEqual([]);
  });

  it('기록 필드는 행동을 따라 쌓인다: 리밸런싱 턴·분산 턴·디폴트옵션 운용·사건 선택', () => {
    const rebalancer = play('ach-record', (state) => state.turn === 1 || state.turn === 5 ? { kind: 'rebalance' } : { kind: 'hold' });
    expect(rebalancer.record.rebalanceTurns).toEqual([1, 5]);
    expect(rebalancer.record.diversifiedTurns).toBe(8);
    expect(rebalancer.record.lifeChoices).toHaveLength(rebalancer.eventHistory.length);
    expect(rebalancer.record.lifeChoices.every((item) => item.choice === 'cash')).toBe(true);
    // 출발 구성(예금·혼합형 2종)을 그대로 두면 분산 턴이 0
    const idle = play('ach-record', () => ({ kind: 'hold' }));
    expect(idle.record.diversifiedTurns).toBe(0);
    expect(idle.record.rebalanceTurns).toEqual([]);
    // 디폴트옵션 + 납입 뒤 「그대로」 → 자동 매수 횟수
    const auto = play('ach-record', (state) => state.turn % 2 === 1 ? { kind: 'contribute', amount: 1_000_000 } : { kind: 'hold' }, 'cash', { defaultOption: 'lowRisk' });
    expect(auto.record.defaultOptionRuns).toBeGreaterThanOrEqual(2);
  });

  it('분산 8턴·목표·연금 선택은 손 플레이로 성립한다', () => {
    const state = play('ach-hand-1', (game) => game.turn === 1 ? { kind: 'rebalance' } : game.cash > 8_000_000 ? { kind: 'contribute', amount: 1_000_000 } : { kind: 'hold' });
    const chosen = choosePayout(state, 'annuity20').state;
    const ids = evaluateGame(chosen);
    expect(ids).toContain('diversified-12');
    expect(ids).toContain('annuity-choice');
    expect(evaluateGame(choosePayout(state, 'lumpSum').state)).not.toContain('annuity-choice');
    expect(evaluateGame(state)).not.toContain('annuity-choice');
  });

  it('공제 한도 채움: 세액공제 대상 900만 원을 넘어야 한다', () => {
    const heavy = play('ach-credit', (game) => game.cash >= 1_500_000 ? { kind: 'contribute', amount: 1_500_000 } : { kind: 'hold' });
    expect(heavy.taxCreditEligible).toBeGreaterThanOrEqual(policyRules.annualTaxCreditLimit - 1);
    expect(evaluateGame(heavy)).toContain('tax-credit-max');
    const light = play('ach-credit', () => ({ kind: 'hold' }));
    expect(evaluateGame(light)).not.toContain('tax-credit-max');
  });

  it('충격 전 리밸런싱: 충격 바로 전 턴에 리밸런싱한 시드에서만', () => {
    let found = 0;
    for (let index = 0; index < 40 && found < 3; index += 1) {
      const seed = `ach-shock-${index}`;
      const probe = createGame(seed, 'balanced', 500_000, { ghost: false });
      const shockTurn = probe.marketPath.find((step) => step.shock && step.turn >= 2)?.turn;
      if (!shockTurn) continue;
      const before = play(seed, (game) => game.turn === shockTurn - 1 ? { kind: 'rebalance' } : { kind: 'hold' });
      expect(rebalancedBeforeShock(before)).toBe(true);
      expect(evaluateGame(before)).toContain('pre-shock-rebalance');
      const after = play(seed, (game) => game.turn === shockTurn ? { kind: 'rebalance' } : { kind: 'hold' });
      expect(evaluateGame(after)).not.toContain('pre-shock-rebalance');
      found += 1;
    }
    expect(found).toBeGreaterThan(0);
  });

  it('퀴즈 만점: 3문항 이상 전부 정답', () => {
    const perfect = autoplay('ach-quiz', 'balanced', 'balanced', { quiz: 'correct' });
    expect(perfect.quizLog.length).toBeGreaterThanOrEqual(3);
    expect(evaluateGame(perfect)).toContain('quiz-perfect');
    const wrong = autoplay('ach-quiz', 'balanced', 'balanced', { quiz: 'wrong' });
    expect(evaluateGame(wrong)).not.toContain('quiz-perfect');
    const none = autoplay('ach-quiz', 'balanced');
    expect(evaluateGame(none)).not.toContain('quiz-perfect');
  });

  it('고스트 격파: 고스트가 있고 월 연금 5만 원 이상 앞서야 한다', () => {
    const withGhost = autoplay('ach-ghost', 'contributor', 'balanced', { ghost: true });
    const gap = ghostPensionGap(withGhost);
    expect(gap).not.toBeNull();
    expect(evaluateGame(withGhost).includes('ghost-crusher')).toBe((gap ?? 0) >= GHOST_CRUSH_GAP);
    const noGhost = autoplay('ach-ghost', 'contributor');
    expect(ghostPensionGap(noGhost)).toBeNull();
    expect(evaluateGame(noGhost)).not.toContain('ghost-crusher');
  });

  it('퇴직급여는 IRP로: 이직 사건에서 transfer-irp를 골라야 한다', () => {
    let seeds = 0;
    for (let index = 0; index < 60 && seeds < 2; index += 1) {
      const seed = `ach-sev-${index}`;
      const probe = createGame(seed, 'balanced', 500_000, { ghost: false });
      if (!probe.lifeEventSchedule.some((item) => item.eventId === 'severance')) continue;
      const moved = play(seed, () => ({ kind: 'hold' }), 'transfer-irp');
      expect(evaluateGame(moved)).toContain('severance-to-irp');
      const cashed = play(seed, () => ({ kind: 'hold' }), 'cash');
      expect(evaluateGame(cashed)).not.toContain('severance-to-irp');
      seeds += 1;
    }
    expect(seeds).toBeGreaterThan(0);
  });

  it('잔잔한 항해·별 셋은 점수·낙폭 기준을 그대로 따른다', () => {
    const steward = autoplay('ach-steward-3', 'steward');
    const score = calculateScore(steward);
    const ids = evaluateGame(steward);
    expect(ids.includes('three-stars')).toBe(score.stars === 3);
    expect(ids.includes('goal-reached')).toBe(score.goalMet);
    expect(ids.includes('calm-seas')).toBe(steward.maxDrawdown <= CALM_SEAS_DRAWDOWN);
  });

  it('같은 시드·같은 행동은 같은 기록과 업적을 만든다', () => {
    const a = autoplay('ach-det', 'balanced', 'balanced', { quiz: 'correct' });
    const b = autoplay('ach-det', 'balanced', 'balanced', { quiz: 'correct' });
    expect(a.record).toEqual(b.record);
    expect(evaluateGame(a)).toEqual(evaluateGame(b));
  });
});

describe('누적 업적·컬렉션·새 업적', () => {
  it('컬렉션은 판 수와 최고 별을 쌓고, 5성향 모두 완주하면 all-profiles', () => {
    let collection = emptyCollection();
    expect(evaluateMeta(collection)).toEqual([]);
    collection = recordCollection(collection, 'balanced', 2);
    collection = recordCollection(collection, 'balanced', 1);
    expect(collection.balanced).toEqual({ plays: 2, bestStars: 2 });
    for (const id of ['stable', 'stableGrowth', 'growth'] as const) collection = recordCollection(collection, id, 0);
    expect(evaluateMeta(collection)).toEqual([]);
    collection = recordCollection(collection, 'aggressive', 3);
    expect(evaluateMeta(collection)).toEqual(['all-profiles']);
  });

  it('newlyUnlocked는 이미 가진 업적을 빼고 판 업적과 누적 업적을 합친다', () => {
    const state = choosePayout(autoplay('ach-new', 'contributor'), 'annuity20').state;
    const all = evaluateGame(state);
    expect(all).toContain('annuity-choice');
    let collection = emptyCollection();
    for (const id of ['stable', 'stableGrowth', 'balanced', 'growth', 'aggressive'] as const) collection = recordCollection(collection, id, 1);
    const fresh = newlyUnlocked([], state, collection);
    expect(fresh).toEqual([...all, 'all-profiles']);
    const owned = newlyUnlocked(['annuity-choice', 'all-profiles'], state, collection);
    expect(owned).not.toContain('annuity-choice');
    expect(owned).not.toContain('all-profiles');
    expect(newlyUnlocked(all, state, emptyCollection())).toEqual([]);
  });
});

describe('주간 시드·공유 텍스트', () => {
  it('weeklySeed는 ISO 주를 쓴다(일요일은 그 주, 월요일은 다음 주, 연초는 전년 53주)', () => {
    expect(weeklySeed(new Date(2026, 8, 6))).toBe('weekly-2026-W36');
    expect(weeklySeed(new Date(2026, 8, 7))).toBe('weekly-2026-W37');
    expect(weeklySeed(new Date(2027, 0, 1))).toBe('weekly-2026-W53');
    expect(weeklySeed(new Date(2026, 0, 5))).toBe('weekly-2026-W02');
    expect(isWeeklySeed('weekly-2026-W36')).toBe(true);
    expect(isWeeklySeed('weekly-2026-w36')).toBe(false);
    expect(isWeeklySeed('abc-def')).toBe(false);
    expect(weeklyLabel('weekly-2026-W36')).toBe('2026-W36');
    expect(weeklyLabel('abc')).toBe('abc');
  });

  it('주간 시드로 만든 판은 같은 시장·사건·주사위를 만든다', () => {
    const a = createGame(weeklySeed(new Date(2026, 8, 6)), 'balanced', 500_000, { ghost: false });
    const b = createGame(weeklySeed(new Date(2026, 8, 2)), 'growth', 500_000, { ghost: false });
    expect(a.marketPath).toEqual(b.marketPath);
    expect(a.lifeEventSchedule).toEqual(b.lifeEventSchedule);
  });

  it('공유 텍스트는 목표·별·수익률·새 업적·시드를 담고 주간 시드면 그렇게 말한다', () => {
    const state = choosePayout(autoplay('weekly-2026-W36', 'contributor', 'balanced', { ghost: true }), 'annuity20').state;
    const score = calculateScore(state);
    const text = resultShareText(state, score, { newAchievements: ['annuity-choice'], url: 'https://example.test/' });
    expect(text).toContain('연금로드 12턴 결과 · 위험중립형');
    expect(text).toContain('/ 500,000원');
    expect(text).toContain('목표용 월 환산액 · 세전');
    expect(text).toContain(`별 ${'★'.repeat(score.stars)}${'☆'.repeat(3 - score.stars)}`);
    expect(text).toContain('그대로 둔 나 대비 월');
    expect(text).toContain('새 업적: 일시금 유혹 거절');
    expect(text).toContain('주간 시드 2026-W36');
    expect(text.trim().endsWith('https://example.test/')).toBe(true);
    const plain = resultShareText(autoplay('plain-seed', 'passive'), calculateScore(autoplay('plain-seed', 'passive')));
    expect(plain).toContain('시드 plain-seed');
    expect(plain).not.toContain('새 업적');
    expect(plain).not.toContain('그대로 둔 나');
  });
});

describe('업적 게이트 — 달성률과 점수 불변', () => {
  const RUNS = 60;
  const GAME_IDS = ACHIEVEMENTS.filter((item) => item.scope === 'game').map((item) => item.id);
  type GateStrategy = AutoStrategy | 'diversifier';
  const strategies: GateStrategy[] = [...AUTO_STRATEGIES, 'diversifier'];
  const rates = new Map<GateStrategy, Map<AchievementId, number>>();

  for (const strategy of strategies) {
    const counts = new Map<AchievementId, number>(GAME_IDS.map((id) => [id, 0]));
    for (let index = 0; index < RUNS; index += 1) {
      const seed = `ach-gate-${index}`;
      // 1턴에 리밸런싱해 분산을 만들고 그 뒤는 balanced. 표준 전략 중에는 1턴 분산이 없다.
      const raw = strategy === 'diversifier'
        ? play(seed, (game) => game.turn === 1 || game.turn % 4 === 0 ? { kind: 'rebalance' } : game.cash > balanceConfig.safeCashThreshold + balanceConfig.contributionAmount ? { kind: 'contribute' } : { kind: 'hold' }, 'transfer-irp', { ghost: true })
        : autoplay(seed, strategy, undefined, { ghost: true, quiz: strategy === 'steward' ? 'correct' : 'none' });
      const state = choosePayout(raw, strategy === 'passive' ? 'lumpSum' : 'annuity20').state;
      for (const id of evaluateGame(state)) counts.set(id, (counts.get(id) ?? 0) + 1);
    }
    rates.set(strategy, new Map([...counts].map(([id, count]) => [id, count / RUNS])));
  }

  it('판 업적 11개는 모두 어느 전략에서든 달성된다(불가능한 업적 없음)', () => {
    for (const id of GAME_IDS) {
      const best = Math.max(...strategies.map((strategy) => rates.get(strategy)!.get(id) ?? 0));
      expect(best, id).toBeGreaterThanOrEqual(0.01);
    }
  });

  it('행동 업적은 행동으로만 열린다: passive는 분산·리밸런싱·공제·퀴즈·고스트·디폴트옵션·이전 업적이 0', () => {
    const passive = rates.get('passive')!;
    for (const id of ['diversified-12', 'pre-shock-rebalance', 'tax-credit-max', 'quiz-perfect', 'ghost-crusher', 'default-option-run', 'severance-to-irp', 'annuity-choice'] as AchievementId[]) {
      expect(passive.get(id), id).toBe(0);
    }
  });

  it('기록 필드는 점수를 바꾸지 않는다(record를 비워도 같은 점수)', () => {
    for (const strategy of AUTO_STRATEGIES) {
      const state = autoplay(`ach-invariant-${strategy}`, strategy);
      const stripped: GameState = { ...state, record: { rebalanceTurns: [], diversifiedTurns: 0, defaultOptionRuns: 0, lifeChoices: [] } };
      expect(calculateScore(stripped)).toEqual(calculateScore(state));
    }
  });
});
