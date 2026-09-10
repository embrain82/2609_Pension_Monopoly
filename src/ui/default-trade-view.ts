import { defaultTabAvailability } from '../engine/action-availability';
import { defaultInConstraint, defaultOutConstraint, MIN_TRADE_AMOUNT } from '../engine/action-constraints';
import { DEFAULT_PORTFOLIOS, DEFAULT_PORTFOLIO_REVIEW, allowedPortfolios, defaultPortfolio } from '../data/default-portfolios';
import { products } from '../data/content';
import { defaultScopes, defaultValue, scopedHolding } from '../engine/position-engine';
import { nextDefaultCommand, previewDefaultOptIn, previewDefaultOptOut, type DefaultTradeDraft } from '../engine/default-trade-engine';
import { equityExposureRatio, riskAssetRatio } from '../engine/policy-engine';
import type { GameState } from '../types';
const won=(n:number)=>`${Math.round(n).toLocaleString('ko-KR')}원`;
const pct=(n:number)=>`${(n*100).toFixed(1)}%`;

export function renderDefaultOrderStatus(state: GameState): string {
  if(!state.defaultTrading?.groups.length) return '';
  return `<details class="default-order-history"><summary>디폴트옵션 주문 기록</summary><ul class="order-list">${state.defaultTrading.groups.map(g=>{
    const pending=state.pendingOrders.filter(o=>g.orderIds.includes(o.id));
    const status=!pending.length?'결제 완료':pending.some(o=>o.stage==='received')?'접수 · 가격확정 대기':'가격확정 · 결제 대기';
    const settlement = pending.length ? Math.max(...pending.map(o=>o.settlesTurn)) : 0;
    return `<li>${g.turn}턴 · ${defaultPortfolio(g.scope.optionId).name} ${g.kind==='in'?'매수':'환매'} · ${status}${pending.length<g.orderIds.length&&pending.length?' · 일부 결제':''}<small>접수 당시 ${won(g.amount)}${pending.length?settlement>12?' · 12턴 종료 후 최종 정산 예정':` · ${settlement}턴까지 결제 예정`:''}</small></li>`;
  }).join('')}</ul></details>`;
}
export function renderDefaultHoldings(state: GameState): string {
  if(!state.defaultTrading) return '';
  const scopes=defaultScopes(state);
  return `<section class="default-positions"><h3>디폴트옵션 운용분</h3>${scopes.length?scopes.map(scope=>`<div class="preview-box"><strong>${defaultPortfolio(scope.optionId).name} · ${won(defaultValue(state,scope))}</strong><p>${defaultPortfolio(scope.optionId).products.map(id=>`${products.find(p=>p.id===id)!.shortName} ${won(scopedHolding(state,id,scope).amount)}`).join(' · ')}${state.pendingOrders.some(o=>o.defaultScope?.mandateId===scope.mandateId)?' · 합계에 미결제 주문 포함':''}</p><small>일반 매도·리밸런싱에서 제외됩니다. 디폴트옵션 메뉴에서 묶음으로 환매하세요.</small></div>`).join(''):'<p>보유한 디폴트옵션이 없습니다.</p>'}${renderDefaultOrderStatus(state)}</section>`;
}
export function renderDefaultTrade(state: GameState, draft: DefaultTradeDraft): string {
  const scopes=defaultScopes(state),held=scopes[0],isIn=draft.tab==='in';
  const option=defaultPortfolio(isIn?draft.optionId:held?.optionId??draft.optionId);
  const allowed=new Set(allowedPortfolios(state.profileId).map(p=>p.id));
  const plan=isIn?previewDefaultOptIn(state,draft.optionId,draft.amount):previewDefaultOptOut(state,draft.fraction);
  const tabs = defaultTabAvailability(state);
  const selection=state.defaultOption?defaultPortfolio(state.defaultOption).name:'지정 안 함';
  const schedule=plan.legs.map(l=>{const p=products.find(p=>p.id===l.productId)!;return `<li>${p.shortName} · ${isIn?'':'평가액 약 '}${won(l.amount)}<small>${p.kind==='fund'?`접수 ${state.turn}턴 → 기준가 ${state.turn+1>12?'최종 정산':`${state.turn+1}턴`} → 결제 ${state.turn+2>12?'최종 정산':`${state.turn+2}턴`}`:isIn?'이번 턴 신규 예금 약정 가입':'이번 턴 반영 · 예금 중도해지 조건 적용'}</small></li>`;}).join('');
  return `<button class="text-button" data-action="action-view" data-view="menu">← 운용지시</button>
    <p class="eyebrow">TURN ${state.turn} · 확정 시 행동 1회</p><h2>디폴트옵션</h2>
    <p>사전지정: <strong>${selection}</strong> · 현재 보유: <strong>${held?defaultPortfolio(held.optionId).name:'없음'}</strong></p>
    <div class="default-trade-stats"><div><small>디폴트옵션 보유·주문</small><strong>${won(defaultValue(state))}</strong></div><div><small>주문 가능 IRP 대기자금</small><strong>${won(state.irpCash)}</strong></div></div>
    <div class="tab-row default-trade-tabs" role="group" aria-label="디폴트옵션 거래 선택">${(['in', 'out'] as const).map(tab => `<div><button class="${draft.tab === tab ? 'active' : ''}" aria-pressed="${draft.tab === tab}" data-action="default-trade-tab" data-tab="${tab}" ${tabs[tab].enabled ? '' : `disabled aria-describedby="default-${tab}-reason"`}>${tab === 'in' ? '직접 매수<small>옵트인</small>' : '직접 운용 전환<small>옵트아웃</small>'}</button>${tabs[tab].enabled ? '' : `<p class="availability-reason" id="default-${tab}-reason">${tabs[tab].reason}</p>`}</div>`).join('')}</div>
    ${isIn?`<label for="default-trade-option">매수할 옵션</label><select id="default-trade-option">${DEFAULT_PORTFOLIOS.map(p=>`<option value="${p.id}" ${p.id===draft.optionId?'selected':''} ${!allowed.has(p.id)||(held&&held.optionId!==p.id)?'disabled':''}>${p.name} · 가상 ${p.riskGrade}등급${!allowed.has(p.id)?' · 성향 밖':held&&held.optionId!==p.id?' · 보유 옵션 환매 후 선택':''}</option>`).join('')}</select><p>${option.blurb}</p><label for="default-trade-amount">매수 금액 (원)</label><input id="default-trade-amount" type="number" inputmode="numeric" min="100000" step="1" max="${Math.floor(state.irpCash)}" value="${draft.amount}">`: '<p>디폴트옵션 구성품을 같은 비율로 환매합니다. 직접 매수한 같은 상품은 유지됩니다.</p>'}
    <div class="amount-presets default-trade-presets">${([.5, 1] as const).map(fraction => {
      const amount = isIn ? Math.floor(state.irpCash * fraction) : (held ? option.products.reduce((sum,id) => sum + scopedHolding(state,id,held).amount,0) : 0) * fraction;
      const available = isIn ? defaultInConstraint(state,draft.optionId,amount) : defaultOutConstraint(state,fraction);
      const active = amount > 0 && available.enabled && (isIn ? draft.amount === amount : draft.fraction === fraction);
      return `<div><button class="${active ? 'active' : ''}" aria-pressed="${active}" data-action="default-trade-${isIn ? 'amount' : 'fraction'}" data-fraction="${fraction}" ${available.enabled ? '' : `disabled aria-describedby="preset-${fraction}-reason"`}><span>${isIn ? fraction === .5 ? '대기자금 절반' : '대기자금 전액' : fraction === .5 ? '보유분 50%' : '보유분 전부'}</span><small>${isIn ? '' : '약 '}${won(amount)}</small></button>${available.enabled ? '' : `<p class="availability-reason" id="preset-${fraction}-reason">${isIn && amount < MIN_TRADE_AMOUNT ? '최소 매수금액 10만원 미만' : available.reason}</p>`}</div>`;
    }).join('')}</div>
    <div class="preview-box ${plan.ok?'':'warning'}" aria-live="polite"><strong>${plan.ok?'지시 미리보기':'지시 전 확인'}</strong><p>${plan.message}</p>${plan.ok?`<ul class="order-list">${schedule}</ul><p>${isIn?`접수 후 대기자금 ${won(plan.state.irpCash)}`:`이번 턴 현금 반영 ${won(plan.state.irpCash-state.irpCash)} · 이자 조정 ${won(plan.costs)}`}</p><p>규제 위험비중 ${pct(riskAssetRatio(state))} → ${pct(riskAssetRatio(plan.state))}<br>기초 주식 노출 ${pct(equityExposureRatio(state))} → ${pct(equityExposureRatio(plan.state))}</p>`:''}</div>
    <p class="hint">${isIn?'지정만으로 매수되지 않습니다. 위 구성비는 신규 매수 비중이며 시장 변동 후에는 달라집니다.':'환매대금은 결제 후 IRP 안에 남습니다. 사전지정 해제나 계좌 밖 인출이 아닙니다.'} 펀드 일정은 실제 영업일이 아닌 게임 시간입니다.${state.turn>=11?' 12턴을 넘는 주문은 추가 시장·급여 없이 종료 시점의 가격으로 최종 정산합니다.':''}</p>
    <div class="button-stack"><button class="primary jumbo" data-action="submit-default-trade" data-command="${nextDefaultCommand(state)}" ${plan.ok?'':'disabled'}>${isIn?`${won(draft.amount)} 매수 지시`:`보유분 ${draft.fraction*100}% 환매 지시`}</button><button class="secondary" data-action="action-portfolio">포트폴리오 확인</button></div>
    ${renderDefaultOrderStatus(state)}<details><summary>가상 상품과 제도 가정</summary><p>${DEFAULT_PORTFOLIO_REVIEW.assumption}</p><p>사전지정·통지·대기에 따른 자동운용은 이 버전에서 실행하지 않습니다.</p><a href="${DEFAULT_PORTFOLIO_REVIEW.source}" target="_blank" rel="noreferrer">제도 근거</a> · 검수 ${DEFAULT_PORTFOLIO_REVIEW.reviewedAt}</details>`;
}
