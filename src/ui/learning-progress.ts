import type { GameState, LearningCard } from '../types';
import { calculateScore, knowledgeBreakdown, KNOWLEDGE_CAPS, starChecklist } from '../engine/scoring-engine';
import { learningExamples } from '../data/learning-examples';

export function renderConceptExample(card: LearningCard):string {
 const e=learningExamples[card.id];
 if(!e)return '';
 return `<details class="concept-example" data-preserve-open><summary>먼저 개념과 다른 예시 살펴보기</summary><p><strong>${e.concept}</strong></p><p>${e.example}</p><small>설명용 예시예요. 아래 문제에서는 다른 상황에 적용해 보세요. 읽기만 해서는 점수나 행동이 변하지 않아요.</small></details>`;
}
export function learningProgressData(state:GameState) {
 const k=knowledgeBreakdown(state), score=calculateScore(state);
 const without=calculateScore({...state,quizLog:[]});
 return { ...k, quizCap:state.campaign?16:KNOWLEDGE_CAPS.quiz, contribution:score.totalScore-without.totalScore, totalScore:score.totalScore };
}
export function renderLearningProgress(state:GameState):string {
 const k=learningProgressData(state);
 return `<aside class="learning-progress" aria-label="퀴즈 점수의 쓰임"><strong>학습 ${k.total}/20점 · 퀴즈 정답 ${k.quizCorrect}개</strong><p>학습 점수는 12턴 최종 종합점수 100점 중 20점에 포함돼요.</p><details data-preserve-open><summary>퀴즈 기여와 평가 기준</summary><p>퀴즈 항목 ${k.quiz}/${k.quizCap}점 · 정답 1개당 최대 2점.</p><small>현재 퀴즈가 종합점수에 더한 점수 +${k.contribution}점 · 상한·감점 반영. 연금액·자산·별을 직접 늘리지는 않아요. 퀴즈는 선택이며 오답 벌점은 없어요.</small></details></aside>`;
}
export function renderFinalPerformance(state:GameState):string {
 const s=calculateScore(state), k=learningProgressData(state),checks=starChecklist(state,s);
 const good=checks.find(c=>c.passed);
 const next=checks.find(c=>!c.passed);
 return `<section class="final-performance" aria-label="목표와 학습의 최종 성과"><h2>목표와 배움을 함께 돌아봐요</h2><p class="final-total">종합 성과 <strong>${s.totalScore}/100점</strong></p><div class="performance-parts"><article><strong>연금 목표 ${s.incomeScore}/50</strong><small>목표용 월 환산액 기준</small></article><article><strong>안정성 ${s.stabilityScore}/30</strong><small>생활자금·낙폭·분산 등</small></article><article><strong>학습 ${s.knowledgeScore}/20</strong><small>퀴즈와 이해 점수</small></article></div><p class="hint">각 항목과 합계는 반올림하므로 표시 점수의 합이 1점 다를 수 있어요. 별은 미션·생활자금 등 별도 조건으로 결정해요.</p>${renderLearningProgress(state)}<details data-preserve-open><summary>학습 점수 구성</summary><p>기본 ${KNOWLEDGE_CAPS.base} + 퀴즈 ${k.quiz} + 이해 ${k.understanding} + 리밸런싱 ${k.rebalance} − 위반 ${k.penalty} → ${k.total}/20점(0~20점 상한).</p>${state.campaign?'<p>이 판은 거래 횟수 보너스 없이 퀴즈 최대 16점과 기본 4점으로 학습을 평가해요.</p>':''}</details><div class="result-takeaway"><p><strong>이번 판에서 해낸 것</strong><br>${good?good.label:k.quizCorrect?`퀴즈 ${k.quizCorrect}문항을 맞히며 배웠어요.`:'12턴을 끝까지 진행하며 결과를 확인했어요.'}</p><p><strong>다음 도전 한 가지</strong><br>${next?next.label+' 조건을 먼저 살펴보세요.':'달성한 조건을 다른 시장에서도 지킬 수 있는지 비교해 보세요.'}</p></div></section>`;
}
