// @vitest-environment happy-dom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { PensionRoadApp } from '../src/ui/app';
import { defaultSave, STORAGE_KEY } from '../src/ui/ui-state';
import { CHECKPOINT_KEY, parseCheckpoint } from '../src/ui/play-checkpoint';
import { dicePairForTurn, diceSteps, renderDiceOutcome } from '../src/ui/dice';
import { createGame, startTurn } from '../src/engine/game-engine';
let root: HTMLElement;
const click = (action: string) => root.querySelector<HTMLButtonElement>(`[data-action="${action}"]`)!.click();
beforeEach(() => { localStorage.clear(); document.body.innerHTML='<div id="app"></div>'; root=document.querySelector('#app')!; });
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });
it('36개 주사위 결과에서 점 눈의 면 수와 합계의 접근성 문구가 일치한다', () => {
  for(let left=1;left<=6;left++)for(let right=1;right<=6;right++) {
    root.innerHTML=renderDiceOutcome([left,right]);
    expect(root.querySelector('.dice-outcome')!.getAttribute('aria-label')).toBe(`직전 주사위 ${left}과 ${right}, 합계 ${left+right}칸 이동`);
    expect(root.querySelectorAll('.dice')).toHaveLength(2);
    const cubes=root.querySelectorAll('.dice');
    expect(cubes[0].querySelectorAll(`.n${left} .pip.on`)).toHaveLength(left);
    expect(cubes[1].querySelectorAll(`.n${right} .pip.on`)).toHaveLength(right);
    expect(root.querySelector('.rolling')).toBeNull();
  }
});
it('동작 줄이기로 굴려도 실제 이동과 결과가 일치하고 이어하기에서 유지된다', async () => {
  localStorage.setItem(STORAGE_KEY,JSON.stringify({...defaultSave,disclaimerAccepted:true,howtoSeen:true,settings:{...defaultSave.settings,reducedMotion:true}}));
  new PensionRoadApp(root);click('begin');click('prepare-continue');click('confirm-default-option');
  const before=parseCheckpoint(localStorage.getItem(CHECKPOINT_KEY))!.game, faces=dicePairForTurn(before.seed,before.turn);
  click('roll-dice');await Promise.resolve();await Promise.resolve();
  const after=parseCheckpoint(localStorage.getItem(CHECKPOINT_KEY))!.game;
  expect(after.turn).toBe(1);expect(after.position).toBe(diceSteps(faces)%24);
  expect(root.querySelector('.dice-outcome')!.getAttribute('aria-label')).toContain(`${faces[0]}과 ${faces[1]}`);
  expect(root.querySelector('.dice-overlay')).toBeNull();
  document.body.innerHTML='<div id="app"></div>';root=document.querySelector('#app')!;new PensionRoadApp(root);click('resume-game');
  expect(root.querySelector('.dice-outcome')!.getAttribute('aria-label')).toContain(`${faces[0]}과 ${faces[1]}`);
  expect(parseCheckpoint(localStorage.getItem(CHECKPOINT_KEY))!.game).toEqual(after);
});
it('최근 결과는 이어서 굴릴 다음 턴의 눈으로 바뀌지 않는다', () => {
  const initial=createGame('design-dice-history','balanced',500000,{scenario:'classic',defaultTrading:true}), faces=dicePairForTurn(initial.seed,0);
  const game=startTurn(initial,diceSteps(faces)).state;
  localStorage.setItem(STORAGE_KEY,JSON.stringify({...defaultSave,disclaimerAccepted:true}));
  localStorage.setItem(CHECKPOINT_KEY,JSON.stringify({version:'c3',game,modal:null,lastSummary:null,quizCardId:null,quizPicked:null,finalQuizQueue:[],finalQuizTotal:0,finishing:false,defaultOptionAsk:false}));
  new PensionRoadApp(root);click('resume-game');
  expect(root.querySelector('.dice-outcome')!.getAttribute('aria-label')).toContain(`${faces[0]}과 ${faces[1]}`);
});
it('브랜드 그림 로드 실패는 시작 동의·진입을 막지 않는다', () => {
  new PensionRoadApp(root);
  const image=root.querySelector<HTMLImageElement>('[data-brand-art]')!;image.dispatchEvent(new Event('error'));
  expect(image.hidden).toBe(true);expect(root.querySelector('.road-art-fallback')).not.toBeNull();
  const agree=root.querySelector<HTMLInputElement>('#disclaimer')!;agree.checked=true;agree.dispatchEvent(new Event('change',{bubbles:true}));click('begin');
  expect(root.querySelector('[data-action="prepare-diagnosis"]')).not.toBeNull();
});
it('새 레이아웃에서도 추천과 직접 고른 옵션이 구분되며 확인 전 저장하지 않는다', () => {
  localStorage.setItem(STORAGE_KEY,JSON.stringify({...defaultSave,disclaimerAccepted:true}));new PensionRoadApp(root);
  click('begin');click('prepare-continue');root.querySelector<HTMLButtonElement>('[data-option="principal"]')!.click();
  expect(root.querySelector('.preparation-option-detail h2')!.textContent).toBe('원리금보장형');
  expect(root.querySelector('.default-option-card.picked')!.getAttribute('data-option')).toBe('principal');
  expect(root.querySelector('.tag.suggest')!.closest('[data-option]')!.getAttribute('data-option')).toBe('midRisk');
  expect(localStorage.getItem(CHECKPOINT_KEY)).toBeNull();click('prepare-no-option');
  expect(root.querySelector('.preparation-option-detail h2')!.textContent).toBe('지정 안 함');
});
