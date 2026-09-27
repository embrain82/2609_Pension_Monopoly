// @vitest-environment happy-dom
import { expect, it } from 'vitest';
import { createGame, startTurn, performAction, resolveLifeEvent } from '../src/engine/game-engine';
import { applyMarketStep, marketHoldingEffects } from '../src/engine/market-engine';
import { calculateScore, starChecklist } from '../src/engine/scoring-engine';
import { canBuyForProfile } from '../src/engine/policy-engine';
import { PROFILE_IDS } from '../src/engine/profile-engine';
import { allowedDefaultOptions } from '../src/engine/default-option';
import { products, generalLearningCards, investorProfiles, learningCards } from '../src/data/content';
import { DEFAULT_PORTFOLIOS } from '../src/data/default-portfolios';
import { learningExamples } from '../src/data/learning-examples';
import { returnExplanation } from '../src/ui/return-explanation';
import { productRequirement, defaultRequirement } from '../src/ui/profile-requirement';
import { renderMoneyFlow, moneyFlowData } from '../src/ui/money-flow';
import { renderConceptExample, renderFinalPerformance, learningProgressData } from '../src/ui/learning-progress';
import { renderQuizModal } from '../src/ui/quiz-view';
import { renderGoalConditions } from '../src/ui/hud';
import { renderSettlementModal } from '../src/ui/settlement';
import { summarizeTurn } from '../src/engine/settlement-engine';
const dom=(html:string)=>{const d=document.createElement('div');d.innerHTML=html;return d;};
const fresh=()=>createGame('beginner-results','stable',500000,{scenario:'classic',defaultLifecycle:true,contributionPacing:true,ghost:false});
it('금리 동결과 주가 하락에도 예금 약정 이자와 채권 원인을 실제 손익에 맞춰 보여준다',()=>{
 const s=fresh();const m={...s.marketPath[0],turn:1,ratePct:2.5,rateDeltaPct:0,stockReturn:-.036,returns:{...s.marketPath[0].returns,shortBond:.0045}};
 const after=applyMarketStep({...s,turn:1},m), effects=marketHoldingEffects(s,after);
 for(const e of effects){const why=returnExplanation(e,m);expect(why.rows.reduce((v,r)=>v+r.value,0)).toBeCloseTo(e.delta,6);}
 const deposit=effects.find(e=>e.productId==='deposit')!,bond=effects.find(e=>e.productId==='shortBond')!;
 expect(deposit.delta).toBeGreaterThan(0);expect(returnExplanation(deposit,m).line).toContain('약정 이자');
 expect(bond.delta).toBeGreaterThan(0);expect(returnExplanation(bond,m).rows.find(r=>r.label==='금리 변화의 가격 영향')!.value).toBeCloseTo(0);
 expect(returnExplanation(bond,m).line).toContain('주가지수 등락을 그대로 따르는');
});
it('금리·충격·클램프와 모든 상품에서 분해 합계는 실제 시장 반영액과 일치한다',()=>{
 const s={...fresh(),holdings:products.map(p=>({productId:p.id,amount:1000000,principal:1000000,depositTurnsHeld:0}))};
 for(const market of s.marketPath){const after=applyMarketStep({...s,turn:market.turn},market);for(const e of marketHoldingEffects(s,after)){const why=returnExplanation(e,market);expect(why.rows.reduce((v,r)=>v+r.value,0)).toBeCloseTo(e.delta,5);}}
});
it('근거가 없거나 다른 계산의 구 기록은 원인별 금액을 꾸며내지 않는다',()=>{
 const e={productId:'shortBond' as const,opening:1000000,delta:3000,returnRate:.003};
 expect(returnExplanation(e).rows).toEqual([]);expect(returnExplanation({...e,delta:999999},fresh().marketPath[0]).rows).toEqual([]);
});
it('추가납입 미리보기는 생활자금→대기자금만 강조하고 자산과 미결제는 보존한다',()=>{
 const s=fresh(),copy=structuredClone(s),after={...s,cash:s.cash-1000000,irpCash:s.irpCash+1000000};
 const d=dom(renderMoneyFlow(s,after,'contribution'));
 expect(d.querySelector('.money-flow-trade')).toBeNull();expect(d.textContent).toContain('생활 지갑 → 대기자금');expect(d.textContent).toContain('이번 납입으로 변하지 않아요');
 expect(d.querySelectorAll('.money-flow-changed')).toHaveLength(2);
 expect(moneyFlowData(after).total-moneyFlowData(s).total).toBe(1000000);expect(s).toEqual(copy);
 expect(renderMoneyFlow(s)).toContain('화살표는 이번 거래 내역이 아니에요');
});
it('상품·디폴트옵션의 최소 성향 표시는 실제 허용 판정과 일치한다',()=>{
 for(const p of products){const ids=PROFILE_IDS.filter(id=>canBuyForProfile(id,p.id).ok);const name=investorProfiles.find(x=>x.id===ids[0])!.name;expect(productRequirement(p.id)).toContain(ids.length===5?'모든 성향':name+' 이상');}
 for(const modern of [false,true])for(const p of DEFAULT_PORTFOLIOS){const ids=PROFILE_IDS.filter(id=>allowedDefaultOptions(id,modern).some(o=>o.id===p.id));expect(defaultRequirement(p.id,modern)).toContain(ids.length===5?'모든 성향':investorProfiles.find(x=>x.id===ids[0])!.name+' 이상');}
});
it('25개 개념 예시는 기존·신규 문제와 연결되며 정답 보기 문장을 그대로 복사하지 않는다',()=>{
 expect(Object.keys(learningExamples)).toHaveLength(generalLearningCards.length);
 for(const c of [...learningCards,...generalLearningCards]){const e=learningExamples[c.id];expect(e).toBeTruthy();expect(e.example).not.toContain(c.quiz.q);expect(e.example).not.toBe(c.quiz.options[c.quiz.answer]);expect(renderConceptExample(c)).toContain('다른 상황');}
});
it('퀴즈의 최종 기여는 종합점수 차이와 같고 상한·벌점·기존 판을 처리한다',()=>{
 for(const campaign of [fresh(),createGame('legacy')])for(const correct of [0,1,4,8,12]){
 const s={...campaign,quizLog:generalLearningCards.slice(0,correct).map(c=>({cardId:c.id,correct:true,turn:1})),understandingPoints:6,rebalanceCount:2};
 const copy=structuredClone(s),k=learningProgressData(s),score=calculateScore(s),none=calculateScore({...s,quizLog:[]});
 expect(k.contribution).toBe(score.totalScore-none.totalScore);expect(k.total).toBeLessThanOrEqual(20);
 expect(score.stars).toBe(none.stars);expect(score.irpValue).toBe(none.irpValue);
 const d=dom(renderFinalPerformance(s));expect(d.querySelector('.final-total')?.textContent).toContain(`${score.totalScore}/100`);expect(d.textContent).toContain(`+${k.contribution}점`);expect(s).toEqual(copy);
 }
});
it('퀴즈 안내는 풀이 전 개념과 기여를 설명하고 선택 학습·오답 무벌점을 유지한다',()=>{
 const g=fresh(),card=generalLearningCards[0],copy=structuredClone(g);
 const before=dom(renderQuizModal(card,{game:g,picked:null,progress:null,characters:false,streak:0,pointsAvailable:2}));
 expect(before.querySelector('.concept-example')).not.toBeNull();expect(before.textContent).toContain('최종 종합점수 100점');expect(before.querySelector('[data-action="quiz-skip"]')).not.toBeNull();
 const answered=dom(renderQuizModal(card,{game:g,picked:card.quiz.answer,progress:null,characters:false,streak:0,pointsEarned:0}));
 expect(answered.querySelector('.concept-example')).toBeNull();expect(answered.textContent).toContain('추가 점수 없이 복습 완료');expect(g).toEqual(copy);
});
it('정산 첫 영역의 합계는 원장과 일치하고 원인 상세·필수 안내·진행을 유지한다',()=>{
 let s=startTurn(fresh(),1).state;if(s.currentEventId)s=resolveLifeEvent(s,'cash').state;
 const after=performAction(s,{kind:'hold'}).state,summary=summarizeTurn(s,after,'그대로 유지');
 const d=dom(renderSettlementModal(summary,{characters:false,market:after.lastMarket,goalHtml:renderGoalConditions(after),importantHtml:'<aside id="required">만기 통지</aside>'}));
 expect(d.querySelector('.settle-essential')?.closest('details')).toBeNull();expect(d.querySelector('.settle-lesson')?.closest('details')).toBeNull();
 expect(d.querySelector('#required')?.closest('details')).toBeNull();expect(d.querySelectorAll('[data-action="dismiss-settle"]')).toHaveLength(1);
 expect(d.querySelector('.settle-market-panel')?.closest('details')).not.toBeNull();
 const checks=dom(renderGoalConditions(after));expect(checks.querySelectorAll('li')).toHaveLength(starChecklist(after,calculateScore(after)).length);
 expect(summary.marketDelta+(summary.capitalFlow??0)+(summary.tradingDelta??0)).toBeCloseTo(summary.irpAfter-summary.irpOpen,4);
});
