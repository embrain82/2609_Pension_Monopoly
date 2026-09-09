import { describe, expect, it } from 'vitest';
import { defaultOptions, learningCards } from '../src/data/content';
import { allowedDefaultOptions, applyDefaultOption, suggestDefaultOption } from '../src/engine/default-option';
import { autoplay, createGame, performAction, startTurn } from '../src/engine/game-engine';
import { canBuyForProfile } from '../src/engine/policy-engine';
import { calculateScore } from '../src/engine/scoring-engine';
import { defaultSave, loadSave } from '../src/ui/ui-state';
import type { GameState } from '../src/types';

const open = (state: GameState): GameState => startTurn(state, 3).state;

describe('디폴트옵션(3.7) 데이터', () => {
  it('4종이고 상품은 모두 실제 상품이며 성향 허용 등급으로 걸러진다', () => {
    expect(defaultOptions.map((option) => option.id)).toEqual(['principal', 'lowRisk', 'midRisk', 'highRisk']);
    for (const option of defaultOptions) expect(option.products.length).toBeGreaterThan(0);
    expect(allowedDefaultOptions('stable').map((option) => option.id)).toEqual(['principal', 'lowRisk']);
    expect(allowedDefaultOptions('balanced').map((option) => option.id)).toEqual(['principal', 'lowRisk', 'midRisk']);
    expect(allowedDefaultOptions('aggressive').map((option) => option.id)).toEqual(['principal', 'lowRisk', 'midRisk', 'highRisk']);
    for (const option of allowedDefaultOptions('stableGrowth')) {
      for (const productId of option.products) expect(canBuyForProfile('stableGrowth', productId).ok).toBe(true);
    }
  });

  it('성향별 추천은 허용 범위 안의 값이다', () => {
    expect(suggestDefaultOption('stable')).toBe('principal');
    expect(suggestDefaultOption('stableGrowth')).toBe('lowRisk');
    expect(suggestDefaultOption('balanced')).toBe('midRisk');
    expect(suggestDefaultOption('growth')).toBe('highRisk');
    expect(suggestDefaultOption('aggressive')).toBe('highRisk');
  });

  it('학습 카드 default-option이 있다', () => {
    expect(learningCards.find((card) => card.id === 'default-option')?.category).toBe('제도');
  });
});

describe('디폴트옵션 동작', () => {
  it('createGame 옵션으로 지정하고, 기본은 null(고스트·시뮬 기준선)', () => {
    expect(createGame('do-1', 'balanced').defaultOption).toBeNull();
    const game = createGame('do-1', 'balanced', 500_000, { defaultOption: 'midRisk' });
    expect(game.defaultOption).toBe('midRisk');
    expect(game.ghost).not.toBeNull();
  });

  it('성향 밖 옵션은 지정해도 추천값으로 바뀐다', () => {
    const game = createGame('do-2', 'stable', 500_000, { defaultOption: 'highRisk' });
    expect(game.defaultOption).toBe('principal');
  });

  it('applyDefaultOption: 고정 비중대로 매수하고 펀드는 가격 확정·결제를 기다린다', () => {
    const base = open(createGame('do-3', 'balanced', 500_000, { defaultOption: 'midRisk', ghost: false }));
    const withCash: GameState = { ...base, irpCash: 3_000_000 };
    const applied = applyDefaultOption(withCash);
    expect(applied.bought.map((item) => item.productId).sort()).toEqual(['balanced', 'tdf']);
    expect(applied.bought.map(item => item.amount)).toEqual([1200000, 1800000]);
    expect(applied.state.irpCash).toBeLessThan(100_000);
    expect(applied.state.pendingOrders.filter((order) => order.side === 'buy')).toHaveLength(2);
    expect(applied.message).toContain('디폴트옵션');
  });

  it('소액도 구성 비율을 지킨다', () => {
    const base = open(createGame('do-4', 'balanced', 500_000, { defaultOption: 'midRisk', ghost: false }));
    const applied = applyDefaultOption({ ...base, irpCash: 150_000 });
    expect(applied.bought).toHaveLength(2);
    expect(applied.bought[0].productId).toBe('balanced');
    expect(applied.bought[0].amount).toBe(60_000);
  });

  it('대기자금이 10만원 미만이거나 옵션이 없으면 아무 일도 없다', () => {
    const base = open(createGame('do-5', 'balanced', 500_000, { defaultOption: 'midRisk', ghost: false }));
    expect(applyDefaultOption({ ...base, irpCash: 50_000 }).bought).toHaveLength(0);
    expect(applyDefaultOption({ ...base, irpCash: 3_000_000, defaultOption: null }).bought).toHaveLength(0);
  });

  it('옵트인을 명시하면 디폴트옵션이 대기자금을 운용하고 행동 줄에 남는다', () => {
    const base = open(createGame('do-6', 'balanced', 500_000, { defaultOption: 'principal', ghost: false }));
    const withCash: GameState = { ...base, irpCash: 2_000_000, currentEventId: null, awaitingAction: true };
    const held = performAction(withCash, { kind: 'default-opt-in' });
    expect(held.ok).toBe(true);
    expect(held.message).toContain('디폴트옵션');
    expect(held.state.irpCash).toBeLessThan(100_000);
    expect(held.state.holdings.find((holding) => holding.productId === 'deposit')!.amount).toBeGreaterThan(base.holdings.find((holding) => holding.productId === 'deposit')!.amount);
    expect(held.summary?.actionLines.some((line) => line.includes('디폴트옵션'))).toBe(true);
    expect(held.state.record.defaultOptionRuns).toBe(1);
  });

  it('디폴트옵션이 없으면 「그대로」는 예전과 같다', () => {
    const base = open(createGame('do-7', 'balanced', 500_000, { ghost: false }));
    const withCash: GameState = { ...base, irpCash: 2_000_000, currentEventId: null, awaitingAction: true };
    const held = performAction(withCash, { kind: 'hold' });
    expect(held.state.irpCash).toBe(2_000_000);
    expect(held.message).not.toContain('디폴트옵션');
  });

  it('가상 승인형 편입분만 한도 예외로 구분한다', () => {
    const base = open(createGame('do-8', 'aggressive', 500_000, { defaultOption: 'highRisk', ghost: false }));
    // 보유를 모두 ETF로 바꿔 한도 근처로 만든다
    const risky: GameState = {
      ...base,
      holdings: [{ productId: 'equityEtf', amount: 70_000_000, principal: 70_000_000, depositTurnsHeld: 0 }, { productId: 'deposit', amount: 30_000_000, principal: 30_000_000, depositTurnsHeld: 0 }],
      irpCash: 10_000_000
    };
    const applied = applyDefaultOption(risky);
    expect(applied.state.irpCash).toBeGreaterThanOrEqual(0);
    expect(applied.state.pendingOrders.some(o => o.productId === 'tdf')).toBe(true);
    expect(applied.state.holdings.find(h => h.productId === 'equityEtf')!.amount).toBe(78_000_000);
    expect(applied.state.ruleBreaches).toBe(risky.ruleBreaches);
  });
});

describe('디폴트옵션 전략·저장', () => {
  it('defaultOption 전략은 12턴을 마치고 passive보다 IRP가 높다(대기자금을 놀리지 않음)', () => {
    const seeds = Array.from({ length: 20 }, (_, index) => `do-gate-${index}`);
    let better = 0;
    for (const seed of seeds) {
      const passive = calculateScore(autoplay(seed, 'passive', 'balanced'));
      const withDefault = calculateScore(autoplay(seed, 'defaultOption', 'balanced'));
      if (withDefault.irpValue > passive.irpValue) better += 1;
    }
    expect(better).toBeGreaterThanOrEqual(15);
  });

  it('저장 v5: defaultOption을 기억하고 v1~v4는 null로 승격한다', () => {
    expect(defaultSave.version).toBe(7);
    expect(defaultSave.defaultOption).toBeNull();
    const v4 = { getItem: () => JSON.stringify({ version: 4, settings: { reducedMotion: false, sound: false, characters: true, ghost: false }, unlockedCards: [], bestScore: 1, lastSeed: 'x' }) };
    const loaded = loadSave(v4);
    expect(loaded.version).toBe(7);
    expect(loaded.defaultOption).toBeNull();
    expect(loaded.settings.ghost).toBe(false);
    const v5 = { getItem: () => JSON.stringify({ version: 5, settings: { reducedMotion: false, sound: false, characters: true, ghost: true }, unlockedCards: [], bestScore: 1, lastSeed: 'x', defaultOption: 'lowRisk' }) };
    expect(loadSave(v5).defaultOption).toBe('lowRisk');
    const bad = { getItem: () => JSON.stringify({ version: 5, settings: { reducedMotion: false, sound: false, characters: true, ghost: true }, unlockedCards: [], bestScore: 1, lastSeed: 'x', defaultOption: 'nope' }) };
    expect(loadSave(bad).defaultOption).toBeNull();
  });
});
