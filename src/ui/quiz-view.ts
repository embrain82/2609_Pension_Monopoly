import type { GameState, LearningCard } from '../types';
import { learningCards } from '../data/content';
import { renderSpeech } from './speech';

export interface QuizViewState {
  /** 고른 선택지. 아직이면 null */
  picked: number | null;
  /** 마무리 퀴즈면 "n / 총" 진행. 턴 중 퀴즈면 null */
  progress: { index: number; total: number } | null;
  characters: boolean;
  /** 연속 정답 수(답한 뒤) */
  streak: number;
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
    ? ''
    : view.picked === card.quiz.answer
      ? renderSpeech('coach', `<p><strong>정답!</strong> 제도·운용 이해 +2${view.streak >= 3 ? ` · ${view.streak}연속` : ''}. ${card.quiz.why}</p>`, { characters: view.characters, tone: 'positive' })
      : renderSpeech('coach', `<p><strong>아쉬워요.</strong> 정답은 「${card.quiz.options[card.quiz.answer]}」. ${card.quiz.why} 오답은 벌점이 없습니다.</p>`, { characters: view.characters });
  const skip = !answered
    ? `<button class="text-button" data-action="quiz-skip">이번엔 건너뛰기</button>`
    : '';
  const next = answered
    ? `<button class="primary jumbo" data-action="quiz-next">${view.progress && view.progress.index + 1 < view.progress.total ? '다음 문제' : '계속'}</button>`
    : '';
  return `<div class="modal-icon quiz">?</div>
    <p class="eyebrow">${quizEyebrow(view.progress)}</p>
    <p class="quiz-card"><span>${card.category}</span> ${card.title}</p>
    <h2 class="quiz-question">${card.quiz.q}</h2>
    <div class="quiz-options">${options}</div>
    ${verdict}
    ${answered ? `<details><summary>학습 목표·근거</summary><p>${card.learningObjective ?? card.key}</p><p>${card.gameAssumption ?? ""}</p><a href="${card.source_url}" target="_blank" rel="noreferrer">사실 근거</a> · 검수 ${card.reviewed_at}</details>` : ""}
    <div class="button-stack">${next}${skip}</div>`;
}

/** 결과 「배운 것」: 푼 퀴즈 목록과 정답 수 */
export function renderLearnedBlock(state: GameState): string {
  const total = state.quizLog.length;
  const correct = state.quizLog.filter((record) => record.correct).length;
  if (total === 0) {
    return `<article class="learned-card"><div class="card-label">배운 것</div><p class="learned-empty">이번 판에는 퀴즈를 풀지 않았습니다. 제도 안내·시장 뉴스 칸에 서면 배운 카드에서 한 문제가 나옵니다.</p></article>`;
  }
  const rows = state.quizLog.map((record) => {
    const card = learningCards.find((item) => item.id === record.cardId);
    return `<li class="${record.correct ? 'ok' : 'miss'}"><span>${record.correct ? '✓' : '✕'}</span><b>${card?.title ?? record.cardId}</b><small>${card?.key ?? ''}</small></li>`;
  }).join('');
  return `<article class="learned-card"><div class="card-label">배운 것 · 퀴즈 ${correct}/${total} 정답</div><ul class="learned-list">${rows}</ul></article>`;
}
