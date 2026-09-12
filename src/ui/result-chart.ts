export interface ChartPoint {
  x: number;
  y: number;
}

export const CHART_WIDTH = 320;
export const CHART_HEIGHT = 96;
const PAD = 8;

export interface ChartDomain {
  min: number;
  max: number;
}

/** 두 시리즈를 한 축에 놓기 위한 공통 범위 */
export function chartDomain(...series: number[][]): ChartDomain {
  const values = series.flat();
  if (!values.length) return { min: 0, max: 1 };
  return { min: Math.min(...values), max: Math.max(...values) };
}

export function sparklinePoints(history: number[], width = CHART_WIDTH, height = CHART_HEIGHT, domain: ChartDomain = chartDomain(history)): ChartPoint[] {
  if (history.length === 0) return [];
  const span = domain.max - domain.min || 1;
  const stepX = history.length > 1 ? (width - PAD * 2) / (history.length - 1) : 0;
  return history.map((value, index) => ({
    x: Math.round((PAD + index * stepX) * 10) / 10,
    y: Math.round((height - PAD - ((value - domain.min) / span) * (height - PAD * 2)) * 10) / 10
  }));
}

/** 직전 최고점 대비 가장 크게 떨어진 턴. 떨어진 턴이 없으면 null. */
export function worstTurn(history: number[]): { turn: number; drawdown: number } | null {
  let peak = history[0] ?? 0;
  let worst: { turn: number; drawdown: number } | null = null;
  history.forEach((value, index) => {
    if (index === 0) return;
    const drop = peak > 0 ? 1 - value / peak : 0;
    if (drop > 0 && (!worst || drop > worst.drawdown)) worst = { turn: index, drawdown: drop };
    peak = Math.max(peak, value);
  });
  return worst;
}

/**
 * 12턴 IRP 스파크라인. `ghostHistory`를 주면 같은 축에 점선("그대로 둔 나")을 먼저 깔고 내 선을 위에 그린다.
 * 두 선의 끝에 라벨을 붙여 어느 쪽이 위인지 바로 읽히게 한다.
 */
export function renderIrpSparkline(history: number[], shockTurns: number[], ghostHistory: number[] | null = null): string {
  const ghost = ghostHistory && ghostHistory.length >= 2 ? ghostHistory : null;
  const domain = chartDomain([0], history, ghost ?? []);
  const points = sparklinePoints(history, CHART_WIDTH, CHART_HEIGHT, domain);
  if (points.length < 2) return '';
  const line = points.map((point) => `${point.x},${point.y}`).join(' ');
  const area = `${points[0].x},${CHART_HEIGHT} ${line} ${points[points.length - 1].x},${CHART_HEIGHT}`;
  const worst = worstTurn(history);
  const shocks = shockTurns
    .filter((turn) => turn > 0 && turn < points.length)
    .map((turn) => `<text class="chart-shock" x="${points[turn].x}" y="${Math.max(12, points[turn].y - 10)}" text-anchor="middle" style="--i:${turn}">⚡</text>`)
    .join('');
  const worstMark = worst
    ? `<circle class="chart-worst" cx="${points[worst.turn].x}" cy="${points[worst.turn].y}" r="5"></circle>`
    : '';
  const end = points[points.length - 1];
  const rising = history[history.length - 1] >= history[0];
  let ghostMarkup = '';
  let labels = '';
  if (ghost) {
    const ghostPoints = sparklinePoints(ghost, CHART_WIDTH, CHART_HEIGHT, domain);
    const ghostLine = ghostPoints.map((point) => `${point.x},${point.y}`).join(' ');
    const ghostEnd = ghostPoints[ghostPoints.length - 1];
    ghostMarkup = `<polyline class="chart-ghost" points="${ghostLine}"></polyline><circle class="chart-ghost-end" cx="${ghostEnd.x}" cy="${ghostEnd.y}" r="3"></circle>`;
    // 두 라벨이 겹치지 않게 위쪽 선의 라벨은 위로, 아래쪽은 아래로 민다.
    const meAbove = end.y <= ghostEnd.y;
    const myY = Math.min(CHART_HEIGHT - 2, Math.max(10, end.y + (meAbove ? -8 : 14)));
    const ghostY = Math.min(CHART_HEIGHT - 2, Math.max(10, ghostEnd.y + (meAbove ? 14 : -8)));
    labels = `<text class="chart-label me" x="${end.x - 8}" y="${myY}" text-anchor="end">내 IRP</text><text class="chart-label ghost" x="${ghostEnd.x - 8}" y="${ghostY}" text-anchor="end">그대로 둔 나</text>`;
  }
  const ghostAria = ghost ? `, 그대로 둔 나 마지막 ${Math.round(ghost[ghost.length - 1]).toLocaleString('ko-KR')}원` : '';
  return `<p class="chart-axis">IRP 잔액 · 입출금 포함 · 0~${history.length-1}턴<small>세로축 0원~${Math.round(domain.max).toLocaleString('ko-KR')}원 · 고스트도 같은 축</small></p><svg class="irp-chart ${rising ? 'up' : 'down'}${ghost ? ' with-ghost' : ''}" viewBox="0 0 ${CHART_WIDTH} ${CHART_HEIGHT}" role="img" aria-label="12턴 IRP 평가액 흐름. 시작 ${Math.round(history[0]).toLocaleString('ko-KR')}원, 마지막 ${Math.round(history[history.length - 1]).toLocaleString('ko-KR')}원${ghostAria}">
      <polygon class="chart-area" points="${area}"></polygon>
      ${ghostMarkup}
      <polyline class="chart-line" points="${line}" pathLength="1"></polyline>
      ${shocks}${worstMark}
      <circle class="chart-end" cx="${end.x}" cy="${end.y}" r="4"></circle>
      ${labels}
    </svg>`;
}

export function worstTurnLine(history: number[]): string {
  const worst = worstTurn(history);
  if (!worst || worst.drawdown < 0.005) return '12턴 내내 직전 최고점을 크게 밑돈 적이 없습니다.';
  return `가장 아슬아슬했던 턴: ${worst.turn}턴 낙폭 −${(worst.drawdown * 100).toFixed(1)}%`;
}
