import { formatWon as won } from './format';
import { previewContribution, MIN_CONTRIBUTION_AMOUNT } from '../engine/contribution-engine';
import { actionTiming, blockReason } from '../engine/action-constraints';
import { resolveActionAmount, type AmountPreset } from '../engine/game-engine';
import { contributionCredit } from '../engine/policy-engine';
import { portfolioValue } from '../engine/portfolio-engine';
import { policyRules } from '../data/content';
import type { GameState } from '../types';

const short = (n: number) => n % 10000 === 0 ? `${n / 10000}만원` : won(n);

export function normalizeContributionPreset(state: GameState, preset: AmountPreset): AmountPreset {
  if (!state.contributionPacing) return preset;
  const available = Math.floor(previewContribution(state, { requested: state.cash }).available);
  return resolveActionAmount(state, 'contribute', preset) >= available ? 'max' : preset;
}

export function renderContributionView(state: GameState, preset: AmountPreset): string {
  const q = previewContribution(state, { requested: resolveActionAmount(state, 'contribute', preset) });
  const blocked = blockReason(actionTiming(state)) ?? blockReason(q.availability);
  const maximum = Math.floor(q.available), paced = Boolean(state.contributionPacing);
  const choices: AmountPreset[] = paced ? ['half', 'default', 'max'] : ['default', 'half', 'max'];
  const buttons = choices.filter(p => !paced || p === 'max' || resolveActionAmount(state, 'contribute', p) !== maximum).map(p => {
    const amount = resolveActionAmount(state, 'contribute', p);
    const disabled = amount < MIN_CONTRIBUTION_AMOUNT || (paced && amount > maximum);
    const label = paced ? p === 'max' ? '이번 턴 최대' : short(amount) : p === 'default' ? '기본' : p === 'half' ? '절반' : '가능액';
    return `<button type="button" class="${preset === p ? 'active' : ''}" data-action="amount-preset" data-preset="${p}" aria-pressed="${preset === p}" ${disabled ? 'disabled aria-describedby="contribution-budget-note"' : ''}><span>${label}</span><small>${disabled ? amount > maximum ? '가능액보다 큼' : '10만원 미만' : p === 'max' || !paced ? won(amount) : '고정 금액'}</small></button>`;
  }).join('');
  const credit = contributionCredit(state.contributionTotal, q.accepted);
  const creditNote = credit.benefit > 0 ? `세액공제 ${won(credit.benefit)}(교육용)은 연말정산 칸에서 생활자금으로 돌아옵니다.` : '공제 한도를 채워 이번 납입은 세액공제가 없습니다.';
  return `<button class="text-button" data-action="action-view" data-view="menu">← 행동 목록</button>
    <p class="eyebrow">추가납입</p><h2>IRP에 얼마나 넣을까요?</h2>
    ${paced ? `<p>턴당 합계 ${short(q.perTurnLimit!)}까지 나누어 납입할 수 있어요.</p><div class="contribution-budget"><div><small>이번 턴 납입</small><strong>${won(q.usedThisTurn)} / ${short(q.perTurnLimit!)}</strong></div><div><small>지금 추가 가능액</small><strong>${won(maximum)}</strong></div></div>` : '<p class="hint">이전 규칙으로 진행 중입니다. 턴당 제한 없이 기존 누적 납입 한도를 적용합니다.</p>'}
    <p class="hint" id="contribution-budget-note">${paced ? '게임 진행용 한도 · 운용지시 2회와 보너스 납입이 함께 사용합니다. ' : ''}이번 판 누적 납입 잔여 ${won(q.annualRemaining)} · 최소 10만원.</p>
    <div class="amount-presets contribution-presets">${buttons}</div>
    <div class="preview-box contribution-preview" aria-live="polite"><strong>미리보기</strong><p>납입 ${won(q.accepted)} · 납입 후 생활자금 ${won(state.cash - q.accepted)}.<br>목표용 월 환산액 · 세전 약 ${won((portfolioValue(state) + q.accepted) / policyRules.receivingMonths)}.</p><p>${creditNote}</p></div>
    ${blocked ? `<p class="availability-reason" id="contribution-reason">${blocked}</p>` : ''}
    <button class="primary jumbo" data-action="do-contribute" data-amount="${q.accepted}" ${blocked ? 'disabled aria-describedby="contribution-reason"' : ''}>${blocked ? '추가납입 이용 불가' : `${short(q.accepted)} 납입`}</button>`;
}
