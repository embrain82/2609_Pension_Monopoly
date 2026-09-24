import { describe, expect, it } from 'vitest';
import { actionGuidance } from '../src/ui/action-guidance';
import { actionAvailability } from '../src/engine/action-availability';
import { createGame, performAction, startTurn, resolveLifeEvent } from '../src/engine/game-engine';
import { buyProduct } from '../src/engine/portfolio-engine';
import { riskAssetRatio, expectedRiskAfterBuy } from '../src/engine/policy-engine';
import { profileLimits } from '../src/engine/profile-engine';
import { PROFILE_IDS } from '../src/engine/profile-engine';
import { SCENARIOS } from '../src/engine/scenario-engine';
import type { GameState } from '../src/types';

const open = (): GameState => ({ ...startTurn(createGame('guidance', 'aggressive', 500000, {
  defaultLifecycle: true, defaultOption: 'midRisk', scenario: 'classic', ghost: false, contributionPacing: true
}), 5).state, currentEventId: null, awaitingAction: true, actionsLeft: 2, cash: 12_000_000, irpCash: 1_000_000 });
const ids = (g: GameState) => actionGuidance(g).choices.map(c => c.id);

describe('현재 상태로만 판단하는 초보자 힌트', () => {
  it('생활자금 부족과 미지급 생활비를 가장 먼저 보고 납입을 권하지 않는다', () => {
    const g = { ...open(), cash: 500000, livingDebt: 100000, marketLimitExceeded: true };
    expect(actionGuidance(g).kind).toBe('living'); expect(ids(g)).not.toContain('contribute');
    expect(actionGuidance(g).body).toContain('생활 지갑으로 바로 인출되지는');
    const spare = { ...open(), cash: profileLimits(g).safeCash + 100000 };
    expect(ids(spare)).not.toContain('contribute'); // the 1m default draft would cross the floor
  });
  it('현재 위험비중으로 판단하고 예금 매수만으로 비중이 낮아진다고 설명하지 않는다', () => {
    const g = { ...open(), holdings: [{ productId: 'equityEtf' as const, amount: 75000000, principal: 75000000, depositTurnsHeld: 0 }], irpCash: 25000000 };
    expect(actionGuidance(g).kind).toBe('risk'); expect(ids(g)).toEqual(['rebalance', 'sell']);
    expect(actionGuidance(g).body).toContain('낮아지지는 않아요');
    expect(expectedRiskAfterBuy(g, 'deposit', 1000000)).toBe(riskAssetRatio(g));
    const fixed = { ...g, irpCash: 40000000, marketLimitExceeded: true };
    expect(actionGuidance(fixed).kind).toBe('cash');
  });
  it('일반 펀드 전액 주문 뒤 매수 카드를 제거하고 처리 중 조회로 바꾼다', () => {
    const g = open(), before = actionGuidance(g);
    expect(before.kind).toBe('cash'); expect(ids(g)).toContain('buy');
    const result = performAction(g, { kind: 'buy', productId: 'shortBond', amount: g.irpCash });
    expect(result.ok).toBe(true); expect(result.state.actionsLeft).toBe(1);
    expect(actionGuidance(result.state).kind).toBe('pending');
    expect(ids(result.state)).toContain('portfolio-orders'); expect(ids(result.state)).not.toContain('buy');
  });
  it('납입 소진과 거래 잠금에 맞춰 목적 카드도 제한한다', () => {
    const exhausted = { ...open(), contributionTotal: 18000000 };
    expect(ids(exhausted)).not.toContain('contribute');
    const planned = { ...open(), rebalancePlan: { deposit: .5, shortBond: .5, longBond: 0, balanced: 0, equityEtf: 0, tdf: 0 } };
    expect(actionGuidance(planned).kind).toBe('locked'); expect(ids(planned)).toContain('portfolio-orders');
    for (const c of actionGuidance(planned).choices) if ('operation' in c) expect(actionAvailability(planned, c.operation).enabled).toBe(true);
  });
  it('만기자금은 실제 만기 원장에서 판단하고 일반 주문만 있는 경우와 구분한다', () => {
    let g = open();
    while (g.turn < 3) {
      if (g.currentEventId) g = resolveLifeEvent(g, 'cash').state;
      if (g.awaitingAction) g = performAction(g, { kind: 'hold' }).state;
      g = startTurn(g, 1).state;
    }
    g = { ...g, cash: 12000000, currentEventId: null };
    expect(actionGuidance(g).kind).toBe('maturity'); expect(ids(g)).toContain('portfolio-maturity');
    expect(actionGuidance(g).body).toContain('대기자금 중');
  });
  it('생활 사건 해결 전과 종료 후에는 목적 카드를 만들지 않는다', () => {
    for (const change of [{ currentEventId: 'moving' }, { awaitingAction: false }, { actionsLeft: 0 }, { status: 'finished' as const }]) {
      expect(actionGuidance({ ...open(), ...change }).choices).toEqual([]);
    }
  });
  it('5 성향·4 시장·자금 경계·대기 주문에서 카드와 메뉴 가능 여부가 일치하고 조회가 상태를 바꾸지 않는다', () => {
    for (const profileId of PROFILE_IDS) for (const scenario of Object.keys(SCENARIOS) as Array<keyof typeof SCENARIOS>) {
      const base = { ...open(), profileId, campaign: createGame('guide-matrix', profileId, 500000, { scenario, ghost: false }).campaign };
      for (const irpCash of [0, 99999, 100000, 2000000]) {
        const state = { ...base, irpCash }, order = buyProduct({ ...state, irpCash: 1000000 }, 'shortBond', 1000000);
        for (const g of [state, ...(order.ok ? [order.state] : [])]) {
          const original = JSON.stringify(g), guide = actionGuidance(g);
          expect(guide.choices.length).toBeLessThanOrEqual(2);
          expect(new Set(guide.choices.map(c => c.id)).size).toBe(guide.choices.length);
          for (const c of guide.choices) if ('operation' in c) expect(actionAvailability(g, c.operation).enabled, c.id).toBe(true);
          expect(JSON.stringify(g)).toBe(original);
        }
      }
    }
  });
});
