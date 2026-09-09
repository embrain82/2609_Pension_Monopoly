import { describe,it,expect } from 'vitest';
import { createGame,autoplay,startTurn,performAction } from '../src/engine/game-engine';
import { tdfEquity,SCENARIOS,scenarioConfig,withGlidePath,inflatedEvent,replayChapter,missionResult,type ScenarioId } from '../src/engine/scenario-engine';
import { beginPerformance,finishPerformance } from '../src/engine/performance-engine';
import { generateMarketPath } from '../src/engine/market-engine';
import { calculateScore,knowledgeScoreOf } from '../src/engine/scoring-engine';
import { applyGoalToGame } from '../src/engine/goal';
import { applyProfileToGame } from '../src/engine/profile-engine';
import { learningCards,lifeEvents } from '../src/data/content';
import { parseCheckpoint,type PlayCheckpoint } from '../src/ui/play-checkpoint';
import { actionLesson } from '../src/engine/quiz-engine';
const game=()=>createGame('d-proof','balanced',500000,{scenario:'classic',ghost:false});
const snapshot=(g=game()):PlayCheckpoint=>({version:'c2',game:g,modal:null,lastSummary:null,quizCardId:null,quizPicked:null,finalQuizQueue:[],finalQuizTotal:0,finishing:false,defaultOptionAsk:false});
describe('D 시장·성과·복기',()=>{
  it('시나리오별 결정성과 기존 판의 경로를 보존한다',()=>{
    const legacy=createGame('same','balanced',500000,{ghost:false});
    expect(legacy.marketPath).toEqual(generateMarketPath('same'));
    const paths=Object.keys(SCENARIOS).map(id=>{
      const a=createGame('same','balanced',500000,{scenario:id as ScenarioId,ghost:false});
      expect(a.marketPath).toEqual(createGame('same','balanced',500000,{scenario:id as ScenarioId,ghost:false}).marketPath);
      return JSON.stringify(a.marketPath);
    });
    expect(new Set(paths).size).toBe(4);
  });
  it('TDF 비중은 감소하고 수익은 기간 시작 비중을 사용한다',()=>{
    const raw=generateMarketPath('tdf'),path=withGlidePath(raw);
    expect(tdfEquity(0)).toBe(.45);expect(tdfEquity(12)).toBeCloseTo(.25);
    for(let t=1;t<=12;t++) {
      expect(tdfEquity(t)).toBeLessThan(tdfEquity(t-1));
      const s=raw[t-1],w=tdfEquity(t-1),b=(.85-w)/2;
      expect(path[t-1].returns.tdf).toBeCloseTo(w*s.returns.equityEtf+b*(s.returns.shortBond+s.returns.longBond)+.15*s.returns.deposit);
    }
  });
  it('가격 불변 시 납입·이전·인출 자체는 운용수익과 낙폭이 아니다',()=>{
    for(const flow of [1000000,6000000,-1000000]) {
      let g=game();g={...g,turn:1};
      g=beginPerformance(g,g);
      g={...g,irpCash:g.irpCash+flow,cashFlows:[{turn:1,kind:flow<0?'withdrawal':'contribution',amount:flow}]};
      g=finishPerformance(g);
      expect(g.campaign!.index).toBe(1);expect(g.maxDrawdown).toBe(0);
      expect(calculateScore(g).investmentReturnRate).toBe(0);
      expect(g.campaign!.reviews[0].flow).toBe(flow);
    }
  });
  it('외부유입 뒤 가격 하락은 새 원본의 비율로 계산한다',()=>{
    let g=game();g={...g,turn:1};g=beginPerformance(g,g);
    g={...g,irpCash:108000000,cashFlows:[{turn:1,kind:'contribution',amount:108000000}]};
    g=finishPerformance(g);
    const before={...g,turn:2},after={...before,holdings:before.holdings.map(h=>({...h,amount:h.amount*.9})),irpCash:before.irpCash*.9};
    const next=beginPerformance(before,after);
    expect(next.campaign!.index).toBeCloseTo(.9);expect(next.maxDrawdown).toBeCloseTo(.1);
  });
  it('물가 누적은 비용과 구매력을 바꾸지만 원본 사건을 변경하지 않는다',()=>{
    const g=game();g.campaign!.priceIndex=1.5;
    const event=lifeEvents.find(e=>e.kind==='cost')!,cost=event.cost;
    expect(inflatedEvent(g,event).cost).toBe(Math.round(cost*1.5));expect(event.cost).toBe(cost);
    g.campaign!.mission='purchasing';expect(missionResult(g,1000000).passed).toBe(false);
  });
  it('주간 조건과 시작 목표·성향은 고정된다',()=>{
    const g=createGame('weekly-test','aggressive',700000,{weekly:true,scenario:'recovery',mission:'cushion',ghost:false});
    expect(g.profileId).toBe('balanced');expect(g.goalMonthly).toBe(500000);
    expect(g.campaign!.scenario).toBe('classic');expect(g.campaign!.mission).toBe('pension');
    expect(applyGoalToGame(g,350000)).toBe(g);expect(applyProfileToGame(g,'aggressive')).toBe(g);
  });
  it('거래 횟수로 지식 점수를 올릴 수 없고 성공 행동 학습을 연결한다',()=>{
    const g=game();expect(knowledgeScoreOf({...g,rebalanceCount:100,understandingPoints:100})).toBe(knowledgeScoreOf(g));
    const active=startTurn(g,1).state,result=performAction(active,{kind:'contribute'});
    expect(result.state.pendingQuizCardId).toBe('contribution-limit');
    expect(actionLesson(g,'sell').pendingQuizCardId).toBe('sale-vs-withdrawal');
    for(const c of learningCards) {expect(c.learningObjective).toBeTruthy();expect(c.gameAssumption).toBeTruthy();expect(c.quiz.options[c.quiz.answer]).toBeTruthy();}
  });
  it('시나리오 완주·4장 기록·분기 복원·저장 왕복',()=>{
    for(const id of Object.keys(SCENARIOS) as ScenarioId[]) {
      const g=autoplay('d-full','steward','balanced',{scenario:id});
      expect(g.turn).toBe(12);expect(g.pendingOrders).toHaveLength(0);
      expect(g.campaign!.reviews).toHaveLength(12);expect(g.campaign!.reviews.filter(r=>r.chapter)).toHaveLength(4);
      expect(g.campaign!.branches.map(b=>b.turn)).toEqual([3,6,9]);
      const branch=replayChapter(g,6)!;expect(branch.turn).toBe(6);expect(branch.status).toBe('playing');expect(branch.campaign!.practice).toBe(true);
      expect(branch.marketPath).toEqual(g.marketPath);expect(branch.campaign!.reviews).toHaveLength(6);
      const raw=JSON.stringify(snapshot(branch));expect(raw.length).toBeLessThan(1000000);
      expect(parseCheckpoint(raw)!.game).toEqual(branch);
      expect(parseCheckpoint(JSON.stringify(snapshot({...branch,campaign:{...branch.campaign!,priceIndex:-1}})))).toBeNull();
    }
  });
  it('조건부 전망 경로는 현재 상태에서 시작하고 실제 미래를 참조하지 않는다',()=>{
    const g=game(),origin={...g.marketPath[4],ratePct:5};
    const path=generateMarketPath('new-fork',scenarioConfig('inflation'),origin);
    expect(path[0].turn).toBe(6);expect(path).toHaveLength(7);
    expect(path[0].ratePct).toBeGreaterThanOrEqual(4);
  });
});
