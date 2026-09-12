import { describe, expect, it } from 'vitest';
import type { GameState } from '../src/types';
import { createGame, performAction } from '../src/engine/game-engine';
import { beginPerformance, finishPerformance } from '../src/engine/performance-engine';
import { portfolioValue } from '../src/engine/portfolio-engine';
import { calculateScore } from '../src/engine/scoring-engine';
import { summarizeTurn } from '../src/engine/settlement-engine';
import { renderSettlementModal } from '../src/ui/settlement';
import { defaultSave, loadSave, saveData } from '../src/ui/ui-state';

describe('자금 흐름과 운용 성과 표시', () => {
  it.each([2_000_000, 6_000_000, -1_000_000])('시장·비용 불변, 외부 흐름 %i원은 운용 수익이 아니다', amount => {
    let before: GameState = { ...createGame('flow-display', 'balanced', 500_000, { scenario: 'classic', ghost: false }), turn: 1 };
    before = beginPerformance(before, before);
    const value = portfolioValue(before);
    before = { ...before, ledger: { open: value, afterMarket: value, beforeAction: null } };
    const after = finishPerformance({ ...before, irpCash: before.irpCash + amount,
      cashFlows: [{ turn: 1, kind: amount < 0 ? 'withdrawal' : amount > 2_000_000 ? 'transfer' : 'contribution', amount }] });
    const summary = summarizeTurn(before, after, '외부 자금 이동');
    expect(calculateScore(after).investmentReturnRate).toBe(0);
    expect(calculateScore(after).returnRate).toBeCloseTo(amount / value);
    expect(summary.capitalFlow).toBe(amount);
    expect(summary.tradingDelta).toBe(0);
    expect(summary.marketDelta + summary.capitalFlow! + summary.tradingDelta!).toBeCloseTo(summary.irpAfter - summary.irpOpen);
    expect(summary.benchmarkIrp).toBe(after.campaign!.benchmark);
  });

  it('두 번째 지시에서 첫 납입을 다시 매수해도 외부 입출금은 중복되지 않는다', () => {
    let before: GameState = { ...createGame('flow-two', 'balanced', 500_000, { scenario: 'classic', ghost: false }),
      turn: 1, awaitingAction: true, currentEventId: null, actionsLeft: 2 };
    before = beginPerformance(before, before);
    const value = portfolioValue(before);
    before = { ...before, ledger: { open: value, afterMarket: value, beforeAction: null } };
    const first = performAction(before, { kind: 'contribute', amount: 1_000_000 });
    expect(first.ok).toBe(true);
    const second = performAction(first.state, { kind: 'buy', productId: 'deposit', amount: 1_000_000 });
    expect(second.ok).toBe(true);
    const summary = summarizeTurn(first.state, second.state, second.message);
    expect(summary.capitalFlow).toBe(1_000_000);
    expect(summary.tradingDelta).toBeCloseTo(0);
    expect(second.state.cashFlows.filter(f => f.turn === 1)).toHaveLength(1);
  });

  it('동일 입출금 비교를 먼저 보이고 고스트는 조건이 다른 보조 비교로 접는다', () => {
    const game = createGame('benchmark-display', 'balanced', 500_000, { scenario: 'classic', ghost: false });
    const summary = { ...summarizeTurn(game, game, '유지'), benchmarkIrp: portfolioValue(game) + 1_000_000, ghostIrp: portfolioValue(game) - 1_000_000 };
    const html = renderSettlementModal(summary);
    expect(html.indexOf('같은 입출금으로 비교')).toBeLessThan(html.indexOf('생활 선택까지 다른 고스트'));
    expect(html).toContain('실제 예금 약정·거래비용·결제 대기는 재현하지 않습니다');
    expect(html).toContain('-1,000,000원');
    expect(html).toContain('(+1,000,000원)');
    expect(html).not.toContain('판단의 값어치');
  });

  it('최고 기록의 알려진 규칙만 저장하고 구 기록의 조건은 추측하지 않는다', () => {
    let raw = '';
    const saved = { ...structuredClone(defaultSave), bestReturnRate: .222,
      bestReturnRule: { ruleset: '2026-09-10-e' as const, perTurnLimit: 2_000_000 } };
    saveData(saved, { setItem: (_key, value) => { raw = value; } });
    expect(loadSave({ getItem: () => raw })).toEqual(saved);
    expect(loadSave({ getItem: () => JSON.stringify({ ...saved, bestReturnRule: undefined }) }).bestReturnRule).toBeUndefined();
    expect(loadSave({ getItem: () => JSON.stringify({ ...saved, bestReturnRule: { ruleset: 'future', perTurnLimit: -1 } }) }).bestReturnRule).toBeUndefined();
  });
});
