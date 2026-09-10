import {describe,it,expect} from 'vitest';
import {createGame,startTurn,performAction,setDefaultOption,autoplay,resolveLifeEvent} from '../src/engine/game-engine';
import {previewDefaultOptIn,previewDefaultOptOut,nextDefaultCommand,executeDefaultTrade} from '../src/engine/default-trade-engine';
import {defaultScopes,scopedHolding,defaultValue,positionsOf,initializePositions} from '../src/engine/position-engine';
import {buyProduct,sellProduct,settleAllOrders,rebalancePortfolio,portfolioValue} from '../src/engine/portfolio-engine';
import {applyMarketStep} from '../src/engine/market-engine';
import {riskAssetRatio,equityExposureRatio,canBuyRiskAsset} from '../src/engine/policy-engine';
import {DEFAULT_PORTFOLIOS,allowedPortfolios} from '../src/data/default-portfolios';
import {parseCheckpoint} from '../src/ui/play-checkpoint';
import {replayChapter} from '../src/engine/scenario-engine';
import {lifeEvents} from '../src/data/content';
import type {GameState,DefaultOptionId} from '../src/types';
function base(profile:GameState['profileId']='balanced'):GameState {
  const g=startTurn(createGame('option-test',profile,500000,{ghost:false,scenario:'classic',defaultTrading:true,defaultOption:'midRisk'}),5).state;
  return {...g,irpCash:2000000,currentEventId:null,awaitingAction:true,actionsLeft:2};
}
const ready=(g:GameState):GameState=>({...g,status:'playing',awaitingAction:true,currentEventId:null,actionsLeft:2});
function buy(g:GameState,id:DefaultOptionId='highRisk',amount=1000000) {
  const r=performAction(g,{kind:'default-opt-in',optionId:id,amount,commandId:nextDefaultCommand(g)});expect(r.ok,r.message).toBe(true);return r.state;
}
const packed=(game:GameState)=>JSON.stringify({version:game.defaultTrading?'c3':'c2',game,modal:null,lastSummary:null,quizCardId:null,quizPicked:null,finalQuizQueue:[],finalQuizTotal:0,finishing:false,defaultOptionAsk:false});
function accounting(g:GameState) {
  for(const h of g.holdings) {
    expect(h.amount).toBeCloseTo(positionsOf(h).reduce((s,p)=>s+p.amount,0),5);
    expect(h.principal).toBeCloseTo(positionsOf(h).reduce((s,p)=>s+p.principal,0),5);
  }
  expect(g.irpCash).toBeGreaterThanOrEqual(0);
  expect(parseCheckpoint(packed(g))).not.toBeNull();
}
describe('명시적 디폴트옵션 거래',()=>{
  it('버전별 카탈로그, 고정 구성비와 포트폴리오 적합성을 사용한다',()=>{
    for(const p of DEFAULT_PORTFOLIOS) {expect(Object.values(p.weights).reduce((s,w)=>s+w,0)).toBeCloseTo(1);expect(p.products).not.toContain('equityEtf');}
    expect(allowedPortfolios('stable').map(p=>p.id)).toEqual(['principal','lowRisk']);
    expect(previewDefaultOptIn(base('stable'),'highRisk',200000).ok).toBe(false);
    // 구성품 개별 등급이 아닌 가상 옵션의 위험등급을 판정한다.
    expect(previewDefaultOptIn(base('stable'),'lowRisk',100000).ok).toBe(true);
  });
  it('지정과 hold는 자산·주문을 바꾸지 않고 이전 C/D hold는 그대로 유지한다',()=>{
    const g=base(),selected=setDefaultOption(g,'principal');
    expect(selected.holdings).toEqual(g.holdings);expect(selected.irpCash).toBe(g.irpCash);
    const held=performAction(selected,{kind:'hold'});expect(held.ok).toBe(true);expect(held.state.irpCash).toBe(g.irpCash);expect(held.state.pendingOrders).toEqual([]);
    const old=ready({...createGame('old','balanced',500000,{ghost:false,scenario:'classic',defaultOption:'principal'}),irpCash:200000});
    expect(performAction(old,{kind:'hold'}).state.irpCash).toBe(0);
  });
  it.each([100000,150000])('소액 %i원도 70/30 구성을 유지하고 미리보기는 불변이다',amount=>{
    const g=base(),before=structuredClone(g),preview=previewDefaultOptIn(g,'highRisk',amount);
    expect(g).toEqual(before);expect(preview.ok).toBe(true);
    expect(preview.legs.map(l=>l.amount)).toEqual([amount*.7,amount*.3]);
    const after=buy(g,'highRisk',amount);expect(after.actionsLeft).toBe(1);expect(after.defaultTrading!.groups).toHaveLength(1);
    expect(portfolioValue(after)).toBeCloseTo(portfolioValue(g),5);accounting(after);
  });
  it('자금 부족·잘못된 금액·실패는 장부와 행동을 전혀 바꾸지 않는다',()=>{
    const g=base();for(const amount of [0,-1,99999,2e6+1,Infinity,NaN,100000.5]) {
      const r=performAction(g,{kind:'default-opt-in',optionId:'highRisk',amount,commandId:nextDefaultCommand(g)});expect(r.ok).toBe(false);expect(r.state).toEqual(g);
    }
  });
  it('같은 상품 직접매수분은 부분·전체 옵트아웃 후에도 유지된다',()=>{
    let g=base();g=buyProduct(g,'tdf',500000).state;g=settleAllOrders(g);const direct=scopedHolding(g,'tdf').amount;
    g=settleAllOrders(buy(g));const scope=defaultScopes(g)[0];
    expect(scopedHolding(g,'tdf',scope).amount).toBe(300000);
    for(const fraction of [.5,1] as const) {
      g=ready(g);const before=defaultValue(g);
      const r=performAction(g,{kind:'default-opt-out',fraction,commandId:nextDefaultCommand(g)});expect(r.ok).toBe(true);
      // 예약 환매액도 아직 계좌 자산이다.
      expect(defaultValue(r.state)).toBeCloseTo(before);expect(scopedHolding(r.state,'tdf').amount).toBeCloseTo(direct);
      g=settleAllOrders(r.state);expect(defaultValue(g)).toBeCloseTo(before*(1-fraction));accounting(g);
    }
    expect(defaultScopes(g)).toHaveLength(0);expect(scopedHolding(g,'tdf').amount).toBeCloseTo(direct);
  });
  it('일반 매도와 리밸런싱은 옵션을 유지하며 예약 상태 충돌을 막는다',()=>{
    let g=buy(base());expect(previewDefaultOptOut(ready(g),1).ok).toBe(false);expect(previewDefaultOptIn(ready(g),'highRisk',100000).ok).toBe(false);
    expect(rebalancePortfolio(g).ok).toBe(false);g=settleAllOrders(g);const scope=defaultScopes(g)[0],option=scopedHolding(g,'balanced',scope).amount;
    const sold=sellProduct(g,'balanced',1e9);expect(sold.ok).toBe(true);expect(scopedHolding(sold.state,'balanced',scope).amount).toBe(option);
    const rebalanced=rebalancePortfolio(g);expect(rebalanced.ok).toBe(true);expect(defaultValue(rebalanced.state)).toBe(defaultValue(g));
    expect(previewDefaultOptIn({...ready(g),rebalancePlan:{deposit:1,shortBond:0,longBond:0,balanced:0,equityEtf:0,tdf:0}},'highRisk',100000).ok).toBe(false);
  });
  it('한 종류 보유와 지정값은 분리하며 전량 결제 후 다른 옵션을 선택한다',()=>{
    let g=settleAllOrders(buy(base()));g=setDefaultOption(ready(g),'principal');
    expect(g.defaultOption).toBe('principal');expect(previewDefaultOptIn(g,'principal',100000).ok).toBe(false);
    const r=executeDefaultTrade(g,{tab:'out',optionId:'highRisk',amount:0,fraction:1},nextDefaultCommand(g));g=settleAllOrders(r.state);
    expect(previewDefaultOptIn(g,'principal',100000).ok).toBe(true);expect(g.defaultOption).toBe('principal');
  });
  it('접수 ID가 같은 두 번째 클릭은 중복 주문·행동 차감이 없다',()=>{
    const g=base(),id=nextDefaultCommand(g),action={kind:'default-opt-in' as const,optionId:'principal' as const,amount:100000,commandId:id};
    const first=performAction(g,action),second=performAction(first.state,action);
    expect(second.ok).toBe(false);expect(second.state).toEqual(first.state);accounting(first.state);
  });
  it('옵션 예외가 일반 상품으로 전파되지 않고 주식 노출은 유지된다',()=>{
    let g=base('aggressive');g=initializePositions({...g,holdings:[],irpCash:1e7});g=settleAllOrders(buy(g,'highRisk',1e7));
    expect(riskAssetRatio(g)).toBe(0);expect(equityExposureRatio(g)).toBeGreaterThan(.3);
    g={...g,irpCash:1e7};expect(canBuyRiskAsset(g,'equityEtf',1e7).ratio).toBeCloseTo(.5);
    const direct=buyProduct(g,'equityEtf',1e7);expect(direct.ok).toBe(true);expect(riskAssetRatio(direct.state)).toBeCloseTo(.5);
  });
  it('시장·예금 약정·부분 환매는 출처별 원금과 이자를 보존한다',()=>{
    let g=buy(base(),'principal');const scope=defaultScopes(g)[0],manual=scopedHolding(g,'deposit');
    g=applyMarketStep({...g,turn:2},g.marketPath[1]);accounting(g);
    const direct=scopedHolding(g,'deposit'),p=previewDefaultOptOut(ready(g),.5);
    expect(p.costs).toBeGreaterThan(0);expect(scopedHolding(p.state,'deposit')).toEqual(direct);
    expect(direct.principal).toBe(manual.principal);expect(scopedHolding(p.state,'deposit',scope).principal).toBeCloseTo(500000);
  });
  it('옵션 혼합 예금만 생활사건에서 꺼내지 않는다',()=>{
    let g=initializePositions({...base(),holdings:[],irpCash:2e6});g=settleAllOrders(buy(g,'lowRisk',2e6));
    const event=lifeEvents.find(e=>e.kind==='cost'&&e.eligibleWithdrawal)!;
    const r=resolveLifeEvent({...g,currentEventId:event.id},'deposit');expect(r.ok).toBe(false);expect(r.state.holdings).toEqual(g.holdings);
  });
  it('12턴 신규/환매 주문은 추가 시장과 입출금 없이 모두 정산된다',()=>{
    const g={...base(),turn:12,actionsLeft:1};
    const bought=buy(g);expect(bought.status).toBe('finished');expect(bought.pendingOrders).toHaveLength(0);expect(bought.cashFlows).toEqual(g.cashFlows);expect(bought.campaign!.reviews.at(-1)!.flow).toBe(0);accounting(bought);
    const before=portfolioValue(bought),out=performAction({...ready(bought),actionsLeft:1},{kind:'default-opt-out',fraction:1,commandId:nextDefaultCommand({...ready(bought),actionsLeft:1})});
    expect(out.ok).toBe(true);expect(out.state.pendingOrders).toEqual([]);expect(portfolioValue(out.state)).toBeCloseTo(before);expect(out.state.cash).toBe(bought.cash);
  });
});
describe('진행 저장과 D 복기',()=>{
  it.each(['balanced','defaultOption'] as const)('%s 전략 완주·분기·새 장부를 복원한다',strategy=>{
    const g=autoplay('new-replay',strategy,'balanced',{scenario:'classic',defaultTrading:true});accounting(g);
    expect(g.status).toBe('finished');expect(g.campaign!.reviews).toHaveLength(12);
    for(const turn of [3,6,9]) {const fork=replayChapter(g,turn)!;accounting(fork);expect(fork.rulesetVersion).toBe('2026-09-10-e');}
  });
  it('훼손된 합계·출처·중첩 분기 장부는 복원하지 않는다',()=>{
    const g=settleAllOrders(buy(base()));const bad=structuredClone(g);bad.holdings[0].amount+=100;
    expect(parseCheckpoint(packed(bad))).toBeNull();
    const badScope=structuredClone(g);const p=badScope.holdings.flatMap(h=>h.positions!).find(p=>p.scope)!;p.scope!.optionId='principal';expect(parseCheckpoint(packed(badScope))).toBeNull();
    const complete=autoplay('corrupt-branch','defaultOption','balanced',{scenario:'classic',defaultTrading:true});complete.campaign!.branches[0].state.holdings[0].amount+=100;expect(parseCheckpoint(packed(complete))).toBeNull();
  });
  it('훼손된 복기용 옵션 잔고와 주문은 복원하지 않는다',()=>{
    const g=autoplay('corrupt-review','defaultOption','balanced',{scenario:'classic',defaultTrading:true});
    for(const field of ['defaultHoldings','defaultOrders'] as const) {
      const bad=JSON.parse(packed(g));bad.game.campaign.reviews[0][field]='broken';
      expect(parseCheckpoint(JSON.stringify(bad))).toBeNull();
    }
    const bad=structuredClone(g);bad.campaign!.reviews[0].defaultHoldings=[{productId:'deposit',optionId:'unknown',amount:100000}];
    expect(parseCheckpoint(packed(bad))).toBeNull();
  });
  it('구 C/D 진행 판은 출처를 추정하지 않고 원래 규칙으로 복원한다',()=>{
    for(const scenario of [undefined,'classic'] as const) {const g=autoplay('legacy','defaultOption','balanced',{scenario});const loaded=parseCheckpoint(packed(g));expect(loaded?.game).toEqual(g);expect(loaded?.game.defaultTrading).toBeUndefined();}
  });
});
