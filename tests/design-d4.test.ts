// @vitest-environment happy-dom
import { beforeEach, expect, it } from 'vitest';
import { PensionRoadApp } from '../src/ui/app';
import { defaultSave, STORAGE_KEY } from '../src/ui/ui-state';
import { createGame } from '../src/engine/game-engine';
import { CHECKPOINT_KEY, checkpointVersion, parseCheckpoint } from '../src/ui/play-checkpoint';
let root:HTMLElement;
const click=(action:string)=>{const b=root.querySelector<HTMLButtonElement>(`[data-action="${action}"]`);expect(b,action).not.toBeNull();b!.click();};
beforeEach(()=>{localStorage.clear();document.body.innerHTML='<div id="app"></div>';root=document.querySelector('#app')!;localStorage.setItem(STORAGE_KEY,JSON.stringify({...defaultSave,disclaimerAccepted:true,howtoSeen:true}));});
it('설정의 미진단 안내와 옵션 진입도 기본값을 결과로 표시하지 않는다',()=>{
 new PensionRoadApp(root);click('open-settings');const modal=root.querySelector('[role="dialog"]')!;
 expect(modal.querySelector('.profile-note')!.textContent).toContain('아직 확인한 투자자성향이 없습니다');
 expect(modal.querySelector('.profile-note')!.textContent).not.toContain('위험중립형');
 expect(modal.querySelectorAll('.support-group')).toHaveLength(3);expect(modal.querySelector('.support-sources .source-list')).not.toBeNull();
 click('open-default-option');expect(root.querySelector('.preparation-unassessed')).not.toBeNull();expect(root.querySelector('[data-action="confirm-default-option"]')).toBeNull();
});
it('도감은 탭·패널 연결과 방향키 초점을 유지하고 조회로 게임 상태를 바꾸지 않는다',()=>{
 const game=createGame('support-qa','aggressive',500000,{updatedFinance:true,scenario:'classic',ghost:false});
 localStorage.setItem(CHECKPOINT_KEY,JSON.stringify({version:checkpointVersion(game),game,modal:null,lastSummary:null,quizCardId:null,quizPicked:null,finalQuizQueue:[],finalQuizTotal:0,finishing:false,defaultOptionAsk:false}));
 new PensionRoadApp(root);click('open-cards');
 let tab=root.querySelector<HTMLButtonElement>('[role="tab"][aria-selected="true"]')!;tab.focus();tab.dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowRight',bubbles:true}));
 tab=root.querySelector<HTMLButtonElement>('[role="tab"][aria-selected="true"]')!;
 expect(tab.dataset.tab).toBe('achievements');expect(document.activeElement).toBe(tab);
 expect(root.querySelectorAll('[role="tab"][tabindex="0"]')).toHaveLength(1);
 expect(root.querySelector('[role="tabpanel"]')!.getAttribute('aria-labelledby')).toBe(tab.id);
 expect(root.querySelector('[role="dialog"]')!.contains(root.querySelector('[role="tabpanel"]'))).toBe(true);
 tab.dispatchEvent(new KeyboardEvent('keydown',{key:'End',bubbles:true}));expect(document.activeElement?.getAttribute('data-tab')).toBe('collection');
 click('close-modal');click('resume-game');expect(parseCheckpoint(localStorage.getItem(CHECKPOINT_KEY))!.game).toEqual(game);
});
