import { monthlyPension } from '../engine/scoring-engine';
import type { GameState, TurnSummary } from '../types';

const formatWon = (value: number) => `${Math.round(value).toLocaleString('ko-KR')}원`;
const signedWon = (value: number) => `${value > 0 ? '+' : ''}${formatWon(value)}`;

export interface GhostVerdict {
  /** 내 판단 − 그대로 둔 나. 월 연금 기준 */
  pensionGap: number;
  /** 내 판단 − 그대로 둔 나. IRP + 생활자금 기준(판이 끝났을 때만 의미 있음) */
  totalGap: number;
  beat: boolean;
  /** 이기면 가장 앞선 턴, 지면 가장 뒤처진 턴. 1턴 이후가 없으면 null */
  widestTurn: { turn: number; gap: number } | null;
  myIrp: number;
  ghostIrp: number;
}

/** 지금까지 진행된 턴 기준 내 IRP와 고스트 IRP의 차이. 고스트가 없거나 아직 한 턴도 안 지났으면 null */
export function ghostVerdict(state: GameState): GhostVerdict | null {
  if (!state.ghost) return null;
  const mine = state.irpHistory;
  const ghost = state.ghost.irpHistory;
  const last = Math.min(mine.length, ghost.length) - 1;
  if (last < 1) return null;
  const myIrp = mine[last];
  const ghostIrp = ghost[last];
  const beat = myIrp >= ghostIrp;
  let widestTurn: GhostVerdict['widestTurn'] = null;
  for (let turn = 1; turn <= last; turn += 1) {
    const gap = mine[turn] - ghost[turn];
    if (!widestTurn || (beat ? gap > widestTurn.gap : gap < widestTurn.gap)) widestTurn = { turn, gap };
  }
  return {
    pensionGap: monthlyPension(myIrp) - monthlyPension(ghostIrp),
    totalGap: (myIrp + state.cash) - (ghostIrp + state.ghost.finalCash),
    beat,
    widestTurn,
    myIrp,
    ghostIrp
  };
}

/** 정산 장면 한 줄: "그대로 뒀다면 X · 내 판단 Y (±Z)". 고스트가 없으면 빈 문자열 */
export function renderGhostSettleLine(summary: TurnSummary): string {
  if (summary.ghostIrp === null) return '';
  const gap = summary.irpAfter - summary.ghostIrp;
  const tone = gap > 0 ? 'ahead' : gap < 0 ? 'behind' : 'even';
  return `<p class="settle-ghost ${tone}"><span class="ghost-dot" aria-hidden="true"></span>그대로 뒀다면 <b>${formatWon(summary.ghostIrp)}</b> · 내 판단 <b>${formatWon(summary.irpAfter)}</b> <strong>(${signedWon(gap)})</strong></p>`;
}

/** 결과 화면 값어치 블록. 스파크라인은 result-chart가 그리고 여기는 숫자와 배지만 */
export function renderGhostVerdict(state: GameState): string {
  const verdict = ghostVerdict(state);
  if (!verdict) return '';
  const badge = verdict.beat
    ? '<span class="ghost-badge beat">고스트 격파</span>'
    : '<span class="ghost-badge">그대로 둔 나가 앞섰습니다</span>';
  const widest = verdict.widestTurn && !verdict.beat
    ? `<p class="ghost-widest">가장 벌어진 턴: ${verdict.widestTurn.turn}턴 ${signedWon(verdict.widestTurn.gap)}</p>`
    : '';
  return `<div class="ghost-verdict ${verdict.beat ? 'beat' : 'behind'}">
      <div class="ghost-verdict-head">${badge}<span class="ghost-legend"><i class="me"></i>내 판단 <i class="ghost"></i>그대로 둔 나</span></div>
      <p class="ghost-worth">판단의 값어치 <b class="${verdict.pensionGap < 0 ? 'neg' : ''}">월 연금 ${signedWon(verdict.pensionGap)}</b> · 총자산 기준 <b class="${verdict.totalGap < 0 ? 'neg' : ''}">${signedWon(verdict.totalGap)}</b></p>
      <p class="ghost-detail">그대로 뒀다면 IRP ${formatWon(verdict.ghostIrp)} · 생활자금 ${formatWon(state.ghost!.finalCash)}. 같은 시드·주사위로 두 주사위 합만큼 이동하고 직접 운용하지 않은 기준 경로입니다. 내 납입·생활 선택과 달라 추가 사건과 현금흐름도 다를 수 있습니다.</p>
      ${widest}
    </div>`;
}
