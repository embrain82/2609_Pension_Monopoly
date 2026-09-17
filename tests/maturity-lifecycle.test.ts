import { expect, it } from 'vitest';
import { createGame, startTurn, performAction, resolveLifeEvent, setDefaultOption, autoplay } from '../src/engine/game-engine';
import { advanceDefaultLifecycle, matureDeposits, presentMaturityNotices } from '../src/engine/default-lifecycle';
import { automaticDefaultPurchase, nextDefaultCommand } from '../src/engine/default-trade-engine';
import { buyProduct, portfolioValue, settleAllOrders, sellProduct } from '../src/engine/portfolio-engine';
import { positionsOf, scopedHolding, defaultScopes } from '../src/engine/position-engine';
import { activeCycle } from '../src/engine/maturity-cash';
import { accrueWaitingCash } from '../src/engine/finance-rules';
import { replayChapter, SCENARIOS } from '../src/engine/scenario-engine';
import { checkpointVersion, parseCheckpoint } from '../src/ui/play-checkpoint';
import { validDefaultLifecycle } from '../src/ui/maturity-checkpoint';
import { investorProfiles } from '../src/data/content';
import type { DefaultOptionId, GameState } from '../src/types';

const make = (option: DefaultOptionId|null = 'midRisk') => createGame('maturity-regression','aggressive',500000,
 {defaultLifecycle:true,defaultOption:option,scenario:'classic',settlementLearning:true,contributionPacing:true,ghost:false});
const pack=(game:GameState)=>JSON.stringify({version:checkpointVersion(game),game,modal:null,lastSummary:null,quizCardId:null,quizPicked:null,finalQuizQueue:[],finalQuizTotal:0,finishing:false,defaultOptionAsk:false});
const restore=(g:GameState)=>{const parsed=parseCheckpoint(pack(g));expect(parsed,`restore turn ${g.turn}`).not.toBeNull();return parsed!.game;};
const ready=(g:GameState):GameState=>({...g,currentEventId:null,awaitingAction:true,actionsLeft:2});
function close(g:GameState) {if(g.currentEventId)g=resolveLifeEvent(g,'cash').state;while(g.awaitingAction)g=performAction(g,{kind:'hold'}).state;return g;}
function toTurn(target:number,g=make(),present=true) {while(g.turn<target){g=startTurn(close(g),1).state;if(present)g=presentMaturityNotices(g);}return g;}
function check(g:GameState) {
 expect(validDefaultLifecycle(g)).toBe(true);
 expect(restore(g)).toEqual(g);
 expect(g.defaultLifecycle!.cycles.filter(activeCycle).reduce((s,c)=>s+c.remaining,0)).toBeLessThanOrEqual(g.irpCash+.00001);
 for(const h of g.holdings){expect(h.amount).toBeCloseTo(positionsOf(h).reduce((s,p)=>s+p.amount,0),5);}
 expect(g.irpCash).toBeGreaterThanOrEqual(0);
}

it('만기에는 원리금을 한 번만 현금화하고 새 납입·공제·수익으로 더하지 않는다',()=>{
 const t2=toTurn(2),t3=toTurn(3,t2),c=t3.defaultLifecycle!.cycles[0];
 expect(c.maturityTurn).toBe(3);expect(c.remaining).toBe(c.originalAmount);
 expect(scopedHolding(t3,'deposit').amount).toBe(0);expect(t3.irpCash).toBeCloseTo(c.remaining,5);
 expect(t3.accountBasis).toEqual(t2.accountBasis);expect(t3.contributionTotal).toBe(0);expect(t3.cashFlows).toEqual(t2.cashFlows);
 expect(t3.ledger.cashInterest!.amount).toBe(0);
 expect(t3.ledger.afterMarket-t3.ledger.open).toBeCloseTo(t3.ledger.marketEffects!.reduce((s,e)=>s+e.delta,0),5);
 expect(matureDeposits(t3)).toEqual(t3);check(t3);
});
it('통지가 표시된 다음 턴 자동주문하며 행동·매매 보상·납입은 늘리지 않는다',()=>{
 const t4=toTurn(4),c=t4.defaultLifecycle!.cycles[0];expect(c.state).toBe('notified');expect(c.presentedTurn).toBe(4);expect(c.eligibleTurn).toBe(5);
 const expected=Math.floor(c.remaining*1.001),t5=toTurn(5,restore(t4));
 expect(t5.defaultLifecycle!.cycles[0]).toMatchObject({state:'ordered',orderedTurn:5,orderedAmount:expected,remaining:0});
 expect(t5.defaultTrading!.groups[0]).toMatchObject({source:'automatic',cycleId:c.id,kind:'in',amount:expected});
 expect(t5.actionsLeft).toBe(startTurn(close({...t4, defaultLifecycle:undefined}),1).state.actionsLeft);expect(t5.record.defaultOptionRuns).toBe(0);expect(t5.riskBuyCount).toBe(0);
 expect(t5.pendingOrders[0]).toMatchObject({productId:'balanced',submittedTurn:5,priceTurn:6,settlesTurn:7});
 expect(t5.contributionTotal).toBe(0);expect(t5.taxCreditEligible).toBe(0);
 expect(advanceDefaultLifecycle(t5)).toEqual(t5);expect(automaticDefaultPurchase(t5,c.id).ok).toBe(false);check(t5);
});
it('미표시 통지는 시간 경과·새로고침으로 적용하지 않고 실제 표시 이후 한 단계를 기다린다',()=>{
 const t6=toTurn(6,make(),false);expect(t6.defaultTrading!.groups).toHaveLength(0);expect(t6.defaultLifecycle!.cycles[0].presentedTurn).toBeUndefined();
 const seen=presentMaturityNotices(restore(t6));expect(seen.defaultLifecycle!.cycles[0].eligibleTurn).toBe(7);
 expect(advanceDefaultLifecycle(seen).defaultTrading!.groups).toHaveLength(0);
 const t7=toTurn(7,seen);expect(t7.defaultLifecycle!.cycles[0].orderedTurn).toBe(7);check(t7);
});
it('대기 이자는 출처에 비례하며 새 납입은 자동운용 대상에 섞이지 않는다',()=>{
 let g=toTurn(3);const amount=g.defaultLifecycle!.cycles[0].remaining;
 const funded=performAction(ready(g),{kind:'contribute',amount:2000000});expect(funded.ok).toBe(true);g=toTurn(4,funded.state);
 expect(g.defaultLifecycle!.cycles[0].remaining).toBeCloseTo(amount*1.001,5);
 expect(g.irpCash-g.defaultLifecycle!.cycles[0].remaining).toBeCloseTo(2000000*1.001,5);
 expect(accrueWaitingCash(g)).toBe(g);const auto=toTurn(5,g);expect(auto.irpCash).toBeGreaterThan(2000000);check(auto);
});
it('일부 직접 매수는 오래된 만기자금부터 줄이고 재매도 대금을 다시 대상으로 넣지 않는다',()=>{
 let g=toTurn(3);const before=g.defaultLifecycle!.cycles[0].remaining;
 const buy=buyProduct(g,'shortBond',1000000);expect(buy.ok).toBe(true);g=buy.state;
 expect(g.defaultLifecycle!.cycles[0].remaining).toBeCloseTo(before-1000000,5);
 g=settleAllOrders(g);const amount=g.defaultLifecycle!.cycles[0].remaining;
 g=settleAllOrders(sellProduct(g,'shortBond',1000000).state);expect(g.defaultLifecycle!.cycles[0].remaining).toBe(amount);check(g);
});
it('전액 직접 사용하면 자동운용은 종료되고 전액의 자산은 한 번만 계산된다',()=>{
 let g=toTurn(3);const before=portfolioValue(g),c=g.defaultLifecycle!.cycles[0];g=buyProduct(g,'deposit',g.irpCash).state;
 expect(g.defaultLifecycle!.cycles[0]).toMatchObject({remaining:0,state:'exhausted'});expect(portfolioValue(g)).toBeCloseTo(before,5);
 expect(toTurn(5,g).defaultTrading!.groups).toHaveLength(0);expect(c.originalAmount).toBeGreaterThan(0);check(g);
});
it('상세의 현금 유지 지시는 정확히 행동 1회이며 사전지정·실제 현금은 유지한다',()=>{
 const g=ready(toTurn(4)),c=g.defaultLifecycle!.cycles[0],before=portfolioValue(g);
 const r=performAction(g,{kind:'maturity-cash',cycleId:c.id});expect(r.ok).toBe(true);expect(r.state.actionsLeft).toBe(1);
 expect(r.state.defaultLifecycle!.cycles[0]).toMatchObject({state:'directed',remaining:0,directedAmount:c.remaining,directedTurn:4});
 expect(r.state.irpCash).toBe(g.irpCash);expect(portfolioValue(r.state)).toBe(before);expect(r.state.defaultOption).toBe('midRisk');
 expect(performAction(r.state,{kind:'maturity-cash',cycleId:c.id}).ok).toBe(false);expect(toTurn(5,r.state).defaultTrading!.groups).toHaveLength(0);check(r.state);
});
it('사전지정 없음·변경·해제는 추천을 임의 실행하지 않고 새 통지 대기를 보장한다',()=>{
 let g=toTurn(5,make(null));expect(g.defaultLifecycle!.cycles[0].state).toBe('blocked');expect(g.defaultTrading!.groups).toHaveLength(0);
 g=presentMaturityNotices(setDefaultOption(g,'midRisk'));expect(g.defaultLifecycle!.cycles[0].eligibleTurn).toBe(6);
 g=setDefaultOption(g,'principal');expect(g.defaultLifecycle!.cycles[0].presentedTurn).toBeUndefined();expect(g.defaultLifecycle!.cycles[0].optionId).toBe('principal');
 g=toTurn(6,g,false);expect(g.defaultTrading!.groups).toHaveLength(0);
 g=presentMaturityNotices(g);expect(g.defaultLifecycle!.cycles[0].eligibleTurn).toBe(7);
 g=setDefaultOption(g,null);expect(toTurn(7,g).defaultTrading!.groups).toHaveLength(0);check(g);
});
it('기존 펀드 결제 동안 지연하고 결제가 끝나면 기존 통지 일정으로 한 번만 주문한다',()=>{
 let g=toTurn(4);g=buyProduct(g,'tdf',1000000).state;const t5=toTurn(5,g);
 expect(t5.defaultLifecycle!.cycles[0].state).toBe('blocked');expect(t5.defaultLifecycle!.cycles[0].blockedReason).toContain('결제');
 const t6=toTurn(6,t5);expect(t6.defaultLifecycle!.cycles[0].orderedTurn).toBe(6);expect(t6.defaultLifecycle!.cycles[0].notifiedTurn).toBe(4);check(t6);
});
it('동일 만기 여러 건은 개별 ID로 추적하고 같은 옵션의 동시 자동주문을 허용한다',()=>{
 let g=make();g=buyProduct({...g,irpCash:2000000},'deposit',2000000).state;
 g=toTurn(5,g);expect(g.defaultLifecycle!.cycles).toHaveLength(2);expect(g.defaultLifecycle!.cycles.every(c=>c.state==='ordered')).toBe(true);
 expect(g.defaultTrading!.groups).toHaveLength(2);expect(new Set(g.defaultTrading!.groups.map(x=>x.commandId)).size).toBe(2);check(g);
});
it.each(['principal','lowRisk','midRisk'] as const)('%s 옵션 내부 예금은 가상 계약의 만기해지/재예치를 따르고 펀드는 유지한다',option=>{
 let g=ready(toTurn(1,make(option)));g={...g,irpCash:2000000};
 const r=performAction(g,{kind:'default-opt-in',optionId:option,amount:2000000,commandId:nextDefaultCommand(g)});expect(r.ok).toBe(true);
 g=toTurn(4,r.state);const lots=g.holdings.flatMap(h=>positionsOf(h).flatMap(p=>p.scope?p.lots??[]:[]));
 if(option==='principal'){expect(g.defaultLifecycle!.cycles).toHaveLength(2);expect(lots).toHaveLength(0);}
 else {expect(g.defaultLifecycle!.renewals).toHaveLength(1);expect(lots[0]).toMatchObject({openedTurn:4,maturityTurn:7});expect(lots[0].principal).toBe(lots[0].amount);expect(defaultScopes(g)).toHaveLength(1);}
 expect(g.record.defaultOptionRuns).toBe(1);check(g);
});
it('다른 옵션을 보유하고 있으면 자동 매수·강제 환매 없이 지연한다',()=>{
 let g=ready(toTurn(1));g={...g,irpCash:2000000};g=performAction(g,{kind:'default-opt-in',optionId:'highRisk',amount:2000000,commandId:nextDefaultCommand(g)}).state;
 g=toTurn(5,g);expect(g.defaultLifecycle!.cycles[0].blockedReason).toContain('다른 옵션');expect(g.defaultTrading!.groups).toHaveLength(1);check(g);
});
it('이전 c4 저장은 만기 현금화·퀴즈 교체 없이 기존 규칙을 그대로 복원한다',()=>{
 const old=createGame('maturity-regression','aggressive',500000,{updatedFinance:true,scenario:'classic',ghost:false});
 const g=toTurn(5,old);expect(checkpointVersion(g)).toBe('c4');expect(g.defaultLifecycle).toBeUndefined();expect(g.learningContentVersion).toBeUndefined();expect(scopedHolding(g,'deposit').amount).toBeGreaterThan(0);expect(restore(g)).toEqual(g);
});
it('마지막 턴에 통지한 자금은 미래 주문을 강제 실행하지 않는다',()=>{
 let g=toTurn(8,make(null));g=buyProduct(g,'deposit',g.irpCash).state;g=toTurn(11,g);g=setDefaultOption(g,'midRisk');g=toTurn(12,g);expect(g.defaultLifecycle!.cycles.at(-1)).toMatchObject({maturityTurn:11,presentedTurn:12,eligibleTurn:13});g=close(g);
 expect(g.status).toBe('finished');expect(startTurn(g).ok).toBe(false);expect(advanceDefaultLifecycle(g)).toBe(g);expect(settleAllOrders(g)).toEqual(g);check(g);
});
it('손상된 대상액·통지·중복 계약·버전·주문 출처를 복원하지 않는다',()=>{
 const base=toTurn(5);
 for(const mutate of [
  (g:GameState)=>{g.defaultLifecycle!.cycles[0].remaining=1000;},
  (g:GameState)=>{g.defaultLifecycle!.cycles[0].eligibleTurn=4;},
  (g:GameState)=>{g.defaultLifecycle!.cycles[0].presentedTurn=3;},
  (g:GameState)=>{g.defaultLifecycle!.cycles.push({...g.defaultLifecycle!.cycles[0]});},
  (g:GameState)=>{g.learningContentVersion=undefined;},
  (g:GameState)=>{g.defaultTrading!.groups[0].source=undefined;},
  (g:GameState)=>{g.holdings.find(h=>h.productId==='deposit')!.positions![0].lots![0].id='deposit-999';},
 ]){const g=structuredClone(base);mutate(g);expect(parseCheckpoint(pack(g))).toBeNull();}
});
it('5 성향 × 4 시장 × 4 전략 × 6 시드는 완주·회계·복기·저장 불변조건을 지킨다',()=>{
 for(const p of investorProfiles)for(const scenario of Object.keys(SCENARIOS) as Array<keyof typeof SCENARIOS>)for(const strategy of ['passive','balanced','defaultOption','contributor'] as const)for(let seed=0;seed<6;seed++){
  const g=autoplay(`maturity-matrix-${seed}`,strategy,p.id,{scenario,defaultLifecycle:true,defaultOption:'lowRisk',contributionPacing:true,settlementLearning:true,automaticStamps:true});
  expect(g.turn).toBe(12);expect(g.pendingOrders).toHaveLength(0);check(g);
  for(const [i,r] of g.campaign!.reviews.entries())expect(r.irp-(i ? g.campaign!.reviews[i-1].irp : 108000000)).toBeCloseTo(r.market+r.flow+r.costs,4);
  const branch=replayChapter(g,6)!;expect(branch.learningContentVersion).toBe(g.learningContentVersion);check(branch);
 }
});

it('1원 단위 자동주문도 정수 합계와 잔여 현금을 보존한다',()=>{
 const original=toTurn(4);const cycle=original.defaultLifecycle!.cycles[0];
 for(const amount of [1,2,99999,100000.75]) {
  const g={...original,turn:5,irpCash:amount,defaultLifecycle:{...original.defaultLifecycle!,cycles:[{...cycle,remaining:amount}]}};
  const r=automaticDefaultPurchase(g,cycle.id);expect(r.ok,r.message).toBe(true);expect(portfolioValue(r.state)).toBeCloseTo(portfolioValue(g),5);expect(r.state.defaultLifecycle!.cycles[0].orderedAmount).toBe(Math.floor(amount));expect(r.state.irpCash).toBeCloseTo(amount-Math.floor(amount),6);expect(r.state.actionsLeft).toBe(g.actionsLeft);
 }
});
