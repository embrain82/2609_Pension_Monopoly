import { describe, expect, it } from 'vitest';
import { balanceConfig, boardTiles, learningCards, validateContent } from '../src/data/content';
import { autoplay, createGame, performAction, startTurn, submitQuiz } from '../src/engine/game-engine';
import {
  FINAL_QUIZ_MAX, QUIZ_CORRECT_POINTS, answerQuiz, finalQuizCards, marketTileQuizzes, pickQuizCard, queueQuiz, quizCandidates, quizCorrectCount
} from '../src/engine/quiz-engine';
import { KNOWLEDGE_CAPS, calculateScore, knowledgeBreakdown, knowledgeScoreOf } from '../src/engine/scoring-engine';
import type { GameState } from '../src/types';

const base = () => createGame('quiz-1', 'balanced', 500_000, { ghost: false });
const unlockedWith = (state: GameState, ...ids: string[]): GameState => ({ ...state, unlockedCards: [...new Set([...state.unlockedCards, ...ids])] });
const card = (id: string) => learningCards.find((item) => item.id === id)!;

describe('퀴즈 데이터(3.4)', () => {
  it('카드 25장마다 3지선다 1문항이 있고 정답 위치가 한쪽으로 몰리지 않는다', () => {
    expect(learningCards).toHaveLength(25);
    expect(() => validateContent()).not.toThrow();
    const counts = [0, 0, 0];
    for (const item of learningCards) {
      expect(item.quiz.options).toHaveLength(3);
      expect(new Set(item.quiz.options).size).toBe(3);
      expect(item.quiz.q.length).toBeGreaterThan(5);
      expect(item.quiz.why.length).toBeGreaterThan(10);
      counts[item.quiz.answer] += 1;
    }
    expect(Math.min(...counts)).toBeGreaterThanOrEqual(5);
  });

  it('질문·선택지에 보드 규칙 단어가 없고, 교체 5장은 연금·상품·시장 상식을 묻는다', () => {
    const banned = /턴|속보|게임|주사위|칸|마무리 퀴즈/;
    for (const item of learningCards) {
      expect(banned.test(item.quiz.q), item.id).toBe(false);
      for (const option of item.quiz.options) expect(banned.test(option), `${item.id}:${option}`).toBe(false);
    }
    const etf = card('etf-order');
    expect(etf.title).toContain('이미 난');
    expect(etf.title).not.toContain('다음 턴');
    expect(etf.quiz.q).toContain('오늘 뉴스');
    expect(etf.quiz.answer).toBe(0);
    const fund = card('fund-order');
    expect(fund.title).toContain('기준가');
    expect(fund.quiz.options[1]).toContain('기준가');
    expect(fund.quiz.answer).toBe(1);
    expect(fund.quiz.options[1]).not.toContain('다음 턴');
    const pension = card('pension-assumption');
    expect(pension.quiz.q).not.toContain('게임이');
    expect(pension.quiz.answer).toBe(2);
    const tax = card('pension-tax');
    expect(tax.quiz.q).not.toContain('교육용 세율');
    expect(tax.quiz.answer).toBe(0);
    const signal = card('signal-vs-forecast');
    expect(signal.quiz.q).not.toContain('충격 전 신호');
    expect(signal.quiz.answer).toBe(2);
  });
});

describe('출제(pickQuizCard·queueQuiz·finalQuizCards)', () => {
  it('해금·미출제 카드에서 시드 결정적으로 1장, 후보가 없으면 null', () => {
    const state = unlockedWith(base(), 'rate-bond', 'duration', 'rebalance');
    const first = pickQuizCard(state, 3);
    expect(first).not.toBeNull();
    expect(pickQuizCard(state, 3)).toBe(first);
    expect(state.unlockedCards).toContain(first);
    const empty: GameState = { ...state, unlockedCards: [] };
    expect(pickQuizCard(empty, 3)).toBeNull();
    const allDone: GameState = { ...state, quizLog: state.unlockedCards.map((cardId) => ({ cardId, correct: true, turn: 1 })) };
    expect(quizCandidates(allDone)).toHaveLength(0);
    expect(pickQuizCard(allDone, 3)).toBeNull();
  });

  it('queueQuiz는 해금 안 된 카드·이미 푼 카드·null을 무시한다', () => {
    const state = unlockedWith(base(), 'rate-bond');
    expect(queueQuiz(state, 'rate-bond').pendingQuizCardId).toBe('rate-bond');
    expect(queueQuiz(state, 'tdf-exception').pendingQuizCardId).toBeNull();
    expect(queueQuiz(state, null).pendingQuizCardId).toBeNull();
    const done = answerQuiz(state, 'rate-bond', card('rate-bond').quiz.answer).state;
    expect(queueQuiz(done, 'rate-bond').pendingQuizCardId).toBeNull();
  });

  it('마무리 퀴즈는 최대 3장, 결정적이며 이미 푼 카드는 빼고 고른다', () => {
    const state = unlockedWith(base(), 'rate-bond', 'duration', 'rebalance', 'profile', 'liquidity');
    const picked = finalQuizCards(state);
    expect(picked).toHaveLength(FINAL_QUIZ_MAX);
    expect(new Set(picked.map((item) => item.id)).size).toBe(FINAL_QUIZ_MAX);
    expect(finalQuizCards(state).map((item) => item.id)).toEqual(picked.map((item) => item.id));
    const done = answerQuiz(state, picked[0].id, 0).state;
    expect(finalQuizCards(done).map((item) => item.id)).not.toContain(picked[0].id);
    expect(finalQuizCards({ ...state, unlockedCards: ['rate-bond'] })).toHaveLength(1);
  });

  it('시장 뉴스 칸 출제 여부는 시드·턴으로 결정된다', () => {
    const hits = Array.from({ length: 12 }, (_, turn) => marketTileQuizzes('quiz-1', turn + 1));
    expect(hits).toEqual(Array.from({ length: 12 }, (_, turn) => marketTileQuizzes('quiz-1', turn + 1)));
    expect(hits.some(Boolean)).toBe(true);
    expect(hits.some((hit) => !hit)).toBe(true);
  });
});

describe('답 처리(answerQuiz)', () => {
  it('정답은 연속 +1과 지식 +2, 오답은 벌점 없이 연속 0. 카드마다 한 판에 한 번', () => {
    const state = unlockedWith(base(), 'rate-bond', 'duration');
    const before = knowledgeScoreOf(state);
    const right = answerQuiz(state, 'rate-bond', card('rate-bond').quiz.answer);
    expect(right.ok).toBe(true);
    expect(right.correct).toBe(true);
    expect(right.state.quizStreak).toBe(1);
    expect(right.state.understandingPoints).toBe(state.understandingPoints);
    expect(knowledgeScoreOf(right.state)).toBe(before + QUIZ_CORRECT_POINTS);
    expect(right.state.logs.at(-1)?.type).toBe('quiz');
    const wrong = answerQuiz(right.state, 'duration', (card('duration').quiz.answer + 1) % 3);
    expect(wrong.ok).toBe(true);
    expect(wrong.correct).toBe(false);
    expect(wrong.state.quizStreak).toBe(0);
    expect(knowledgeScoreOf(wrong.state)).toBe(before + QUIZ_CORRECT_POINTS);
    expect(wrong.message).toContain(card('duration').quiz.options[card('duration').quiz.answer]);
    expect(quizCorrectCount(wrong.state)).toBe(1);
    expect(wrong.state.quizLog).toHaveLength(2);
    expect(answerQuiz(wrong.state, 'rate-bond', 0).ok).toBe(false);
  });

  it('해금 안 된 카드·없는 카드·범위 밖 선택지는 거절한다', () => {
    const state = unlockedWith(base(), 'rate-bond');
    expect(answerQuiz(state, 'tdf-exception', 0).ok).toBe(false);
    expect(answerQuiz(state, 'nope', 0).ok).toBe(false);
    expect(answerQuiz(state, 'rate-bond', 3).ok).toBe(false);
    expect(answerQuiz(state, 'rate-bond', -1).ok).toBe(false);
    expect(answerQuiz(state, 'rate-bond', 1.5).ok).toBe(false);
  });

  it('출제 대기 카드에 답하면 대기가 비고, 3연속 정답에 축하가 붙는다', () => {
    let state = unlockedWith(base(), 'rate-bond', 'duration', 'rebalance');
    state = queueQuiz(state, 'rate-bond');
    const first = submitQuiz(state, 'rate-bond', card('rate-bond').quiz.answer);
    expect(first.correct).toBe(true);
    expect(first.state.pendingQuizCardId).toBeNull();
    const second = answerQuiz(first.state, 'duration', card('duration').quiz.answer);
    const third = answerQuiz(second.state, 'rebalance', card('rebalance').quiz.answer);
    expect(third.state.quizStreak).toBe(3);
    expect(third.message).toContain('3연속');
  });
});

describe('지식 점수 재정의', () => {
  it('기본 4 + 퀴즈(최대 8) + 이해(최대 6) + 리밸런싱(최대 4) − 위반 5, 0~20', () => {
    const state = base();
    expect(knowledgeBreakdown(state)).toMatchObject({ quizCorrect: 0, quiz: 0, understanding: 0, rebalance: 0, penalty: 0, total: KNOWLEDGE_CAPS.base });
    const maxed: GameState = {
      ...state,
      quizLog: Array.from({ length: 6 }, (_, index) => ({ cardId: `c${index}`, correct: true, turn: 1 })),
      understandingPoints: 30,
      rebalanceCount: 5
    };
    expect(knowledgeBreakdown(maxed)).toMatchObject({ quiz: 8, understanding: 6, rebalance: 4, total: 20 });
    // 항목 합은 22지만 20에서 자른다. 위반 1회면 22 − 5 = 17, 5회면 0
    expect(knowledgeScoreOf({ ...maxed, ruleBreaches: 1 })).toBe(17);
    expect(knowledgeScoreOf({ ...maxed, ruleBreaches: 5 })).toBe(0);
    expect(calculateScore(maxed).knowledgeScore).toBe(20);
  });
});

describe('턴 흐름 연결', () => {
  const landOn = (state: GameState, index: number): GameState => {
    const steps = ((index - state.position) % balanceConfig.boardSize + balanceConfig.boardSize) % balanceConfig.boardSize || balanceConfig.boardSize;
    return startTurn(state, steps).state;
  };

  it('제도 안내 칸에 서면 방금 연 제도 카드가 출제 대기에 오른다', () => {
    const state = landOn(base(), 7);
    expect(boardTiles[state.position].kind).toBe('policy');
    const brief = state.tileEffects.find((effect) => effect.kind === 'policy-brief');
    expect(brief?.cardId).toBeTruthy();
    expect(state.pendingQuizCardId).toBe(brief!.cardId);
    expect(state.unlockedCards).toContain(state.pendingQuizCardId);
  });

  it('칸 효과를 꺼도 제도 안내 칸은 해금 카드 중 1장을 출제한다', () => {
    const state = landOn(createGame('quiz-off', 'balanced', 500_000, { ghost: false, tileEffects: false }), 7);
    expect(state.tileEffects).toHaveLength(0);
    expect(state.pendingQuizCardId).not.toBeNull();
    expect(state.unlockedCards).toContain(state.pendingQuizCardId);
  });

  it('시장 뉴스 칸은 시드·턴이 정한 턴에만 출제하고, 다음 턴 시작에 대기가 비워진다', () => {
    const seeds = ['quiz-m1', 'quiz-m2', 'quiz-m3', 'quiz-m4', 'quiz-m5', 'quiz-m6'];
    let queued = 0;
    let skipped = 0;
    for (const seed of seeds) {
      const state = landOn(createGame(seed, 'balanced', 500_000, { ghost: false }), 2);
      expect(boardTiles[state.position].kind).toBe('market');
      if (marketTileQuizzes(seed, 1)) {
        expect(state.pendingQuizCardId).not.toBeNull();
        queued += 1;
        let next = state;
        if (next.currentEventId) next = { ...next, currentEventId: null, awaitingAction: true };
        next = performAction(next, { kind: 'hold' }).state;
        expect(startTurn(next, 1).state.pendingQuizCardId).toBeNull();
      } else {
        expect(state.pendingQuizCardId).toBeNull();
        skipped += 1;
      }
    }
    expect(queued + skipped).toBe(seeds.length);
  });

  it('상품 거리 등 다른 칸은 출제하지 않는다', () => {
    const state = landOn(base(), 1);
    expect(boardTiles[state.position].kind).toBe('product');
    expect(state.pendingQuizCardId).toBeNull();
  });
});

describe('밸런스 게이트 — 퀴즈는 지식 점수만 움직인다', () => {
  it('quiz none·wrong은 지식 ≥ 4, correct는 ≤ 20이며 none보다 높고, 별·월 연금은 세 모드가 같다', () => {
    let correctHigher = 0;
    for (let index = 0; index < 40; index += 1) {
      const seed = `quiz-gate-${index}`;
      const none = autoplay(seed, 'balanced', 'balanced', { quiz: 'none' });
      const wrong = autoplay(seed, 'balanced', 'balanced', { quiz: 'wrong' });
      const correct = autoplay(seed, 'balanced', 'balanced', { quiz: 'correct' });
      const [sn, sw, sc] = [none, wrong, correct].map(calculateScore);
      expect(sn.knowledgeScore).toBeGreaterThanOrEqual(4);
      expect(sw.knowledgeScore).toBeGreaterThanOrEqual(4);
      expect(sc.knowledgeScore).toBeLessThanOrEqual(20);
      expect(sw.knowledgeScore).toBe(sn.knowledgeScore);
      expect(none.quizLog).toHaveLength(0);
      expect(wrong.quizLog.length).toBe(correct.quizLog.length);
      expect(correct.quizLog.length).toBeGreaterThan(0);
      if (sc.knowledgeScore > sn.knowledgeScore) correctHigher += 1;
      expect(sc.stars).toBe(sn.stars);
      expect(sc.monthlyPension).toBe(sn.monthlyPension);
      expect(correct.cash).toBe(none.cash);
    }
    expect(correctHigher).toBeGreaterThanOrEqual(36);
  });

  it('같은 시드는 같은 출제·같은 기록', () => {
    const a = autoplay('quiz-det', 'steward', 'balanced', { quiz: 'correct' });
    const b = autoplay('quiz-det', 'steward', 'balanced', { quiz: 'correct' });
    expect(a.quizLog).toEqual(b.quizLog);
    expect(a.quizLog.length).toBeLessThanOrEqual(learningCards.length);
    expect(new Set(a.quizLog.map((record) => record.cardId)).size).toBe(a.quizLog.length);
  });
});
