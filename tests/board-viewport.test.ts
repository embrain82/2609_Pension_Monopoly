// @vitest-environment happy-dom
import { beforeEach, afterEach, expect, it, vi } from 'vitest';
import { boardScrollTarget, revealBoard } from '../src/ui/board-viewport';
import { AnimationController } from '../src/ui/animation-controller';
import { PensionRoadApp } from '../src/ui/app';
import { CHECKPOINT_KEY, parseCheckpoint } from '../src/ui/play-checkpoint';
import { defaultSave, STORAGE_KEY } from '../src/ui/ui-state';
const rect=(top:number,height=320)=>({top,bottom:top+height,height});
const viewport={top:12,bottom:700,scroll:500,maxScroll:3000};
beforeEach(()=>{localStorage.clear();document.body.innerHTML='<div id="app"></div>';});
afterEach(()=>{vi.restoreAllMocks();vi.useRealTimers();});
it('가시 영역에 들어온 보드는 스크롤하지 않는다',()=>expect(boardScrollTarget(rect(100),viewport)).toBe(500));
it('위로 벗어난 보드는 하단 바를 뺀 영역 중앙으로 옮긴다',()=>expect(boardScrollTarget(rect(-400),viewport)).toBe(0));
it('아래쪽 보드는 중앙으로 이동하고 문서 경계는 넘지 않는다',()=>{
  expect(boardScrollTarget(rect(1000),viewport)).toBe(1304);expect(boardScrollTarget(rect(1000),{...viewport,maxScroll:700})).toBe(700);
});
it('가로·확대 화면에서 큰 보드가 이미 화면을 채우면 다시 끌어당기지 않는다',()=>expect(boardScrollTarget(rect(-40,800),viewport)).toBe(500));
it('숨겨진 보드·0 높이 화면은 기존 위치를 유지한다',()=>{
  expect(boardScrollTarget(rect(0,0),viewport)).toBe(500);expect(boardScrollTarget(rect(1000),{...viewport,bottom:0})).toBe(500);
});
function mockViewport() {
  const board=document.createElement('div'),footer=document.createElement('div');document.body.append(board,footer);
  vi.spyOn(board,'getBoundingClientRect').mockReturnValue(rect(-400) as DOMRect);
  vi.spyOn(footer,'getBoundingClientRect').mockReturnValue(rect(710,100) as DOMRect);
  vi.spyOn(window,'scrollY','get').mockReturnValue(500);
  vi.spyOn(document.documentElement,'scrollHeight','get').mockReturnValue(3000);
  vi.spyOn(document.documentElement,'clientHeight','get').mockReturnValue(844);
  const scroll=vi.spyOn(window,'scrollTo').mockImplementation(()=>{});
  return {board,footer,scroll};
}
it('동작 줄이기는 기다리지 않고 보드를 즉시 보여준다',()=>{
  const {board,footer,scroll}=mockViewport(),motion=new AnimationController();
  expect(revealBoard(board,footer,motion,motion.begin(),true)).toBeNull();expect(scroll).toHaveBeenCalledWith({top:0,behavior:'instant'});
});
it('화면 이동은 320ms에 끝나며 취소된 타이머가 이후 스크롤하지 않는다',async()=>{
  vi.useFakeTimers();const {board,footer,scroll}=mockViewport(),motion=new AnimationController();
  const pending=revealBoard(board,footer,motion,motion.begin(),false)!;await vi.advanceTimersByTimeAsync(320);await expect(pending).resolves.toBe('shown');expect(scroll).toHaveBeenLastCalledWith({top:0,behavior:'instant'});
  scroll.mockClear();const cancelled=revealBoard(board,footer,motion,motion.begin(),false)!;motion.cancel();await expect(cancelled).resolves.toBe('cancelled');await vi.runAllTimersAsync();expect(scroll).not.toHaveBeenCalled();
});
it('사용자 스크롤 개입 후 화면을 다시 끌어당기지 않는다',async()=>{
  vi.useFakeTimers();const {board,footer,scroll}=mockViewport(),motion=new AnimationController();
  const pending=revealBoard(board,footer,motion,motion.begin(),false)!;window.dispatchEvent(new WheelEvent('wheel'));await vi.advanceTimersByTimeAsync(16);await expect(pending).resolves.toBe('interrupted');expect(scroll).not.toHaveBeenCalled();
});
it('화면 이동 중 중복 주사위 입력·탭 중단은 턴과 급여를 실행하지 않는다',async()=>{
  vi.useFakeTimers();localStorage.setItem(STORAGE_KEY,JSON.stringify({...defaultSave,disclaimerAccepted:true,howtoSeen:true}));
  const root=document.querySelector<HTMLElement>('#app')!;new PensionRoadApp(root);
  const click=(action:string)=>root.querySelector<HTMLButtonElement>(`[data-action="${action}"]`)!.click();
  click('begin');click('prepare-continue');click('prepare-no-option');click('confirm-default-option');
  const board=root.querySelector<HTMLElement>('.board-stage')!;
  vi.spyOn(board,'getBoundingClientRect').mockReturnValue(rect(-400) as DOMRect);vi.spyOn(window,'scrollY','get').mockReturnValue(500);
  vi.spyOn(document.documentElement,'scrollHeight','get').mockReturnValue(3000);vi.spyOn(document.documentElement,'clientHeight','get').mockReturnValue(844);vi.spyOn(window,'scrollTo').mockImplementation(()=>{});
  const before=parseCheckpoint(localStorage.getItem(CHECKPOINT_KEY))!.game;const dice=root.querySelector<HTMLButtonElement>('[data-action="roll-dice"]')!;
  dice.click();expect(root.textContent).toContain('게임판으로 이동 중');dice.click();expect(parseCheckpoint(localStorage.getItem(CHECKPOINT_KEY))!.game).toEqual(before);
  vi.spyOn(document,'hidden','get').mockReturnValue(true);document.dispatchEvent(new Event('visibilitychange'));await vi.runAllTimersAsync();
  expect(parseCheckpoint(localStorage.getItem(CHECKPOINT_KEY))!.game).toEqual(before);expect(root.querySelector('[data-action="roll-dice"]')).not.toBeNull();expect(root.textContent).not.toContain('게임판으로 이동 중');
});
