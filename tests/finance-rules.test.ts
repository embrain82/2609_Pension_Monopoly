import { nextDefaultCommand } from '../src/engine/default-trade-engine';
import { expect, it } from 'vitest';
import { createGame, startTurn, performAction, resolveLifeEvent, autoplay } from '../src/engine/game-engine';
import { accrueWaitingCash, validFinanceRules } from '../src/engine/finance-rules';
import { investorProfiles } from '../src/data/content';
import { riskAssetRatio } from '../src/engine/policy-engine';
import { portfolioValue, buyProduct, settleAllOrders, sellProduct } from '../src/engine/portfolio-engine';
import { sourceBalances } from '../src/engine/account-engine';
import { replayChapter, SCENARIOS } from '../src/engine/scenario-engine';
import { parseCheckpoint, checkpointVersion, type PlayCheckpoint } from '../src/ui/play-checkpoint';
import { renderPortfolio } from '../src/ui/portfolio-view';
import { renderSettlementModal } from '../src/ui/settlement';
import type { GameState } from '../src/types';

const make=()=>createGame('finance-rules','aggressive',500000,{scenario:'classic',updatedFinance:true,ghost:false,contributionPacing:true});
const pack=(game:GameState):PlayCheckpoint=>({version:checkpointVersion(game),game,modal:null,lastSummary:null,quizCardId:null,quizPicked:null,finalQuizQueue:[],finalQuizTotal:0,finishing:false,defaultOptionAsk:false});
const restore=(game:GameState)=>parseCheckpoint(JSON.stringify(pack(game)))!.game;
function closeTurn(game:GameState) {
 if(game.currentEventId)game=resolveLifeEvent(game,'cash').state;
 while(game.awaitingAction)game=performAction(game,{kind:'hold'}).state;
 return game;
}

it('신규·기존 배분은 원금·적합성을 보존하고 새 공격투자형만 65%로 시작한다',()=>{
 for(const p of investorProfiles){
  const old=createGame('finance-rules',p.id,500000,{ghost:false,scenario:'classic',defaultTrading:true});
  const fresh=createGame('finance-rules',p.id,500000,{ghost:false,scenario:'classic',updatedFinance:true});
  expect(portfolioValue(fresh)).toBe(108000000);expect(fresh.accountBasis).toEqual(old.accountBasis);expect(fresh.cash).toBe(old.cash);
  expect(fresh.financeRules!.startingAllocation).toEqual(Object.fromEntries(Object.keys(p.startingAllocation).map(id=>[id,(fresh.holdings.find(h=>h.productId===id)?.amount??0)/108000000])));
  if(p.id==='aggressive'){expect(riskAssetRatio(old)).toBeCloseTo(.7);expect(riskAssetRatio(fresh)).toBeCloseTo(.65);}
  else expect(fresh.holdings).toEqual(old.holdings);
  expect(restore(fresh)).toEqual(fresh);expect(restore(old)).toEqual(old);
 }
});

it.each(Object.keys(SCENARIOS) as Array<keyof typeof SCENARIOS>)('새 공격투자형의 첫 시장 %s는 표본에서 위험한도 여유가 있다',scenario=>{
 for(let i=0;i<50;i++){
  const fresh=createGame(`opening-risk-plan-${i}`,'aggressive',500000,{scenario,updatedFinance:true,ghost:false});
  expect(riskAssetRatio(startTurn(fresh,1).state)).toBeLessThan(.7);
 }
});

it.each([0,.5,10000000,2000000000])('턴 시작 현금 %s원에 한 번만 이자를 지급하며 외부 납입으로 분류하지 않는다',amount=>{
 const before={...make(),irpCash:amount};const next=startTurn(before,1).state;
 expect(next.ledger.cashInterest).toEqual({turn:1,opening:amount,rate:.001,amount:amount*.001});
 expect(next.irpCash).toBeCloseTo(amount*1.001,5);expect(next.accountBasis).toEqual(before.accountBasis);expect(next.cashFlows).toEqual([]);
 expect(next.contributionTotal).toBe(0);expect(next.taxCreditBenefit).toBe(0);
 expect(accrueWaitingCash(next)).toBe(next);expect(restore(next)).toEqual(next);
 expect(startTurn(next,1).ok).toBe(false);expect(startTurn(next,1).state).toBe(next);
});

it('그 턴 추가납입은 다음 턴부터 이자를 얻고 정산 총액에 정확히 포함된다',()=>{
 let g=startTurn(make(),1).state;if(g.currentEventId)g=resolveLifeEvent(g,'cash').state;
 const result=performAction(g,{kind:'contribute',amount:2000000});expect(result.ok).toBe(true);
 g=closeTurn(result.state);const basis=structuredClone(g.accountBasis),opening=g.irpCash;
 const next=startTurn(restore(g),1).state;expect(next.ledger.cashInterest!.amount).toBeCloseTo(opening*.001);
 expect(next.accountBasis).toEqual(basis);expect(next.contributionTotal).toBe(g.contributionTotal);
 let active=next;if(active.currentEventId)active=resolveLifeEvent(active,'cash').state;
 const finish=performAction(active,{kind:'hold'});const summary=finish.summary!;
 expect(summary.cashInterest).toEqual(next.ledger.cashInterest);
 expect(summary.irpAfter-summary.irpOpen).toBeCloseTo(summary.marketDelta+summary.capitalFlow!+summary.tradingDelta!,5);
 expect(summary.marketDelta).toBeCloseTo(summary.marketEffects!.reduce((s,e)=>s+e.delta,0)+summary.cashInterest!.amount,5);
 expect(renderSettlementModal(summary,{characters:false})).toContain('대기자금 이자');
 expect(renderPortfolio(next)).toContain('턴당 0.1%');
 const without=portfolioValue(next)-next.ledger.cashInterest!.amount;
 expect(sourceBalances(portfolioValue(next),basis).earnings-sourceBalances(without,basis).earnings).toBeCloseTo(next.ledger.cashInterest!.amount,5);
});

it('미결제 매수·매도는 대기 이자에서 제외하며 결제 이후 현금만 다음 턴에 포함한다',()=>{
 const before={...make(),irpCash:2000000};
 const bought=buyProduct(before,'balanced',2000000).state;expect(bought.irpCash).toBe(0);expect(bought.pendingOrders.length).toBeGreaterThan(0);
 expect(startTurn(bought,1).state.ledger.cashInterest!.amount).toBe(0);
 const sold=sellProduct(make(),'balanced',2000000).state;expect(sold.pendingOrders.length).toBeGreaterThan(0);
 const t1=closeTurn(startTurn(sold,1).state);expect(t1.ledger.cashInterest!.amount).toBe(0);
 const t2=closeTurn(startTurn(t1,1).state);expect(t2.ledger.cashInterest!.amount).toBe(0);expect(t2.irpCash).toBeGreaterThan(0);
 expect(startTurn(t2,1).state.ledger.cashInterest!.amount).toBeCloseTo(t2.irpCash*.001);
});

it('새 규칙에서도 옵트인 거래가 허용되고 마지막 정산은 추가 이자를 만들지 않는다',()=>{
 let g=startTurn({...make(),irpCash:2000000},1).state;if(g.currentEventId)g=resolveLifeEvent(g,'cash').state;
 const result=performAction(g,{kind:'default-opt-in',optionId:'highRisk',amount:1000000,commandId:nextDefaultCommand(g)});
 expect(result.ok).toBe(true);expect(result.state.defaultTrading!.groups).toHaveLength(1);expect(restore(result.state)).toEqual(result.state);
 const done=autoplay('finance-final','balanced','aggressive',{scenario:'classic',updatedFinance:true,contributionPacing:true});
 expect(done.financeRules!.lastInterestTurn).toBe(12);expect(restore(done)).toEqual(done);
 const settled=settleAllOrders(done);expect(settled.ledger.cashInterest).toEqual(done.ledger.cashInterest);
 expect(startTurn(done).ok).toBe(false);
});

it('고스트·분기·새로고침은 원래 금융 규칙을 유지한다',()=>{
 const g=createGame('finance-ghost','aggressive',500000,{scenario:'classic',updatedFinance:true});
 const reference=autoplay('finance-ghost','passive','aggressive',{scenario:'classic',updatedFinance:true});
 expect(g.ghost!.irpHistory).toEqual(reference.irpHistory);
 const fork=replayChapter(restore(reference),3)!;expect(fork.financeRules!.version).toBe('f1');expect(restore(fork)).toEqual(fork);
 let resumed=fork;while(resumed.turn<12)resumed=closeTurn(startTurn(resumed,1).state);
 expect(resumed.financeRules!.lastInterestTurn).toBe(12);
 const old=autoplay('finance-ghost','passive','aggressive',{scenario:'classic',defaultTrading:true});
 expect(replayChapter(restore(old),3)!.financeRules).toBeUndefined();
 const legacy=startTurn({...createGame('old','stable',500000,{ghost:false,scenario:'classic',defaultTrading:true}),irpCash:10000000},1).state;
 expect(legacy.irpCash).toBe(10000000);expect(legacy.ledger.cashInterest).toBeUndefined();
});

it('손상된 이자·버전·배분·분기 규칙은 이어하기에서 거부한다',()=>{
 const base=autoplay('finance-corrupt','balanced','aggressive',{scenario:'classic',updatedFinance:true});
 for(const mutate of [
  (g:GameState)=>{g.financeRules!.cashRatePerTurn=-.1;},
  (g:GameState)=>{g.financeRules!.lastInterestTurn=11;},
  (g:GameState)=>{g.financeRules!.startingAllocation.deposit=.3;},
  (g:GameState)=>{g.ledger.cashInterest!.amount+=1;},
  (g:GameState)=>{g.campaign!.branches[0].state.financeRules!.cashRatePerTurn=1;},
  (g:GameState)=>{g.campaign!.branches[0].state.rulesetVersion='2026-09-10-e';}
 ]){const corrupt=structuredClone(base);mutate(corrupt);expect(parseCheckpoint(JSON.stringify(pack(corrupt)))).toBeNull();}
 expect(parseCheckpoint(JSON.stringify({...pack(base),version:'c3'}))).toBeNull();
 expect(validFinanceRules({...base,financeRules:undefined})).toBe(false);
});
