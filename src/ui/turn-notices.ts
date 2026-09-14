import { learningCards, policyRules } from '../data/content';
import { riskAssetRatio } from '../engine/policy-engine';
import { optionalQuizCards } from '../engine/quiz-engine';
import { knowledgeScoreOf } from '../engine/scoring-engine';
import type { GameState } from '../types';

/** 금융 상태와 분리한, 현재 판·턴의 안내 확인 내역. */
export interface UiProgress {
  riskNoticeAckTurn?: number;
  quizSkipAck?: { turn: number; cardIds: string[] };
}
export type ProgressIntent =
  | { kind: 'enter-action' }
  | { kind: 'leave-settlement' }
  | { kind: 'roll-next-turn' }
  | { kind: 'skip-quiz'; cardId: string };

/** 시장 엔진과 같은 허용오차. 주문 가능 판정은 기존 정책 엔진에 맡긴다. */
export function marketRiskNotice(state: GameState): { ratio: number; limit: number; exceeded: boolean } {
  const ratio = riskAssetRatio(state), limit = policyRules.riskAssetLimit;
  return { ratio, limit, exceeded: state.marketLimitExceeded && ratio > limit + 0.00001 };
}
export function riskRatioLabel(ratio: number, limit = policyRules.riskAssetLimit): string {
  const percent = ratio * 100;
  const digits = ratio > limit + 0.00001 && Number(percent.toFixed(1)) <= limit * 100 ? 3 : 1;
  return `${percent.toFixed(digits)}%`;
}

export interface QuizOpportunity { cardIds: string[]; nextPoints: number; maxPoints: number }
/** 읽기 전용: 가상 정답 로그로 점수만 미리 본다. 채점·해금·출제 순서는 바꾸지 않는다. */
export function quizOpportunity(state: GameState, candidates = optionalQuizCards(state)): QuizOpportunity {
  const cardIds = [...new Set(candidates)].filter(id => state.unlockedCards.includes(id) &&
    learningCards.some(card => card.id === id) && !state.quizLog.some(record => record.cardId === id));
  const current = knowledgeScoreOf(state);
  const projected = (ids: string[]) => knowledgeScoreOf({ ...state,
    quizLog: [...state.quizLog, ...ids.map(cardId => ({ cardId, correct: true, turn: state.turn }))] });
  return { cardIds, nextPoints: projected(cardIds.slice(0, 1)) - current, maxPoints: projected(cardIds) - current };
}
export function quizPointsCopy(opportunity: QuizOpportunity): string {
  if (opportunity.maxPoints <= 0) return '추가 점수 없이 복습할 수 있어요.';
  return opportunity.nextPoints > 0 ? `다음 문제 정답이면 이해 점수를 최대 ${opportunity.nextPoints}점 더 얻을 수 있어요.`
    : `남은 문제의 정답을 쌓으면 이해 점수를 최대 ${opportunity.maxPoints}점 더 얻을 수 있어요.`;
}
export function quizOpportunityAcknowledged(progress: UiProgress, turn: number, ids: string[]): boolean {
  return progress.quizSkipAck?.turn === turn && ids.every(id => progress.quizSkipAck!.cardIds.includes(id));
}
/** 손상되거나 오래된 UI 필드만 버린다. 정상 게임의 복원을 막지 않는다. */
export function normalizeUiProgress(input: unknown, state: GameState): UiProgress {
  if (!input || typeof input !== 'object') return {};
  const raw = input as Record<string, unknown>, result: UiProgress = {};
  if (state.turn > 0 && raw.riskNoticeAckTurn === state.turn) result.riskNoticeAckTurn = state.turn;
  const ack = raw.quizSkipAck as { turn?: unknown; cardIds?: unknown } | null;
  if (ack && ack.turn === state.turn && Array.isArray(ack.cardIds) && ack.cardIds.length <= learningCards.length &&
    ack.cardIds.every(id => typeof id === 'string' && state.unlockedCards.includes(id) && learningCards.some(card => card.id === id)) &&
    new Set(ack.cardIds).size === ack.cardIds.length) result.quizSkipAck = { turn: state.turn, cardIds: [...ack.cardIds] };
  return result;
}

export function renderRiskNotice(state: GameState): string {
  const risk = marketRiskNotice(state);
  return `<p class="eyebrow">운용 전 한 번 확인</p><h2 id="turn-notice-title">위험자산 비중이 ${riskRatioLabel(risk.limit)}를 넘었어요</h2>
    <div class="risk-notice-value"><small>현재 위험자산 비중</small><strong>${riskRatioLabel(risk.ratio)} <small>/ 한도 ${riskRatioLabel(risk.limit)}</small></strong></div>
    <p id="turn-notice-description">시장 가격 변화로 비중이 높아졌습니다. 위험자산 추가매수는 제한됩니다.</p>
    <p>가능한 행동은 다음 메뉴에서 확인할 수 있어요.</p>
    <div class="button-stack"><button class="primary jumbo" data-action="notice-continue">확인하고 운용하기</button></div>
    <p class="hint">확인해도 운용 횟수는 줄지 않아요. X를 누르면 보드로 돌아갑니다.</p>`;
}
export function renderQuizNotice(opportunity: QuizOpportunity, final: boolean): string {
  return `<p class="eyebrow">넘어가기 전에</p><h2 id="turn-notice-title">아직 풀 수 있는 퀴즈가 있어요</h2>
    <p class="quiz-notice-value">${quizPointsCopy(opportunity)}</p><p id="turn-notice-description">풀지 않고 넘어갈까요?</p>
    <p class="hint">${final ? '이번 게임을 마치면 남은 퀴즈에 답할 수 없습니다.' : '이번에는 넘어가고 계속 플레이할 수 있습니다.'} 건너뛰어도 점수가 차감되지 않습니다.</p>
    <div class="button-stack"><button class="primary jumbo" data-action="notice-quiz">퀴즈 풀기</button><button class="secondary" data-action="notice-continue">그냥 넘어가기</button></div>`;
}
