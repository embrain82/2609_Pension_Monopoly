import type { GameState, PayoutChoice, ScoreResult } from '../types';
import { MISSIONS, CUSHION_TARGET, missionResult, type MissionId } from './scenario-engine';
import { calculateScore, starLockReason } from './scoring-engine';

const won = (value: number) => `${Math.round(value).toLocaleString('ko-KR')}원`;

export function pensionBasisLabel(choice: PayoutChoice | null = 'annuity20'): string {
  return choice === 'lumpSum' ? '목표용 월 환산액 · 일시금 조정' : '목표용 월 환산액 · 세전';
}

export interface MissionDisplay {
  id: MissionId;
  name: string;
  metric: string;
  value: number;
  target: number;
  ratio: number;
  passed: boolean;
  valueText: string;
  targetText: string;
  progress: string;
  remaining: string;
  basis: string;
  stars: string;
}

/** 표시 전용. 통과 판정은 기존 missionResult / calculateScore, 별 조건은 starLockReason을 따른다. */
export function missionDisplay(state: GameState, score: ScoreResult = calculateScore(state)): MissionDisplay {
  const id = state.campaign?.mission ?? 'pension';
  const passed = state.campaign ? missionResult(state, score.monthlyPension).passed : score.goalMet;
  const value = id === 'cushion' ? state.cash - state.livingDebt
    : id === 'purchasing' ? 100 * state.campaign!.index / state.campaign!.priceIndex : score.monthlyPension;
  const target = id === 'cushion' ? CUSHION_TARGET
    : id === 'purchasing' ? 100 : state.campaign?.startingGoal ?? state.goalMonthly;
  const metric = id === 'cushion' ? '순생활자금' : id === 'purchasing' ? '실질 운용지수' : pensionBasisLabel(state.payoutChoice);
  const format = id === 'purchasing' ? (n: number) => n.toFixed(1) : won;
  const gap = Math.max(0, target - value);
  const remaining = id === 'cushion' && state.livingDebt > 0
    ? `목표까지 ${won(gap)} · 미지급 생활비 ${won(state.livingDebt)}`
    : passed ? '현재 목표 조건 충족' : `목표까지 ${format(gap)}${id === 'purchasing' ? 'p' : ''}`;
  const basis = id === 'cushion' ? '생활자금에서 미지급 생활비를 뺀 금액입니다. 미지급 생활비가 없어야 달성합니다.'
    : id === 'purchasing' ? '납입을 제외한 운용지수를 누적 물가로 나눈 값입니다. 시작 구매력은 100입니다.'
      : state.payoutChoice === 'lumpSum' ? '일시금의 세후 비교 비율을 반영한 게임 목표용 환산입니다. 실제 월 지급액이 아닙니다.'
        : 'IRP를 240개월로 나눈 세전 목표용 값입니다. 세후 수령 평균은 수령 비교에서 따로 봅니다.';
  const lock = starLockReason(state, score);
  return { id, name: MISSIONS[id].name, metric, value, target, ratio: target > 0 ? value / target : 0, passed,
    valueText: format(value), targetText: format(target), progress: `${metric} ${format(value)} / ${format(target)}`,
    remaining, basis, stars: `${state.status === 'finished' ? '최종' : '현재 기준'} 별 ${score.stars}개 · ${lock.line}` };
}
