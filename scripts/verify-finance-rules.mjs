import assert from 'node:assert/strict';
import {writeFileSync} from 'node:fs';
import {fileURLToPath,URL} from 'node:url';
import {log} from 'node:console';
const root=fileURLToPath(new URL('..',import.meta.url)).replace(/\/$/,'');
const {createGame,startTurn,autoplay}=await import(root+'/src/engine/game-engine.ts');
const {riskAssetRatio}=await import(root+'/src/engine/policy-engine.ts');
const {portfolioValue}=await import(root+'/src/engine/portfolio-engine.ts');
const {SCENARIOS}=await import(root+'/src/engine/scenario-engine.ts');
const {parseCheckpoint,checkpointVersion}=await import(root+'/src/ui/play-checkpoint.ts');
const rows=[],opening=[];
for(const scenario of Object.keys(SCENARIOS)){
 let high=0,max=0;
 for(let i=0;i<1000;i++){
  const g=startTurn(createGame(`opening-risk-plan-${i}`,'aggressive',500000,{scenario,updatedFinance:true,ghost:false}),1).state;
  const risk=riskAssetRatio(g);high+=risk>.7?1:0;max=Math.max(max,risk);
 }
 assert.equal(high,0);opening.push({scenario,n:1000,over70:high,maxRiskPct:max*100});
 for(const strategy of ['passive','contributor','growth','balanced']){
  const sample=[];
  for(let i=0;i<100;i++){
   const g=autoplay(`d4-finance-${i}`,strategy,'aggressive',{scenario,updatedFinance:true,contributionPacing:true,automaticStamps:true,settlementLearning:true});
   assert.equal(g.turn,12);assert.equal(g.status,'finished');assert.equal(g.financeRules.lastInterestTurn,12);
   assert.equal(g.pendingOrders.length,0);
   assert(parseCheckpoint(JSON.stringify({version:checkpointVersion(g),game:g,modal:null,lastSummary:null,quizCardId:null,quizPicked:null,finalQuizQueue:[],finalQuizTotal:0,finishing:false,defaultOptionAsk:false})));
   const interest=g.campaign.branches.map(b=>b.state.ledger.cashInterest.amount);assert(interest.every(x=>Number.isFinite(x)&&x>=0));
   sample.push({irp:portfolioValue(g),cash:g.cash,contributed:g.contributionTotal,index:g.campaign.index});
  }
  const avg=k=>sample.reduce((s,g)=>s+g[k],0)/sample.length;
  rows.push({scenario,strategy,n:sample.length,meanIrp:avg('irp'),meanCash:avg('cash'),meanContributed:avg('contributed'),meanInvestmentIndex:avg('index')});
 }
}
const report={version:'1.10.0',opening,strategies:rows,completedGames:1600,method:'100 paired seeds per strategy and scenario; same life-cash choice. Deterministic engine checks, not browser plays or representative win rates. contributor leaves contributions in cash; passive retains starting products, growth alternates contribution/ETF purchases, balanced contributes/rebalances. IRP totals include external contributions; investment index is separated.',limitations:'Risk buffer reduces sampled first-turn breaches; it does not guarantee all later markets remain below 70%. Cash can legitimately perform better in falling markets; no universal strategy superiority is asserted.'};
writeFileSync(root+'/docs/implementation/2026-09-15-design-d4/finance-matrix.json',JSON.stringify(report,null,2)+'\n');log(JSON.stringify(report));
