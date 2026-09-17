import { expect, it } from 'vitest';
import { generalLearningCards, learningCards, learningCardsFor, validateContent } from '../src/data/content';
import { createGame, submitQuiz } from '../src/engine/game-engine';
import { quizCandidates, finalQuizCards } from '../src/engine/quiz-engine';
import { checkpointVersion, parseCheckpoint } from '../src/ui/play-checkpoint';
import { knowledgeScoreOf } from '../src/engine/scoring-engine';
import { renderQuizModal } from '../src/ui/quiz-view';
it('25개 주제·보기 3개를 유지하고 정답 위치는 9/8/8로 분산한다',()=>{
 validateContent();expect(generalLearningCards.map(c=>c.id)).toEqual(learningCards.map(c=>c.id));
 expect([0,1,2].map(a=>generalLearningCards.filter(c=>c.quiz.answer===a).length)).toEqual([9,8,8]);
 for(const c of generalLearningCards){expect(c.quiz.options).toHaveLength(3);expect(c.quiz.q).not.toMatch(/주사위|이번 턴|도장/);expect(c.quiz.q).not.toBe(learningCards.find(old=>old.id===c.id)!.quiz.q);expect(c.quiz.why.length).toBeGreaterThan(40);}
});
it('구판의 질문·정답은 새 은행과 별도로 보존하며 새 판에서 한 번만 +2점 채점한다',()=>{
 const old=createGame('quiz-version','balanced',500000,{updatedFinance:true,ghost:false}),fresh=createGame('quiz-version','balanced',500000,{defaultLifecycle:true,ghost:false});
 const a=learningCards.find(c=>c.id==='rate-bond')!,b=generalLearningCards.find(c=>c.id==='rate-bond')!;expect(a.quiz.answer).not.toBe(b.quiz.answer);
 expect(learningCardsFor(old)).toBe(learningCards);expect(learningCardsFor(fresh)).toBe(generalLearningCards);
 for(const [g,c] of [[old,a],[fresh,b]] as const){
  const result=submitQuiz(g,c.id,c.quiz.answer);expect(result.correct).toBe(true);expect(knowledgeScoreOf(result.state)-knowledgeScoreOf(g)).toBe(2);
  expect(submitQuiz(result.state,c.id,c.quiz.answer).ok).toBe(false);expect(result.state.holdings).toEqual(g.holdings);
  const restored=parseCheckpoint(JSON.stringify({version:checkpointVersion(g),game:result.state,modal:'quiz',lastSummary:null,quizCardId:c.id,quizPicked:c.quiz.answer,finalQuizQueue:[],finalQuizTotal:0,finishing:false,defaultOptionAsk:false}))!;
  expect(restored).not.toBeNull();expect(learningCardsFor(restored.game).find(x=>x.id===c.id)!.quiz).toEqual(c.quiz);
 }
 expect(quizCandidates(old).map(c=>c.id)).toEqual(quizCandidates(fresh).map(c=>c.id));expect(finalQuizCards(old).map(c=>c.id)).toEqual(finalQuizCards(fresh).map(c=>c.id));
 const html=renderQuizModal(b,{picked:b.quiz.answer,progress:null,characters:false,streak:1});expect(html).toContain(b.quiz.why);
});
