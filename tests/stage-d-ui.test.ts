// @vitest-environment happy-dom
import {beforeEach,it,expect} from 'vitest';
import {PensionRoadApp} from '../src/ui/app';
import {defaultSave,STORAGE_KEY} from '../src/ui/ui-state';
import {CHECKPOINT_KEY,parseCheckpoint} from '../src/ui/play-checkpoint';
import {autoplay} from '../src/engine/game-engine';
let root:HTMLElement;
const click=(s:string)=>{const el=root.querySelector<HTMLElement>(s);expect(el,s).not.toBeNull();el!.click();};
const saved=()=>parseCheckpoint(localStorage.getItem(CHECKPOINT_KEY))!;
beforeEach(()=>{localStorage.clear();document.body.innerHTML='<div id="app"></div>';root=document.querySelector('#app')!;localStorage.setItem(STORAGE_KEY,JSON.stringify({...defaultSave,disclaimerAccepted:true,howtoSeen:true,settings:{...defaultSave.settings,reducedMotion:true}}));});
it('시작 선택을 저장하고 정산 퀴즈는 선택적으로 열어 복귀한다',()=>{
  new PensionRoadApp(root);
  root.querySelector<HTMLDetailsElement>('.campaign-picker')!.open=true;
  const scenario=root.querySelector<HTMLSelectElement>('#scenario-pick')!;scenario.value='inflation';scenario.dispatchEvent(new Event('change',{bubbles:true}));
  expect(root.querySelector<HTMLDetailsElement>('.campaign-picker')!.open).toBe(true);
  const mission=root.querySelector<HTMLSelectElement>('#mission-pick')!;mission.value='cushion';mission.dispatchEvent(new Event('change',{bubbles:true}));
  click('[data-action="begin"]');click('[data-action="skip-default-option"]');click('[data-action="roll-dice"]');
  if(root.querySelector('[data-action="quiz-skip"]')) click('[data-action="quiz-skip"]');
  if(root.querySelector('[data-action="dismiss-news"]')) click('[data-action="dismiss-news"]');
  expect(saved().game.campaign!.scenario).toBe('inflation');expect(saved().game.campaign!.mission).toBe('cushion');
  click('[data-action="action-view"][data-view="contribute"]');click('[data-action="do-contribute"]');
  if(saved().game.awaitingAction) click('[data-action="do-hold"]');
  const before=structuredClone(saved().game);click('[data-action="action-quiz"]');click('[data-action="quiz-skip"]');
  expect(root.querySelector('.modal-settle')).not.toBeNull();
  expect(saved().game.cash).toBe(before.cash);expect(saved().game.campaign!.reviews).toEqual(before.campaign!.reviews);
});
it('완주 결과에서 장 끝으로 분기하고 새로고침 복원한다',()=>{
  const g=autoplay('branch-ui','steward','balanced',{scenario:'classic'});
  localStorage.setItem(CHECKPOINT_KEY,JSON.stringify({version:'c2',game:g,modal:'payout',lastSummary:null,quizCardId:null,quizPicked:null,finalQuizQueue:[],finalQuizTotal:0,finishing:true,defaultOptionAsk:false}));
  new PensionRoadApp(root);click('[data-action="resume-game"]');click('[data-action="choose-payout"][data-choice="annuity20"]');
  expect(root.textContent).toContain('내 판단 복기');
  click('[data-action="replay-chapter"][data-turn="6"]');const branch=saved();
  expect(branch.game.turn).toBe(6);expect(branch.game.campaign!.practice).toBe(true);expect(root.querySelector('[data-action="roll-dice"]')).not.toBeNull();
  document.body.innerHTML='<div id="app2"></div>';root=document.querySelector('#app2')!;new PensionRoadApp(root);click('[data-action="resume-game"]');
  expect(saved().game).toEqual(branch.game);
});
