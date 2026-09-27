import { actionAvailability, type Operation } from '../engine/action-availability';
import { actionTiming, MIN_TRADE_AMOUNT } from '../engine/action-constraints';
import { previewContribution } from '../engine/contribution-engine';
import { activeCycle } from '../engine/maturity-cash';
import { riskAssetRatio } from '../engine/policy-engine';
import { profileLimits } from '../engine/profile-engine';
import { balanceConfig, policyRules } from '../data/content';
import type { GameState } from '../types';
import { operationIcon } from './design-system';
import { formatWon } from './format';
import { riskRatioLabel } from './turn-notices';

export type PortfolioSection = 'overview' | 'orders' | 'maturity';
type Destination = { operation: Exclude<Operation, 'hold'> } | { portfolio: PortfolioSection };
export type GuidanceChoice = Destination & { id: string; title: string; description: string };
export interface ActionGuidance {
  kind: 'timing' | 'living' | 'risk' | 'locked' | 'maturity' | 'pending' | 'cash' | 'holdings';
  title: string; body: string; choices: GuidanceChoice[];
}

/** Read-only UI policy: same availability as the full menu; no forecasts or automatic trades. */
export function actionGuidance(state: GameState): ActionGuidance {
  const available = (operation: Operation) => actionAvailability(state, operation).enabled;
  const op = (operation: Exclude<Operation, 'hold'>, title: string, description: string): GuidanceChoice | null =>
    available(operation) ? { id: operation, operation, title, description } : null;
  const portfolio = (section: PortfolioSection, title: string, description: string): GuidanceChoice =>
    ({ id: `portfolio-${section}`, portfolio: section, title, description });
  const overview = portfolio('overview', '내 돈의 위치 확인', '생활자금과 IRP 안의 돈을 나누어 봐요.');
  const orders = portfolio('orders', '주문 진행 확인', '가격 확정·결제 턴을 확인해요.');
  const buy = op('buy', '대기자금으로 상품 살펴보기', '매수 미리보기 · 성향과 가능 금액을 확인해요.');
  const safeCash = profileLimits(state).safeCash;
  const spare = state.cash - state.livingDebt - safeCash;
  const quote = previewContribution(state, { requested: Math.min(balanceConfig.contributionAmount, state.cash) });
  // A default draft that crosses this game's living-cash floor is not put on the short list.
  // The full menu remains available: this is guidance, not a new financial restriction.
  const contribute = spare >= MIN_TRADE_AMOUNT && quote.accepted <= spare
    ? op('contribute', '은퇴자금 더하기', '추가납입 미리보기 · 납입 후 생활자금도 확인해요.') : null;
  const result = (kind: ActionGuidance['kind'], title: string, body: string, ...choices: Array<GuidanceChoice | null>): ActionGuidance =>
    ({ kind, title, body, choices: choices.filter((c): c is GuidanceChoice => c !== null).filter((c, i, all) => all.findIndex(other => other.id === c.id) === i).slice(0, 2) });
  if (!actionTiming(state).enabled) return result('timing', '먼저 이번 턴의 순서를 마쳐요', '시장과 생활사건을 확인한 뒤 운용을 선택할 수 있어요.');
  if (state.livingDebt > 0 || state.cash - state.livingDebt < safeCash) {
    const cash = state.livingDebt > 0 ? `미지급 생활비 ${formatWon(state.livingDebt)}가 있어요.` : `생활자금이 이번 판 기준 ${formatWon(safeCash)}보다 적어요.`;
    return result('living', '생활자금부터 확인해요', `${cash} IRP 상품을 팔아도 생활 지갑으로 바로 인출되지는 않아요.`, overview, buy);
  }
  const risk = riskAssetRatio(state);
  if (risk > policyRules.riskAssetLimit + .00001) return result('risk', '위험자산 비중을 먼저 점검해요',
    `현재 ${riskRatioLabel(risk)}로 게임 한도 ${riskRatioLabel(policyRules.riskAssetLimit)}를 넘었어요. 기존 대기자금으로 예금을 사도 이 비중이 낮아지지는 않아요.`,
    op('rebalance', '분산 비중 점검하기', '리밸런싱 미리보기 · 바뀔 비중과 주문을 확인해요.') ?? (state.pendingOrders.length || state.rebalancePlan ? orders : overview),
    op('sell', '보유상품 매도 살펴보기', '매도 미리보기 · 상품과 금액에 따라 결과가 달라요.') ?? overview);
  if (state.rebalancePlan) return result('locked', '리밸런싱 주문이 진행 중이에요', '매매가 잠시 제한돼요. 기존 주문의 결제를 확인하고 다음 선택을 준비해요.', orders, contribute);
  const maturity = state.defaultLifecycle?.cycles.filter(activeCycle) ?? [];
  if (maturity.length) return result('maturity', '만기된 돈의 다음 단계를 확인해요',
    `대기자금 중 ${formatWon(maturity.reduce((sum, c) => sum + c.remaining, 0))}이 만기자금이에요. 통지·자동운용 상태를 확인하고 직접 운용할 수도 있어요.`,
    portfolio('maturity', '만기자금 진행 확인', '통지와 자동주문 예정, 직접 운용 방법을 확인해요.'), buy);
  if (state.pendingOrders.length) return result('pending', '이전 주문이 아직 처리 중이에요',
    '처리 중인 돈은 지금 다시 쓸 수 없어요. 남은 대기자금이 있으면 다른 상품을 살펴볼 수 있어요.', orders, buy ?? contribute);
  if (buy) return result('cash', 'IRP 안에 운용할 대기자금이 있어요',
    state.turn === 12 ? '마지막 턴이에요. 새 주문은 최종 정산되며 이번 판의 추가 시장 수익은 없어요.' : '성향에 맞는 상품의 특징과 손실 가능성을 비교해보세요. 시장 방향과 수익은 확정되지 않았어요.', buy, contribute ?? overview);
  return result('holdings', '현재 구성을 보고 선택해요', '대기자금이 적어 새 매수는 어려워요. 여유 생활자금과 이미 보유한 상품을 확인해보세요.',
    contribute ?? overview,
    op('sell', '보유상품 매도 살펴보기', '매도 미리보기 · 대금은 IRP 안에 남아요.') ?? op('default', '디폴트옵션 운용분 살펴보기', '가능한 직접 매수·환매 지시를 확인해요.'));
}

export function renderActionHint(guide: ActionGuidance): string {
  return `<aside class="beginner-action-hint" data-guidance="${guide.kind}" aria-label="지금 확인할 한 가지"><p class="eyebrow">지금 확인할 한 가지</p><h3>${guide.title}</h3><p>${guide.body}</p></aside>`;
}
export function renderPurposeChoices(guide: ActionGuidance): string {
  return `<div class="purpose-choices" aria-label="지금 살펴볼 수 있는 선택">${guide.choices.map(c => `<button class="purpose-choice" data-action="guidance-choice" data-choice="${c.id}">${operationIcon('operation' in c ? c.operation : 'default')}<span><strong>${c.title}</strong><small>${c.description}</small></span><span class="purpose-arrow" aria-hidden="true">›</span></button>`).join('')}</div>`;
}
