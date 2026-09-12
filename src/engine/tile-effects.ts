import { manualPortfolioValue, scopedHolding } from './position-engine';
import { depositLots } from './portfolio-engine';
import { scenarioConfig, withGlidePath } from './scenario-engine';
import { profileDistance } from './profile-engine';
import { balanceConfig, boardTiles, investorProfiles, learningCards, lifeEvents, policyRules, products } from '../data/content';
import type { BoardTile, GameState, ProductId, TileEffect } from '../types';
import { ALERT_CARD_ID, generateMarketPath, marketPathOf } from './market-engine';
import { portfolioValue, rebalanceShares } from './portfolio-engine';
import { riskAssetRatio } from './policy-engine';
import { hashSeed, nextRandom } from './random-engine';
import { behaviorProfile, diversificationNeeded, diversificationCount, monthlyPension } from './scoring-engine';

/** 은퇴 전망대가 굴리는 분기 시장 수 */
export const OUTLOOK_FORKS = 20;
/** 생활 사건 칸이 한 판에 추가할 수 있는 사건 수 */
export const EXTRA_LIFE_EVENT_CAP = 1;
/** 리밸런싱 칸 도착 턴의 리밸런싱 보너스(이해 포인트) */
export const REBALANCE_TILE_BONUS = 2;

export interface ArrivalContext {
  position: number;
  /** 이번 이동으로 출발 칸(연말정산)을 지났거나 그 칸에 멈췄다 */
  crossedStart: boolean;
  /** 이번 턴 시드 일정 사건이 이미 있다(추가 사건은 뽑지 않는다) */
  scheduledEvent: boolean;
}

interface Applied {
  state: GameState;
  effect: TileEffect | null;
}

const won = (value: number) => `${Math.round(value).toLocaleString('ko-KR')}원`;
const pct = (value: number) => `${Math.round(value * 100)}%`;

function unlock(state: GameState, cardId: string): GameState {
  return state.unlockedCards.includes(cardId) ? state : { ...state, unlockedCards: [...state.unlockedCards, cardId] };
}

function understand(state: GameState, points: number): GameState {
  return points ? { ...state, understandingPoints: state.understandingPoints + points } : state;
}

/**
 * 연말정산 칸 통과·도착: 보류 중인 세액공제를 생활자금으로 돌려준다. 납입이 없어도 장면은 열려
 * "납입하면 돌아온다"를 보여 준다. 최종 IRP·생활자금 합계는 환급 시점만 다르고 총액은 같다.
 */
export function refundTaxCredit(state: GameState, tileIndex = 0): Applied {
  const amount = state.pendingTaxCredit;
  const rounded = Math.round(amount);
  const detail = rounded > 0
    ? `이번 판 납입 ${won(state.contributionTotal)} → 세액공제 ${won(rounded)} 환급! 생활자금에 들어왔습니다.`
    : state.contributionTotal <= 0
      ? `아직 납입이 없어 환급 0원. 납입하면 공제 대상 ${won(policyRules.annualTaxCreditLimit)}까지 ${(policyRules.taxCreditRate * 100).toFixed(1)}%를 돌려받습니다.`
      : state.taxCreditEligible >= policyRules.annualTaxCreditLimit
        ? `공제 한도 ${won(policyRules.annualTaxCreditLimit)}를 이미 채워 새 환급이 없습니다. 납입 한도(${won(policyRules.annualContributionLimit)})와 공제 한도는 다릅니다.`
        : '지난 통과 뒤 새 납입이 없어 이번 환급은 0원입니다.';
  const next: GameState = rounded > 0
    ? {
      ...state,
      cash: state.cash + amount,
      pendingTaxCredit: 0,
      taxCreditRefunded: state.taxCreditRefunded + amount,
      logs: [...state.logs, { turn: state.turn, type: 'refund', message: `연말정산 통과 · 세액공제 ${won(rounded)} 환급`, impact: rounded }]
    }
    : state;
  return { state: next, effect: { kind: 'tax-refund', tileIndex, title: '연말정산 통과', detail, amount: rounded } };
}

function settlementNote(productId: ProductId): string {
  const product = products.find((item) => item.id === productId)!;
  if (product.kind === 'fund') return '기준가 확정·결제 대기는 일반 주문과 동일';
  if (product.kind === 'deposit') return '가입 건별 약정 유지 · 중도해지 시 발생 이자 조정';
  return '표시가격 즉시 체결';
}

function spotlight(state: GameState, tile: BoardTile): Applied {
  const productId = tile.productId!;
  const product = products.find((item) => item.id === productId)!;
  const sensitivity = product.duration > 0 ? ` · 금리 민감도 ${product.duration}` : '';
  return {
    state: { ...state, spotlightProductId: productId },
    effect: {
      kind: 'spotlight',
      tileIndex: tile.index,
      productId,
      title: `${tile.label} 스포트라이트`,
      detail: `${product.name} ${product.riskGrade}등급${sensitivity} · ${settlementNote(productId)} · 매수와 무관한 상품 정보`
    }
  };
}

function signalPreview(state: GameState, tile: BoardTile): Applied {
  const nextStep = marketPathOf(state)[state.turn];
  const alert = nextStep?.alert ?? null;
  const detail = !nextStep
    ? '마지막 턴이라 미리 볼 다음 신호가 없습니다.'
    : alert
      ? `한 턴 먼저 보는 신호: ${alert.text}. 신호는 예측이 아니라 대비할 이유입니다.`
      : '다음 턴에는 특별한 신호가 없습니다. 조용하다는 뜻은 아니니 분산을 지키세요.';
  return {
    state: alert ? unlock(state, ALERT_CARD_ID) : state,
    effect: { kind: 'signal-preview', tileIndex: tile.index, title: `${tile.label} · 신호 미리 보기`, detail, alert }
  };
}

export function pickExtraLifeEvent(seed: string, turn: number): string {
  const roll = nextRandom(hashSeed(`${seed}:tile-life:${turn}`));
  return lifeEvents[Math.floor(roll.value * lifeEvents.length)].id;
}

function extraLife(state: GameState, tile: BoardTile, ctx: ArrivalContext): Applied {
  const base = { kind: 'extra-life' as const, tileIndex: tile.index, title: '생활 사건 칸' };
  if (ctx.scheduledEvent) return { state, effect: { ...base, detail: '이번 턴은 이미 시드 일정 사건이 있어 추가 사건은 없습니다.' } };
  if (state.extraLifeEvents >= EXTRA_LIFE_EVENT_CAP) return { state, effect: { ...base, detail: '추가 사건은 한 판에 한 번. 이번 판 몫은 이미 겪었습니다.' } };
  if (state.turn < 2 || state.turn >= balanceConfig.maxTurns) return { state, effect: { ...base, detail: '첫 턴과 마지막 턴에는 사건이 나지 않습니다.' } };
  const eventId = pickExtraLifeEvent(state.seed, state.turn);
  const event = lifeEvents.find((item) => item.id === eventId)!;
  return {
    state: {
      ...state,
      currentEventId: eventId,
      awaitingAction: false,
      extraLifeEvents: state.extraLifeEvents + 1,
      eventHistory: [...state.eventHistory, eventId]
    },
    effect: { ...base, title: '생활 사건 칸 · 사건 하나 더', detail: `${event.title} — 시드 일정 밖의 사건이 왔습니다. 비상생활자금이 버티는지 보세요.`, eventId }
  };
}

function doubleAction(state: GameState, tile: BoardTile): Applied {
  return {
    state: { ...state, actionsLeft: 2 },
    effect: { kind: 'double-action', tileIndex: tile.index, title: '운용지시 칸 · 행동 2회', detail: '이번 턴은 두 번 행동할 수 있어요. 납입한 뒤 바로 매수하는 순서를 써 보세요. "그대로"는 남은 행동을 모두 씁니다.' }
  };
}

function policyBrief(state: GameState, tile: BoardTile): Applied {
  const card = learningCards.find((item) => item.category === '제도' && !state.unlockedCards.includes(item.id));
  const next = understand(card ? unlock(state, card.id) : state, 1);
  return {
    state: next,
    effect: {
      kind: 'policy-brief',
      tileIndex: tile.index,
      title: '제도 안내 · 카드 1장',
      detail: card ? `${card.title} — ${card.key} (이해 +1)` : '제도 카드를 모두 열었습니다. 이해 +1.',
      cardId: card?.id,
      understanding: 1
    }
  };
}

export function rebalanceGapLine(state: GameState): string {
  const total = manualPortfolioValue(state);
  const shares = rebalanceShares(state.profileId);
  return products
    .filter((product) => shares[product.id] > 0 || (scopedHolding(state,product.id).amount) > 0)
    .map((product) => {
      const current = total > 0 ? (scopedHolding(state,product.id).amount) / total : 0;
      return `${product.shortName} ${pct(current)}→${pct(shares[product.id])}`;
    })
    .join(' · ');
}

function rebalanceBonus(state: GameState, tile: BoardTile): Applied {
  return {
    state: { ...state, rebalanceBonusTurn: state.turn },
    effect: {
      kind: 'rebalance-bonus',
      tileIndex: tile.index,
      title: '리밸런싱 칸 · 지금 → 목표',
      detail: `${rebalanceGapLine(state)} · 이번 턴 리밸런싱하면 이해 +${REBALANCE_TILE_BONUS}`,
      understanding: REBALANCE_TILE_BONUS
    }
  };
}

/**
 * 지금 구성(보유 + 대기 주문, 대기자금은 그대로)을 남은 턴 동안 행동 없이 굴렸을 때의 월 연금 범위.
 * 실제 경로는 쓰지 않고 `seed:fork:k` 분기 20개를 만든다. 결정적이며, 미래를 보여 주지 않는다.
 */
export function outlookRange(state: GameState, forks = OUTLOOK_FORKS): { low: number; mid: number; high: number } {
  const pendingBuys = state.pendingOrders.filter((order) => order.side === 'buy');
  const pendingSells = state.pendingOrders.filter((order) => order.side === 'sell').reduce((sum, order) => sum + order.amount, 0);
  const results: number[] = [];
  for (let fork = 0; fork < forks; fork += 1) {
    const path = state.campaign ? withGlidePath(generateMarketPath(`${state.seed}:fork:${fork}`, scenarioConfig(state.campaign.scenario), state.lastMarket)) : generateMarketPath(`${state.seed}:fork:${fork}`);
    let holdings = state.holdings.map((holding) => ({ productId: holding.productId, amount: holding.amount }));
    for (const order of pendingBuys) {
      const index = holdings.findIndex((holding) => holding.productId === order.productId);
      if (index >= 0) holdings[index] = { ...holdings[index], amount: holdings[index].amount + order.amount };
      else holdings.push({ productId: order.productId, amount: order.amount });
    }
    for (let turn = state.turn + 1; turn <= balanceConfig.maxTurns; turn += 1) {
      const step = path.find(s => s.turn === turn)!;
      holdings = holdings.map((holding) => {
        const product = products.find((item) => item.id === holding.productId)!;
        if(state.campaign && holding.productId==='deposit') {
          const original=state.holdings.find(h=>h.productId==='deposit');
          const interest=original ? depositLots(state,original).reduce((sum,lot)=>sum+(turn<=lot.maturityTurn ? lot.principal*lot.ratePerTurn : 0),0) : 0;
          return {...holding,amount:holding.amount+interest};
        }
        const gross = holding.amount * (1 + step.returns[holding.productId]);
        return { ...holding, amount: Math.max(0, gross - Math.max(0, gross * product.feeRate)) };
      });
    }
    results.push(monthlyPension(state.irpCash + pendingSells + holdings.reduce((sum, holding) => sum + holding.amount, 0)));
  }
  results.sort((a, b) => a - b);
  const at = (q: number) => results[Math.min(results.length - 1, Math.floor(results.length * q))];
  return { low: at(0.1), mid: at(0.5), high: at(0.9) };
}

function outlook(state: GameState, tile: BoardTile): Applied {
  const range = outlookRange(state);
  const turnsLeft = balanceConfig.maxTurns - state.turn;
  const detail = turnsLeft <= 0
    ? `마지막 턴. 지금 월 연금 ${won(monthlyPension(portfolioValue(state)))} · 목표 ${won(state.goalMonthly)}.`
    : `지금 구성 그대로 ${turnsLeft}턴을 더 가면 월 연금 ${won(range.low)}~${won(range.high)} (중간 ${won(range.mid)}) · 목표 ${won(state.goalMonthly)}. 가상 20개 경로의 표본 범위이며 실제 확률이나 수익을 보장하지 않습니다.`;
  return {
    state: unlock(state, 'pension-assumption'),
    effect: { kind: 'outlook', tileIndex: tile.index, title: '은퇴 전망대 · 이대로 가면', detail, range }
  };
}

function profileCheck(state: GameState, tile: BoardTile): Applied {
  const diagnosed = investorProfiles.find((item) => item.id === state.profileId)!;
  const actual = investorProfiles.find((item) => item.id === behaviorProfile(state))!;
  const ratio = riskAssetRatio(state);
  const distance = profileDistance(state);
  const aligned = distance <= balanceConfig.profileAlignBand;
  const detail = `진단 ${diagnosed.name} · 현재 구성 유사 성향 ${actual.name}(규제 위험비중 ${pct(ratio)}, 목표 구성 차이 ${pct(distance)}) → ${aligned ? `${Math.round(balanceConfig.profileAlignBand * 100)}%p 이내 · 이해 +1` : '차이가 큽니다. 이번 판 성향은 고정입니다. 리밸런싱으로 구성을 점검하고 다른 성향은 다음 새 판 준비에서 확인하세요.'}`;
  return {
    state: understand(unlock(state, 'profile'), aligned ? 1 : 0),
    effect: { kind: 'profile-check', tileIndex: tile.index, title: '성향 점검', detail, understanding: aligned ? 1 : 0 }
  };
}

function diversifyCheck(state: GameState, tile: BoardTile): Applied {
  const count = diversificationCount(state);
  const need = diversificationNeeded(state.profileId);
  const ok = count >= need;
  return {
    state: ok ? understand(state, 1) : unlock(state, 'diversification'),
    effect: {
      kind: 'diversify-check',
      tileIndex: tile.index,
      title: '분산 광장',
      detail: ok
        ? `5% 이상 보유 상품 ${count}종 · 분산을 지키고 있어요 (이해 +1)`
        : `지금 ${count}종. ${need}종 이상으로 나누면 충격의 영향을 줄이는 데 도움이 될 수 있습니다.`,
      understanding: ok ? 1 : 0
    }
  };
}

function applyEffect(state: GameState, tile: BoardTile, ctx: ArrivalContext): Applied {
  switch (tile.effect) {
    case 'tax-refund': return { state, effect: null };
    case 'spotlight': return spotlight(state, tile);
    case 'signal-preview': return signalPreview(state, tile);
    case 'extra-life': return extraLife(state, tile, ctx);
    case 'double-action': return doubleAction(state, tile);
    case 'policy-brief': return policyBrief(state, tile);
    case 'rebalance-bonus': return rebalanceBonus(state, tile);
    case 'outlook': return outlook(state, tile);
    case 'profile-check': return profileCheck(state, tile);
    case 'diversify-check': return diversifyCheck(state, tile);
  }
}

/**
 * 턴 시작에서 시장 반영·급여 뒤에 호출. 출발 칸을 지났으면 환급이 먼저, 그다음 도착 칸 효과.
 * 도착 칸이 출발 칸이면 환급 한 번만. 결과는 `state.tileEffects`(0~2개)에 남는다.
 */
export function applyTileArrival(state: GameState, ctx: ArrivalContext): GameState {
  const tile = boardTiles[ctx.position];
  if (!tile) throw new Error(`알 수 없는 칸: ${ctx.position}`);
  const effects: TileEffect[] = [];
  let next = state;
  if (ctx.crossedStart) {
    const refunded = refundTaxCredit(next, 0);
    next = refunded.state;
    if (refunded.effect) effects.push(refunded.effect);
  }
  const applied = applyEffect(next, tile, ctx);
  next = applied.state;
  if (applied.effect) effects.push(applied.effect);
  return { ...next, tileEffects: effects };
}
