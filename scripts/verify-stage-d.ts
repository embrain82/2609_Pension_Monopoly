import { writeFileSync } from 'node:fs';
import { autoplay,type AutoStrategy } from '../src/engine/game-engine';
import { SCENARIOS,MISSIONS,missionResult,type ScenarioId,type MissionId } from '../src/engine/scenario-engine';
import { calculateScore } from '../src/engine/scoring-engine';
import type { ProfileId } from '../src/types';
const strategies:AutoStrategy[]=['passive','contributor','balanced','steward','growth','etfOnly','stopLoss','momentum','newsChaser','defaultOption','withdrawer'];
const profiles:ProfileId[]=['stable','stableGrowth','balanced','growth','aggressive'];
const rows:Array<{scenario:ScenarioId;profile:ProfileId;strategy:AutoStrategy;games:number;wins:Record<MissionId,number>;meanStars:number;meanReturn:number;meanRealIndex:number;meanNetCash:number}>=[];let games=0;
for(const scenario of Object.keys(SCENARIOS) as ScenarioId[]) for(const profile of profiles) for(const strategy of strategies) {
  let stars=0,real=0,cash=0,ret=0;const wins={pension:0,cushion:0,purchasing:0};
  for(let n=0;n<20;n++) {
    const g=autoplay('d-matrix-'+n,strategy,profile,{scenario});
    if(g.turn!==12||g.status!=='finished'||g.pendingOrders.length||!Number.isFinite(g.campaign!.index)||g.campaign!.reviews.length!==12) throw Error('Invalid run');
    const score=calculateScore(g);stars+=score.stars;ret+=score.investmentReturnRate;real+=g.campaign!.index/g.campaign!.priceIndex;cash+=g.cash-g.livingDebt;
    for(const mission of Object.keys(MISSIONS) as MissionId[]) wins[mission]+=Number(missionResult({...g,campaign:{...g.campaign!,mission}},score.monthlyPension).passed);
    games++;
  }
  rows.push({scenario,profile,strategy,games:20,wins,meanStars:stars/20,meanReturn:ret/20,meanRealIndex:real/20,meanNetCash:cash/20});
}
const report={version:'1.4.0',seeds:20,games,scenarios:4,profiles:5,strategies:11,rows};
writeFileSync('docs/implementation/2026-09-10-stage-d-matrix.json',JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({games,errors:0,leaders:Object.keys(MISSIONS).map(mission=>({mission,strategies:strategies.map(strategy=>({strategy,wins:rows.filter(r=>r.strategy===strategy).reduce((s,r)=>s+r.wins[mission as MissionId],0)})).sort((a,b)=>b.wins-a.wins)}))},null,2));
