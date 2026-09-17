// @vitest-environment happy-dom
import { beforeEach, expect, it, vi } from 'vitest';
import { PensionRoadApp } from '../src/ui/app';
import { defaultSave, STORAGE_KEY } from '../src/ui/ui-state';
import { createGame, startTurn, performAction, resolveLifeEvent } from '../src/engine/game-engine';
import { CHECKPOINT_KEY, checkpointVersion, parseCheckpoint } from '../src/ui/play-checkpoint';
import { renderMaturitySummary } from '../src/ui/maturity-view';
import { renderTradePreview } from '../src/ui/trade-preview';
import { buyProduct } from '../src/engine/portfolio-engine';
import type { GameState } from '../src/types';
import { generalLearningCards } from '../src/data/content';
let root:HTMLElement;
const click=(action:string)=>{const b=root.querySelector<HTMLButtonElement>(`[data-action="${action}"]`);expect(b,action).not.toBeNull();b!.click();};
const current=()=>parseCheckpoint(localStorage.getItem(CHECKPOINT_KEY))!.game;
function game(turn=4) {let g=createGame('maturity-ui','aggressive',500000,{defaultLifecycle:true,defaultOption:'midRisk',scenario:'classic',ghost:false,settlementLearning:true});while(g.turn<turn){if(g.currentEventId)g=resolveLifeEvent(g,'cash').state;if(g.awaitingAction)g=performAction(g,{kind:'hold'}).state;g=startTurn(g,1).state;}return {...g,currentEventId:null,awaitingAction:true,actionsLeft:2};}
function seed(g:GameState,modal:string|null='action') {localStorage.setItem(CHECKPOINT_KEY,JSON.stringify({version:checkpointVersion(g),game:g,modal,lastSummary:null,quizCardId:null,quizPicked:null,finalQuizQueue:[],finalQuizTotal:0,finishing:false,defaultOptionAsk:false}));new PensionRoadApp(root);click('resume-game');}
beforeEach(()=>{localStorage.clear();document.body.innerHTML='<div id="app"></div>';root=document.querySelector('#app')!;localStorage.setItem(STORAGE_KEY,JSON.stringify({...defaultSave,disclaimerAccepted:true,howtoSeen:true,settings:{...defaultSave.settings,reducedMotion:true}}));});
it('실제 통지 렌더 후에만 표시 턴을 저장하고 반복 조회·새로고침은 주문/행동을 바꾸지 않는다',()=>{
 const g=game();expect(g.defaultLifecycle!.cycles[0].presentedTurn).toBeUndefined();seed(g);
 expect(root.querySelector('[data-default-notice]')).not.toBeNull();const seen=current();expect(seen.defaultLifecycle!.cycles[0]).toMatchObject({presentedTurn:4,eligibleTurn:5});
 expect(seen.actionsLeft).toBe(g.actionsLeft);expect(seen.holdings).toEqual(g.holdings);expect(seen.defaultTrading!.groups).toHaveLength(0);
 click('action-portfolio');expect(current()).toEqual(seen);click('close-modal');expect(current()).toEqual(seen);
 document.body.innerHTML='<div id="app"></div>';root=document.querySelector('#app')!;new PensionRoadApp(root);click('resume-game');expect(current()).toEqual(seen);
});
it('현금 유지 지시는 상위 메뉴에 없고 상세 확인에서만 1회 소비한다',()=>{
 seed(game());expect(root.querySelector('[data-action="keep-maturity-cash"]')).toBeNull();expect(root.textContent).toContain('통지·대기 절차는 계속됩니다');
 click('action-portfolio');const button=root.querySelector('[data-action="keep-maturity-cash"]')!;expect(button.closest('details')).not.toBeNull();
 const before=current();click('keep-maturity-cash');const after=current();expect(after.irpCash).toBe(before.irpCash);expect(after.actionsLeft).toBe(before.actionsLeft-1);expect(after.defaultLifecycle!.cycles[0].state).toBe('directed');
 expect(root.querySelector('[data-action="keep-maturity-cash"]')).toBeNull();
});
it('새 판 시작 확정은 c5와 새 퀴즈 은행을 저장한다',()=>{
 new PensionRoadApp(root);click('begin');click('prepare-diagnosis');for(let i=0;i<5;i++)click('answer');click('prepare-continue');
 expect(root.textContent).toContain('통지·대기 후 자동주문');click('confirm-default-option');expect(current().rulesetVersion).toBe('2026-09-16-g');expect(current().learningContentVersion).toBe('2026-09-16-situations');
});
it('만기 안내는 상품 위험·비용·실제 주 수와 게임 단계를 나란히 알린다',()=>{
 const html=renderMaturitySummary(game());expect(html).toContain('원금 손실');expect(html).toContain('운용보수');expect(html).toContain('4주 무지시');expect(html).toContain('2주 무지시');expect(html).toContain('5턴');
 const g=game(3),r=buyProduct(g,'deposit',1000000);expect(renderTradePreview(g,r)).toContain('오래된 만기 순서');expect(g.defaultLifecycle!.cycles[0].remaining-r.state.defaultLifecycle!.cycles[0].remaining).toBeCloseTo(1000000,5);
});
it('퀴즈를 모두 풀었어도 만기 안내가 있으면 정산을 자동으로 넘기지 않는다',async()=>{
 vi.useFakeTimers();
 try {
  localStorage.setItem(STORAGE_KEY,JSON.stringify({...defaultSave,disclaimerAccepted:true,settings:{...defaultSave.settings,reducedMotion:true,autoSettle:true}}));
  const g=game(3);
  seed({...g,quizLog:generalLearningCards.map(c=>({cardId:c.id,correct:true,turn:1})),unlockedCards:generalLearningCards.map(c=>c.id)});
  click('do-hold');expect(root.querySelector('.modal-settle')).not.toBeNull();expect(root.querySelector('.settle-cta.auto')).toBeNull();
  await vi.advanceTimersByTimeAsync(5000);expect(root.querySelector('.modal-settle')).not.toBeNull();
 } finally {vi.useRealTimers();}
});
