import {defaultScopes} from '../src/engine/position-engine';
import {nextDefaultCommand} from '../src/engine/default-trade-engine';
import {suggestDefaultOption} from '../src/engine/default-option';
import { validDefaultLedger } from '../src/ui/default-checkpoint';
import { writeFileSync } from 'node:fs';
import { autoplay,createGame,startTurn,performAction,resolveLifeEvent,type AutoStrategy,type GameAction } from '../src/engine/game-engine';
import { SCENARIOS,MISSIONS,missionResult,type ScenarioId,type MissionId } from '../src/engine/scenario-engine';
import { calculateScore } from '../src/engine/scoring-engine';
import type { ProfileId } from '../src/types';
const strategies:AutoStrategy[]=['passive','contributor','balanced','steward','growth','etfOnly','stopLoss','momentum','newsChaser','defaultOption','withdrawer'];
const profiles:ProfileId[]=['stable','stableGrowth','balanced','growth','aggressive'];
const rows:Array<{scenario:ScenarioId;profile:ProfileId;strategy:AutoStrategy;games:number;wins:Record<MissionId,number>;meanStars:number;meanReturn:number;meanRealIndex:number;meanNetCash:number}>=[];let games=0;
for(const scenario of Object.keys(SCENARIOS) as ScenarioId[]) for(const profile of profiles) for(const strategy of strategies) {
  let stars=0,real=0,cash=0,ret=0;const wins={pension:0,cushion:0,purchasing:0};
  for(let n=0;n<20;n++) {
    const g=autoplay('d-matrix-'+n,strategy,profile,{scenario,defaultTrading:true});
    if(g.turn!==12||g.status!=='finished'||g.pendingOrders.length||!Number.isFinite(g.campaign!.index)||g.campaign!.reviews.length!==12) throw Error('Invalid run');
    if(!validDefaultLedger(g)||g.campaign!.branches.some(b=>!validDefaultLedger(b.state))) throw Error('Invalid ownership ledger');
    const score=calculateScore(g);stars+=score.stars;ret+=score.investmentReturnRate;real+=g.campaign!.index/g.campaign!.priceIndex;cash+=g.cash-g.livingDebt;
    for(const mission of Object.keys(MISSIONS) as MissionId[]) wins[mission]+=Number(missionResult({...g,campaign:{...g.campaign!,mission}},score.monthlyPension).passed);
    games++;
  }
  rows.push({scenario,profile,strategy,games:20,wins,meanStars:stars/20,meanReturn:ret/20,meanRealIndex:real/20,meanNetCash:cash/20});
}
const extraModes=['partial','mixed','lastTurn'] as const;
let extraGames=0;
for(const scenario of Object.keys(SCENARIOS) as ScenarioId[]) for(const profile of profiles) for(const mode of extraModes) for(let n=0;n<20;n++) {
  let g=createGame('e-extra-'+n,profile,500000,{ghost:false,scenario,defaultTrading:true,defaultOption:suggestDefaultOption(profile,true)});
  while(g.status==='playing') {
    g=startTurn(g,3).state;
    if(g.currentEventId) g=resolveLifeEvent(g,'cash').state;
    while(g.awaitingAction) {
      const scope=defaultScopes(g)[0];
      let a:GameAction={kind:'hold'};
      if(mode==='lastTurn'&&g.turn<12) a={kind:'contribute',amount:100000};
      else if(mode==='partial'&&scope&&g.turn%3===0&&!g.pendingOrders.some(o=>o.defaultScope)) a={kind:'default-opt-out',fraction:.5,commandId:nextDefaultCommand(g)};
      else if(mode==='mixed'&&g.turn%3===0&&g.irpCash>=100000) a={kind:'buy',productId:'tdf',amount:100000};
      else if(g.irpCash>=100000) a={kind:'default-opt-in',optionId:g.defaultOption!,amount:Math.floor(g.irpCash),commandId:nextDefaultCommand(g)};
      else a={kind:'contribute',amount:100000};
      const r=performAction(g,a);g=r.ok?r.state:performAction(g,{kind:'hold'}).state;
      if(!validDefaultLedger(g)||!Number.isFinite(g.campaign!.index)||g.irpCash<0) throw Error(`Invalid ${mode} ownership at ${g.turn}`);
    }
  }
  if(g.pendingOrders.length||g.rebalancePlan||g.campaign!.reviews.length!==12||g.campaign!.branches.some(b=>!validDefaultLedger(b.state))) throw Error('Incomplete custom run');
  extraGames++;
}
const report={version:'1.5.0',seeds:20,games:games+extraGames,baselineGames:games,extraGames,extraModes,scenarios:4,profiles:5,strategies:11,rows};
writeFileSync('docs/implementation/2026-09-10-default-trading-matrix.json',JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({games:games+extraGames,baselineGames:games,extraGames,errors:0,leaders:Object.keys(MISSIONS).map(mission=>({mission,strategies:strategies.map(strategy=>({strategy,wins:rows.filter(r=>r.strategy===strategy).reduce((s,r)=>s+r.wins[mission as MissionId],0)})).sort((a,b)=>b.wins-a.wins)}))},null,2));
