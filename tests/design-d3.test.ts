// @vitest-environment happy-dom
import { beforeEach, expect, it } from 'vitest';
import { createGame, startTurn, performAction, autoplay, choosePayout, resolveLifeEvent, submitQuiz } from '../src/engine/game-engine';
import { queueQuiz } from '../src/engine/quiz-engine';
import { accountPayout } from '../src/engine/account-engine';
import { portfolioValue } from '../src/engine/portfolio-engine';
import { calculateScore, knowledgeScoreOf } from '../src/engine/scoring-engine';
import { learningCards } from '../src/data/content';
import { renderSettlementModal } from '../src/ui/settlement';
import { renderPayoutModal } from '../src/ui/payout-view';
import { renderResultHero } from '../src/ui/result-summary';
import { PensionRoadApp } from '../src/ui/app';
import { CHECKPOINT_KEY, parseCheckpoint, type PlayCheckpoint } from '../src/ui/play-checkpoint';
import { defaultSave, STORAGE_KEY } from '../src/ui/ui-state';
import { formatWon } from '../src/ui/format';
import type { GameState } from '../src/types';

let root: HTMLElement;
const click=(s:string)=>{const b=root.querySelector<HTMLElement>(s);expect(b,s).not.toBeNull();b!.click();};
const saved=()=>parseCheckpoint(localStorage.getItem(CHECKPOINT_KEY))!;
const settings=()=>JSON.parse(localStorage.getItem(STORAGE_KEY)!);
const gameOf=(app:PensionRoadApp)=>(app as unknown as {game:GameState}).game;
function mount(data:PlayCheckpoint) {
 localStorage.setItem(CHECKPOINT_KEY,JSON.stringify(data));expect(saved()).not.toBeNull();
 const app=new PensionRoadApp(root);click('[data-action="resume-game"]');return app;
}
function checkpoint(game:GameState, modal='payout'):PlayCheckpoint {
 return {version:game.defaultTrading?'c3':'c2',game,modal,lastSummary:null,quizCardId:null,quizPicked:null,finalQuizQueue:[],finalQuizTotal:0,finishing:modal==='payout',defaultOptionAsk:false};
}
function settlement() {
 let g=startTurn(createGame('d3-learning','growth',500000,{defaultTrading:true,settlementLearning:true,scenario:'classic',contributionPacing:true}),5).state;
 if(g.currentEventId)g=resolveLifeEvent(g,'cash').state;
 const result=performAction(g,{kind:'contribute',amount:1_000_000});
 return result.summary ? result : performAction(result.state,{kind:'hold'});
}
function quizCheckpoint() {
 const result=settlement(),id='rate-bond';
 const g=queueQuiz({...result.state,unlockedCards:[...new Set([...result.state.unlockedCards,id])]},id);
 return {...checkpoint(g,'quiz'),lastSummary:result.summary!,quizCardId:id};
}
beforeEach(()=>{
 localStorage.clear();document.body.innerHTML='<div id="app"></div>';root=document.querySelector('#app')!;
 localStorage.setItem(STORAGE_KEY,JSON.stringify({...defaultSave,disclaimerAccepted:true,howtoSeen:true,settings:{...defaultSave.settings,reducedMotion:true,sound:false}}));
});

it.each([true,false])('분할 퀴즈 정오답(%s)은 한 번만 채점하고 해설·근거를 답한 뒤 공개한다',correct=>{
 const cp=quizCheckpoint(),card=learningCards.find(c=>c.id===cp.quizCardId)!,app=mount(cp);
 expect(root.querySelector('.quiz-split')).not.toBeNull();expect(root.querySelector('.quiz-source')).toBeNull();
 expect(root.querySelector('.quiz-answer')?.textContent).not.toContain(card.quiz.why);
 expect(root.querySelector('.quiz-choice-panel')!.compareDocumentPosition(root.querySelector('.quiz-explanation')!)&Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
 const option=correct?card.quiz.answer:(card.quiz.answer+1)%3;
 click(`[data-action="quiz-pick"][data-option="${option}"]`);
 const expected=submitQuiz(cp.game,card.id,option).state;
 expect(gameOf(app)).toEqual(expected);expect(root.querySelector('.quiz-answer')?.textContent).toContain(card.quiz.why);
 expect(root.querySelector('.quiz-source a')?.getAttribute('href')).toBe(card.source_url);
 expect(document.activeElement?.id).toBe('quiz-answer');
 expect(root.querySelectorAll('.quiz-option:disabled')).toHaveLength(3);
 root.querySelector('[data-action="quiz-pick"]')!.dispatchEvent(new MouseEvent('click',{bubbles:true}));
 expect(gameOf(app)).toEqual(expected);
 const stored=saved();document.body.innerHTML='<div id="app"></div>';root=document.querySelector('#app')!;
 const resumed=mount(stored);expect(gameOf(resumed)).toEqual(expected);expect(root.querySelector('.quiz-answer')?.textContent).toContain(card.quiz.why);
 click('[data-action="quiz-next"]');expect(root.querySelector('.road-settle')).not.toBeNull();expect(gameOf(resumed)).toEqual(expected);
});

it('퀴즈 점수 상한에서는 답하기 전·후 모두 추가 점수를 약속하지 않는다',()=>{
 const cp=quizCheckpoint();cp.game.quizLog=learningCards.filter(c=>c.id!==cp.quizCardId).slice(0,10).map(c=>({cardId:c.id,correct:true,turn:1}));
 const card=learningCards.find(c=>c.id===cp.quizCardId)!,app=mount(cp),points=knowledgeScoreOf(cp.game);
 expect(root.querySelector('.quiz-reward')?.textContent).toContain('추가 점수 없이');
 click(`[data-action="quiz-pick"][data-option="${card.quiz.answer}"]`);
 expect(knowledgeScoreOf(gameOf(app))).toBe(points);expect(root.querySelector('.quiz-answer')?.textContent).toContain('추가 점수 없이 복습 완료');
});

it('퀴즈 스킵 안내 취소는 상태를 유지하고 확인한 스킵은 벌점 없이 정산으로 돌아간다',()=>{
 const cp=quizCheckpoint(),app=mount(cp);click('[data-action="quiz-skip"]');
 expect(root.querySelector('.modal-quiz-confirm')).not.toBeNull();expect(gameOf(app)).toEqual(cp.game);
 click('[data-action="close-modal"]');expect(root.querySelector('.road-quiz')).not.toBeNull();expect(gameOf(app)).toEqual(cp.game);
 click('[data-action="quiz-skip"]');click('[data-action="notice-continue"]');
 expect(root.querySelector('.road-settle')).not.toBeNull();expect(gameOf(app).quizLog).toEqual(cp.game.quizLog);
 expect(knowledgeScoreOf(gameOf(app))).toBe(knowledgeScoreOf(cp.game));expect(portfolioValue(gameOf(app))).toBe(portfolioValue(cp.game));
});

it('정산은 요약→금리·실제 보유분→행동 순서로 읽고 외부 입출금과 손익을 보존한다',()=>{
 const result=settlement(),summary=result.summary!,before=structuredClone(summary);
 root.innerHTML=renderSettlementModal(summary,{characters:false,market:result.state.lastMarket,learningHtml:'<aside class="optional-learning">선택 학습</aside>'});
 const overview=root.querySelector('.settle-overview')!,market=root.querySelector('.settle-market-panel')!,action=root.querySelector('.settle-action-panel')!;
 expect(overview.querySelector('.settle-bars')!.compareDocumentPosition(market)&Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
 expect(market.compareDocumentPosition(action)&Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
 expect(market.querySelector('.settle-rate-strip')).not.toBeNull();expect(market.querySelector('.actual-market-impact')).not.toBeNull();
 expect(action.querySelector('.settle-mine')?.textContent).toContain(summary.actionLines[0]);expect(root.querySelector('.settle-more .settle-mine')).toBeNull();
 expect(action.querySelectorAll('.change-row')).toHaveLength(3);
 expect(summary.marketDelta+summary.capitalFlow!+summary.tradingDelta!).toBeCloseTo(summary.irpAfter-summary.irpOpen,5);
 expect(action.textContent).toContain('납입은 운용 수익이 아닙니다');expect(summary).toEqual(before);
});

it('구 정산은 없는 손익을 역산하지 않으며 마지막 정산은 수령으로 안내한다',()=>{
 const summary=settlement().summary!;
 root.innerHTML=renderSettlementModal({...summary,marketEffects:undefined,capitalFlow:undefined,tradingDelta:undefined},{characters:false,final:true,optionalLearning:true});
 expect(root.querySelector('.settle-rate-strip')).toBeNull();expect(root.textContent).toContain('이전 저장에는');
 expect(root.querySelectorAll('.change-row')).toHaveLength(2);expect(root.textContent).toContain('시장 이후 변화 (입출금·거래 포함)');
 expect(root.querySelector('[data-action="dismiss-settle"]')?.textContent).toBe('수령 방식 비교로');expect(root.querySelector('.settle-more')?.textContent).not.toContain('다음 턴 신호');
});

it.each(['pension','purchasing','cushion'] as const)('%s 수령 비교는 실제 재원별 금액·미션을 사용하고 상태는 바꾸지 않는다',mission=>{
 const g=autoplay('d3-payout','passive','balanced',{scenario:'classic',mission,defaultTrading:true}),before=structuredClone(g);
 for(const selected of ['annuity20','lumpSum'] as const){
  const plan=accountPayout(portfolioValue(g),selected,g.accountBasis);
  root.innerHTML=renderPayoutModal(g,{characters:false,selected});
  expect(root.querySelectorAll('.payout-card[aria-pressed="true"]')).toHaveLength(1);
  expect(root.querySelector('.payout-selection')?.textContent).toContain(formatWon(plan.monthlyBasis));
  expect(root.querySelector(`[data-choice="${selected}"]`)?.textContent).toContain(formatWon(selected==='lumpSum'?plan.net:plan.monthlyNet));
  expect(root.textContent).toContain('실제');
  expect(g).toEqual(before);
 }
});

it('수령 비교·취소는 미확정이며 명시적 확정과 재비교도 완주 횟수를 중복 집계하지 않는다',()=>{
 const g=autoplay('d3-confirm','passive','balanced',{scenario:'classic',defaultTrading:true}),app=mount(checkpoint(g));
 expect(root.querySelector<HTMLButtonElement>('[data-action="confirm-payout"]')!.disabled).toBe(true);
 for(const choice of ['lumpSum','annuity20','lumpSum']){click(`[data-action="choose-payout"][data-choice="${choice}"]`);expect(gameOf(app)).toEqual(g);expect(settings().playCount).toBe(0);}
 click('[data-action="confirm-payout"]');const expected=choosePayout(g,'lumpSum').state;
 expect(gameOf(app)).toEqual(expected);expect(settings().playCount).toBe(1);expect(localStorage.getItem(CHECKPOINT_KEY)).toBeNull();
 expect(root.querySelector('.road-result')).not.toBeNull();expect(root.querySelector('.result-payout [data-action="open-payout"]')).not.toBeNull();
 root.insertAdjacentHTML('beforeend','<button data-action="confirm-payout" id="stale-confirm">stale</button>');click('#stale-confirm');expect(gameOf(app)).toEqual(expected);expect(settings().playCount).toBe(1);
 click('[data-action="open-payout"]');click('[data-choice="annuity20"]');click('[data-action="close-modal"]');
 expect(gameOf(app)).toEqual(expected);expect(settings().playCount).toBe(1);
 click('[data-action="open-payout"]');expect(root.querySelector('.payout-card[aria-pressed="true"]')?.getAttribute('data-choice')).toBe('lumpSum');
 click('[data-choice="annuity20"]');click('[data-action="confirm-payout"]');expect(gameOf(app)).toEqual(choosePayout(expected,'annuity20').state);expect(settings().playCount).toBe(1);
});

it('수령 임시 선택 후 새로고침은 미확정 상태와 자금을 보존한다',()=>{
 const g=autoplay('d3-resume','passive','balanced',{scenario:'classic',defaultTrading:true});mount(checkpoint(g));click('[data-choice="lumpSum"]');
 const stored=saved();expect(stored.game).toEqual(g);
 document.body.innerHTML='<div id="app"></div>';root=document.querySelector('#app')!;
 const app=mount(stored);expect(gameOf(app)).toEqual(g);expect(root.querySelectorAll('.payout-card[aria-pressed="true"]')).toHaveLength(0);expect(settings().playCount).toBe(0);
});

it('완주 그림은 성과를 과장하지 않고 캐릭터 숨김·이미지 실패에도 결과와 재비교를 제공한다',()=>{
 const g=autoplay('d3-unmet','passive','balanced',{scenario:'classic',defaultTrading:true});g.goalMonthly=2_000_000;g.campaign!.startingGoal=2_000_000;
 const score=calculateScore(g);expect(score.goalRate).toBeLessThan(1);
 expect(renderResultHero(g,true)).toContain('미달');expect(renderResultHero(g,false)).not.toContain('data-brand-art');
 const app=mount(checkpoint(g));click('[data-choice="annuity20"]');click('[data-action="confirm-payout"]');
 const art=root.querySelector<HTMLImageElement>('[data-brand-art="journey"]')!;art.dispatchEvent(new Event('error'));expect(art.hidden).toBe(true);
 click('[data-action="open-payout"]');expect(root.querySelector('[data-brand-art="journey"]')).toBeNull();expect(root.querySelector('[data-action="confirm-payout"]')).not.toBeNull();expect(gameOf(app).status).toBe('finished');
});
