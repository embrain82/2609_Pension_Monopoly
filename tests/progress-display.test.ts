import { describe, expect, it } from 'vitest';
import { createGame } from '../src/engine/game-engine';
import { missionDisplay } from '../src/engine/progress-engine';
import { calculateScore, starChecklist } from '../src/engine/scoring-engine';
import { normalizeMissionMilestones, stampMilestones, isUrgent } from '../src/engine/milestones';
import type { MissionId } from '../src/engine/scenario-engine';
import { resultShareText } from '../src/engine/achievements';
import { renderGoalMeter, goalStatusLine } from '../src/ui/hud';
import { renderCampaignStatus } from '../src/ui/campaign-view';
import { renderPayoutModal } from '../src/ui/payout-view';
import { parseCheckpoint, type PlayCheckpoint } from '../src/ui/play-checkpoint';
import type { GameState, PayoutChoice } from '../src/types';

function sample(mission: MissionId, passed: boolean, payoutChoice: PayoutChoice = 'annuity20'): GameState {
  const state = createGame('progress-review', 'balanced', 500_000, { scenario: 'classic', mission, ghost: false });
  return { ...state, turn: 12, status: 'finished', payoutChoice, holdings: [], irpCash: passed ? 150_000_000 : 108_000_000,
    cash: passed ? 18_000_000 : 9_208_462, campaign: { ...state.campaign!, index: passed ? 1.1 : .9, priceIndex: 1 } };
}

describe('F02 미션 표시의 공통 판정', () => {
  for (const mission of ['pension', 'cushion', 'purchasing'] as const) {
    for (const passed of [false, true]) {
      it(`${mission} ${passed ? '달성' : '미달'}: 두 수령 방식의 HUD·결과·공유·수령 카드가 같은 미션을 표시한다`, () => {
        for (const payout of ['annuity20', 'lumpSum'] as const) {
          const state = sample(mission, passed, payout), before = structuredClone(state);
          const score = calculateScore(state), display = missionDisplay(state, score);
          expect(display.passed).toBe(passed);
          expect(starChecklist(state, score)[0].passed).toBe(passed);
          expect(renderGoalMeter(state, score)).toContain(display.name);
          expect(renderCampaignStatus(state)).toContain(display.valueText);
          expect(resultShareText(state, score)).toContain(`${display.name} ${passed ? '달성' : '미달'}`);
          expect(renderPayoutModal(state, { characters: false })).toContain(`${display.name} ${passed ? '달성' : '미달'}`);
          if (mission !== 'pension') expect(renderGoalMeter(state, score)).not.toContain('ghost-mark');
          expect(state).toEqual(before);
          expect(calculateScore(state)).toEqual(score);
        }
      });
    }
  }

  it('생활 미션은 연금 목표를 넘어도 실패할 수 있고 1원 부족과 미지급액을 숨기지 않는다', () => {
    const state = { ...sample('cushion', false), irpCash: 150_000_000, cash: 17_999_999, status: 'playing' as const, turn: 10 };
    expect(calculateScore(state).goalMet).toBe(true);
    expect(missionDisplay(state).passed).toBe(false);
    expect(goalStatusLine(state, calculateScore(state))).toContain('1원');
    expect(goalStatusLine(state, calculateScore(state))).toContain('현재 기준 별 0개');
    expect(isUrgent(state)).toBe(true);
    const debt = { ...state, cash: 20_000_000, livingDebt: 1_000_000 };
    expect(missionDisplay(debt).passed).toBe(false);
    expect(renderGoalMeter(debt, calculateScore(debt))).not.toContain('goal-meter met');
    expect(goalStatusLine(debt, calculateScore(debt))).toContain('미지급 생활비 1,000,000원');
  });

  it('세전 목표와 세후 평균을 구분하며 반올림 표시가 목표 통과를 바꾸지 않는다', () => {
    const below = { ...sample('pension', true), irpCash: 119_999_999 };
    expect(missionDisplay(below).valueText).toBe('500,000원');
    expect(missionDisplay(below).passed).toBe(false);
    expect(missionDisplay({ ...below, irpCash: 120_000_000 }).passed).toBe(true);
    const score = calculateScore(below);
    expect(score.payout.monthlyNet).toBeLessThan(score.monthlyPension);
    const html = renderPayoutModal(below, { characters: false });
    expect(html).toContain('세후 평균 월');
    expect(html).toContain('목표용 월 환산액 · 세전');
    expect(html).toContain('목표용 월 환산액 · 일시금 조정');
  });

  it('별 체크리스트의 낙폭은 실제 별 계산과 같은 값을 사용한다', () => {
    const state = { ...sample('pension', true), maxDrawdown: .2 };
    expect(calculateScore(state).stars).toBe(2);
    expect(starChecklist(state, calculateScore(state))[2].passed).toBe(false);
  });
});

describe('F02 미션 이정표와 이전 저장', () => {
  it('생활 미션 달성은 생활자금으로 알리고 연금 이정표를 띄우지 않는다', () => {
    const state = createGame('cushion-milestone', 'balanced', 500_000, { ghost: false, scenario: 'classic', mission: 'cushion' });
    expect(state.milestonesHit).toEqual(['goal-50']);
    const earned = stampMilestones({ ...state, turn: 2, cash: 18_000_000 });
    expect(earned.turnMilestones).toHaveLength(1);
    expect(earned.turnMilestones[0].title).toContain('든든한 생활');
    expect(earned.turnMilestones[0].detail).toContain('순생활자금');
    expect(stampMilestones({ ...earned, turn: 3 }).turnMilestones).toEqual([]);
  });

  it('구 캠페인 저장을 거절하지 않고 표시 이력만 정리하며 점수·주문·과거 로그를 보존한다', () => {
    const state = sample('cushion', false);
    delete state.campaign!.milestonesByMission;
    state.milestonesHit = ['goal-50', 'goal-75', 'goal-90', 'goal-100'];
    const before = structuredClone(state), score = calculateScore(state);
    const checkpoint: PlayCheckpoint = { version: 'c2', game: state, modal: null, lastSummary: null, quizCardId: null, quizPicked: null,
      finalQuizQueue: [], finalQuizTotal: 0, finishing: false, defaultOptionAsk: false };
    const restored = parseCheckpoint(JSON.stringify(checkpoint))!.game;
    expect(restored.milestonesHit).toEqual(['goal-50']);
    expect(restored.campaign!.milestonesByMission).toBe(true);
    expect(calculateScore(restored)).toEqual(score);
    expect(restored.holdings).toEqual(before.holdings);
    expect(restored.pendingOrders).toEqual(before.pendingOrders);
    expect(restored.logs).toEqual(before.logs);
    expect(normalizeMissionMilestones(restored)).toBe(restored);
    expect(state).toEqual(before);
  });
});
