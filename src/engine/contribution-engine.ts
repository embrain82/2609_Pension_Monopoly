import { policyRules } from '../data/content';
import type { GameState } from '../types';
import type { Availability, BlockCode } from './action-constraints';

export const MIN_CONTRIBUTION_AMOUNT = 100_000;
// Saved v1 games keep this rule even if a future version changes the default.
export const PACING_V1_LIMIT = 2_000_000;

export function contributionBudget(state: GameState) {
  const perTurnLimit = state.contributionPacing?.perTurnLimit ?? null;
  const usedThisTurn = state.cashFlows.reduce((sum, flow) =>
    sum + (flow.turn === state.turn && flow.kind === 'contribution' ? Math.max(0, flow.amount) : 0), 0);
  return { perTurnLimit, usedThisTurn,
    turnRemaining: perTurnLimit === null ? Infinity : Math.max(0, perTurnLimit - usedThisTurn),
    annualRemaining: Math.max(0, policyRules.annualContributionLimit - state.contributionTotal) };
}

/** Pure quote shared by ordinary contributions and bonus events; source funds differ. */
export function previewContribution(state: GameState, { requested, availableSource = state.cash }: { requested: number; availableSource?: number }) {
  const budget = contributionBudget(state);
  const available = Math.max(0, Math.min(availableSource, budget.annualRemaining, budget.turnRemaining));
  const validInput = Number.isFinite(requested) && requested > 0 && Number.isFinite(availableSource) && availableSource >= 0;
  const capped = validInput ? Math.min(requested, available) : 0;
  const accepted = state.contributionPacing ? Math.floor(capped) : capped;
  const block = (code: BlockCode, reason: string): Availability => ({ enabled: false, code, reason });
  let availability: Availability = { enabled: true };
  if (!validInput) availability = block('amount', '납입 금액은 유한한 양수여야 합니다.');
  else if (accepted < MIN_CONTRIBUTION_AMOUNT) {
    if (budget.annualRemaining < MIN_CONTRIBUTION_AMOUNT) availability = block('contribution-limit', '이번 판에 남은 납입 한도가 10만원 미만입니다.');
    else if (budget.turnRemaining < MIN_CONTRIBUTION_AMOUNT) availability = block('turn-contribution-limit', budget.turnRemaining === 0
      ? '이번 턴 추가납입 한도를 모두 사용했습니다. 다음 턴에 다시 납입할 수 있어요.'
      : '이번 턴 남은 한도가 최소 납입금액 10만원보다 작습니다. 다음 턴에 다시 납입할 수 있어요.');
    else if (availableSource < MIN_CONTRIBUTION_AMOUNT) availability = block('cash', '납입 가능한 생활자금이 10만원 미만입니다.');
    else availability = block('amount', '최소 납입금액은 10만원입니다.');
  }
  return { ...budget, requested, available, accepted, availability,
    remainingAfter: Math.max(0, budget.turnRemaining - accepted) };
}

export function contributionRuleLabel(state: Pick<GameState, 'contributionPacing'>): string {
  return state.contributionPacing
    ? `추가납입 턴당 ${state.contributionPacing.perTurnLimit / 10_000}만원`
    : '추가납입 이전 규칙 · 턴 한도 없음';
}

/** Only the new rule requires its ledger; existing checkpoints remain compatible. */
export function validContributionPacing(state: GameState): boolean {
  const rule = state.contributionPacing;
  if (rule === undefined) return true;
  if (!rule || rule.version !== 'v1' || rule.perTurnLimit !== PACING_V1_LIMIT || !Array.isArray(state.cashFlows)) return false;
  const used = new Map<number, number>();
  let total = 0;
  for (const flow of state.cashFlows) {
    if (!flow || !Number.isInteger(flow.turn) || flow.turn < 1 || flow.turn > state.turn || !Number.isFinite(flow.amount)) return false;
    if (!['contribution', 'transfer', 'withdrawal'].includes(flow.kind)) return false;
    if (flow.kind === 'withdrawal' ? flow.amount >= 0 : flow.amount <= 0) return false;
    if (flow.kind === 'contribution') {
      if (!Number.isInteger(flow.amount) || flow.amount < MIN_CONTRIBUTION_AMOUNT) return false;
      total += flow.amount;
      used.set(flow.turn, (used.get(flow.turn) ?? 0) + flow.amount);
      if (used.get(flow.turn)! > rule.perTurnLimit) return false;
    }
  }
  return Number.isFinite(state.contributionTotal) && total === state.contributionTotal && total <= policyRules.annualContributionLimit;
}
