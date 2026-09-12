import { policyRules } from '../data/content';
import { accountPayout, SCENARIO_CLOCK } from '../engine/account-engine';
import type { GameState, PayoutChoice, PayoutPlan } from '../types';
import { portfolioValue } from '../engine/portfolio-engine';
import { renderSpeech } from './speech';
import { missionDisplay, pensionBasisLabel } from '../engine/progress-engine';
import { calculateScore } from '../engine/scoring-engine';

const formatWon = (value: number) => `${Math.round(value).toLocaleString('ko-KR')}원`;
const pct = (rate: number) => `${Math.round(rate * 1000) / 10}%`;

export interface PayoutViewOptions {
  characters: boolean;
  /** 결과 화면에서 다시 고르는 경우 지금 선택 */
  current?: PayoutChoice | null;
}

export function payoutLabel(choice: PayoutChoice): string {
  return choice === 'lumpSum' ? '일시금' : '연금(20년)';
}

function planCard(plan: PayoutPlan, state: GameState, current: PayoutChoice | null | undefined): string {
  const lump = plan.choice === 'lumpSum';
  const projected = { ...state, payoutChoice: plan.choice };
  const mission = missionDisplay(projected, calculateScore(projected));
  const headline = lump ? `세후 ${formatWon(plan.net)}` : `세후 평균 월 ${formatWon(plan.monthlyNet)}`;
  const sub = lump
    ? `일시 수령액 · 평균 세금 ${pct(plan.taxRate)} (${formatWon(plan.tax)}) · ${pensionBasisLabel(plan.choice)} ${formatWon(plan.monthlyBasis)}`
    : `평균 세금 ${pct(plan.taxRate)} · ${policyRules.receivingMonths}개월 · ${pensionBasisLabel(plan.choice)} ${formatWon(plan.monthlyBasis)}`;
  const goal = `<span class="payout-goal ${mission.passed ? 'ok' : 'miss'}">${mission.name} ${mission.passed ? '달성' : '미달'}${mission.passed ? '' : ` · ${mission.remaining}`}</span>`;
  return `<button type="button" class="payout-card ${lump ? 'lump' : 'annuity'} ${current === plan.choice ? 'current' : ''}" data-action="choose-payout" data-choice="${plan.choice}">
      <span class="payout-name">${payoutLabel(plan.choice)}</span>
      <strong>${headline}</strong>
      <small>${sub}</small>
      ${goal}
    </button>`;
}

/**
 * 12턴 뒤 수령 방식 선택. 같은 IRP를 연금과 일시금으로 나눠 세금·월 수령·목표 판정을 나란히 보인다.
 * 어느 쪽이든 고를 수 있고, 결과 화면에서 다시 바꿀 수 있다.
 */
export function renderPayoutModal(state: GameState, options: PayoutViewOptions): string {
  const irp = portfolioValue(state);
  const annuity = accountPayout(irp, 'annuity20', state.accountBasis);
  const lump = accountPayout(irp, 'lumpSum', state.accountBasis);
  const diff = lump.tax - annuity.tax;
  const mission = missionDisplay(state);
  const goalExplanation = mission.id === 'pension'
    ? `연금 미션은 목표용 월 환산액으로 판정합니다. 일시금은 세후 비교 비율을 반영하므로 같은 IRP라도 목표용 환산액이 ${Math.round((1 - (annuity.monthlyBasis > 0 ? lump.monthlyBasis / annuity.monthlyBasis : 1)) * 100)}% 낮게 잡힙니다. 실제 월 지급액은 아닙니다.`
    : `이번 ${mission.name} 미션은 ${mission.metric}로 판정합니다. 이 화면에서 수령 방식을 바꿔도 해당 미션의 판정은 달라지지 않습니다.`;
  return `<div class="modal-icon payout">₩</div>
    <p class="eyebrow">12턴 끝 · 마지막 결정</p>
    <h2>어떻게 받을까요?</h2>
    <p class="modal-lead">IRP 평가액 <b>${formatWon(irp)}</b>. 미공제 원금은 과세 제외, 퇴직급여는 원천징수영수증의 이연세액, 공제 원금·수익은 수령 방식과 나이에 따른 세금으로 구분합니다. 표시 비율은 전체 잔액 대비 평균 세금입니다.</p>
    <div class="payout-grid">${planCard(annuity, state, options.current)}${planCard(lump, state, options.current)}</div>
    ${renderSpeech('coach', `<p>이번 재원 구성에서는 일시금 세금이 <b>${formatWon(diff)}</b> 더 붙습니다. ${goalExplanation} 정답은 없습니다. 급한 목돈이 필요하면 일시금도 선택입니다.</p>`, { characters: options.characters, title: '한 줄 정리' })}
    <p class="hint">${SCENARIO_CLOCK.description} 초기 퇴직급여 9천만원의 이연세액 180만원은 가상 영수증의 값입니다. 손실 시 재원 비례 축소·수령 중 운용수익 없음 가정이며 실제 세무 계산서는 아닙니다.</p>`;
}

/** 결과 화면 수령 방식 한 줄 */
export function renderPayoutLine(plan: PayoutPlan): string {
  return plan.choice === 'lumpSum'
    ? `일시금 수령 · 평균 세금 ${pct(plan.taxRate)} ${formatWon(plan.tax)} 차감 → 세후 ${formatWon(plan.net)} · 목표용 월 환산액(일시금 조정) ${formatWon(plan.monthlyBasis)}`
    : `연금(20년) 수령 · 평균 세금 ${pct(plan.taxRate)} → 세후 평균 월 ${formatWon(plan.monthlyNet)}`;
}
