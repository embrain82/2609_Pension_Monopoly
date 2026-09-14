// @vitest-environment happy-dom
import { beforeEach, afterEach, expect, it, vi } from 'vitest';
import { createGame, startTurn, performAction, autoplay } from '../src/engine/game-engine';
import { queueQuiz } from '../src/engine/quiz-engine';
import { learningCards } from '../src/data/content';
import { knowledgeScoreOf } from '../src/engine/scoring-engine';
import { marketRiskNotice, riskRatioLabel, quizOpportunity, normalizeUiProgress, quizOpportunityAcknowledged } from '../src/ui/turn-notices';
import { PensionRoadApp } from '../src/ui/app';
import { CHECKPOINT_KEY, parseCheckpoint, type PlayCheckpoint } from '../src/ui/play-checkpoint';
import { defaultSave, STORAGE_KEY } from '../src/ui/ui-state';
import type { GameState, ProductId, TurnSummary } from '../src/types';

let root: HTMLElement;
const saved = () => parseCheckpoint(localStorage.getItem(CHECKPOINT_KEY))!;
const click = (action: string) => { const b=root.querySelector<HTMLButtonElement>(`[data-action="${action}"]`);expect(b,action).not.toBeNull();b!.click(); };
const view = (name: string) => root.querySelector<HTMLButtonElement>(`[data-view="${name}"]`)!.click();
function mount(game: GameState, modal: string|null='action', summary: TurnSummary|null=null, progress?: PlayCheckpoint['uiProgress']) {
  const data:PlayCheckpoint={version:game.defaultTrading?'c3':'c2',game,modal,lastSummary:summary,quizCardId:null,quizPicked:null,finalQuizQueue:[],finalQuizTotal:0,finishing:false,defaultOptionAsk:false,uiProgress:progress};
  localStorage.setItem(CHECKPOINT_KEY,JSON.stringify(data));expect(parseCheckpoint(JSON.stringify(data))).not.toBeNull();new PensionRoadApp(root);click('resume-game');
}
function remount() { document.body.innerHTML='<div id="app"></div>';root=document.querySelector('#app')!;new PensionRoadApp(root);click('resume-game'); }
function game() { return {...startTurn(createGame('followup-notices','aggressive',500000,{ghost:false,defaultTrading:true,scenario:'classic',settlementLearning:true,contributionPacing:true}),5).state,currentEventId:null}; }
function riskGame(ratio=.706): GameState {
  const holding=(productId:ProductId,amount:number)=>({productId,amount,principal:amount,depositTurnsHeld:0,positions:[{id:`test-${productId}`,source:'manual' as const,amount,principal:amount,depositTurnsHeld:0}]});
  return {...game(),cash:10_000_000,irpCash:1_000_000,pendingOrders:[],holdings:[holding('equityEtf',100_000_000*ratio),holding('shortBond',99_000_000-100_000_000*ratio)],marketLimitExceeded:true};
}
function settled(): {state: GameState; summary: TurnSummary} {
  const active=queueQuiz({...game(),actionsLeft:1},'db-dc-irp');
  const result=performAction(active,{kind:'hold'});
  return {state:result.state,summary:result.summary!};
}
beforeEach(()=>{localStorage.clear();document.body.innerHTML='<div id="app"></div>';root=document.querySelector('#app')!;
  localStorage.setItem(STORAGE_KEY,JSON.stringify({...defaultSave,disclaimerAccepted:true,howtoSeen:true,settings:{...defaultSave.settings,reducedMotion:true}}));});
afterEach(()=>vi.useRealTimers());

it.each([.699,.7,.700009,.700009999])('시장 한도 경계 %s에는 초과 팝업을 만들지 않는다',ratio=>expect(marketRiskNotice(riskGame(ratio)).exceeded).toBe(false));
it('반올림상 70.0%가 되는 실제 초과는 정밀도를 늘린다',()=>{expect(marketRiskNotice(riskGame(.70002)).exceeded).toBe(true);expect(riskRatioLabel(.70002)).toBe('70.002%');});
it('시장 당시 초과했어도 현재 정상화되면 경고를 표시하지 않는다',()=>{mount(riskGame(.692));expect(root.querySelector('.modal-action')).not.toBeNull();expect(root.querySelector('.risk-limit-warning')).toBeNull();});
it('위험 안내 X·Esc는 미확인으로 돌아가고 확인만으로 금융 상태가 변하지 않는다',()=>{
  const g=riskGame();mount(g);expect(root.querySelector('.modal-risk-notice')).not.toBeNull();expect(saved().game).toEqual(g);expect(saved().modal).toBeNull();
  click('close-modal');expect(saved().uiProgress?.riskNoticeAckTurn).toBeUndefined();click('open-action');expect(root.querySelector('.modal-risk-notice')).not.toBeNull();
  document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape'}));click('open-action');click('notice-continue');
  expect(root.querySelector('.modal-action')).not.toBeNull();expect(saved().game).toEqual(g);expect(saved().uiProgress?.riskNoticeAckTurn).toBe(1);
});
it('확인한 턴의 재진입·포트폴리오·새로고침은 안내를 반복하지 않는다',()=>{
  mount(riskGame());click('notice-continue');click('action-portfolio');click('return-action');expect(root.querySelector('.modal-action')).not.toBeNull();
  click('close-modal');click('open-action');expect(root.querySelector('.modal-risk-notice')).toBeNull();remount();expect(root.querySelector('.modal-action')).not.toBeNull();
});
it('첫 납입 뒤 비중이 낮아지면 남은 두 번째 운용과 대시보드를 최신 상태로 표시한다',()=>{
  mount(riskGame());click('notice-continue');view('contribute');click('do-contribute');expect(saved().game.actionsLeft).toBe(1);
  expect(saved().game.marketLimitExceeded).toBe(true);expect(marketRiskNotice(saved().game).exceeded).toBe(false);expect(root.querySelector('.risk-limit-warning')).toBeNull();
});
it('지난 턴 확인은 다음 턴을 면제하지 않으며 손상된 UI 정보가 게임 저장을 지우지 않는다',()=>{
  const g=riskGame();expect(normalizeUiProgress({riskNoticeAckTurn:0,quizSkipAck:{turn:1,cardIds:['wrong']}},g)).toEqual({});
  mount(g,'action',null,{riskNoticeAckTurn:0});expect(root.querySelector('.modal-risk-notice')).not.toBeNull();
  const data={...saved(),uiProgress:{riskNoticeAckTurn:'bad',quizSkipAck:null}};
  expect(parseCheckpoint(JSON.stringify(data))?.game).toEqual(g);expect(parseCheckpoint(JSON.stringify(data))?.uiProgress).toEqual({});
});
it('위험자산 한도 예외인 적격 TDF를 전체 위험자산으로 다시 분류하지 않는다',()=>{
  const g=riskGame(.8);g.holdings[0]={...g.holdings[0],productId:'tdf'};expect(marketRiskNotice(g).exceeded).toBe(false);
});
it('점수 기회는 채점 없이 현재 상한을 계산하고 입력을 바꾸지 않는다',()=>{
  const g=game(),snapshot=JSON.stringify(g);const ids=learningCards.slice(0,10).map(c=>c.id);g.unlockedCards=ids;
  const before=JSON.stringify(g);expect(quizOpportunity(g,ids).maxPoints).toBe(16);expect(quizOpportunity(g,ids).nextPoints).toBe(2);expect(JSON.stringify(g)).toBe(before);expect(snapshot).not.toBe(before);
  const capped={...g,quizLog:ids.slice(0,8).map(cardId=>({cardId,correct:true,turn:1}))};expect(quizOpportunity(capped,ids).maxPoints).toBe(0);
  const legacy={...g,campaign:undefined};expect(quizOpportunity(legacy,ids).maxPoints).toBeLessThanOrEqual(8);
  expect(quizOpportunity({...legacy,understandingPoints:6,rebalanceCount:2,quizLog:ids.slice(0,3).map(cardId=>({cardId,correct:true,turn:1}))},ids).maxPoints).toBe(0);
});
it('같은 턴에 확인한 문제의 부분집합은 반복하지 않고 새 문제는 다시 판정한다',()=>{
  const p={quizSkipAck:{turn:2,cardIds:['db-dc-irp','risk-limit']}};
  expect(quizOpportunityAcknowledged(p,2,['risk-limit'])).toBe(true);expect(quizOpportunityAcknowledged(p,3,['risk-limit'])).toBe(false);expect(quizOpportunityAcknowledged(p,2,['rebalance'])).toBe(false);
});
it('정산 다음 확인창의 X는 스크롤·금융 상태를 복원한다',()=>{
  const s=settled();mount(s.state,'settle',s.summary);root.querySelector<HTMLElement>('.modal-sheet')!.scrollTop=310;click('dismiss-settle');
  expect(root.querySelector('.modal-quiz-confirm')).not.toBeNull();expect(saved().modal).toBe('settle');expect(saved().game).toEqual(s.state);
  click('close-modal');expect(root.querySelector<HTMLElement>('.modal-sheet')!.scrollTop).toBe(310);expect(saved().game).toEqual(s.state);
});
it('정산 건너뛰기 확인은 질문 큐를 지우지 않고 새로고침 후에도 같은 질문을 반복하지 않는다',()=>{
  const s=settled();mount(s.state,'settle',s.summary);click('dismiss-settle');click('notice-continue');const after=saved();
  expect(after.game).toEqual(s.state);expect(after.uiProgress?.quizSkipAck?.cardIds.length).toBeGreaterThan(0);remount();click('roll-dice');
  expect(root.querySelector('.modal-quiz-confirm')).toBeNull();expect(saved().game.turn).toBe(s.state.turn+1);
});
it('정산 X는 보드를 보여주고 다음 주사위에서 미확인 퀴즈를 안내한다',()=>{
  const s=settled();mount(s.state,'settle',s.summary);click('close-modal');expect(root.querySelector('[role=dialog]')).toBeNull();click('roll-dice');expect(root.querySelector('.modal-quiz-confirm')).not.toBeNull();expect(saved().game.turn).toBe(1);
});
it('퀴즈 자체 X→확인 취소는 퀴즈 복귀, 명시적 건너뛰기만 해당 문항을 제외한다',()=>{
  const s=settled();mount(s.state,'settle',s.summary);click('action-quiz');const id=saved().quizCardId!;click('close-modal');expect(root.querySelector('.modal-quiz-confirm')).not.toBeNull();
  click('close-modal');expect(root.querySelector('.modal-quiz')).not.toBeNull();expect(saved().quizCardId).toBe(id);click('quiz-skip');click('notice-continue');
  expect(saved().game.learningFlow?.dismissed).toContain(id);expect(root.querySelector('.modal-settle')).not.toBeNull();
});
it('정답 후 X는 건너뛰기로 기록하지 않으며 복원·닫기로 점수가 중복 반영되지 않는다',()=>{
  const s=settled();mount(s.state,'settle',s.summary);click('action-quiz');const id=saved().quizCardId!,answer=learningCards.find(c=>c.id===id)!.quiz.answer;
  root.querySelector<HTMLButtonElement>(`[data-action="quiz-pick"][data-option="${answer}"]`)!.click();const points=knowledgeScoreOf(saved().game);
  remount();click('close-modal');expect(root.querySelector('.modal-settle')).not.toBeNull();expect(saved().game.learningFlow?.dismissed??[]).not.toContain(id);expect(knowledgeScoreOf(saved().game)).toBe(points);
});
it('미확인 팝업 중 새로고침은 원래 정산으로 복구하고 금융 전환을 실행하지 않는다',()=>{
  const s=settled();mount(s.state,'settle',s.summary);click('dismiss-settle');remount();expect(root.querySelector('.modal-settle')).not.toBeNull();expect(saved().game).toEqual(s.state);click('dismiss-settle');expect(root.querySelector('.modal-quiz-confirm')).not.toBeNull();
});
it('마지막 턴의 선택 퀴즈도 확인한 뒤 수령으로 이동한다',()=>{
  const base=autoplay('followup-final','steward','balanced',{defaultTrading:true,scenario:'classic'});
  const done=performAction({...base,status:'playing',awaitingAction:true,actionsLeft:1,learningFlow:{version:'settlement-v1',queue:[]},payoutChoice:null},{kind:'hold'});
  mount(done.state,'settle',done.summary!);click('dismiss-settle');expect(root.querySelector('.modal-quiz-confirm')).not.toBeNull();expect(root.textContent).toContain('이번 게임을 마치면');click('notice-continue');expect(root.querySelector('.modal-payout')).not.toBeNull();
});
it('추가 점수 기회가 있으면 자동 정산을 예약하지 않는다',async()=>{
  vi.useFakeTimers();const save={...defaultSave,disclaimerAccepted:true,settings:{...defaultSave.settings,reducedMotion:true,autoSettle:true}};localStorage.setItem(STORAGE_KEY,JSON.stringify(save));
  mount({...game(),actionsLeft:1});if(root.querySelector('.modal-risk-notice'))click('notice-continue');click('do-hold');expect(root.querySelector('.modal-settle')).not.toBeNull();expect(root.querySelector('.settle-cta.auto')).toBeNull();await vi.advanceTimersByTimeAsync(5000);expect(root.querySelector('.modal-settle')).not.toBeNull();
});
