import { renderChangeChart } from './mini-chart';
import { products } from '../data/content';
import type { MarketHoldingEffect } from '../types';

const won = (value: number) => `${value > 0 ? '+' : ''}${Math.round(value).toLocaleString('ko-KR')}원`;

/** 턴 시작에 기록한 시장 구간만 표시. 행동 후 잔액으로 과거 수익을 역산하지 않는다. */
export function renderMarketImpacts(effects: MarketHoldingEffect[] | undefined, turn: number, chart = true): string {
  if (turn === 0) return '';
  if (!effects) return '<p class="hint market-impact-unavailable">이전 저장에는 상품별 시장 반영 내역이 없습니다. 아래 숫자는 시장 예시이며 내 보유분 수익과 다릅니다.</p>';
  if (!effects.length) return '<div class="preview-box actual-market-impact"><strong>이번 시장에 노출된 보유분·주문 없음</strong><p>IRP 대기자금과 가격 확정 전 매수 대기금에는 시장 수익이 붙지 않습니다.</p></div>';
  const main = [...effects].sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta)).slice(0, 2);
  const bars = chart ? renderChangeChart(main.map(e => ({label: products.find(p=>p.id===e.productId)!.shortName, value:e.delta, kind:'market'})), '실제 보유 손익 · 이번 턴 주요 영향') : '';
  const rows = main.map(effect => {
    const name = products.find(p => p.id === effect.productId)!.shortName;
    return `<li><div><strong>${name}</strong><b class="${effect.delta < 0 ? 'neg' : 'pos'}">${won(effect.delta)} <small>(${effect.returnRate > 0 ? '+' : ''}${(effect.returnRate * 100).toFixed(2)}%)</small></b></div><small>${effect.productId === 'deposit' ? '가입 건별 약정·만기 반영 · 시장 예시와 다름' : '실제 가격 변동·상품 보수 반영'}</small></li>`;
  }).join('');
  return `<div class="preview-box actual-market-impact"><strong>내 보유분에 실제 반영 · 주요 ${Math.min(2, effects.length)}개</strong>${bars}<ul>${rows}</ul><small>턴 시작 시장 구간 · 매매·납입 전. 가격 변동 중인 대기 주문 포함.</small></div>`;
}
