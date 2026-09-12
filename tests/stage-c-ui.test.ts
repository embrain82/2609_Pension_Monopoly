/// <reference lib="dom.iterable" />
// @vitest-environment happy-dom
import { beforeEach, afterEach, describe, it, expect, vi } from 'vitest';
import { PensionRoadApp } from '../src/ui/app';
import { defaultSave, STORAGE_KEY } from '../src/ui/ui-state';
import { CHECKPOINT_KEY, parseCheckpoint } from '../src/ui/play-checkpoint';
import { createGame, startTurn, performAction } from '../src/engine/game-engine';
import { updateView } from '../src/ui/dom-view';
import { dicePairForTurn } from '../src/engine/random-engine';
import { AnimationController } from '../src/ui/animation-controller';
let root: HTMLElement;
const click = (selector: string) => { const el = root.querySelector<HTMLElement>(selector); expect(el, selector).not.toBeNull(); el!.click(); };
const saved = () => parseCheckpoint(localStorage.getItem(CHECKPOINT_KEY))!;
function mountAction(twoActions = false) {
  let game = startTurn(createGame('ui-c','balanced',500000,{ghost:false}),twoActions ? 5 : 1).state;
  if(twoActions) game = performAction(game,{kind:'contribute'}).state;
  localStorage.setItem(CHECKPOINT_KEY, JSON.stringify({version:'c1',game,modal:'action',lastSummary:null,quizCardId:null,quizPicked:null,finalQuizQueue:[],finalQuizTotal:0,finishing:false,defaultOptionAsk:false,routePending:false}));
  new PensionRoadApp(root); click('[data-action="resume-game"]'); return game;
}
beforeEach(() => {
  localStorage.clear(); document.body.innerHTML='<div id="app"></div>'; root=document.querySelector('#app')!;
  localStorage.setItem(STORAGE_KEY,JSON.stringify({...defaultSave,disclaimerAccepted:true,howtoSeen:true,settings:{...defaultSave.settings,reducedMotion:true}}));
});
afterEach(() => { vi.useRealTimers(); });
describe('운용 선택 탐색', () => {
  it('취소·포트폴리오 확인·재진입은 금액과 행동 횟수를 유지한다', () => {
    const game = mountAction(true);
    expect(root.textContent).not.toContain("취소하고 보드로");
    expect(root.querySelectorAll('[role="dialog"] [data-action="close-modal"]')).toHaveLength(1);
    click('[data-action="action-view"][data-view="buy"]');
    const select = root.querySelector<HTMLSelectElement>('#buy-product');
    if(select) { select.focus(); select.value='shortBond'; select.dispatchEvent(new Event('change',{bubbles:true})); expect(document.activeElement).toBe(select); }
    click('[data-action="action-portfolio"]');
    expect(root.textContent).toContain('운용 선택으로 돌아가기');
    click('[data-action="return-action"]');
    expect(root.textContent).toContain('매수');
    click('[data-action="close-modal"]');
    expect(root.querySelector('[role="dialog"]')).toBeNull();
    click('[data-action="open-portfolio"]'); click('[data-action="close-modal"]');
    click('[data-action="open-action"]'); expect(saved().game).toEqual(game);
  });
  it('Esc로 운용 창을 닫아도 턴이 진행되지 않고 거래 뒤 복원해도 중복 실행되지 않는다', () => {
    const game=mountAction();
    document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape'}));
    expect(root.querySelector('[role="dialog"]')).toBeNull(); expect(saved().game).toEqual(game);
    click('[data-action="open-action"]'); click('[data-action="action-view"][data-view="contribute"]'); click('[data-action="do-contribute"]');
    const after=saved(); expect(after.game.contributionTotal).toBeGreaterThan(0);
    document.body.innerHTML='<div id="second"></div>'; root=document.querySelector('#second')!;
    new PensionRoadApp(root); click('[data-action="resume-game"]');
    expect(saved().game).toEqual(after.game); expect(root.textContent).toContain('정산');
  });
  it('같은 보드·말·입력 노드는 갱신에도 유지된다', () => {
    mountAction(); const board=root.querySelector('.board'), token=root.querySelector('.token-pos');
    click('[data-action="action-portfolio"]'); click('[data-action="return-action"]');
    expect(root.querySelector('.board')).toBe(board); expect(root.querySelector('.token-pos')).toBe(token);
    const host=document.createElement('div'); updateView(host,'<select id="x"><option value="a">A</option><option value="b">B</option></select>');
    const select=host.firstChild; updateView(host,'<select id="x"><option value="a">A</option><option value="b" selected>B</option></select>');
    expect(host.firstChild).toBe(select); expect((select as HTMLSelectElement).value).toBe('b');
  });
});
it('취소된 애니메이션 대기는 완료 콜백을 실행하지 않는다', async () => {
  vi.useFakeTimers(); const controller=new AnimationController(); const id=controller.begin();
  const pending=controller.wait(1000,id); controller.cancel(); await expect(pending).resolves.toBe(false);
  await vi.runAllTimersAsync(); expect(controller.valid(id)).toBe(false);
});
it('경로 선택 없이 자동 이동하는 12턴 UI를 완주하고 결과 중복 집계 없이 진행 저장을 지운다', () => {
  new PensionRoadApp(root); click('[data-action="begin"]');click('[data-action="prepare-continue"]'); click('[data-action="prepare-no-option"]');click('[data-action="confirm-default-option"]');
  for(let i=0;i<120 && !root.querySelector('.result-screen');i++) {
    const dialog = root.querySelector('[role="dialog"]');
    const actions = dialog ? ['dismiss-howto','dismiss-news','quiz-skip','quiz-next','resolve-life','do-hold','dismiss-settle','choose-payout'] : ['roll-dice','open-action'];
    const action = actions.find(a => (dialog ?? root).querySelector(`[data-action="${a}"]`));
    expect(action, (dialog ?? root).textContent ?? '').toBeTruthy();
    if(action === 'resolve-life') click('[data-action="resolve-life"][data-choice="cash"]');
    else if(action === 'choose-payout') click('[data-action="choose-payout"][data-choice="annuity20"]');
    else click(`[data-action="${action}"]`);
  }
  expect(root.querySelector('.result-screen')).not.toBeNull();
  expect(localStorage.getItem(CHECKPOINT_KEY)).toBeNull();
  expect(JSON.parse(localStorage.getItem(STORAGE_KEY)!).playCount).toBe(1);
});
it('이동 도중 탭 중단·복구에서도 보드/말 노드를 유지하고 시장·급여를 한 번만 처리한다', async () => {
  vi.useFakeTimers();
  localStorage.setItem(STORAGE_KEY,JSON.stringify({...defaultSave,disclaimerAccepted:true,howtoSeen:true}));
  new PensionRoadApp(root); click('[data-action="begin"]');click('[data-action="prepare-continue"]'); click('[data-action="prepare-no-option"]');click('[data-action="confirm-default-option"]');
  const board=root.querySelector('.board'), token=root.querySelector('.token-pos');
  click('[data-action="roll-dice"]'); await vi.advanceTimersByTimeAsync(1500);
  expect(root.querySelector('.board')).toBe(board); expect(root.querySelector('.token-pos')).toBe(token);
  const hidden=vi.spyOn(document,'hidden','get').mockReturnValue(true);
  document.dispatchEvent(new Event('visibilitychange')); hidden.mockRestore();
  const checkpoint=saved(); expect(checkpoint.modal).toBeNull(); expect(checkpoint.game.turn).toBe(0);
  await vi.runAllTimersAsync(); expect(saved().game.turn).toBe(0);
  const faces=dicePairForTurn(checkpoint.game.seed,checkpoint.game.turn); const expected=startTurn(checkpoint.game,faces[0]+faces[1]).state;
  document.body.innerHTML='<div id="resumed"></div>'; root=document.querySelector('#resumed')!;
  localStorage.setItem(STORAGE_KEY,JSON.stringify({...defaultSave,disclaimerAccepted:true,howtoSeen:true,settings:{...defaultSave.settings,reducedMotion:true}}));
  new PensionRoadApp(root); click('[data-action="resume-game"]'); click('[data-action="roll-dice"]');
  expect(saved().game).toEqual(expected); expect(saved().game.route).not.toHaveProperty("choices");
});
