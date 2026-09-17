import type { GameState, LearningCard } from '../types';
import { learningCardsFor } from '../data/content';
import { renderSpeech } from './speech';

export interface QuizViewState {
  optional?:boolean;
  /** 고른 선택지. 아직이면 null */
  picked: number | null;
  /** 마무리 퀴즈면 "n / 총" 진행. 턴 중 퀴즈면 null */
  progress: { index: number; total: number } | null;
  characters: boolean;
  /** 연속 정답 수(답한 뒤) */
  streak: number;
  /** 실제 이해 점수 증분. 상한에 닿은 정답도 무조건 +2로 표시하지 않는다. */
  pointsEarned?: number;
  /** 답하기 전 실제로 얻을 수 있는 점수. 상한이면 0 */
  pointsAvailable?: number;
}

export function quizEyebrow(progress: QuizViewState['progress']): string {
  return progress ? `마무리 퀴즈 · ${progress.index + 1} / ${progress.total}` : '한 문제 · 배운 카드에서';
}

/**
 * 퀴즈 모달. 답하기 전엔 선택지 3개, 답한 뒤엔 정답·해설과 「계속」. 오답도 벌점이 없다는 것을 문구로 밝힌다.
 */
export function renderQuizModal(card: LearningCard, view: QuizViewState): string {
  const answered = view.picked !== null;
  const options = card.quiz.options.map((option, index) => {
    const state = !answered ? '' : index === card.quiz.answer ? 'correct' : index === view.picked ? 'wrong' : 'dim';
    return `<button type="button" class="quiz-option ${state}" data-action="quiz-pick" data-option="${index}" ${answered ? 'disabled' : ''} aria-pressed="${view.picked === index}">
        <span class="choice-index">${String.fromCharCode(65 + index)}</span><span>${option}</span>${state === 'correct' ? '<i aria-hidden="true">✓</i>' : state === 'wrong' ? '<i aria-hidden="true">✕</i>' : ''}
      </button>`;
  }).join('');
  const verdict = !answered
    ? '<div class="quiz-answer-placeholder"><span aria-hidden="true">?</span><p>답을 고르면 정답과 해설이 여기에 나타나요.</p><small>부담 없이 생각해 보세요. 오답은 벌점이 없습니다.</small></div>'
    : view.picked === card.quiz.answer
      ? renderSpeech('coach', `<p><strong>정답!</strong> ${view.pointsEarned === 0 ? '추가 점수 없이 복습 완료' : `제도·운용 이해 +${view.pointsEarned ?? 2}`}${view.streak >= 3 ? ` · ${view.streak}연속` : ''}. ${card.quiz.why}</p>`, { characters: view.characters, tone: 'positive' })
      : renderSpeech('coach', `<p><strong>아쉬워요.</strong> 정답은 「${card.quiz.options[card.quiz.answer]}」. ${card.quiz.why} 오답은 벌점이 없습니다.</p>`, { characters: view.characters });
  const skip = !answered
    ? `<button class="text-button" data-action="quiz-skip">이번엔 건너뛰기</button>`
    : '';
  const next = answered
    ? `<button class="primary jumbo" data-action="quiz-next">${view.progress && view.progress.index + 1 < view.progress.total ? '다음 문제' : view.optional?'정산으로 돌아가기':'계속'}</button>`
    : '';
  const available = view.pointsAvailable ?? 2;
  return `<header class="quiz-heading"><p class="eyebrow">${view.optional?'선택 학습 · 정산 후 한 문제':quizEyebrow(view.progress)}</p>
    <p class="quiz-card"><span>${card.category}</span> ${card.title}</p>
    <p class="quiz-reward">${answered ? '선택을 돌아보며 한 가지 더 배워요.' : available > 0 ? `정답이면 제도·운용 이해 +${available}점 · 오답 벌점 없음` : '이번 문제는 추가 점수 없이 복습할 수 있어요 · 오답 벌점 없음'}</p></header>
    <div class="quiz-split"><section class="quiz-choice-panel" aria-labelledby="quiz-question">
      <div class="quiz-prompt"><span class="quiz-q" aria-hidden="true">Q</span><h2 class="quiz-question" id="quiz-question">${card.quiz.q}</h2></div>
      <div class="quiz-options" aria-label="답안 선택">${options}</div>
    </section><section class="quiz-explanation" aria-labelledby="quiz-explanation-title">
      <h3 id="quiz-explanation-title">선택을 확인해요</h3>
      <div id="quiz-answer" class="quiz-answer" tabindex="-1" role="status" aria-atomic="true">${verdict}</div>
      ${answered ? `<details class="quiz-source"><summary>학습 목표·근거</summary><p>${card.learningObjective ?? card.key}</p><p><b>실제 제도·일반 원리</b> ${card.actualPrinciple ?? card.key}</p><p><b>이 판의 가정</b> ${card.gameAssumption ?? ""}</p><a href="${card.source_url}" target="_blank" rel="noreferrer">사실 근거</a> · 검수 ${card.reviewed_at}</details>` : ''}
      <div class="button-stack">${next}${skip}</div>
    </section></div>`;
}

/** 결과 「배운 것」: 푼 퀴즈 목록과 정답 수 */
export function renderLearnedBlock(state: GameState): string {
  const total = state.quizLog.length;
  const correct = state.quizLog.filter((record) => record.correct).length;
  if (total === 0) {
    return `<article class="learned-card"><div class="card-label">배운 것</div><p class="learned-empty">이번 판에는 퀴즈를 풀지 않았습니다. ${state.learningFlow?'정산 화면에서 관련 문제를 선택해 풀 수 있습니다.':'제도 안내·시장 뉴스 칸에 서면 배운 카드에서 한 문제가 나옵니다.'}</p></article>`;
  }
  const rows = state.quizLog.map((record) => {
    const card = learningCardsFor(state).find((item) => item.id === record.cardId);
    return `<li class="${record.correct ? 'ok' : 'miss'}"><span>${record.correct ? '✓' : '✕'}</span><b>${card?.title ?? record.cardId}</b><small>${card?.key ?? ''}</small></li>`;
  }).join('');
  return `<article class="learned-card"><div class="card-label">배운 것 · 퀴즈 ${correct}/${total} 정답</div><ul class="learned-list">${rows}</ul></article>`;
}
