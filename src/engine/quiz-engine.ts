import { learningCards } from '../data/content';
import type { GameState, LearningCard, QuizRecord } from '../types';
import { hashSeed, nextRandom } from './random-engine';

/** 정답 1개당 이해 포인트 */
export const QUIZ_CORRECT_POINTS = 2;
/** 연속 정답 축하 기준 */
export const QUIZ_STREAK_CHEER = 3;
/** 결과 직전 마무리 퀴즈 최대 문항 */
export const FINAL_QUIZ_MAX = 3;

export interface QuizAnswer {
  ok: boolean;
  correct: boolean;
  card: LearningCard | null;
  message: string;
  state: GameState;
}

function answered(state: GameState, cardId: string): boolean {
  return state.quizLog.some((record) => record.cardId === cardId);
}

/** 해금됐고 아직 안 푼 카드. 해금 순서 그대로 */
export function quizCandidates(state: GameState): LearningCard[] {
  return state.unlockedCards
    .filter((cardId) => !answered(state, cardId))
    .map((cardId) => learningCards.find((card) => card.id === cardId))
    .filter((card): card is LearningCard => Boolean(card));
}

/** 시드 결정적으로 후보 1장. 없으면 null */
export function pickQuizCard(state: GameState, salt: string | number): string | null {
  const candidates = quizCandidates(state);
  if (candidates.length === 0) return null;
  const roll = nextRandom(hashSeed(`${state.seed}:quiz:${salt}`));
  return candidates[Math.floor(roll.value * candidates.length)].id;
}

/** 시장 뉴스 칸 출제 여부. 같은 시드·턴이면 늘 같다 */
export function marketTileQuizzes(seed: string, turn: number): boolean {
  return hashSeed(`${seed}:quiz:${turn}`) % 2 === 0;
}

/** 출제 대기에 올린다. 해금 안 됐거나 이미 푼 카드면 그대로 */
export function queueQuiz(state: GameState, cardId: string | null): GameState {
  if (!cardId || !state.unlockedCards.includes(cardId) || answered(state, cardId)) return state;
  return { ...state, pendingQuizCardId: cardId };
}

/** 결과 직전 마무리 퀴즈 후보(최대 3장). 해금·미출제 카드를 시드 결정적으로 고른다 */
export function finalQuizCards(state: GameState, max = FINAL_QUIZ_MAX): LearningCard[] {
  const candidates = quizCandidates(state);
  const picked: LearningCard[] = [];
  let rng = hashSeed(`${state.seed}:quiz:final`);
  while (picked.length < max && candidates.length > 0) {
    const roll = nextRandom(rng);
    rng = roll.state;
    picked.push(candidates.splice(Math.floor(roll.value * candidates.length), 1)[0]);
  }
  return picked;
}

/**
 * 답을 낸다. 정답이면 연속 +1, 오답은 벌점 없이 연속 0. 카드마다 한 판에 한 번. 출제 대기 카드였다면
 * 대기를 비운다. 점수는 `quizLog`의 정답 수로 지식 항목에 들어가며(정답 ×2, 최대 8) 이해 포인트와는 따로 센다.
 */
export function answerQuiz(state: GameState, cardId: string, option: number): QuizAnswer {
  const card = learningCards.find((item) => item.id === cardId) ?? null;
  if (!card) return { ok: false, correct: false, card: null, message: '없는 카드입니다.', state };
  if (!state.unlockedCards.includes(cardId)) return { ok: false, correct: false, card, message: '아직 열리지 않은 카드입니다.', state };
  if (answered(state, cardId)) return { ok: false, correct: false, card, message: '이미 푼 문제입니다.', state };
  if (!Number.isInteger(option) || option < 0 || option >= card.quiz.options.length) {
    return { ok: false, correct: false, card, message: '선택지를 골라 주세요.', state };
  }
  const correct = option === card.quiz.answer;
  const streak = correct ? state.quizStreak + 1 : 0;
  const record: QuizRecord = { cardId, correct, turn: state.turn };
  const message = correct
    ? `정답! 제도·운용 이해 +${QUIZ_CORRECT_POINTS}${streak >= QUIZ_STREAK_CHEER ? ` · ${streak}연속 정답` : ''}`
    : `아쉬워요. 정답은 「${card.quiz.options[card.quiz.answer]}」`;
  const next: GameState = {
    ...state,
    quizLog: [...state.quizLog, record],
    quizStreak: streak,
    pendingQuizCardId: state.pendingQuizCardId === cardId ? null : state.pendingQuizCardId,
    logs: [...state.logs, { turn: state.turn, type: 'quiz', message: `퀴즈 「${card.title}」 ${correct ? '정답' : '오답'}` }]
  };
  return { ok: true, correct, card, message, state: next };
}

export function quizCorrectCount(state: GameState): number {
  return state.quizLog.filter((record) => record.correct).length;
}

export const ACTION_LESSONS: Record<string,string> = {contribute:'contribution-limit',buy:'fund-order',sell:'sale-vs-withdrawal',switch:'fund-order',rebalance:'rebalance',hold:'inflation-value'};
/** 성공한 행동만 연결하며 팝업은 정산에서 자율 선택한다. */
export function actionLesson(state: GameState, kind: string): GameState {
  if(!state.campaign) return state;
  const card=ACTION_LESSONS[kind];
  if(!card || !learningCards.some(c=>c.id===card)) return state;
  const next={...state,unlockedCards:state.unlockedCards.includes(card)?state.unlockedCards:[...state.unlockedCards,card]};
  return queueQuiz(next,card);
}
