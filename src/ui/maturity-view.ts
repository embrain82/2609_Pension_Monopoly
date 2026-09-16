import { products } from '../data/content';
import { defaultPortfolio } from '../data/default-portfolios';
import { actionTiming } from '../engine/action-constraints';
import { activeCycle } from '../engine/maturity-cash';
import type { GameState, MaturityCycle } from '../types';
import { formatWon } from './format';

const escape = (s: string) => s.replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
function stage(c: MaturityCycle, state: GameState): string {
  if (c.state === 'ordered') return `${c.orderedTurn}턴 자동주문 접수 · ${formatWon(c.orderedAmount!)}`;
  if (c.state === 'directed') return `${c.directedTurn}턴 현금 유지 지시 · 자동운용 제외`;
  if (c.state === 'exhausted') return '직접 운용에 사용 · 자동운용 대상 없음';
  if (state.status === 'finished') return '판 종료 · 남은 만기자금은 IRP 현금으로 평가 · 추가 자동주문 없음';
  if (c.state === 'blocked') return escape(c.blockedReason ?? '자동운용 조건 확인 중');
  if (c.notifiedTurn === undefined) return `${c.maturityTurn + 1}턴 사전지정·통지 확인 예정`;
  const due = c.eligibleTurn ?? state.turn + 1;
  return `${due > 12 ? '판 종료 이후 단계 · 이번 판 추가 자동주문 없음' : `${due}턴 남은 대상액 자동주문 예정`} · 직접 운용 가능`;
}
function disclosure(c: MaturityCycle): string {
  if (!c.optionId || c.notifiedTurn === undefined) return '';
  const option = defaultPortfolio(c.optionId);
  const fee = option.products.map(id => {
    const p = products.find(p => p.id === id)!;
    return `${p.shortName} ${(p.feeRate * 100).toFixed(3)}%`;
  }).join(' · ');
  return `<p class="maturity-risk">${option.name} · 가상 ${option.riskGrade}등급. ${option.principalGuaranteed ? '약정 만기 원리금 보장 가정 · 물가 위험은 남습니다.' : '펀드·TDF는 시장 변동에 따라 원금 손실이 가능합니다.'} 운용보수(교육용 턴당): ${fee}. 별도 매매수수료는 게임에서 0원입니다.</p>`;
}
/** One compact card, with amounts grouped only for the same notice and option. */
export function renderMaturitySummary(state: GameState): string {
  const lifecycle = state.defaultLifecycle;
  if (!lifecycle) return '';
  const relevant = lifecycle.cycles.filter(c => activeCycle(c) || c.orderedTurn === state.turn);
  const renewed = lifecycle.renewals.filter(r => r.turn === state.turn);
  if (!relevant.length && !renewed.length) return '';
  const groups = new Map<string, MaturityCycle[]>();
  for (const c of relevant) {
    const key = `${c.state}-${c.optionId}-${c.maturityTurn}-${c.notifiedTurn}-${c.eligibleTurn}-${c.blockedReason}`;
    groups.set(key, [...(groups.get(key) ?? []), c]);
  }
  const rows = [...groups.values()].map(cs => {
    const c = cs[0], amount = cs.reduce((sum,x) => sum + (x.orderedAmount ?? x.remaining),0);
    const notice = activeCycle(c) && c.notifiedTurn !== undefined;
    return `<div class="maturity-stage" ${notice?'data-default-notice':''}><strong>${c.state==='ordered'?'자동운용 접수':'만기 대기'} ${formatWon(amount)}${cs.length>1?` · ${cs.length}건`:''}</strong><p>지정 옵션: ${c.optionId ? defaultPortfolio(c.optionId).name : state.defaultOption ? defaultPortfolio(state.defaultOption).name : '지정 안 함'}</p><p>${stage(c,state)}</p>${notice?disclosure(c):''}</div>`;
  }).join('');
  return `<aside class="maturity-notice maturity-flow" aria-label="만기자금 안내"><h3>예금 만기 이후</h3>${rows}${renewed.length?`<p>혼합 디폴트옵션 안의 예금 ${renewed.length}건은 새 약정으로 재예치했습니다. 상세에서 새 금리·만기를 확인하세요.</p>`:''}<p class="hint">실제 제도: 만기 후 4주 무지시 → 통지 → 2주 무지시 시 적용. 게임은 단계별 다음 턴으로 압축하며 실제 주 수와 같지 않습니다.</p><button class="secondary" data-action="open-portfolio">만기자금 확인</button></aside>`;
}
export function renderMaturityDetails(state: GameState): string {
  const d = state.defaultLifecycle;
  if (!d) return '';
  const waiting = d.cycles.filter(activeCycle), total = waiting.reduce((sum,c) => sum+c.remaining,0);
  const timing = actionTiming(state);
  const rows = d.cycles.map(c => `<li ${activeCycle(c)&&c.notifiedTurn!==undefined?'data-default-notice':''}><strong>${c.maturityTurn}턴 만기 · ${formatWon(c.originalAmount)}</strong><p>${stage(c,state)}</p>${activeCycle(c)?`<p>남은 대상액 ${formatWon(c.remaining)} · ${c.optionId?defaultPortfolio(c.optionId).name:'통지 전'}</p>${disclosure(c)}<details class="maturity-instruction"><summary>이 만기자금을 직접 운용하려면</summary><p>운용지시에서 매수하거나, 아래에서 이 만기 건의 남은 ${formatWon(c.remaining)}원을 현금으로 유지하도록 지시할 수 있습니다. 현금 유지는 이 건의 자동운용을 중단하며 <b>행동 1회</b>를 사용합니다. 사전지정과 다른 만기 건은 유지합니다.</p><button class="secondary" data-action="open-action" ${timing.enabled?'':'disabled'}>운용지시 확인</button><button class="secondary" data-action="keep-maturity-cash" data-cycle="${c.id}" ${timing.enabled?'':`disabled aria-describedby="${c.id}-reason"`}>${formatWon(c.remaining)} 현금 유지 지시 · 행동 1회</button>${timing.enabled?'':`<p id="${c.id}-reason" class="availability-reason">${timing.reason}</p>`}</details>`:''}<small>만기 ${c.maturityTurn}턴${c.notifiedTurn?` → 통지 생성 ${c.notifiedTurn}턴`:''}${c.presentedTurn?` → 통지 표시 ${c.presentedTurn}턴`:''}${c.orderedTurn?` → 주문 접수 ${c.orderedTurn}턴`:''}</small></li>`).join('');
  const renewals = d.renewals.map(r=>`<li>${r.turn}턴 · ${defaultPortfolio(r.optionId).name} 예금 ${formatWon(r.amount)} 재예치<small>새 약정 턴당 ${(r.rate*100).toFixed(2)}% · ${r.maturityTurn}턴 만기</small></li>`).join('');
  return `<section class="maturity-detail"><h3>만기자금 ${formatWon(total)}</h3><p>위 IRP 대기자금에 이미 포함된 금액입니다. 별도 자산으로 더하지 않습니다. 만기자금의 대기 이자는 대상액에 함께 반영합니다.</p><p class="hint">일반 매수에는 오래된 만기자금부터 사용합니다(게임 계산 규칙). 「이번엔 그대로」는 새 지시 없이 기다리는 선택이며 자동운용 대기를 취소하지 않습니다.</p>${!state.defaultOption&&waiting.length?'<button class="secondary" data-action="open-default-option">사전지정 확인</button>':''}<ul class="trade-timeline">${rows||'<li>대기 중이거나 처리한 만기자금이 없습니다.</li>'}</ul>${renewals?`<details><summary>혼합 옵션 내부 예금 재예치 기록</summary><p>이 게임의 가상 계약 조건입니다. 실제 상품별 만기 조건을 확인하세요.</p><ul class="trade-timeline">${renewals}</ul></details>`:''}</section>`;
}
