// @vitest-environment happy-dom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { autoplay, createGame, startTurn } from '../src/engine/game-engine';
import { SCENARIOS, replayChapter } from '../src/engine/scenario-engine';
import { investorProfiles, boardTiles } from '../src/data/content';
import { hopPlan } from '../src/ui/token3d';
import { renderBoardMarkup } from '../src/ui/board';
import { renderExplore } from '../src/ui/route-view';
import { boardVisibilityOf, revealedTiles, TILE_REVEAL_MS } from '../src/ui/board-discovery';
import { CHECKPOINT_KEY, checkpointVersion, parseCheckpoint, type PlayCheckpoint } from '../src/ui/play-checkpoint';
import { PensionRoadApp } from '../src/ui/app';
import { STORAGE_KEY, defaultSave } from '../src/ui/ui-state';
import { DICE_ROLL_DURATION_MS, DICE_LAND_HOLD_MS, dicePairForTurn } from '../src/ui/dice';
import type { GameState } from '../src/types';

const game = (seed = 'map-a1-b5') => createGame(seed, 'balanced', 500000, {
  boardVisibility: 'arrival-v1', updatedFinance: true, scenario: 'classic', automaticStamps: true, ghost: false
});
function checkpoint(g: GameState): PlayCheckpoint {
  return {version:checkpointVersion(g),game:g,modal:null,lastSummary:null,quizCardId:null,quizPicked:null,finalQuizQueue:[],finalQuizTotal:0,finishing:false,defaultOptionAsk:false};
}
const parse = (g: GameState) => parseCheckpoint(JSON.stringify(checkpoint(g)));
function markup(g: GameState, view = {}) {
  const host = document.createElement('div'); host.innerHTML = renderBoardMarkup(g,true,view); return host;
}

it('출발칸만 공개하고 도장 방문 기록은 비워둔다. 모든 미지의 칸은 종류를 숨긴다', () => {
  const g=game(), host=markup(g);
  expect([...revealedTiles(g)]).toEqual([0]); expect(g.route.visits).toEqual([]);
  expect(host.querySelectorAll('.tile-hidden')).toHaveLength(23);
  for (const tile of boardTiles.slice(1)) {
    const node=host.querySelector(`[data-tile="${tile.index}"]`)!;
    expect(node.textContent).not.toContain(tile.label);
    expect(node.getAttribute('aria-label')).not.toContain(tile.label);
    expect(node.classList.contains(`tile-${tile.kind}`)).toBe(false);
    expect(node.querySelector('use')).toBeNull();
    expect(node.querySelector('.tile-number')!.textContent).toBe(String(tile.index+1).padStart(2,'0'));
  }
});
it('경유칸·중앙 문구·지도 선택·스크린리더에서 공개 전에 정체를 알 수 없다', () => {
  const g=game(), host=markup(g,{focusIndex:5,hopping:true,landed:true});
  expect(host.querySelector('.board-center')!.textContent).toContain('아직 모르는 칸');
  expect(host.querySelector('.board')!.getAttribute('aria-label')).not.toContain(boardTiles[5].label);
  expect(host.querySelector('.tile-fx')).toBeNull();
  const explore=document.createElement('div'); explore.innerHTML=renderExplore(g,5);
  expect(explore.querySelector('h2')!.textContent).toContain('아직 모르는 칸');
  expect(explore.querySelectorAll('option')).toHaveLength(24);
  expect(explore.querySelector('option[value="5"]')!.textContent).not.toContain(boardTiles[5].label);
  expect(explore.textContent).toContain('최종 도착하면');
});
it('공개 순간부터 최종 칸에 고유 색상 클래스·이름·아이콘이 함께 생기고, 떠난 뒤에도 유지한다', () => {
  const g=game(), reveal=markup(g,{focusIndex:4,hopping:true,revealIndex:4});
  const node=reveal.querySelector('[data-tile="4"]')!;
  expect(node.classList.contains('tile-life')).toBe(true);
  expect(node.querySelector('.tile-label')!.textContent).toBe('생활 사건');
  expect(node.querySelector('use')!.getAttribute('href')).toBe('#board-icon-life');
  expect(node.querySelector('.discovery-cover')).not.toBeNull();
  expect(g.route.visits).toEqual([]);
  const arrived=startTurn(g,4).state;
  expect([...revealedTiles(arrived)]).toEqual([0,4]);
  const left=markup({...arrived,position:8,route:{...arrived.route,visits:[4,8]}});
  expect(left.querySelector('[data-tile="4"]')!.classList.contains('tile-life')).toBe(true);
  expect(left.querySelectorAll('.discovery-cover')).toHaveLength(0);
  expect(left.querySelectorAll('.tile-hidden')).toHaveLength(21);
});
it('저장 규칙이 없는 c2/c3/c4는 모두 전체 공개, 새 판은 발견 상태를 복원한다', () => {
  for (const options of [{},{defaultTrading:true},{updatedFinance:true}]) {
    const old=createGame('old','balanced',500000,{...options,ghost:false});
    expect(parse(old)).not.toBeNull();
    expect(boardVisibilityOf(parse(old)!.game)).toBe('open-v1');
    expect(markup(parse(old)!.game).querySelectorAll('.tile-hidden')).toHaveLength(0);
  }
  const arrived=startTurn(game(),7).state;
  expect([...revealedTiles(parse(arrived)!.game)]).toEqual([0,7]);
  expect(parse({...arrived,boardVisibility:'future' as GameState['boardVisibility']})).toBeNull();
});
it('장 복기는 그 시점까지 도착했던 칸만 복원하며 저장 안의 서로 다른 공개 규칙을 거부한다', () => {
  const finished=autoplay('map-replay','steward','balanced',{updatedFinance:true,scenario:'classic',boardVisibility:'arrival-v1',automaticStamps:true});
  expect(parse(finished)).not.toBeNull();
  for (const turn of [3,6,9]) {
    const replay=replayChapter(finished,turn)!;
    expect(replay.boardVisibility).toBe('arrival-v1');
    expect([...revealedTiles(replay)]).toEqual([...new Set([0,...finished.campaign!.branches.find(b=>b.turn===turn)!.state.route.visits])]);
  }
  finished.campaign!.branches[0].state.boardVisibility='open-v1';
  expect(parse(finished)).toBeNull();
});
it('5개 성향 × 4개 시장의 12턴 금융·주사위·도장·점수 상태는 공개 방식에 영향받지 않는다', () => {
  const withoutDisplay=(g:GameState) => JSON.parse(JSON.stringify(g, (key,value)=>key==='boardVisibility'?undefined:value));
  for(const scenario of Object.keys(SCENARIOS) as Array<keyof typeof SCENARIOS>) for(const profile of investorProfiles) {
    const options={updatedFinance:true,scenario,automaticStamps:true,contributionPacing:true};
    const open=autoplay('unchanged-map','steward',profile.id,{...options,boardVisibility:'open-v1'});
    const hidden=autoplay('unchanged-map','steward',profile.id,{...options,boardVisibility:'arrival-v1'});
    expect(withoutDisplay(hidden)).toEqual(withoutDisplay(open));
  }
});

let root:HTMLElement;
const click=(action:string)=>root.querySelector<HTMLElement>(`[data-action="${action}"]`)!.click();
const saved=()=>parseCheckpoint(localStorage.getItem(CHECKPOINT_KEY))!;
function mount(g?:GameState, reducedMotion=false) {
  localStorage.setItem(STORAGE_KEY,JSON.stringify({...defaultSave,profileAssessment:{profileId:'balanced',origin:'confirmed'},disclaimerAccepted:true,howtoSeen:true,settings:{...defaultSave.settings,reducedMotion}}));
  if(g)localStorage.setItem(CHECKPOINT_KEY,JSON.stringify(checkpoint(g)));
  document.body.innerHTML='<div id="app"></div>'; root=document.querySelector('#app')!;
  new PensionRoadApp(root);
  if(g)click('resume-game');
}
beforeEach(()=>{
  localStorage.clear();
  // happy-dom은 WAAPI 완료를 진행하지 않아 브라우저의 재생 시간·취소 경계를 모의한다.
  vi.spyOn(Element.prototype,'animate').mockImplementation((_frames,options)=>{
    const duration=typeof options==='number'?options:Number(options?.duration ?? 0);
    let reject!: (error: Error)=>void;
    let timer: ReturnType<typeof setTimeout>;
    const finished=new Promise<Animation>((resolve,fail)=>{reject=fail;timer=setTimeout(()=>resolve({} as Animation),duration);});
    return {finished,cancel:()=>{clearTimeout(timer);reject(new Error('cancelled'));}} as Animation;
  });
});
afterEach(()=>{vi.restoreAllMocks();vi.useRealTimers();});
it('새 UI 판만 탐험 보드로 시작하고 캐릭터는 선택값을 유지한다', () => {
  mount(undefined,true);
  root.querySelector<HTMLElement>('[data-action="pick-avatar"][data-avatar="aggressive"]')!.click();
  click('begin');click('prepare-continue');click('confirm-default-option');
  expect(saved().game.boardVisibility).toBe('arrival-v1');expect(saved().game.avatarId).toBe('aggressive');
  expect(root.querySelectorAll('.tile-hidden')).toHaveLength(23);
  expect(root.querySelector('.board-discovery-progress')!.textContent).toContain('발견 1/24');
});
it('애니메이션 중에는 최종 칸도 가리고, 착지 후 공개 중에는 중복 입력·저장을 차단한 뒤 한 번만 정산한다', async () => {
  vi.useFakeTimers(); const g=game();mount(g);
  const before=saved(), faces=dicePairForTurn(g.seed,0),steps=faces[0]+faces[1];
  const board=root.querySelector('.board'), token=root.querySelector('.token-pos');
  click('roll-dice');
  const landingEnd=DICE_ROLL_DURATION_MS+DICE_LAND_HOLD_MS+(steps-1)*260+hopPlan(true).duration;
  await vi.advanceTimersByTimeAsync(landingEnd-1);
  expect(root.querySelector(`[data-tile="${steps}"]`)!.classList.contains('tile-hidden')).toBe(true);
  expect(saved().game).toEqual(before.game);
  await vi.advanceTimersByTimeAsync(1);
  expect(root.querySelector('.discovery-cover')).not.toBeNull();
  expect(root.querySelector('.board')).toBe(board); expect(root.querySelector('.token-pos')).toBe(token);
  expect(root.querySelector(`[data-tile="${steps}"]`)!.classList.contains(`tile-${boardTiles[steps].kind}`)).toBe(true);
  expect(saved().game).toEqual(before.game);
  // Synthetic double input exercises the handler guard, not only the disabled button.
  const duplicate=document.createElement('button');duplicate.dataset.action='roll-dice';root.append(duplicate);duplicate.click();
  await vi.advanceTimersByTimeAsync(TILE_REVEAL_MS);
  expect(saved().game).toEqual(startTurn(before.game,steps).state);
  expect(root.querySelectorAll('.tile-hidden')).toHaveLength(22);
  expect(root.querySelector('.discovery-cover')).toBeNull();
});
it('공개 중 탭을 숨기면 임시 공개를 취소하고 재개 시 같은 주사위·금융 상태로 한 번만 진행한다', async () => {
  vi.useFakeTimers();const g=game('map-cancel');mount(g);
  const faces=dicePairForTurn(g.seed,0),steps=faces[0]+faces[1];click('roll-dice');
  await vi.advanceTimersByTimeAsync(DICE_ROLL_DURATION_MS+DICE_LAND_HOLD_MS+(steps-1)*260+hopPlan(true).duration);
  expect(root.querySelector('.discovery-cover')).not.toBeNull();
  const hidden=vi.spyOn(document,'hidden','get').mockReturnValue(true);
  document.dispatchEvent(new Event('visibilitychange'));hidden.mockRestore();
  await vi.runAllTimersAsync();expect(saved().game).toEqual(g);
  expect(root.querySelectorAll('.tile-hidden')).toHaveLength(23);
  mount(saved().game,true);click('roll-dice');
  expect(saved().game).toEqual(startTurn(g,steps).state);
  expect(root.querySelector('.discovery-cover')).toBeNull();
});
it('이미 공개된 최종 칸은 공개 애니메이션을 반복하지 않는다', async () => {
  vi.useFakeTimers();const g=game('map-revisit');const faces=dicePairForTurn(g.seed,0),steps=faces[0]+faces[1];
  g.route.visits=[steps];mount(g);click('roll-dice');
  await vi.advanceTimersByTimeAsync(DICE_ROLL_DURATION_MS+DICE_LAND_HOLD_MS+(steps-1)*260+hopPlan(true).duration);
  expect(saved().game.turn).toBe(1);expect(root.querySelector('.discovery-cover')).toBeNull();
  expect(revealedTiles(saved().game).size).toBe(2);
});
it('같은 시드 재도전은 이전 보드 규칙을 유지하고 새 시드는 탐험 보드를 쓴다',()=>{
  mount(createGame('old-retry','balanced',500000,{updatedFinance:true,ghost:false}),true);
  const button=document.createElement('button');button.dataset.action='same-seed';root.append(button);button.click();
  click('prepare-continue');click('confirm-default-option');expect(saved().game.boardVisibility).toBe('open-v1');
  const fresh=document.createElement('button');fresh.dataset.action='new-seed';root.append(fresh);fresh.click();click('prepare-continue');click('confirm-default-option');expect(saved().game.boardVisibility).toBe('arrival-v1');
});
