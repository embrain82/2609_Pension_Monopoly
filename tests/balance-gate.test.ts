import { describe, expect, it } from 'vitest';
import { balanceConfig } from '../src/data/content';
import { AUTO_STRATEGIES, autoplay, type AutoStrategy } from '../src/engine/game-engine';
import { diceStepsForTurn } from '../src/engine/random-engine';
import { calculateScore } from '../src/engine/scoring-engine';

const RUNS_PER_STRATEGY = 100;

interface Row {
  twoPlus: number;
  three: number;
  meanDrawdown: number;
  drawdownFail: number;
  p10: number;
  p90: number;
}

const rows = new Map<AutoStrategy, Row>();
const diceSums: number[] = [];
const totalScores: number[] = [];

for (const strategy of AUTO_STRATEGIES) {
  let twoPlus = 0;
  let three = 0;
  let drawdownSum = 0;
  let drawdownFail = 0;
  const returns: number[] = [];
  for (let index = 0; index < RUNS_PER_STRATEGY; index += 1) {
    const seed = `gate-${strategy}-${index}`;
    const state = autoplay(seed, strategy);
    const score = calculateScore(state);
    if (score.stars >= 2) twoPlus += 1;
    if (score.stars === 3) three += 1;
    drawdownSum += score.maxDrawdown;
    if (score.maxDrawdown > balanceConfig.maxDrawdownThreshold) drawdownFail += 1;
    returns.push(score.returnRate);
    let diceSum = 0;
    for (let turn = 0; turn < balanceConfig.maxTurns; turn += 1) diceSum += diceStepsForTurn(seed, turn);
    diceSums.push(diceSum);
    totalScores.push(score.totalScore);
  }
  const sorted = [...returns].sort((a, b) => a - b);
  rows.set(strategy, {
    twoPlus: twoPlus / RUNS_PER_STRATEGY,
    three: three / RUNS_PER_STRATEGY,
    meanDrawdown: drawdownSum / RUNS_PER_STRATEGY,
    drawdownFail: drawdownFail / RUNS_PER_STRATEGY,
    p10: sorted[Math.floor(sorted.length * 0.1)],
    p90: sorted[Math.floor(sorted.length * 0.9)]
  });
}

const row = (strategy: AutoStrategy) => rows.get(strategy)!;

function correlation(a: number[], b: number[]): number {
  const mean = (values: number[]) => values.reduce((sum, value) => sum + value, 0) / values.length;
  const ma = mean(a);
  const mb = mean(b);
  let cov = 0;
  let va = 0;
  let vb = 0;
  for (let i = 0; i < a.length; i += 1) {
    cov += (a[i] - ma) * (b[i] - mb);
    va += (a[i] - ma) ** 2;
    vb += (b[i] - mb) ** 2;
  }
  return cov / Math.sqrt(va * vb);
}

describe('밸런스 게이트 — 운보다 의사결정', () => {
  it('분산·납입·리밸런싱 전략이 관망·집중·추격보다 2·3별을 더 얻는다', () => {
    expect(row('steward').twoPlus).toBeGreaterThanOrEqual(row('passive').twoPlus + 0.3);
    expect(row('contributor').twoPlus).toBeGreaterThanOrEqual(row('passive').twoPlus + 0.3);
    expect(row('balanced').twoPlus).toBeGreaterThanOrEqual(row('passive').twoPlus + 0.2);
    expect(row('steward').twoPlus).toBeGreaterThanOrEqual(row('etfOnly').twoPlus + 0.15);
    expect(row('steward').twoPlus).toBeGreaterThanOrEqual(row('momentum').twoPlus + 0.15);
  });

  it('위험한도 추종형은 크게 벌거나 크게 잃고 3별을 독점하지 않는다', () => {
    const etf = row('etfOnly');
    expect(etf.p90 - etf.p10).toBeGreaterThanOrEqual(0.15);
    expect(etf.meanDrawdown).toBeGreaterThanOrEqual(0.05);
    expect(etf.meanDrawdown).toBeLessThanOrEqual(0.16);
    expect(etf.drawdownFail).toBeGreaterThan(row('passive').drawdownFail);
    expect(etf.three).toBeLessThanOrEqual(0.1);
  });

  it('분산·리밸런싱 경로는 낙폭이 작다', () => {
    expect(row('steward').meanDrawdown).toBeLessThanOrEqual(0.06);
    expect(row('balanced').meanDrawdown).toBeLessThanOrEqual(0.06);
  });

  it('주사위 합은 총점과 무관하다', () => {
    expect(Math.abs(correlation(diceSums, totalScores))).toBeLessThan(0.1);
  });

  it('속보를 보고 ETF를 갈아타는 전략은 같은 시드의 균형 전략을 운 수준 이상으로 이기지 못한다', () => {
    let wins = 0;
    for (let index = 0; index < RUNS_PER_STRATEGY; index += 1) {
      const seed = `pair-${index}`;
      const chaser = calculateScore(autoplay(seed, 'newsChaser')).monthlyPension;
      const balanced = calculateScore(autoplay(seed, 'balanced')).monthlyPension;
      if (chaser > balanced) wins += 1;
    }
    expect(wins / RUNS_PER_STRATEGY).toBeLessThanOrEqual(0.5);
    expect(row('newsChaser').twoPlus).toBeLessThanOrEqual(row('balanced').twoPlus);
  });

  it('칸 효과는 판단을 넘지 않는다 — 켬/끔 월 연금 기대치 차이가 작고 무행동 0별 비율은 유지된다', () => {
    let passiveZero = 0;
    const gaps: number[] = [];
    for (let index = 0; index < 60; index += 1) {
      const seed = `tiles-${index}`;
      for (const strategy of ['balanced', 'steward', 'contributor'] as const) {
        const on = calculateScore(autoplay(seed, strategy, undefined, { tileEffects: true })).monthlyPension;
        const off = calculateScore(autoplay(seed, strategy, undefined, { tileEffects: false })).monthlyPension;
        gaps.push(on - off);
      }
      if (calculateScore(autoplay(seed, 'passive')).stars === 0) passiveZero += 1;
    }
    const meanGap = gaps.reduce((sum, value) => sum + value, 0) / gaps.length;
    expect(Math.abs(meanGap)).toBeLessThanOrEqual(15_000);
    expect(passiveZero / 60).toBeGreaterThanOrEqual(0.3);
  });
});
