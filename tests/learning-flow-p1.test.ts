// @vitest-environment happy-dom
import {beforeEach,it,expect} from 'vitest';
import {createGame,startTurn,performAction} from '../src/engine/game-engine';
import {queueQuiz,answerQuiz,optionalQuizCards} from '../src/engine/quiz-engine';
import {PensionRoadApp} from '../src/ui/app';
import {CHECKPOINT_KEY,parseCheckpoint} from '../src/ui/play-checkpoint';
import {STORAGE_KEY,defaultSave} from '../src/ui/ui-state';
import {retrySuggestion} from '../src/ui/retry-view';
import {autoplay} from '../src/engine/game-engine';
import {achievementDef,evaluateGame} from '../src/engine/achievements';
import {learningCards} from '../src/data/content';
import type {GameState} from '../src/types';
let root:HTMLElement;
const saved=()=>parseCheckpoint(localStorage.getItem(CHECKPOINT_KEY))!;
const click=(action:string)=>{const b=root.querySelector<HTMLButtonElement>(`[data-action="${action}"]`);expect(b,action).not.toBeNull();b!.click();};
function mount(g:GameState,modal='action',summary:unknown=null){localStorage.setItem(CHECKPOINT_KEY,JSON.stringify({version:'c3',game:g,modal,lastSummary:summary,quizCardId:null,quizPicked:null,finalQuizQueue:[],finalQuizTotal:0,finishing:false,defaultOptionAsk:false}));new PensionRoadApp(root);click('resume-game');}
beforeEach(()=>{localStorage.clear();document.body.innerHTML='<div id="app"></div>';root=document.querySelector('#app')!;localStorage.setItem(STORAGE_KEY,JSON.stringify({...defaultSave,disclaimerAccepted:true,howtoSeen:true,settings:{...defaultSave.settings,reducedMotion:true}}));});
it('시장과 두 운용 행동의 퀴즈를 덮어쓰지 않고 정산에서 선택한다',()=>{
 let g:GameState={...startTurn(createGame('optional-p1','balanced',500000,{ghost:false,defaultTrading:true,scenario:'classic',settlementLearning:true}),5).state,currentEventId:null};
 g=queueQuiz({...g,unlockedCards:[...g.unlockedCards,'risk-limit']},'risk-limit');mount(g);expect(root.querySelector('.modal-action')).not.toBeNull();
 click('action-view'); // first card is contribution
 click('do-contribute');click('do-hold');
 expect(saved().game.learningFlow!.queue).toEqual(expect.arrayContaining(['risk-limit','contribution-limit','inflation-value']));expect(root.querySelector('.modal-settle')).not.toBeNull();
 const cash=saved().game.cash,actions=saved().game.actionsLeft;click('action-quiz');const id=saved().quizCardId!;click('quiz-skip');expect(root.querySelector('.modal-settle')).not.toBeNull();
 expect(optionalQuizCards(saved().game)).not.toContain(id);expect(saved().game.cash).toBe(cash);expect(saved().game.actionsLeft).toBe(actions);
});
it('선택 퀴즈 정답·복원은 점수를 중복 추가하지 않고 기존 대기는 그대로 유지한다',()=>{
 const g=queueQuiz(createGame('queue','balanced',500000,{defaultTrading:true,scenario:'classic',settlementLearning:true}),'db-dc-irp');
 const answer=learningCards.find(c=>c.id==='db-dc-irp')!.quiz.answer;
 const once=answerQuiz(g,'db-dc-irp',answer).state;expect(answerQuiz(once,'db-dc-irp',answer).ok).toBe(false);expect(once.quizLog).toHaveLength(1);
 mount(once); // restored answer record remains authoritative
 expect(saved().game.quizLog).toHaveLength(1);
 const legacy=createGame('old','balanced',500000,{defaultTrading:true,scenario:'classic'});const queued=queueQuiz(legacy,'db-dc-irp');expect(queued.learningFlow).toBeUndefined();expect(queued.pendingQuizCardId).toBe('db-dc-irp');
});
it('새 판의 12턴은 선택 학습을 생략하고 정산에서 수령으로 바로 이어진다',()=>{
 const base=autoplay('final-optional','steward','balanced',{defaultTrading:true,scenario:'classic'});
 const active={...base,status:'playing' as const,awaitingAction:true,actionsLeft:1,learningFlow:{version:'settlement-v1' as const,queue:[]},payoutChoice:null,turnActionLines:[]};
 const result=performAction(active,{kind:'hold'});expect(result.state.status).toBe('finished');mount(result.state,'settle',result.summary);
 expect(root.textContent).toContain('주문 최종 정산 완료');expect(root.textContent).toContain('수령 방식 비교로');expect(root.textContent).not.toContain('마무리 퀴즈(최대 3문항)');click('dismiss-settle');expect(root.querySelector('.modal-payout')).not.toBeNull();expect(root.querySelector('.modal-quiz')).toBeNull();
});
it('손상된 자율 학습 데이터는 복원하지 않는다',()=>{
 const g=createGame('invalid','balanced',500000,{defaultTrading:true,scenario:'classic',settlementLearning:true});mount(g);const data=saved();
 for(const flow of [{version:'unknown',queue:[]},{version:'settlement-v1',queue:['bad-card']},{version:'settlement-v1',queue:['db-dc-irp','db-dc-irp']},{version:'settlement-v1',queue:[],dismissed:[null]}])expect(parseCheckpoint(JSON.stringify({...data,game:{...data.game,learningFlow:flow}}))).toBeNull();
});
it('수령 체험 업적은 이름만 바뀌고 조건·기존 식별자는 유지한다',()=>{
 const g=autoplay('annuity','steward','balanced',{scenario:'classic'});
 expect(achievementDef('annuity-choice').title).toBe('연금 수령 체험');expect(evaluateGame({...g,payoutChoice:'annuity20'})).toContain('annuity-choice');expect(evaluateGame({...g,payoutChoice:'lumpSum'})).not.toContain('annuity-choice');
});
it('복기 지점은 실제 저장된 장 끝 중 문제 턴 이전을 선택한다',()=>{
 const g=autoplay('retry-p1','passive','balanced',{scenario:'classic',goalMonthly:700000});const suggestion=retrySuggestion(g);
 expect(suggestion).not.toBeNull();if(suggestion?.turn){expect(suggestion.turn).toBeLessThan(suggestion.moment);expect(g.campaign!.branches.some(b=>b.turn===suggestion.turn)).toBe(true);}
});
