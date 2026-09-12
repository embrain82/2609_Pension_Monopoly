import { describe, expect, it } from 'vitest';
import { createGame, startTurn, performAction, resolveLifeEvent, autoplay, resolveActionAmount } from '../src/engine/game-engine';
import { contributionBudget, previewContribution, validContributionPacing } from '../src/engine/contribution-engine';
import { actionAvailability } from '../src/engine/action-availability';
import { lifeChoicesFor } from '../src/engine/life-engine';
import { lifeEvents, policyRules } from '../src/data/content';
import { parseCheckpoint } from '../src/ui/play-checkpoint';
import { replayChapter } from '../src/engine/scenario-engine';
import type { GameState } from '../src/types';

const open = (paced = true): GameState => ({ ...startTurn(createGame('pacing-test', 'balanced', 500000,
  { ghost: false, defaultTrading: true, scenario: 'classic', contributionPacing: paced }), 5).state,
  cash: 13_400_000, currentEventId: null, awaitingAction: true, actionsLeft: 2 });
const contribute = (g: GameState, amount: number) => performAction(g, { kind: 'contribute', amount });
const checkpoint = (game: GameState) => JSON.stringify({ version: game.defaultTrading ? 'c3' : 'c2', game, modal: 'action', lastSummary: null,
  quizCardId: null, quizPicked: null, finalQuizQueue: [], finalQuizTotal: 0, finishing: false, defaultOptionAsk: false });

describe('개인 추가납입 턴 한도', () => {
  it('1,340만원 요청을 200만원으로 제한하고 미리보기·장부·공제를 일치시킨다', () => {
    const g = open(), q = previewContribution(g, { requested: g.cash }), out = contribute(g, g.cash);
    expect(q.accepted).toBe(2_000_000); expect(out.ok).toBe(true);
    expect(resolveActionAmount(g, 'contribute', 'max')).toBe(q.accepted);
    expect(out.state.cash).toBe(g.cash - q.accepted); expect(out.state.irpCash).toBe(g.irpCash + q.accepted);
    expect(out.state.contributionTotal).toBe(q.accepted); expect(out.state.cashFlows.at(-1)?.amount).toBe(q.accepted);
    expect(out.state.pendingTaxCredit - g.pendingTaxCredit).toBe(q.accepted * policyRules.taxCreditRate);
    expect(out.state.accountBasis.deducted - g.accountBasis.deducted).toBe(q.accepted);
    expect(validContributionPacing(out.state)).toBe(true);
  });
  it('100만원씩 두 번 허용하며 첫 200만원 뒤에는 납입만 막는다', () => {
    const once = contribute(open(), 1_000_000).state;
    expect(contributionBudget(once).turnRemaining).toBe(1_000_000);
    expect(contribute(once, 1_000_000).state.contributionTotal).toBe(2_000_000);
    const max = contribute(open(), 2_000_000).state;
    expect(max.actionsLeft).toBe(1);
    expect(actionAvailability(max, 'contribute')).toMatchObject({ enabled: false, code: 'turn-contribution-limit' });
    for (const operation of ['buy', 'default', 'sell', 'rebalance'] as const) expect(actionAvailability(max, operation).enabled).toBe(true);
    const rejected = contribute(max, 100_000);
    expect(rejected.ok).toBe(false); expect(rejected.state).toEqual(max);
  });
  it.each([0, -1, NaN, Infinity, 99_999])('잘못된 금액 %s은 자산·행동을 바꾸지 않는다', amount => {
    const g = open(), before = structuredClone(g), result = contribute(g, amount);
    expect(result.ok).toBe(false); expect(result.state).toEqual(before);
  });
  it.each([100_000, 99_999])('턴 잔여액 %i에서 최소 금액을 지킨다', remaining => {
    const g = contribute(open(), 2_000_000 - remaining).state;
    expect(previewContribution(g, { requested: 2_000_000 }).accepted).toBe(remaining);
    expect(contribute(g, 2_000_000).ok).toBe(remaining >= 100_000);
  });
  it('누적 한도와 생활자금이 턴 한도보다 작으면 더 작은 한도를 사용한다', () => {
    const g = { ...open(), contributionTotal: 17_850_000 };
    expect(previewContribution(g, { requested: 2_000_000 }).accepted).toBe(150_000);
    expect(previewContribution({ ...g, cash: 100_000 }, { requested: 2_000_000 }).accepted).toBe(100_000);
    const exhausted = { ...contribute(open(), 2_000_000).state, contributionTotal: 18_000_000 };
    expect(actionAvailability(exhausted, 'contribute')).toMatchObject({ code: 'contribution-limit' });
  });
  it('새 턴에는 새 한도를 적용하고 미사용액은 이월하지 않는다', () => {
    const partly = performAction(contribute(open(), 500_000).state, { kind: 'hold' }).state;
    expect(contributionBudget(startTurn(partly, 1).state).turnRemaining).toBe(2_000_000);
    const spent = performAction(contribute(open(), 2_000_000).state, { kind: 'hold' }).state;
    expect(contributionBudget(startTurn(spent, 1).state).turnRemaining).toBe(2_000_000);
  });
  it('납입 후 허용 인출을 해도 사용액이 복원되지 않는다', () => {
    const spent = contribute(open(), 2_000_000).state;
    const out = resolveLifeEvent({ ...spent, currentEventId: 'medical', awaitingAction: false }, 'withdraw');
    expect(out.ok).toBe(true); expect(out.state.cashFlows.at(-1)?.kind).toBe('withdrawal');
    expect(contributionBudget(out.state).turnRemaining).toBe(0);
    expect(validContributionPacing(out.state)).toBe(true);
  });
  it('보너스는 개인 한도를 공유하며 나머지는 생활자금으로 보존한다', () => {
    const g = { ...open(), cash: 0, currentEventId: 'yearend-bonus', awaitingAction: false };
    const out = resolveLifeEvent(g, 'contribute-all');
    expect(out.ok).toBe(true); expect(out.state.contributionTotal).toBe(2_000_000);
    expect(out.state.cash).toBe(1_000_000); expect(out.state.actionsLeft).toBe(g.actionsLeft);
    expect(actionAvailability(out.state, 'contribute')).toMatchObject({ code: 'turn-contribution-limit' });
    expect(out.state.lifeResolution?.choiceLabel).toContain('1,000,000원 생활자금');
    expect(validContributionPacing(out.state)).toBe(true);
    const half = resolveLifeEvent(g, 'contribute-half').state;
    expect(contribute(half, 2_000_000).state.contributionTotal).toBe(2_000_000);
  });
  it('한도 때문에 같은 결과가 되는 보너스 선택지를 합친다', () => {
    const g = { ...contribute(open(), 1_000_000).state, currentEventId: 'yearend-bonus', awaitingAction: false };
    const choices = lifeChoicesFor(g, lifeEvents.find(e => e.id === 'yearend-bonus')!);
    expect(choices.map(c => c.id)).toEqual(['contribute-all', 'cash']);
    expect(choices[0].label).toContain('1,000,000원 납입');
    expect(resolveLifeEvent(g, 'contribute-all').state.contributionTotal).toBe(2_000_000);
  });
  it('퇴직급여 이전은 한도 소진 후에도 개인 납입과 별도 처리한다', () => {
    const g = { ...contribute(open(), 2_000_000).state, currentEventId: 'severance', awaitingAction: false };
    const out = resolveLifeEvent(g, 'transfer-irp');
    expect(out.ok).toBe(true); expect(out.state.contributionTotal).toBe(2_000_000);
    expect(out.state.irpCash - g.irpCash).toBe(6_000_000);
    expect(validContributionPacing(out.state)).toBe(true);
  });
  it('기존 판은 턴 한도가 없고 견적 조회는 상태를 변경하지 않는다', () => {
    const g = open(false), before = structuredClone(g);
    expect(previewContribution(g, { requested: g.cash }).accepted).toBe(g.cash);
    expect(contribute(g, g.cash).state.contributionTotal).toBe(g.cash);
    expect(g).toEqual(before); expect(validContributionPacing(g)).toBe(true);
  });
});

describe('추가납입 저장·복기', () => {
  it('구 c2/c3 저장과 새 저장을 복원하고 이미 쓴 한도를 유지한다', () => {
    for (const defaultTrading of [false, true]) {
      const legacy = createGame('legacy', 'balanced', 500000, { defaultTrading, ghost: false, scenario: 'classic' });
      expect(parseCheckpoint(checkpoint(legacy))?.game).toEqual(legacy);
    }
    const g = contribute(open(), 1_000_000).state;
    const restored = parseCheckpoint(checkpoint(g))!.game;
    expect(contributionBudget(restored).turnRemaining).toBe(1_000_000);
  });
  it('손상된 새 규칙·장부·누적 금액을 거부한다', () => {
    const g = contribute(open(), 1_000_000).state;
    const variants: GameState[] = [
      { ...g, contributionPacing: { version: 'v1', perTurnLimit: 20_000_000 } },
      { ...g, contributionPacing: null as any },
      { ...g, contributionTotal: 0 },
      { ...g, cashFlows: [{ turn: 2, kind: 'contribution', amount: 1_000_000 }] },
      { ...g, cashFlows: [{ turn: 1, kind: 'contribution', amount: -1_000_000 }] },
      { ...g, contributionTotal: 3_000_000, cashFlows: [{ turn: 1, kind: 'contribution', amount: 3_000_000 }] }
    ];
    for (const invalid of variants) expect(parseCheckpoint(checkpoint(invalid))).toBeNull();
  });
  it('챕터 분기에도 같은 규칙과 유효한 납입 장부를 요구한다', () => {
    const finished = autoplay('pacing-replay', 'contributor', 'balanced', { contributionPacing: true, defaultTrading: true, scenario: 'classic', ghost: false });
    expect(parseCheckpoint(checkpoint(finished))).not.toBeNull();
    const replay = replayChapter(finished, 3)!;
    expect(replay.contributionPacing).toEqual(finished.contributionPacing);
    expect(parseCheckpoint(checkpoint(replay))).not.toBeNull();
    const broken = structuredClone(finished);
    delete broken.campaign!.branches[0].state.contributionPacing;
    expect(parseCheckpoint(checkpoint(broken))).toBeNull();
  });
});
