import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { createGame, performAction, startTurn } from '../src/engine/game-engine';
import { explainMarketStep, marketExplanation } from '../src/engine/market-explanation';
import { applyMarketStep, marketHoldingEffects } from '../src/engine/market-engine';
import { portfolioValue } from '../src/engine/portfolio-engine';
import { aggregateHolding } from '../src/engine/position-engine';
import { summarizeTurn } from '../src/engine/settlement-engine';
import { type ScenarioId } from '../src/engine/scenario-engine';
import { renderMarketCard, renderMarketTimeline } from '../src/ui/market-view';
import { renderMarketImpacts } from '../src/ui/market-impact-view';
import { dialAngle, renderNewsFlash } from '../src/ui/news-flash';
import { balanceConfig, boardTiles } from '../src/data/content';
import type { GameState, MarketStep, PendingOrder } from '../src/types';
import baseline from './fixtures/market-p0-baseline.json';

describe('공개된 시장 사실과 실제 보유 영향', () => {
  it('F04 이전의 4개 시나리오 × 20개 시드 숫자·충격·신호를 그대로 유지한다', () => {
    for (const item of baseline) {
      const path = createGame(item.seed, 'balanced', 500_000, { scenario: item.scenario as ScenarioId, ghost: false }).marketPath;
      const numeric = path.map(({ headline: _headline, signal: _signal, reason: _reason, phase: _phase, ...step }) => { void _headline; void _signal; void _reason; void _phase; return step; });
      const hash = createHash('sha256').update(JSON.stringify(numeric)).digest('hex');
      expect(hash, `${item.scenario}/${item.seed}`).toBe(item.hash);
    }
  });

  it.each([-.5, 0, .5])('실제 금리 변화 %f%%p와 주가 방향을 국면 이름보다 우선한다', rateDeltaPct => {
    const base = createGame('facts', 'balanced', 500_000, { ghost: false }).marketPath[0];
    for (const stockReturn of [-.05, 0, .05]) {
      const step = { ...base, rateDeltaPct, stockReturn, regime: 'easing' as const, headline: '금리가 내려갑니다', reason: '하락 고정 설명' };
      const facts = marketExplanation(step);
      expect(facts.headline).toContain(rateDeltaPct === 0 ? '금리 동결' : rateDeltaPct > 0 ? '금리 상승' : '금리 하락');
      expect(facts.headline).toContain(stockReturn === 0 ? '주가 보합' : stockReturn > 0 ? '주가 상승' : '주가 하락');
      expect(facts.reason).toContain('다음 턴 방향은 확정되지 않았습니다');
      expect(facts.reason).not.toContain('하락 고정 설명');
      if (rateDeltaPct !== 0) expect(facts.reason).toContain('다른 조건이 같다면');
      expect(explainMarketStep(step).returns).toBe(step.returns);
    }
  });

  it.each(['rate-bigstep', 'emergency-cut'])('상·하한에 막힌 %s도 실제 동결로 설명한다', shockId => {
    const game = createGame('clamp', 'balanced', 500_000, { ghost: false });
    const old: MarketStep = { ...game.marketPath[0], rateDeltaPct: 0, ratePct: shockId === 'rate-bigstep' ? 6 : .5, shockId, shock: true };
    const state = { ...game, turn: 1, lastMarket: old, marketPath: [old, ...game.marketPath.slice(1)] };
    expect(marketExplanation(old).phase).toBe('금리 충격 시나리오');
    for (const html of [renderMarketCard(state, false), renderMarketCard(state, true), renderMarketTimeline(state, false), renderNewsFlash(old, game.lastMarket, boardTiles[0])]) {
      expect(html).toContain('금리 동결');
      expect(html).not.toContain('금리가 한 번에 크게 오릅니다');
    }
    const hidden = renderMarketTimeline({ ...state, turn: 0 }, true);
    expect(hidden).not.toContain('금리 동결');
    expect(hidden).not.toContain('금리 충격 시나리오');
  });

  it('직접·옵션 예금의 가입 약정·만기를 합산하며 예시 수익률로 대체하지 않는다', () => {
    const lot = (principal: number, ratePerTurn: number, maturityTurn: number) => ({ principal, amount: principal, openedTurn: 0, maturityTurn, ratePerTurn });
    const before: GameState = { ...createGame('fixed', 'balanced', 500_000, { ghost: false, defaultTrading: true }), turn: 4, holdings: [aggregateHolding('deposit', [
      { id: 'manual', source: 'manual', amount: 1_000_000, principal: 1_000_000, depositTurnsHeld: 3, lots: [lot(1_000_000, .01, 4)] },
      { id: 'default', source: 'default', scope: { mandateId: 'm', optionId: 'principal', optionVersion: 'e1' }, amount: 2_000_000, principal: 2_000_000, depositTurnsHeld: 3, lots: [lot(2_000_000, .02, 3)] }
    ])] };
    const after = applyMarketStep(before, { ...before.marketPath[3], returns: { ...before.lastMarket.returns, deposit: .09 } });
    const effects = marketHoldingEffects(before, after);
    expect(effects).toHaveLength(1);
    expect(effects[0].delta).toBe(10_000);
    expect(effects[0].returnRate).toBeCloseTo(10_000 / 3_000_000);
    const next = { ...after, turn: 5 };
    expect(marketHoldingEffects(next, applyMarketStep(next, next.marketPath[4]))[0].delta).toBe(0);
    const html = renderMarketImpacts(effects, 4);
    expect(html).toContain('+10,000원');
    expect(html).toContain('가입 건별 약정·만기 반영');
    expect(html).not.toContain('9.00%');
  });

  it('가격 노출 중인 매수·환매만 실제 영향에 포함하고 결제 전후 재분류와 구분한다', () => {
    const order = (id: string, side: 'buy' | 'sell', stage: 'received' | 'priced'): PendingOrder =>
      ({ id, side, stage, productId: 'balanced', amount: 1_000_000, submittedTurn: 1, priceTurn: 2, settlesTurn: 3 });
    const before: GameState = { ...createGame('pending-impact', 'balanced', 500_000, { ghost: false }), turn: 2, holdings: [],
      pendingOrders: [order('a', 'buy', 'received'), order('b', 'buy', 'priced'), order('c', 'sell', 'received'), order('d', 'sell', 'priced')] };
    const after = applyMarketStep(before, before.marketPath[1]);
    const effects = marketHoldingEffects(before, after);
    expect(effects[0].opening).toBe(2_000_000);
    expect(effects.reduce((sum, e) => sum + e.delta, 0)).toBeCloseTo(portfolioValue(after) - portfolioValue(before));
    expect(after.pendingOrders[0].amount).toBe(1_000_000);
    expect(after.pendingOrders[3].amount).toBe(1_000_000);
    const unexposed = { ...before, pendingOrders: [order('a', 'buy', 'received')] };
    expect(marketHoldingEffects(unexposed, applyMarketStep(unexposed, unexposed.marketPath[1]))).toEqual([]);
    expect(renderMarketImpacts([], 2)).toContain('이번 시장에 노출된 보유분·주문 없음');
  });

  it('운용 후 매수 금액과 구 저장의 누락으로 과거 시장 영향을 재계산하지 않는다', () => {
    const active = { ...startTurn(createGame('persist-impact', 'balanced', 500_000, { scenario: 'classic', ghost: false }), 1).state,
      currentEventId: null, awaitingAction: true, irpCash: 2_000_000 };
    const snapshot = structuredClone(active.ledger.marketEffects);
    const result = performAction(active, { kind: 'buy', productId: 'deposit', amount: 1_000_000 });
    expect(result.ok).toBe(true);
    expect(result.state.ledger.marketEffects).toEqual(snapshot);
    expect(summarizeTurn(active, result.state, result.message).marketEffects).toEqual(snapshot);
    expect(renderMarketImpacts(undefined, 3)).toContain('이전 저장에는 상품별 시장 반영 내역이 없습니다');
    expect(renderMarketImpacts(undefined, 0)).toBe('');
  });

  it('첫 턴 다이얼은 시나리오의 실제 시작 금리에서 움직인다', () => {
    const game = createGame('inflation-dial', 'balanced', 500_000, { scenario: 'inflation', ghost: false });
    const step = game.marketPath[0], config = balanceConfig.market;
    expect(step.ratePct - step.rateDeltaPct).not.toBe(config.rateStartPct);
    expect(renderNewsFlash(step, game.lastMarket, boardTiles[0])).toContain(`--from:${dialAngle(step.ratePct - step.rateDeltaPct, config.rateMinPct, config.rateMaxPct)}deg`);
  });
});
