import type { CashInterest, GameState } from '../types';
import { formatWon } from './format';

export function cashInterestRule(state: GameState): string {
  return state.financeRules
    ? '턴 시작 주문 가능 대기자금에 턴당 0.1% 이자 · 게임 가정'
    : '이전 규칙의 판 · 대기자금 이자 생략';
}

export function renderCashInterest(interest?: CashInterest): string {
  if (!interest || interest.opening <= 0) return '';
  return `<aside class="cash-interest"><strong>대기자금 이자 <span>+${formatWon(interest.amount)}</span></strong><small>턴 시작 ${formatWon(interest.opening)} × 턴당 0.1% · 게임 가정<br>상품 가격 손익과 구분하며 운용손익 합계에 포함합니다.</small></aside>`;
}
