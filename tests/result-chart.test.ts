import { describe, expect, it } from 'vitest';
import { autoplay } from '../src/engine/game-engine';
import { CHART_HEIGHT, CHART_WIDTH, chartDomain, renderIrpSparkline, sparklinePoints, worstTurn, worstTurnLine } from '../src/ui/result-chart';

describe('결과 스파크라인', () => {
  it('점 개수는 이력 길이와 같고 화면 안에 놓인다', () => {
    const points = sparklinePoints([100, 120, 90, 130]);
    expect(points).toHaveLength(4);
    for (const point of points) {
      expect(point.x).toBeGreaterThanOrEqual(0);
      expect(point.x).toBeLessThanOrEqual(CHART_WIDTH);
      expect(point.y).toBeGreaterThanOrEqual(0);
      expect(point.y).toBeLessThanOrEqual(CHART_HEIGHT);
    }
    expect(points[3].y).toBeLessThan(points[2].y);
    expect(sparklinePoints([])).toEqual([]);
  });

  it('가장 아슬아슬했던 턴은 직전 최고점 대비 최대 낙폭 턴이다', () => {
    const worst = worstTurn([100, 110, 99, 120, 108])!;
    expect(worst.turn).toBe(2);
    expect(worst.drawdown).toBeCloseTo(0.1, 10);
    expect(worstTurn([100, 101, 102])).toBeNull();
    expect(worstTurnLine([100, 110, 99])).toContain('2턴 낙폭 −10.0%');
    expect(worstTurnLine([100, 101])).toContain('밑돈 적이 없습니다');
  });

  it('마크업에 선·면·충격 마커·아슬아슬 턴 표시가 있고, 점이 2개 미만이면 비어 있다', () => {
    const html = renderIrpSparkline([100, 110, 99, 120], [2]);
    expect(html).toContain('chart-line');
    expect(html).toContain('chart-area');
    expect(html).toContain('chart-shock');
    expect(html).toContain('chart-worst');
    expect(html).toContain('role="img"');
    expect(renderIrpSparkline([100], [])).toBe('');
    expect(renderIrpSparkline([100, 110, 120], [])).toContain('irp-chart up');
    expect(renderIrpSparkline([100, 90, 80], [])).toContain('irp-chart down');
  });

  it('실제 12턴 이력을 그리면 충격 턴 마커 수가 충격 수와 같다', () => {
    const state = autoplay('chart');
    const shocks = state.marketPath.filter((step) => step.shock).map((step) => step.turn);
    const html = renderIrpSparkline(state.irpHistory, shocks);
    expect(html.match(/chart-shock/g)?.length).toBe(shocks.length);
  });

  it('고스트 이력을 주면 같은 축에 점선과 두 라벨을 그리고, 위쪽 선의 라벨이 위로 간다', () => {
    const mine = [100, 105, 110, 120];
    const ghost = [100, 101, 102, 103];
    const html = renderIrpSparkline(mine, [], ghost);
    expect(html).toContain('irp-chart up with-ghost');
    expect(html).toContain('chart-ghost');
    expect(html).toContain('chart-ghost-end');
    expect(html).toContain('내 IRP');
    expect(html).toContain('그대로 둔 나');
    expect(html).toContain('그대로 둔 나 마지막 103원');
    const domain = chartDomain(mine, ghost);
    expect(domain).toEqual({ min: 100, max: 120 });
    const myEnd = sparklinePoints(mine, CHART_WIDTH, CHART_HEIGHT, domain)[3];
    const ghostEnd = sparklinePoints(ghost, CHART_WIDTH, CHART_HEIGHT, domain)[3];
    expect(myEnd.y).toBeLessThan(ghostEnd.y);
    const myLabelY = Number(html.match(/class="chart-label me" x="[\d.]+" y="([\d.]+)"/)![1]);
    const ghostLabelY = Number(html.match(/class="chart-label ghost" x="[\d.]+" y="([\d.]+)"/)![1]);
    expect(myLabelY).toBeLessThan(ghostLabelY);
    expect(renderIrpSparkline(mine, [], null)).not.toContain('chart-ghost');
    expect(renderIrpSparkline(mine, [], [100])).not.toContain('chart-ghost');
  });

  it('고스트가 내 선보다 높으면 두 선이 한 축에 놓여 내 선이 아래에 그려진다', () => {
    const mine = [100, 98, 97, 96];
    const ghost = [100, 104, 108, 112];
    const html = renderIrpSparkline(mine, [], ghost);
    const domain = chartDomain([0], mine, ghost);
    expect(domain.max).toBe(112);
    const myEnd = sparklinePoints(mine, CHART_WIDTH, CHART_HEIGHT, domain)[3];
    const ghostEnd = sparklinePoints(ghost, CHART_WIDTH, CHART_HEIGHT, domain)[3];
    expect(myEnd.y).toBeGreaterThan(ghostEnd.y);
    expect(html).toContain(`cx="${myEnd.x}" cy="${myEnd.y}" r="4"`);
    expect(html).toContain(`cx="${ghostEnd.x}" cy="${ghostEnd.y}" r="3"`);
  });
});
