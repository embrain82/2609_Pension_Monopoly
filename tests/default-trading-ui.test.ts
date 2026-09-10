// @vitest-environment happy-dom
import {beforeEach,it,expect} from 'vitest';
import {PensionRoadApp} from '../src/ui/app';
import {createGame,startTurn,performAction} from '../src/engine/game-engine';
import {nextDefaultCommand} from '../src/engine/default-trade-engine';
import {settleAllOrders} from '../src/engine/portfolio-engine';
import {defaultSave,STORAGE_KEY} from '../src/ui/ui-state';
import {CHECKPOINT_KEY,parseCheckpoint} from '../src/ui/play-checkpoint';
import type {GameState} from '../src/types';
let root:HTMLElement;
const saved=()=>parseCheckpoint(localStorage.getItem(CHECKPOINT_KEY))!;
const click=(s:string)=>{const el=root.querySelector<HTMLElement>(s);expect(el,s).not.toBeNull();el!.click();};
const change=(id:string,value:string)=>{const e=root.querySelector<HTMLInputElement|HTMLSelectElement>(id)!;e.value=value;e.dispatchEvent(new Event('change',{bubbles:true}));};
function mount(game?:GameState) {
  const g=game??{...startTurn(createGame('trade-ui','balanced',500000,{ghost:false,scenario:'classic',defaultTrading:true,defaultOption:'highRisk'}),5).state,irpCash:2000000};
  localStorage.setItem(CHECKPOINT_KEY,JSON.stringify({version:'c3',game:g,modal:'action',lastSummary:null,quizCardId:null,quizPicked:null,finalQuizQueue:[],finalQuizTotal:0,finishing:false,defaultOptionAsk:false}));
  new PensionRoadApp(root);click('[data-action="resume-game"]');return g;
}
beforeEach(()=>{localStorage.clear();document.body.innerHTML='<div id="app"></div>';root=document.querySelector('#app')!;localStorage.setItem(STORAGE_KEY,JSON.stringify({...defaultSave,disclaimerAccepted:true,howtoSeen:true,settings:{...defaultSave.settings,reducedMotion:true}}));});
it('기존 6개 카드와 같은 디자인의 새 카드 한 개, 상세 탭은 하위 화면에만 표시',()=>{
  mount();expect(root.querySelectorAll('.action-list > article')).toHaveLength(7);
  expect([...root.querySelectorAll('.action-list strong')].map(e=>e.textContent)).toEqual(['추가납입','매수','매도','바꾸기','리밸런싱','디폴트옵션 옵트인/아웃','이번엔 그대로']);
  expect(root.querySelectorAll('[data-action="default-trade-tab"]')).toHaveLength(0);
  click('[data-view="default"]');expect(root.querySelectorAll('[data-action="default-trade-tab"]')).toHaveLength(2);
  expect(root.querySelectorAll('[role="dialog"] [data-action="close-modal"]')).toHaveLength(1);
  expect(root.querySelectorAll('[data-action="action-portfolio"]')).toHaveLength(1);
  expect(root.textContent).not.toContain('취소하고 보드로');
});
it('포트폴리오 왕복·재접속은 탭과 금액 초안을 보존하고 X/Esc는 행동을 쓰지 않는다',()=>{
  const g=mount();click('[data-view="default"]');change('#default-trade-amount','345678');click('[data-action="default-trade-tab"][data-tab="out"]');click('[data-action="default-trade-fraction"][data-fraction="1"]');click('[data-action="action-portfolio"]');
  document.body.innerHTML='<div id="second"></div>';root=document.querySelector('#second')!;new PensionRoadApp(root);click('[data-action="resume-game"]');click('[data-action="return-action"]');
  expect(root.querySelector('[data-action="default-trade-tab"][data-tab="out"]')?.getAttribute('aria-pressed')).toBe('true');
  click('[data-action="default-trade-tab"][data-tab="in"]');expect(root.querySelector<HTMLInputElement>('#default-trade-amount')?.value).toBe('345678');
  expect(saved().game).toEqual(g);document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape'}));expect(root.querySelector('[role="dialog"]')).toBeNull();expect(saved().game).toEqual(g);
  click('[data-action="open-action"]');expect(root.querySelectorAll('.action-list>article')).toHaveLength(7);
});
it('확정은 한 번만 접수하고 남은 행동과 결제 진행을 표시한다',()=>{
  const g=mount();click('[data-view="default"]');change('#default-trade-amount','100000');click('[data-action="submit-default-trade"]');
  const after=saved().game;expect(after.actionsLeft).toBe(g.actionsLeft-1);expect(after.irpCash).toBe(g.irpCash-100000);expect(after.defaultTrading!.groups).toHaveLength(1);
  click('[data-view="default"]');expect(root.textContent).toContain('주문 처리 중');expect(root.querySelector<HTMLButtonElement>('[data-action="submit-default-trade"]')?.disabled).toBe(true);
});
it('보유분 환매와 지정 해제가 분리되고 같은 일반 상품 매도 화면은 보호된다',()=>{
  let g={...startTurn(createGame('out-ui','balanced',500000,{ghost:false,scenario:'classic',defaultTrading:true,defaultOption:'highRisk'}),5).state,irpCash:2000000};
  g=settleAllOrders(performAction(g,{kind:'default-opt-in',optionId:'highRisk',amount:1000000,commandId:nextDefaultCommand(g)}).state);g={...g,awaitingAction:true,actionsLeft:2};mount(g);
  click('[data-view="default"]');click('[data-action="default-trade-tab"][data-tab="out"]');expect(root.textContent).toContain('직접 매수한 같은 상품은 유지');click('[data-action="submit-default-trade"]');
  expect(saved().game.defaultOption).toBe('highRisk');expect(saved().game.defaultTrading!.groups.at(-1)!.kind).toBe('out');expect(saved().game.pendingOrders.every(o=>!!o.defaultScope)).toBe(true);
});
it('새 판의 사전지정 안내와 순수 마감은 자동 매수를 약속하지 않는다',()=>{
  new PensionRoadApp(root);click('[data-action="begin"]');expect(root.textContent).toContain('지정만으로 매수되지 않습니다');expect(root.textContent).not.toContain('「이번엔 그대로」를 고르면 대기자금이 이 옵션으로 운용');
});
it('마지막 턴 주문은 가상의 13·14턴 대신 최종 정산으로 안내한다',()=>{
  const g={...startTurn(createGame('last-ui','balanced',500000,{ghost:false,scenario:'classic',defaultTrading:true}),5).state,turn:12,irpCash:1000000};
  mount(g);click('[data-view="default"]');change('#default-trade-option','highRisk');
  expect(root.textContent).toContain('기준가 최종 정산 → 결제 최종 정산');
  expect(root.textContent).toContain('추가 시장·급여 없이');expect(root.textContent).not.toContain('결제 14턴');
});
