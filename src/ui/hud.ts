import { calculateScore, starChecklist, knowledgeBreakdown } from '../engine/scoring-engine';
import { formatWon as won, formatShortWon as shortWon } from './format';
import { missionDisplay } from '../engine/progress-engine';
import { profileLimits } from '../engine/profile-engine';
import { balanceConfig, policyRules } from '../data/content';
import type { GameState, ScoreResult } from '../types';

const formatMan = (value: number) => `${Math.max(1, Math.round(value / 10_000)).toLocaleString('ko-KR')}만 원`;
const formatShortWon = (value: number) => value >= 100_000_000
  ? `${(value / 100_000_000).toFixed(2)}억`
  : `${Math.round(value / 10_000).toLocaleString('ko-KR')}만`;

export function turnsLeft(state: GameState): number {
  return Math.max(0, balanceConfig.maxTurns - state.turn);
}

export function goalStatusLine(state: GameState, score: ScoreResult): string {
  if (state.campaign) {
    const mission = missionDisplay(state, score);
    return `${mission.remaining} · ${mission.stars}`;
  }
  const remaining = Math.max(0, state.goalMonthly - score.monthlyPension);
  const cashGap = Math.max(0, profileLimits(state).safeCash - state.cash + state.livingDebt);
  if (score.goalRate < balanceConfig.nearGoalRate) {
    return `목표까지 ${formatMan(remaining)} · 남은 턴 ${turnsLeft(state)}`;
  }
  if (!score.goalMet) {
    return `현재 기준 1별 · 목표까지 ${formatMan(remaining)}`;
  }
  if (cashGap > 0) {
    return `목표 달성 · 2별까지 생활자금 ${formatMan(cashGap)} 더`;
  }
  return '2별 조건 충족 · 낙폭·분산·정렬을 지키면 3별';
}

/** 지금 턴까지의 고스트("그대로 둔 나") 월 연금. 고스트가 없거나 아직 0턴이면 null */
export function ghostMonthlyNow(state: GameState): number | null {
  const irp = state.ghost?.irpHistory[Math.min(state.turn, (state.ghost?.irpHistory.length ?? 1) - 1)];
  if (irp === undefined || state.turn === 0) return null;
  return irp / policyRules.receivingMonths;
}

export function renderGoalMeter(state: GameState, score: ScoreResult, ghostMonthly: number | null = null): string {
  const mission = missionDisplay(state, score);
  const pct = Math.max(0, Math.min(100, mission.ratio * 100));
  const status = mission.passed ? 'met' : mission.ratio >= 0.9 ? 'near' : '';
  const meterClass = ['goal-meter', status].filter(Boolean).join(' ');
  const statusClass = ['goal-status', status].filter(Boolean).join(' ');
  const ghostPct = mission.id === 'pension' && state.payoutChoice !== 'lumpSum' && ghostMonthly !== null && mission.target > 0 ? Math.min(100, (ghostMonthly / mission.target) * 100) : null;
  const ghost = ghostPct !== null
    ? `<i class="ghost-mark ${ghostPct > pct ? 'ahead' : ''}" style="left:${ghostPct.toFixed(1)}%" title="그대로 둔 나 · 월 ${Math.round(ghostMonthly! / 10_000).toLocaleString('ko-KR')}만 원" aria-label="그대로 둔 나 ${Math.round(ghostPct)}%"></i>`
    : '';
  return `<div class="${meterClass}"><span style="width:${pct.toFixed(1)}%"></span><i class="tick" style="left:${state.campaign ? 100 : Math.round(balanceConfig.nearGoalRate * 100)}%" aria-hidden="true"></i>${ghost}</div>
    <div class="goal-caption"><span>${mission.name} · 목표 ${mission.id === 'purchasing' ? mission.targetText : formatShortWon(mission.target)}</span><strong>진행률 ${Math.round(mission.ratio * 100)}%</strong><span>남은 턴 ${turnsLeft(state)}</span></div>
    <p class="${statusClass}">${goalStatusLine(state, score)}</p>`;
}

export function renderRiskMeter(ratio: number, limit: number): string {
  const over = ratio > limit + 0.00001;
  return `<div class="risk-meter${over ? ' over' : ''}" role="img" aria-label="위험자산 비중 ${(ratio * 100).toFixed(1)}%, 한도 ${Math.round(limit * 100)}%"><span style="width:${Math.min(100, ratio * 100).toFixed(1)}%"></span><i class="limit" style="left:${Math.round(limit * 100)}%"></i></div>`;
}

/** 보드 바로 위의 핵심 정보. 생활자금과 계좌 안 주문 가능 자금을 혼동하지 않게 한다. */
export function renderBoardHud(state:GameState):string {
  const mission=missionDisplay(state);
  const learning=knowledgeBreakdown(state);
  const pending=state.pendingOrders.reduce((s,o)=>s+o.amount,0);
  return `<section class="board-hud" aria-label="이번 판 목표와 자금"><div class="board-mission"><strong>${mission.name}</strong><span>${mission.progress}</span></div><div class="board-funds"><div><small>생활자금 · IRP 밖</small><strong title="${won(state.cash)}">${shortWon(state.cash)}</strong></div><div><small>주문 가능 · IRP 안</small><strong title="${won(state.irpCash)}">${shortWon(state.irpCash)}</strong></div>${pending>0?`<div class="pending-cash"><small>미결제 · 사용 대기</small><strong title="${won(pending)}">${shortWon(pending)}</strong></div>`:''}</div>${renderGoalConditions(state)}<p class="board-learning">학습 ${learning.total}/20점 · 퀴즈 ${learning.quizCorrect}개 정답 · 최종 종합점수에 포함</p></section>`;
}

/** Keeps actual mission/star conditions visible without inventing a quiz gate. */
export function renderGoalConditions(state:GameState):string {
 const score=calculateScore(state), checks=starChecklist(state,score);
 return `${state.campaign ? `<p class="goal-check-brief">${checks.map((c,i)=>`${['미션','생활 안정','낙폭 예산'][i]} ${c.passed?'✓':'미충족'}`).join(' · ')}</p>` : ''}<details class="goal-conditions" data-preserve-open><summary>별 조건 ${checks.filter(c=>c.passed).length}/${checks.length} 충족 · 현재 ${score.stars}별</summary><ul>${checks.map(c=>`<li>${c.passed?'✓ 충족':'○ 확인 필요'} · ${c.label}</li>`).join('')}</ul><p>최종 결과에서 판정해요. 퀴즈는 종합점수의 학습 항목에 반영되며 별 조건과 구분해요.</p></details>`;
}
