import { products } from '../data/content';
import type { ProductId } from '../types';

/** One vocabulary for contextual help and the always-available reference. */
export const learningTerms = {
  contribute: ['돈 넣기 · 추가납입', '생활자금을 IRP 안으로 옮겨요. 상품을 사는 것은 별도 선택이며, 납입액은 투자 수익이 아니에요.'],
  buy: ['상품 사기 · 매수', 'IRP 대기자금으로 상품을 사요. 주문을 확정하면 그 돈은 다른 주문에 동시에 쓸 수 없어요.'],
  sell: ['상품 팔기 · 매도·환매', '보유 상품을 팔아요. 결제가 끝난 대금은 IRP 대기자금으로 돌아오며 생활자금으로 인출되지는 않아요.'],
  switch: ['다른 상품으로 · 교체매매', '기존 상품을 팔고 그 대금으로 다른 상품을 사요. 결제를 기다려야 하거나, 조건에 따라 일부만 매수될 수 있어요.'],
  rebalance: ['구성 다시 맞추기 · 리밸런싱', '성향에 맞춘 목표 비중과 현재 구성을 비교해 사고팔아요. 수익을 보장하지 않으며 이 게임에서는 직접 운용분에만 적용해요.'],
  pending: ['처리 중인 주문 · 미결제', '접수했지만 상품이나 대금의 이동이 끝나지 않은 주문이에요. IRP 총액에는 포함되지만 결제 전에는 다시 사용할 수 없어요.'],
  price: ['가격 정하기 · 기준가 확정', '펀드를 몇 좌 사고팔지 계산할 가격이 정해지는 단계예요. 가격 확정과 상품·대금이 들어오는 결제는 별개예요.'],
  designation: ['미리 정한 운용방법 · 사전지정', '만기자금을 지시 없이 둘 때 적용할 디폴트옵션을 미리 정해요. 지정 즉시 모든 현금이 매수되는 것은 아니에요.'],
  optIn: ['디폴트옵션 직접 사기 · 옵트인', '자동운용 대기를 기다리지 않고 선택한 디폴트옵션의 매수를 직접 지시해요. 사전지정 변경과는 별개예요.'],
  optOut: ['디폴트옵션에서 나오기 · 옵트아웃', '다른 운용방법으로 바꾸는 선택이에요. 이 게임에서는 보유 옵션을 묶음으로 환매하고 결제대금을 IRP 안에 남겨요. 사전지정 해제나 계좌 밖 인출이 아니에요.'],
  risk: ['위험등급과 위험자산 한도', '이 게임의 가상 위험등급은 1에 가까울수록 위험이 커요. 규제상 위험자산 분류와는 다른 기준이며, 채권형·적격 TDF도 원금 손실이 가능해요. 실제 상품·금융회사의 등급과 요건은 별도 확인해야 해요.']
} as const;
export type LearningTerm = keyof typeof learningTerms;
export const operationLabels = {
  contribute: learningTerms.contribute[0], buy: learningTerms.buy[0], sell: '상품 팔기 · 매도',
  switch: learningTerms.switch[0], rebalance: learningTerms.rebalance[0], default: '디폴트옵션 사기·나오기 · 옵트인/아웃'
} as const;

export function renderTermHelp(keys: readonly LearningTerm[], title = '말뜻이 궁금해요'): string {
  return `<details class="term-help" data-preserve-open data-key="terms-${keys.join('-')}"><summary>${title}<span aria-hidden="true">＋</span></summary><dl>${keys.map(key => `<div><dt>${learningTerms[key][0]}</dt><dd>${learningTerms[key][1]}</dd></div>`).join('')}</dl></details>`;
}

export function renderProductHelp(id: ProductId): string {
  const product = products.find(p => p.id === id)!;
  return `<details class="term-help product-help" data-preserve-open data-key="product-help-${id}"><summary>${product.shortName} · 세 줄로 알아보기<span aria-hidden="true">＋</span></summary><dl>
    <div><dt>무엇에 투자하나요?</dt><dd>${product.description}</dd></div>
    <div><dt>돈이 줄어들 수 있나요?</dt><dd>${product.principal_guaranteed ? '약정 만기까지 원리금을 보장하는 게임 가정이에요. 중도해지하면 이자가 줄고 물가 위험은 남아요.' : '원금 손실이 가능해요. 가격은 시장에 따라 달라지고 운용보수도 반영돼요.'}</dd></div>
    <div><dt>언제 처리되나요?</dt><dd>${product.kind === 'fund' ? '게임에서는 접수 다음 턴 가격 확정, 그다음 턴 결제예요.' : '게임에서는 확정하는 턴에 즉시 처리해요.'} 실제 상품 일정과 다르며 이번 주문의 정확한 단계는 아래 시간표에서 확인해요.</dd></div></dl></details>`;
}

export function renderLearningReference(): string {
  return `<section class="learning-reference" aria-label="언제든 보는 용어와 상품"><h3>용어·상품 사전</h3><p>학습 카드를 모으지 않아도 언제든 볼 수 있어요.</p>${renderTermHelp(Object.keys(learningTerms) as LearningTerm[], '게임에서 만나는 말뜻')}${products.map(p => renderProductHelp(p.id)).join('')}</section>`;
}
