import { actionTiming } from '../engine/action-constraints';
import type { GameState } from '../types';
import { actionGuidance, type GuidanceChoice } from './action-guidance';

/** UI-only progress. No money, order or engine rule belongs in this object. */
export interface PracticeProgress {
  version: 'p1';
  mode: 'active' | 'off';
  turn: 1 | 2;
  step: 'money' | 'preview' | 'review' | 'done';
}
export function normalizePractice(value: unknown, state: GameState): PracticeProgress | undefined {
  if (!value || typeof value !== 'object' || state.turn > 2 || state.status !== 'playing') return undefined;
  const p = value as Partial<PracticeProgress>;
  if (p.version !== 'p1' || !['active','off'].includes(p.mode ?? '') || ![1,2].includes(p.turn ?? 0) ||
    !['money','preview','review','done'].includes(p.step ?? '') || p.turn! > state.turn) return undefined;
  return { version:'p1', mode:p.mode!, turn:state.turn as 1|2, step:p.turn === state.turn ? p.step! : 'money' };
}
export const practiceAvailable = (state: GameState): boolean => state.turn >= 1 && state.turn <= 2 && actionTiming(state).enabled;
export function beginPractice(state: GameState): PracticeProgress | undefined {
  return practiceAvailable(state) ? { version:'p1', mode:'active', turn:state.turn as 1|2, step:'money' } : undefined;
}
export function practiceChoice(state: GameState): GuidanceChoice | undefined {
  return practiceAvailable(state) ? actionGuidance(state).choices[0] : undefined;
}
export function practiceIsActive(state: GameState, progress?: PracticeProgress): boolean {
  const p = normalizePractice(progress,state);
  return practiceAvailable(state) && p?.mode === 'active' && p.step !== 'done';
}
export function renderPractice(state: GameState, progress: PracticeProgress | undefined, menu = false): string {
  if (!practiceAvailable(state)) return '';
  const p = normalizePractice(progress,state);
  if (!p) return menu ? `<aside class="practice-invitation"><strong>처음이라면, 두 턴만 함께 해봐요</strong><p>돈 위치와 확인 화면을 차례로 봐요. 거래하지 않고 끝내도 괜찮아요.</p><button class="secondary" data-action="practice-start">도움받으며 해보기</button><button class="text-button" data-action="practice-skip">직접 해볼게요</button></aside>` : '';
  if (p.mode === 'off' || p.step === 'done') return menu ? `<button class="text-button practice-replay" data-action="practice-start">${p.step === 'done' && p.mode === 'active' ? '이번 턴 실습 완료 · ' : ''}두 턴 도움 다시 보기</button>` : '';
  const choice = practiceChoice(state);
  const review = choice && 'operation' in choice
    ? choice.operation === 'contribute'
      ? '납입 후 남는 생활자금과 IRP 안으로 옮기는 금액을 봐요. 납입만으로 상품이 매수되지는 않아요.'
      : choice.operation === 'buy' || choice.operation === 'default'
        ? '상품의 세 줄 설명과 주문 시간표를 봐요. 손실 가능성과 돈이 처리되는 시점을 확인한 뒤 결정해요.'
        : '바뀌는 구성과 매도·매수 순서를 봐요. 결제 전 대금을 다시 쓸 수는 없어요.'
    : choice && 'portfolio' in choice && choice.portfolio === 'orders'
      ? '주문 시간표의 현재 표시를 봐요. 이미 접수한 주문이므로 같은 돈을 다시 주문할 필요는 없어요.'
      : choice && 'portfolio' in choice && choice.portfolio === 'maturity'
        ? '디폴트옵션 카드의 남은 대상액과 다음 단계를 봐요. 모든 대기자금이 자동운용되는 것은 아니에요.'
        : '생활자금과 IRP 안의 돈을 구분해 봐요. 생활비가 부족할 때 IRP 상품을 판다고 생활자금이 바로 늘지는 않아요.';
  const step = p.step === 'money' ? 1 : p.step === 'preview' ? 2 : 3;
  const title = p.step === 'money' ? state.turn === 1 ? '먼저 내 돈이 어디 있는지 봐요' : '한 턴 뒤 돈 위치를 다시 봐요' : p.step === 'preview' ? actionGuidance(state).title : '조회만 했어요 · 이제 직접 선택해요';
  const body = p.step === 'money' ? '생활자금은 IRP 밖, 대기자금·상품·처리 중인 주문은 IRP 안에 있어요.' : p.step === 'preview' ? actionGuidance(state).body : `${review} 실제 지시는 별도 확정 버튼으로 실행해요.`;
  return `<aside class="guided-practice" data-practice-step="${p.step}" aria-label="첫 두 턴 실습"><p class="eyebrow">도움받으며 해보기 · ${state.turn}/2턴 · 안내 ${step}/3</p><h3>${title}</h3><p>${body}</p><div class="practice-actions">
    ${p.step === 'money' ? '<button class="secondary" data-action="practice-money">돈 위치 확인하기</button>' : p.step === 'preview' && choice ? `<button class="secondary" data-action="practice-preview">${choice.title} · 조회</button>` : p.step === 'review' ? '<button class="secondary" data-action="practice-done">실습 마치고 직접 선택</button>' : '<button class="secondary" data-action="practice-done">확인했어요</button>'}
    <button class="text-button" data-action="practice-skip">도움 그만 보기</button></div><small>도움·조회는 행동 0회 · 거래나 납입을 강요하지 않아요.</small></aside>`;
}
