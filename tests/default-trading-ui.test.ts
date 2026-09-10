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
  localStorage.setItem(CHECKPOINT_KEY,JSON.stringify({version:g.defaultTrading?'c3':'c2',game:g,modal:'action',lastSummary:null,quizCardId:null,quizPicked:null,finalQuizQueue:[],finalQuizTotal:0,finishing:false,defaultOptionAsk:false}));
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
  let base={...startTurn(createGame('draft-both','balanced',500000,{ghost:false,scenario:'classic',defaultTrading:true}),5).state,irpCash:2000000};
  base=settleAllOrders(performAction(base,{kind:'default-opt-in',optionId:'highRisk',amount:1000000,commandId:nextDefaultCommand(base)}).state);
  const g=mount({...base,awaitingAction:true,actionsLeft:2});click('[data-view="default"]');change('#default-trade-amount','345678');click('[data-action="default-trade-tab"][data-tab="out"]');click('[data-action="default-trade-fraction"][data-fraction="1"]');click('[data-action="action-portfolio"]');
  document.body.innerHTML='<div id="second"></div>';root=document.querySelector('#second')!;new PensionRoadApp(root);click('[data-action="resume-game"]');click('[data-action="return-action"]');
  expect(root.querySelector('[data-action="default-trade-tab"][data-tab="out"]')?.getAttribute('aria-pressed')).toBe('true');
  click('[data-action="default-trade-tab"][data-tab="in"]');expect(root.querySelector<HTMLInputElement>('#default-trade-amount')?.value).toBe('345678');
  expect(saved().game).toEqual(g);document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape'}));expect(root.querySelector('[role="dialog"]')).toBeNull();expect(saved().game).toEqual(g);
  click('[data-action="open-action"]');expect(root.querySelectorAll('.action-list>article')).toHaveLength(7);
});
it('확정은 한 번만 접수하고 남은 행동과 결제 진행을 표시한다',()=>{
  const g=mount();click('[data-view="default"]');change('#default-trade-amount','100000');click('[data-action="submit-default-trade"]');
  const after=saved().game;expect(after.actionsLeft).toBe(g.actionsLeft-1);expect(after.irpCash).toBe(g.irpCash-100000);expect(after.defaultTrading!.groups).toHaveLength(1);
  expect(root.querySelector<HTMLButtonElement>('[data-view="default"]')?.disabled).toBe(true);
  click('[data-view="default"]');expect(root.textContent).toContain('주문 처리 중');expect(root.querySelector('[data-action="submit-default-trade"]')).toBeNull();expect(saved().game).toEqual(after);
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

it('추천과 선택을 각각 표시하고 CTA와 실제 저장이 같은 상품을 가리킨다',()=>{
  localStorage.setItem(STORAGE_KEY,JSON.stringify({...defaultSave,profileId:'growth',defaultOption:'principal',disclaimerAccepted:true,howtoSeen:true}));
  new PensionRoadApp(root);click('[data-action="begin"]');
  expect(root.querySelector('[data-option="highRisk"] .suggest')).not.toBeNull();
  expect(root.querySelector('[data-option="principal"] .selected')?.textContent).toContain('현재 선택됨');
  expect(root.querySelector('[data-action="confirm-default-option"]')?.textContent).toBe('원리금보장형으로 시작');
  click('[data-option="highRisk"]');
  expect(root.querySelectorAll('[role="radio"][aria-checked="true"]')).toHaveLength(1);
  expect(root.querySelector('[data-option="highRisk"] .selected')).not.toBeNull();
  expect(root.querySelector('[data-option="highRisk"] .suggest')).not.toBeNull();
  expect(root.querySelector('[data-action="confirm-default-option"]')?.textContent).toBe('고위험으로 시작');
  click('[data-action="confirm-default-option"]');expect(saved().game.defaultOption).toBe('highRisk');
});
it('설정의 명시적 미지정을 과거 저장값으로 대체하지 않고 X는 초안을 저장하지 않는다',()=>{
  localStorage.setItem(STORAGE_KEY,JSON.stringify({...defaultSave,defaultOption:'highRisk',disclaimerAccepted:true,howtoSeen:true}));
  mount({...startTurn(createGame('none','balanced',500000,{defaultTrading:true,ghost:false}),5).state,defaultOption:null});
  click('[data-action="close-modal"]');click('[data-action="open-settings"]');click('[data-action="open-default-option"]');
  expect(root.querySelectorAll('[aria-checked="true"]')).toHaveLength(0);
  expect(root.querySelector('[data-action="confirm-default-option"]')?.textContent).toBe('지정 안 함으로 저장');
  click('[data-option="principal"]');click('[data-action="close-modal"]');expect(saved().game.defaultOption).toBeNull();
  click('[data-action="open-default-option"]');expect(root.querySelectorAll('[aria-checked="true"]')).toHaveLength(0);
});
it('키보드로 허용 카드만 이동하고 선택·초점·확정 문구가 함께 갱신된다',()=>{
  localStorage.setItem(STORAGE_KEY,JSON.stringify({...defaultSave,profileId:'stable',disclaimerAccepted:true,howtoSeen:true}));
  new PensionRoadApp(root);click('[data-action="begin"]');
  const principal=root.querySelector<HTMLButtonElement>('[data-option="principal"]')!;principal.focus();
  principal.dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowRight',bubbles:true}));
  expect(root.querySelector('[aria-checked="true"]')?.getAttribute('data-option')).toBe('lowRisk');
  expect(document.activeElement?.getAttribute('data-option')).toBe('lowRisk');
  document.activeElement!.dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowRight',bubbles:true}));
  expect(root.querySelector('[aria-checked="true"]')?.getAttribute('data-option')).toBe('principal');
});
it('15만원이면 유효한 전액 초안으로 시작하고 절반은 금액과 비활성 사유를 보여준다',()=>{
  mount({...startTurn(createGame('presets','balanced',500000,{defaultTrading:true,ghost:false}),5).state,irpCash:150000});click('[data-view="default"]');
  expect(root.querySelector<HTMLInputElement>('#default-trade-amount')?.value).toBe('150000');
  const half=root.querySelector<HTMLButtonElement>('[data-action="default-trade-amount"][data-fraction="0.5"]')!;
  expect(half.disabled).toBe(true);expect(half.textContent).toContain('75,000원');expect(root.querySelector('[id="preset-0.5-reason"]')?.textContent).toContain('10만원 미만');
  expect(root.querySelector('[data-action="default-trade-amount"][data-fraction="1"]')?.getAttribute('aria-pressed')).toBe('true');
  change('#default-trade-amount','123456');expect(root.querySelectorAll('.default-trade-presets [aria-pressed="true"]')).toHaveLength(0);
  click('[data-action="action-portfolio"]');click('[data-action="return-action"]');expect(root.querySelector<HTMLInputElement>('#default-trade-amount')?.value).toBe('123456');
});
it('대기자금이 없고 환매 가능하면 옵션 메뉴를 열어 옵트아웃으로 진입한다',()=>{
  let g={...startTurn(createGame('out-only','balanced',500000,{defaultTrading:true,ghost:false}),5).state,irpCash:1000000};
  g=settleAllOrders(performAction(g,{kind:'default-opt-in',optionId:'highRisk',amount:1000000,commandId:nextDefaultCommand(g)}).state);
  mount({...g,irpCash:0,actionsLeft:2,awaitingAction:true});click('[data-view="default"]');
  expect(root.querySelector<HTMLButtonElement>('[data-tab="in"]')?.disabled).toBe(true);
  expect(root.querySelector('[data-tab="out"]')?.getAttribute('aria-pressed')).toBe('true');
  expect(root.querySelector<HTMLButtonElement>('[data-action="submit-default-trade"]')?.disabled).toBe(false);
});
it('두 번째 행동에서 전액 매수 후 메뉴 비활성은 클릭 이벤트를 강제로 보내도 행동을 소비하지 않는다',()=>{
  const g=mount();click('[data-view="buy"]');change('#buy-product','tdf');click('[data-action="amount-preset"][data-preset="max"]');click('[data-action="do-buy"]');
  const after=saved().game;expect(after.actionsLeft).toBe(g.actionsLeft-1);expect(after.irpCash).toBe(0);
  const buy=root.querySelector<HTMLButtonElement>('[data-view="buy"]')!;
  expect(buy.disabled).toBe(true);expect(root.querySelector('#reason-buy')?.textContent).toContain('10만원 미만');
  buy.dispatchEvent(new MouseEvent('click',{bubbles:true}));expect(saved().game).toEqual(after);
  expect(root.querySelectorAll('.action-list>article')).toHaveLength(7);
  expect(root.querySelector<HTMLButtonElement>('[data-view="sell"]')?.disabled).toBe(false);
});
it('이전 저장 판은 기존 6개 메뉴와 기존 운용 규칙을 유지한다',()=>{
  mount({...startTurn(createGame('legacy-ui','balanced',500000,{ghost:false}),5).state,irpCash:0});
  expect(root.querySelectorAll('.action-list>article')).toHaveLength(6);expect(root.querySelector('[data-view="default"]')).toBeNull();
  expect(root.querySelector<HTMLButtonElement>('[data-view="buy"]')?.disabled).toBe(true);
});
it('성향 밖 저장 옵션은 창을 열 때 이유와 추천 초안을 표시하고 그 초안을 확정한다',()=>{
  localStorage.setItem(STORAGE_KEY,JSON.stringify({...defaultSave,profileId:'stable',defaultOption:'highRisk',disclaimerAccepted:true,howtoSeen:true}));
  new PensionRoadApp(root);click('[data-action="begin"]');
  expect(root.textContent).toContain('이전에 저장한 옵션이 현재 투자성향 범위 밖');
  expect(root.querySelector('[aria-checked="true"]')?.getAttribute('data-option')).toBe('principal');
  expect(root.querySelector('[data-action="confirm-default-option"]')?.textContent).toBe('원리금보장형으로 시작');
  click('[data-action="confirm-default-option"]');expect(saved().game.defaultOption).toBe('principal');
});
