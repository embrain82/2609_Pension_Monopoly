import {describe,it,expect} from 'vitest';
import {createGame,autoplay} from '../src/engine/game-engine';
import {eligibleRegions,stampVisit,reflectRegion,validRoute} from '../src/engine/route-engine';
import {parseCheckpoint, type PlayCheckpoint} from '../src/ui/play-checkpoint';
import {replayChapter, type MissionId, type ScenarioId} from '../src/engine/scenario-engine';
import {calculateScore} from '../src/engine/scoring-engine';
const base=()=>createGame('collect-p2','balanced',500000,{automaticStamps:true,defaultTrading:true,scenario:'classic',ghost:false});
const save=(g=base()):PlayCheckpoint=>({version:'c3',game:g,modal:null,lastSummary:null,quizCardId:null,quizPicked:null,finalQuizQueue:[],finalQuizTotal:0,finishing:false,defaultOptionAsk:false});
describe('F09 새 판 자동 도장',()=>{
 it('서로 다른 두 칸, 지역별 1회이며 재방문·재렌더로 중복 발급하지 않는다',()=>{
  let g=base();g=stampVisit({...g,position:1});const same=stampVisit(g);expect(same).toBe(g);expect(g.route.badges).toEqual([]);
  g=stampVisit({...g,position:2});expect(g.route.badges).toEqual([0]);expect(stampVisit(g)).toBe(g);expect(g.logs.filter(l=>l.type==='region')).toHaveLength(1);
  expect(eligibleRegions([1,1,-1,25])).toEqual([]);
 });
 it('네 지역을 방문하면 매수·이유 선택 없이 네 도장을 받고 금융 상태는 보존한다',()=>{
  let g=base();const before=calculateScore(g);
  for(const i of [0,1,6,7,12,13,18,19])g=stampVisit({...g,position:i});
  expect(g.route.badges).toEqual([0,1,2,3]);expect(g.route.reflections).toEqual([]);expect(validRoute(g.route)).toBe(true);expect(calculateScore(g)).toEqual(before);expect(g.holdings).toEqual(base().holdings);expect(g.actionsLeft).toBe(base().actionsLeft);
 });
 it('이유는 완주 후 선택 복기이며 기존 도장·점수·자금을 바꾸지 않는다',()=>{
  let g=stampVisit(stampVisit({...base(),position:0}));g=stampVisit({...g,position:1});
  expect(reflectRegion(g,0,1).ok).toBe(false);g={...g,status:'finished'};
  const once=reflectRegion(g,0,1);expect(once.ok).toBe(true);expect(once.state.route.badges).toEqual(g.route.badges);expect(calculateScore(once.state)).toEqual(calculateScore(g));expect(reflectRegion(once.state,0,2).ok).toBe(false);
 });
 it('기존 판에는 자동 획득을 소급하지 않고 c3 자동 판은 새로고침 후 보존한다',()=>{
  const legacy=createGame('old','balanced',500000,{defaultTrading:true,scenario:'classic',ghost:false});
  const old=stampVisit({...legacy,route:{...legacy.route,visits:[0]},position:1});expect(old.route.badges).toEqual([]);expect(reflectRegion(old,0,0).ok).toBe(true);
  const current=stampVisit(stampVisit({...base(),position:1}));const roundtrip=parseCheckpoint(JSON.stringify(save(current)))!;expect(roundtrip.game).toEqual(current);
  for(const route of [{...current.route,version:'bad'},{...current.route,visits:[1,1]},{...current.route,badges:[0]},{...current.route,visits:[0,1]}])expect(parseCheckpoint(JSON.stringify(save({...current,route} as typeof current)))).toBeNull();
 });
 it('분기 연습은 자동 규칙과 도장을 이어받고 새 획득은 그 연습의 기록만 바꾼다',()=>{
  const g=autoplay('p2-branch','steward','balanced',{automaticStamps:true,defaultTrading:true,scenario:'classic'});
  expect(parseCheckpoint(JSON.stringify(save(g)))).not.toBeNull();
  const before=structuredClone(g),practice=replayChapter(g,6)!;
  expect(practice.campaign!.practice).toBe(true);expect(practice.route.version).toBe('auto-v1');expect(validRoute(practice.route)).toBe(true);
  stampVisit({...practice,position:22});expect(g).toEqual(before);
 });
 it('80가지 시장·미션 경로에서 자동 도장이 자금·주문·별·수익률·RNG를 바꾸지 않는다',()=>{
  const scenarios:ScenarioId[]=['classic','inflation','recession','recovery'];
  for(let i=0;i<80;i++){
   const options={defaultTrading:true,contributionPacing:true,scenario:scenarios[i%4],mission:(['pension','purchasing','cushion'] as MissionId[])[i%3]};
   const old=autoplay(`p2-parity-${i}`,'steward','balanced',options),g=autoplay(`p2-parity-${i}`,'steward','balanced',{...options,automaticStamps:true});
   for(const key of ['cash','irpCash','holdings','pendingOrders','accountBasis','marketPath','irpHistory','rngState','cashFlows','livingDebt'] as const)expect(g[key],`${i}/${key}`).toEqual(old[key]);
   expect(calculateScore(g)).toEqual(calculateScore(old));expect([...g.route.badges].sort()).toEqual(eligibleRegions(g.route.visits));expect(validRoute(g.route)).toBe(true);
  }
 });
});
