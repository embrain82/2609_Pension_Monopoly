// @vitest-environment happy-dom
import { beforeEach, expect, it } from 'vitest';
import { PensionRoadApp } from '../src/ui/app';
import { createGame, startTurn, performAction, resolveLifeEvent } from '../src/engine/game-engine';
import { CHECKPOINT_KEY, checkpointVersion, parseCheckpoint } from '../src/ui/play-checkpoint';
import { STORAGE_KEY, defaultSave } from '../src/ui/ui-state';
import type { GameState } from '../src/types';
import type { PracticeProgress } from '../src/ui/guided-practice';
let root:HTMLElement;
const game=():GameState=>({...startTurn(createGame('practice-ui','balanced',500000,{defaultLifecycle:true,contributionPacing:true,ghost:false,scenario:'classic'}),5).state,currentEventId:null,awaitingAction:true,actionsLeft:2,cash:12000000,irpCash:0});
const current=()=>parseCheckpoint(localStorage.getItem(CHECKPOINT_KEY))!;
const click=(action:string)=>{const e=root.querySelector<HTMLElement>(`[data-action="${action}"]`);expect(e,action).not.toBeNull();e!.click();};
function mount(g:GameState,practice?:unknown){localStorage.setItem(CHECKPOINT_KEY,JSON.stringify({version:checkpointVersion(g),game:g,practice,modal:'action',lastSummary:null,quizCardId:null,quizPicked:null,finalQuizQueue:[],finalQuizTotal:0,finishing:false,defaultOptionAsk:false}));new PensionRoadApp(root);click('resume-game');}
beforeEach(()=>{localStorage.clear();document.body.innerHTML='<div id="app"></div>';root=document.querySelector('#app')!;localStorage.setItem(STORAGE_KEY,JSON.stringify({...defaultSave,disclaimerAccepted:true,howtoSeen:true,quickGuideSeen:true,settings:{...defaultSave.settings,reducedMotion:true}}));});
it('실습 안내·자금 조회·납입 미리보기·완료는 실제 거래를 전혀 하지 않는다',()=>{
 const g=game();mount(g);expect(root.querySelector('.guided-practice')).toBeNull();click('practice-start');
 expect(root.querySelector('.beginner-action-hint')).toBeNull();expect(current().game).toEqual(g);
 click('practice-money');expect(root.querySelector('.money-flow')).not.toBeNull();expect(current().practice?.step).toBe('preview');expect(current().game).toEqual(g);
 click('practice-preview');expect(root.querySelector('.order-input')).not.toBeNull();expect(root.textContent).toContain('IRP에 얼마나 넣을까요');expect(document.activeElement?.textContent).toContain('조회만 했어요');expect(root.querySelector('[role="dialog"]')!.scrollTop).toBe(0);expect(current().game).toEqual(g);
 click('practice-done');expect(root.querySelector('.beginner-action-menu')).not.toBeNull();expect(current().practice?.step).toBe('done');expect(current().game).toEqual(g);
});
it('조회 후 X·다시 보기·건너뛰기와 이어 하기는 자금·행동·주문을 보존한다',()=>{
 const g=game();mount(g);click('practice-start');click('practice-money');click('close-modal');click('open-action');
 expect(current().practice?.step).toBe('preview');click('practice-skip');expect(current().practice?.mode).toBe('off');
 click('practice-start');expect(current().practice?.step).toBe('money');click('practice-money');
 document.body.innerHTML='<div id="app"></div>';root=document.querySelector('#app')!;new PensionRoadApp(root);click('resume-game');
 expect(current().practice?.step).toBe('preview');expect(root.querySelector('.guided-practice')).not.toBeNull();expect(current().game).toEqual(g);
});
it('생활자금 부족은 납입 대신 자금 조회를 안내하고 잘못된 실습 저장은 판을 막지 않는다',()=>{
 const g={...game(),cash:0,irpCash:0};mount(g,{version:'broken',step:'buy'});expect(current().practice).toBeUndefined();click('practice-start');click('practice-money');
 expect(root.querySelector('[data-action="practice-preview"]')!.textContent).toContain('내 돈의 위치');click('practice-preview');expect(root.querySelector('.modal-portfolio')).not.toBeNull();expect(current().game).toEqual(g);
});
it('실습 중 실제 확정은 기존 엔진과 동일하게 한 번만 처리하고 실습을 마친다',()=>{
 const g=game();mount(g);click('practice-start');click('practice-money');click('practice-preview');
 const before=current().game;click('do-contribute');
 expect(current().game).toEqual(performAction(before,{kind:'contribute',amount:1000000}).state);
 expect(current().game.actionsLeft).toBe(1);expect(current().practice?.step).toBe('done');
});
it('턴2 실습은 새 상태에서 시작하고 턴3부터 자동 종료한다',()=>{
 const advance=(g:GameState)=>{if(g.currentEventId)g=resolveLifeEvent(g,'cash').state;return {...startTurn(performAction(g,{kind:'hold'}).state,1).state,currentEventId:null,awaitingAction:true,actionsLeft:1};};
 const turn2=advance(game());const p:PracticeProgress={version:'p1',turn:1,mode:'active',step:'done'};mount(turn2,p);
 expect(root.querySelector('[data-practice-step="money"]')).not.toBeNull();expect(current().practice?.turn).toBe(2);
 document.body.innerHTML='<div id="app"></div>';root=document.querySelector('#app')!;mount(advance(turn2),p);
 expect(root.querySelector('.guided-practice,.practice-invitation,.practice-replay')).toBeNull();expect(current().practice).toBeUndefined();
});
it('용어 펼치기는 폼 선택·금액과 자금을 유지하고 실제 확정과 구분된다',()=>{
 const g={...game(),irpCash:2000000};mount(g);const buy=root.querySelector<HTMLElement>('[data-choice="buy"]')!;buy.click();
 const product=root.querySelector<HTMLSelectElement>('#buy-product')!;product.value='shortBond';product.dispatchEvent(new Event('change',{bubbles:true}));
 const help=root.querySelector<HTMLDetailsElement>('.product-help')!;help.open=true;click('amount-preset');
 expect(root.querySelector<HTMLDetailsElement>('.product-help')!.open).toBe(true);expect(root.querySelector<HTMLSelectElement>('#buy-product')!.value).toBe('shortBond');expect(current().game).toEqual(g);
});
