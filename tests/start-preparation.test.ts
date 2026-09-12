// @vitest-environment happy-dom
import { beforeEach, expect, it } from 'vitest';
import { PensionRoadApp } from '../src/ui/app';
import { defaultSave, STORAGE_KEY } from '../src/ui/ui-state';
import { CHECKPOINT_KEY, parseCheckpoint } from '../src/ui/play-checkpoint';
import { createGame, startTurn } from '../src/engine/game-engine';
import { prepareStart, reassessPreparation, canConfirmPreparation } from '../src/ui/start-preparation';
let root:HTMLElement;
const click=(action:string)=>{const b=root.querySelector<HTMLButtonElement>(`[data-action="${action}"]`);expect(b,action).not.toBeNull();b!.click();};
const checkpoint=()=>parseCheckpoint(localStorage.getItem(CHECKPOINT_KEY))!;
beforeEach(()=>{localStorage.clear();document.body.innerHTML='<div id="app"></div>';root=document.querySelector('#app')!;});
it('처음에는 기본값을 결과로 부르지 않고 진단과 확인 뒤에만 새 판을 생성한다',()=>{
 new PensionRoadApp(root); const agree=root.querySelector<HTMLInputElement>('#disclaimer')!; agree.checked=true; agree.dispatchEvent(new Event('change',{bubbles:true}));click('begin');
 expect(root.textContent).toContain('아직 진단하지 않았습니다');expect(root.querySelector<HTMLButtonElement>('[data-action="prepare-continue"]')!.disabled).toBe(true);
 click('prepare-diagnosis');for(let i=0;i<5;i++) click('answer');
 expect(root.textContent).toContain('교육용 진단 결과');expect(root.textContent).toContain('안정형');expect(localStorage.getItem(CHECKPOINT_KEY)).toBeNull();
 click('prepare-continue');expect(root.textContent).toContain('확인한 성향 · 안정형');expect(localStorage.getItem(CHECKPOINT_KEY)).toBeNull();
 click('confirm-default-option');expect(checkpoint().game.profileId).toBe('stable');expect(checkpoint().game.turn).toBe(0);expect(checkpoint().modal).toBeNull();
 expect(JSON.parse(localStorage.getItem(STORAGE_KEY)!).profileAssessment).toEqual({profileId:'stable',origin:'diagnosed'});
});
it('준비 중 재진단·옵션 변경·취소·재접속은 기존 판과 개인 설정을 덮어쓰지 않는다',()=>{
 const g=startTurn(createGame('saved-before-prep','growth',500000,{ghost:false,scenario:'classic',defaultTrading:true}),5).state;
 const raw=JSON.stringify({version:'c3',game:g,modal:'action',lastSummary:null,quizCardId:null,quizPicked:null,finalQuizQueue:[],finalQuizTotal:0,finishing:false,defaultOptionAsk:false});
 localStorage.setItem(CHECKPOINT_KEY,raw);localStorage.setItem(STORAGE_KEY,JSON.stringify({...defaultSave,profileId:'growth',avatarId:'aggressive',defaultOption:'highRisk',disclaimerAccepted:true}));
 new PensionRoadApp(root);const saved=localStorage.getItem(STORAGE_KEY);click('begin');click('prepare-diagnosis');for(let i=0;i<5;i++)click('answer');click('prepare-continue');
 expect(root.textContent).toContain('성향 범위 밖');expect(localStorage.getItem(CHECKPOINT_KEY)).toBe(raw);expect(localStorage.getItem(STORAGE_KEY)).toBe(saved);
 click('cancel-preparation');click('resume-game');expect(checkpoint().game).toEqual(g);
});
it('준비 화면 새로고침 후 이어하기는 기존 판으로 돌아간다',()=>{
 const g=createGame('reload-old','stable',500000,{scenario:'classic',defaultTrading:true});
 localStorage.setItem(CHECKPOINT_KEY,JSON.stringify({version:'c3',game:g,modal:null,lastSummary:null,quizCardId:null,quizPicked:null,finalQuizQueue:[],finalQuizTotal:0,finishing:false,defaultOptionAsk:false}));
 localStorage.setItem(STORAGE_KEY,JSON.stringify({...defaultSave,disclaimerAccepted:true}));new PensionRoadApp(root);click('begin');click('prepare-continue');
 root.remove();document.body.innerHTML='<div id="app2"></div>';root=document.querySelector('#app2')!;new PensionRoadApp(root);click('resume-game');expect(checkpoint().game).toEqual(g);
});
it('주간 도전은 고정 성향을 먼저 알리고 개인 성향·캐릭터를 바꾸지 않는다',()=>{
 localStorage.setItem(STORAGE_KEY,JSON.stringify({...defaultSave,profileId:'aggressive',avatarId:'stable',disclaimerAccepted:true}));new PensionRoadApp(root);click('weekly-seed');
 expect(root.textContent).toContain('주간 도전의 공통 성향');expect(root.querySelector('[data-action="prepare-diagnosis"]')).toBeNull();click('prepare-continue');click('confirm-default-option');
 expect(checkpoint().game.profileId).toBe('balanced');expect(checkpoint().game.avatarId).toBe('stable');expect(JSON.parse(localStorage.getItem(STORAGE_KEY)!).profileId).toBe('aggressive');
});
it('성향 변경은 부적합 옵션을 교정하고 명시적 미지정은 유지한다',()=>{
 const d=prepareStart({...defaultSave,profileId:'growth',defaultOption:'highRisk'},'seed','classic','pension',500000,'result');
 expect(canConfirmPreparation({...d,stage:'option'})).toBe(false);
 const stable=reassessPreparation(d,'stable');expect(stable.option).toBe('principal');expect(stable.notice).toContain('범위 밖');
 expect(canConfirmPreparation({...stable,stage:'option'})).toBe(true);expect(reassessPreparation({...d,option:null},'stable').option).toBeNull();
});

it('최초 진단 전 임시 추천은 진단 뒤 갱신하고 직접 고른 유효 옵션은 유지한다',()=>{
 const d=prepareStart(defaultSave,'seed','classic','pension',500000,'title');
 expect(reassessPreparation(d,'growth').option).toBe('highRisk');
 expect(reassessPreparation({...d,option:'principal',optionSource:'chosen'},'growth').option).toBe('principal');
});
