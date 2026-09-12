import { describe, expect, it } from 'vitest';
import { createGame, performAction, startTurn } from '../src/engine/game-engine';
import { applyMarketStep } from '../src/engine/market-engine';
import {
  HINT_DEFAULT,
  HINT_NEAR_LIMIT,
  HINT_OVER_LIMIT,
  HINT_PENDING_FUND,
  REACTION_CONTRIBUTE,
  REACTION_DEFAULT,
  reactionLine,
  summarizeTurn
} from '../src/engine/settlement-engine';
import { policyRules } from '../src/data/content';
import type { TurnSummary } from '../src/types';
import { renderSettlementModal } from '../src/ui/settlement';

const sceneFields = {
  productReturns: { deposit: 0.005, shortBond: 0.004, longBond: 0.006, balanced: 0.01, equityEtf: 0.02, tdf: 0.012 },
  holdingShares: { deposit: 0.6, shortBond: 0, longBond: 0, balanced: 0.4, equityEtf: 0, tdf: 0 },
  biggestMover: 'balanced' as const,
  reaction: REACTION_DEFAULT
};

/** 장부 필드를 채운 요약 픽스처. 시장이 한 일은 open→afterMarket, 내가 한 일은 before→after로 잡는다. */
function summaryFixture(input: Omit<TurnSummary, 'actionLines' | 'irpOpen' | 'irpAfterMarket' | 'marketDelta' | 'lifeDelta' | 'actionDelta' | 'tileEffects' | 'ghostIrp' | 'lifeEvent' | 'milestones'> & Partial<TurnSummary>): TurnSummary {
  const irpOpen = input.irpOpen ?? input.irpBefore;
  const irpAfterMarket = input.irpAfterMarket ?? input.irpBefore;
  return {
    actionLines: [input.actionLine],
    lifeEvent: null,
    milestones: [],
    irpOpen,
    irpAfterMarket,
    marketDelta: irpAfterMarket - irpOpen,
    lifeDelta: input.irpBefore - irpAfterMarket,
    actionDelta: input.irpAfter - input.irpBefore,
    tileEffects: [],
    ghostIrp: null,
    ...input
  };
}

describe('턴 정산 요약', () => {
  it('행동 전후 IRP·위험비중과 힌트를 만든다', () => {
    const started = startTurn(createGame('settle-hold'), 1);
    const state = started.state;
    if (state.currentEventId) return;
    const before = state;
    const after = performAction(state, { kind: 'hold' }).state;
    const summary = summarizeTurn(before, after, '이번 턴은 행동하지 않고 현재 구성을 유지했습니다.');
    expect(summary.turn).toBe(before.turn);
    expect(summary.actionLine).toContain('유지');
    expect(summary.irpAfter).not.toBeUndefined();
    expect(summary.riskAfter).toBeGreaterThanOrEqual(0);
    expect(summary.marketHeadline.length).toBeGreaterThan(0);
    expect(summary.nextHints.length).toBeGreaterThanOrEqual(1);
    expect(summary.nextHints.length).toBeLessThanOrEqual(2);
  });

  it('다음 턴 신호가 있으면 그 힌트를 첫 줄에 둔다', () => {
    const base = createGame('settle-alert');
    const before = { ...base, turn: 1, awaitingAction: true, currentEventId: null };
    const after = applyMarketStep(before, {
      ...before.lastMarket,
      turn: 1,
      alert: { level: 2, text: '다음 턴 금리 결정 · 빅스텝 인상 우려', hint: '장기채 비중을 점검하세요.' }
    });
    const summary = summarizeTurn(before, after, '그대로 두기');
    expect(summary.nextHints[0]).toBe('장기채 비중을 점검하세요.');
    expect(summary.alert?.level).toBe(2);
  });

  it('사후 한도 초과면 안전자산·리밸런싱 힌트를 준다', () => {
    const base = createGame('settle-over');
    const before = {
      ...base,
      turn: 1,
      awaitingAction: true,
      currentEventId: null,
      holdings: [
        { productId: 'deposit' as const, amount: 30_000_000, principal: 30_000_000, depositTurnsHeld: 4 },
        { productId: 'equityEtf' as const, amount: 70_000_000, principal: 70_000_000, depositTurnsHeld: 0 }
      ]
    };
    const after = {
      ...applyMarketStep(before, {
        ...before.lastMarket,
        headline: '주가 급등',
        shock: true,
        returns: { ...before.lastMarket.returns, deposit: 0, equityEtf: 0.5 }
      }),
      marketLimitExceeded: true,
      pendingOrders: []
    };
    const summary = summarizeTurn(before, after, '그대로 두기');
    expect(summary.marketLimitExceeded).toBe(true);
    expect(summary.shock).toBe(true);
    expect(summary.nextHints[0]).toBe(HINT_OVER_LIMIT);
    expect(summary.productDeltas[0]?.productId).toBe('equityEtf');
    expect(summary.productDeltas[0]?.delta).toBeGreaterThan(0);
  });

  it('펀드 대기 주문이 있으면 시차 힌트를 준다', () => {
    const before = createGame('settle-fund');
    const after = {
      ...before,
      turn: 1,
      pendingOrders: [{
        id: '1',
        side: 'buy' as const,
        productId: 'longBond' as const,
        amount: 5_000_000,
        submittedTurn: 1,
        settlesTurn: 2,
        stage: 'received' as const
      }],
      lastMarket: { ...before.lastMarket, headline: '금리 소폭 하락' }
    };
    const summary = summarizeTurn(before, after, '장기채 매수 주문 접수');
    expect(summary.nextHints).toContain(HINT_PENDING_FUND);
    expect(summary.nextHints.length).toBeLessThanOrEqual(2);
  });

  it('한도 근처이면 미리보기 힌트를 준다', () => {
    const before = createGame('settle-near');
    const after = {
      ...before,
      turn: 1,
      holdings: [
        { productId: 'deposit' as const, amount: 40_000_000, principal: 40_000_000, depositTurnsHeld: 4 },
        { productId: 'equityEtf' as const, amount: 66_000_000, principal: 66_000_000, depositTurnsHeld: 0 }
      ],
      irpCash: 0,
      pendingOrders: [],
      marketLimitExceeded: false,
      lastMarket: { ...before.lastMarket, headline: '보합' }
    };
    const summary = summarizeTurn(before, after, '유지');
    expect(summary.riskAfter).toBeGreaterThan(0.62);
    expect(summary.riskAfter).toBeLessThanOrEqual(policyRules.riskAssetLimit + 0.00001);
    expect(summary.nextHints).toContain(HINT_NEAR_LIMIT);
  });

  it('정산 모달에 전후 숫자와 다음 판단을 그린다', () => {
    const html = renderSettlementModal(summaryFixture({
      turn: 3,
      actionLine: '이번 턴은 행동하지 않고 현재 구성을 유지했습니다.',
      irpBefore: 108_000_000,
      irpAfter: 109_200_000,
      riskBefore: 0.2,
      riskAfter: 0.21,
      marketHeadline: '금리는 내리고 주가는 올랐습니다',
      shock: false,
      marketLimitExceeded: false,
      productDeltas: [{ productId: 'equityEtf', name: '주식 ETF', delta: 1_200_000 }],
      nextHints: [HINT_DEFAULT],
      ...sceneFields
    }));
    expect(html).toContain('3턴 정산');
    expect(html).toContain('정산 요약');
    expect(html).toContain('다음 판단');
    expect(html).toContain('다음 턴 준비');
    expect(html).toContain('주식 ETF');
    expect(html).toContain(HINT_DEFAULT);
    expect(html).toContain('data-action="dismiss-settle"');
    expect(html).not.toContain('settle-alert');
  });

  it('잔액 변화는 시장 손익·외부 입출금·매매 정산으로 나눈다', () => {
    const html = renderSettlementModal(summaryFixture({
      turn: 4,
      actionLine: '1,000,000원 추가납입.',
      irpOpen: 100_000_000,
      irpAfterMarket: 102_000_000,
      irpBefore: 102_000_000,
      irpAfter: 103_000_000,
      capitalFlow: 1_000_000,
      tradingDelta: 0,
      riskBefore: 0.2,
      riskAfter: 0.2,
      marketHeadline: '보합',
      shock: false,
      marketLimitExceeded: false,
      productDeltas: [],
      nextHints: [HINT_DEFAULT],
      ...sceneFields
    }));
    expect(html).toContain('settle-bars three');
    expect(html).toContain('턴 시작');
    expect(html).toContain('시장 반영');
    expect(html).toContain('정산 후');
    expect(html).toContain('100,000,000원');
    expect(html).toContain('102,000,000원');
    expect(html).toContain('103,000,000원');
    expect(html).toContain('시장 손익 +2,000,000원');
    expect(html).toContain('외부 입출금 +1,000,000원');
    expect(html).toContain('+3,000,000원');
    expect(html).not.toContain('생활사건');
    expect(html).toContain('시장이 한 일');
    expect(html).toContain('이미 보유분에 반영');
  });

  it('분해 원장이 없는 구 요약은 합산 변화로 표시하고 행동 2회는 번호 목록으로 보인다', () => {
    const html = renderSettlementModal(summaryFixture({
      turn: 5,
      actionLine: '1,000,000원 추가납입. · 예금 1,000,000원 매수',
      actionLines: ['1,000,000원 추가납입.', '예금 1,000,000원 매수'],
      irpOpen: 100_000_000,
      irpAfterMarket: 101_000_000,
      irpBefore: 99_000_000,
      irpAfter: 100_000_000,
      riskBefore: 0.2,
      riskAfter: 0.2,
      marketHeadline: '보합',
      shock: false,
      marketLimitExceeded: false,
      productDeltas: [],
      nextHints: [HINT_DEFAULT],
      ...sceneFields
    }));
    expect(html).toContain('시장 이후 변화 -1,000,000원 (입출금·거래 포함)');
    expect(html).toContain('settle-actions');
    expect(html).toContain('행동 2회');
    expect(html.match(/<li>/g)!.length).toBeGreaterThanOrEqual(2);
  });

  it('칸 효과와 고스트 비교 줄을 그리고, 고스트 설정을 끄면 비교 줄만 사라진다', () => {
    const summary = summaryFixture({
      turn: 6,
      actionLine: '유지',
      irpBefore: 100_000_000,
      irpAfter: 100_000_000,
      riskBefore: 0.2,
      riskAfter: 0.2,
      marketHeadline: '보합',
      shock: false,
      marketLimitExceeded: false,
      productDeltas: [],
      nextHints: [HINT_DEFAULT],
      tileEffects: [{ kind: 'tax-refund', tileIndex: 0, title: '연말정산 통과', detail: '세액공제 132,000원 환급!', amount: 132_000 }],
      ghostIrp: 98_500_000,
      ...sceneFields
    });
    const on = renderSettlementModal(summary);
    expect(on).toContain('칸 효과');
    expect(on).toContain('연말정산 통과');
    expect(on).toContain('+132,000원');
    expect(on).toContain('settle-ghost ahead');
    expect(on).toContain('고스트 IRP');
    expect(on).toContain('98,500,000원');
    expect(on).toContain('(+1,500,000원)');
    const off = renderSettlementModal(summary, { characters: true, ghost: false });
    expect(off).not.toContain('settle-ghost');
    expect(off).toContain('연말정산 통과');
  });

  it('요약에 상품 수익률·보유 비중·가장 큰 변화·반응 한 줄이 들어간다', () => {
    const base = createGame('settle-scene');
    const before = { ...base, turn: 2, awaitingAction: true, currentEventId: null };
    const after = applyMarketStep(before, {
      ...before.lastMarket,
      turn: 2,
      shock: true,
      returns: { ...before.lastMarket.returns, deposit: 0.01, balanced: -0.04, longBond: -0.09, equityEtf: -0.08 }
    });
    const summary = summarizeTurn(before, after, '그대로 두기');
    expect(summary.productReturns.longBond).toBe(-0.09);
    expect(summary.holdingShares.deposit).toBeGreaterThan(0.5);
    expect(summary.holdingShares.equityEtf).toBe(0);
    expect(summary.biggestMover).toBe('balanced');
    expect(summary.reaction).toContain('장기채');
  });

  it('반응 한 줄은 규칙 순서를 따른다', () => {
    const base = createGame('settle-reaction');
    const before = { ...base, turn: 3, awaitingAction: true, currentEventId: null };
    const calm = applyMarketStep(before, { ...before.lastMarket, turn: 3, returns: { ...before.lastMarket.returns } });
    expect(reactionLine(before, calm, '이번 턴은 행동하지 않고 현재 구성을 유지했습니다.')).toBe(REACTION_DEFAULT);
    expect(reactionLine(before, calm, '1,000,000원 추가납입, 세액공제 효과 132,000원(교육용)을 생활자금에 반영했습니다.')).toBe(REACTION_CONTRIBUTE);
    const rally = applyMarketStep(before, { ...before.lastMarket, turn: 3, returns: { ...before.lastMarket.returns, equityEtf: 0.08 } });
    expect(reactionLine(before, rally, '유지')).toContain('주식이 크게 올랐습니다');
    const drop = applyMarketStep(before, { ...before.lastMarket, turn: 3, returns: { ...before.lastMarket.returns, balanced: -0.06, deposit: -0.01 } });
    expect(reactionLine(before, drop, '유지')).toContain('평가액이 줄었습니다');
  });

  it('정산 모달은 IRP 막대·상품 막대·가장 큰 변화·반응을 그린다', () => {
    const html = renderSettlementModal(summaryFixture({
      turn: 6,
      actionLine: '유지',
      irpOpen: 100_000_000,
      irpAfterMarket: 97_000_000,
      irpBefore: 97_000_000,
      irpAfter: 97_000_000,
      riskBefore: 0.2,
      riskAfter: 0.19,
      marketHeadline: '기준금리가 한 번에 크게 오릅니다',
      shock: true,
      marketLimitExceeded: false,
      productDeltas: [{ productId: 'balanced', name: '혼합형', delta: -1_800_000 }],
      nextHints: [HINT_DEFAULT],
      productReturns: { deposit: 0.012, shortBond: -0.02, longBond: -0.09, balanced: -0.045, equityEtf: -0.03, tdf: -0.035 },
      holdingShares: { deposit: 0.6, shortBond: 0, longBond: 0, balanced: 0.4, equityEtf: 0, tdf: 0 },
      biggestMover: 'balanced',
      reaction: '장기채가 크게 밀렸습니다. 예금·단기채가 방어했는지 보세요.'
    }));
    expect(html).toContain('settle-bars');
    expect(html).toContain('settle-returns');
    expect(html.match(/class="settle-return /g)?.length).toBe(6);
    expect(html).toContain('mover');
    expect(html).toContain('settle-reaction');
    expect(html).toContain('장기채가 크게 밀렸습니다');
    expect(html).toContain('-3,000,000원');
    expect(html).toContain('-3.0%');
  });

  it('정산 모달은 다음 턴 신호를 따로 강조한다', () => {
    const html = renderSettlementModal(summaryFixture({
      turn: 5,
      actionLine: '유지',
      irpBefore: 100,
      irpAfter: 101,
      riskBefore: 0.2,
      riskAfter: 0.2,
      marketHeadline: '보합',
      shock: false,
      alert: { level: 2, text: '다음 턴 금리 결정 · 빅스텝 인상 우려', hint: '장기채 비중을 점검하세요.' },
      marketLimitExceeded: false,
      productDeltas: [],
      nextHints: ['장기채 비중을 점검하세요.'],
      ...sceneFields
    }));
    expect(html).toContain('settle-alert');
    expect(html).toContain('다음 턴 금리 결정');
  });

  it('한 줄 정리와 다음 판단은 코치 말풍선에 담기고, 캐릭터 끔이면 문구만 남는다', () => {
    let state = startTurn(createGame('settle-coach'), 2).state;
    if (state.currentEventId) state = { ...state, currentEventId: null, awaitingAction: true };
    const summary = performAction(state, { kind: 'hold' }).summary!;
    const on = renderSettlementModal(summary);
    const off = renderSettlementModal(summary, { characters: false });
    expect(on.match(/코치 펭귄/g)?.length).toBe(2);
    expect(off).not.toContain('코치 펭귄');
    for (const html of [on, off]) {
      expect(html).toContain('한 줄 정리');
      expect(html).toContain('다음 판단');
      expect(html).toContain(summary.reaction);
    }
  });
});
