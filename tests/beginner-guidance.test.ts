// @vitest-environment happy-dom
import { beforeEach, expect, it } from 'vitest';
import { PensionRoadApp } from '../src/ui/app';
import { defaultSave, loadSave, STORAGE_KEY } from '../src/ui/ui-state';
import { CHECKPOINT_KEY, checkpointVersion, parseCheckpoint } from '../src/ui/play-checkpoint';
import { createGame, performAction, resolveLifeEvent, startTurn } from '../src/engine/game-engine';
import { buyProduct, sellProduct, switchProduct, settleAllOrders, portfolioValue } from '../src/engine/portfolio-engine';
import { previewDefaultOptIn } from '../src/engine/default-trade-engine';
import { moneyFlowData, renderMoneyFlow } from '../src/ui/money-flow';
import { renderContributionView } from '../src/ui/contribution-view';
import type { GameState } from '../src/types';

let root: HTMLElement;
const click = (action: string) => {
  const button = root.querySelector<HTMLButtonElement>(`[data-action="${action}"]`);
  expect(button, action).not.toBeNull(); button!.click();
};
const mount = () => { document.body.innerHTML = '<div id="app"></div>'; root = document.querySelector('#app')!; new PensionRoadApp(root); };
const savedGame = () => parseCheckpoint(localStorage.getItem(CHECKPOINT_KEY))!.game;
const writeGame = (game: GameState, modal: string | null = null) => localStorage.setItem(CHECKPOINT_KEY, JSON.stringify({ version: checkpointVersion(game), game, modal, lastSummary: null, quizCardId: null, quizPicked: null, finalQuizQueue: [], finalQuizTotal: 0, finishing: false, defaultOptionAsk: false }));
beforeEach(() => {
  localStorage.clear();
  localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...defaultSave, disclaimerAccepted: true }));
});

it('신규 준비는 네 컷 안내 뒤에 성향 진단으로 이어지고 최종 시작 전에는 저장하지 않는다', () => {
  mount(); click('begin');
  expect(root.querySelectorAll('.quick-guide-cuts li')).toHaveLength(4);
  expect(root.querySelector('[data-action="prepare-diagnosis"]')).toBeNull();
  const originalSave = localStorage.getItem(STORAGE_KEY);
  click('prepare-guide-continue'); click('prepare-diagnosis');
  for (let i = 0; i < 5; i++) click('answer');
  click('prepare-continue');
  expect(localStorage.getItem(CHECKPOINT_KEY)).toBeNull();
  expect(localStorage.getItem(STORAGE_KEY)).toBe(originalSave);
  click('confirm-default-option');
  expect(savedGame().turn).toBe(0);
  expect(savedGame().profileId).toBe('stable');
  expect(loadSave().quickGuideSeen).toBe(true);
  mount(); click('begin');
  expect(root.querySelector('.guide-preparation')).toBeNull();
  expect(root.querySelector('[data-action="open-howto"]')).not.toBeNull();
});

it('예전 howtoSeen만으로 새 안내를 건너뛰지 않고 준비 취소·새로고침이 이전 판을 보존한다', () => {
  const game = createGame('guide-old', 'growth', 500000, { defaultTrading: true, scenario: 'classic' });
  writeGame(game);
  localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...defaultSave, disclaimerAccepted: true, howtoSeen: true }));
  const original = localStorage.getItem(CHECKPOINT_KEY), settings = localStorage.getItem(STORAGE_KEY);
  mount(); click('begin'); expect(root.querySelector('.guide-preparation')).not.toBeNull();
  click('prepare-guide-continue'); click('open-howto'); click('dismiss-howto'); click('cancel-preparation');
  expect(localStorage.getItem(CHECKPOINT_KEY)).toBe(original);
  expect(localStorage.getItem(STORAGE_KEY)).toBe(settings);
  mount(); click('resume-game'); expect(savedGame()).toEqual(game);
  click('open-settings'); click('open-howto'); click('dismiss-howto');
  expect(savedGame()).toEqual(game); expect(loadSave().quickGuideSeen).toBe(true);
});

it('잘못된 안내 확인 값은 읽음으로 취급하지 않는다', () => {
  for (const value of [undefined, 'true', 1, false]) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...defaultSave, quickGuideSeen: value }));
    expect(loadSave().quickGuideSeen).toBe(false);
  }
});

const open = (): GameState => ({ ...startTurn(createGame('money-buckets', 'growth', 500000, { defaultTrading: true, scenario: 'classic', contributionPacing: true, ghost: false }), 5).state, currentEventId: null, irpCash: 10000000, awaitingAction: true, actionsLeft: 2 });
const checkAmounts = (state: GameState) => {
  const data = moneyFlowData(state);
  expect(data.cash + data.held + data.pending).toBeCloseTo(portfolioValue(state), 5);
  const host = document.createElement('div'); host.innerHTML = renderMoneyFlow(state);
  for (const key of ['life', 'cash', 'held', 'pending'] as const) {
    const node = host.querySelector<HTMLElement>(`[data-money-bucket="${key}"]`);
    if (key === 'pending' && data[key] === 0) expect(node).toBeNull();
    else expect(Number(node?.dataset.amount)).toBeCloseTo(data[key], 5);
  }
};

it('즉시 거래·펀드 매수/환매·교체·옵션 주문을 보유와 처리 중에 중복 합산하지 않는다', () => {
  const game = open(), original = structuredClone(game);
  const trades = [buyProduct(game, 'deposit', 1000000), buyProduct(game, 'tdf', 1234567), sellProduct(game, 'balanced', 1000000), switchProduct(game, 'balanced', 'tdf', 1000000), previewDefaultOptIn(game, 'highRisk', 2000000)];
  for (const quote of trades) {
    expect(quote.ok).toBe(true); checkAmounts(quote.state); checkAmounts(settleAllOrders(quote.state));
    const html = renderMoneyFlow(game, quote.state);
    expect(html).toContain('아직 실행되지 않았어요'); expect(html).toContain('상품을 팔아도 돈은 IRP 안에 남아요');
    expect(game).toEqual(original);
  }
  expect(moneyFlowData(trades[1].state).pending).toBe(1234567);
  expect(moneyFlowData(trades[1].state).cash).toBe(10000000 - 1234567);
  expect(renderMoneyFlow(game, trades[1].state)).toContain('대기자금 → 처리 중');
  expect(renderMoneyFlow(game, trades[2].state)).toContain('보유상품 → 처리 중');
});

it('만기자금은 대기자금의 부분합으로만 안내하고 보유·미결제와 별도로 더하지 않는다', () => {
  let game = createGame('money-maturity', 'aggressive', 500000, { defaultLifecycle: true, defaultOption: 'midRisk', scenario: 'classic', ghost: false });
  while (game.turn < 3) {
    if (game.currentEventId) game = resolveLifeEvent(game, 'cash').state;
    if (game.awaitingAction) game = performAction(game, { kind: 'hold' }).state;
    game = startTurn(game, 1).state;
  }
  const original = structuredClone(game); checkAmounts(game);
  expect(moneyFlowData(game).maturity).toBeGreaterThan(0);
  expect(moneyFlowData(game).cash).toBeGreaterThanOrEqual(moneyFlowData(game).maturity);
  expect(renderMoneyFlow(game)).toContain('위 합계에 이미 포함'); expect(game).toEqual(original);
});

it('납입 미리보기는 선택 금액만큼 지갑과 대기자금만 바꾸며 실행하지 않는다', () => {
  const game = open(), original = structuredClone(game);
  for (const [preset, amount] of [['half', 500000], ['default', 1000000]] as const) {
    const host = document.createElement('div'); host.innerHTML = renderContributionView(game, preset);
    const amountOf = (key: string) => Number(host.querySelector<HTMLElement>(`[data-money-bucket="${key}"]`)?.dataset.amount);
    expect(amountOf('life')).toBe(game.cash - amount); expect(amountOf('cash')).toBe(game.irpCash + amount);
    expect(amountOf('held')).toBe(moneyFlowData(game).held); expect(game).toEqual(original);
    expect(host.textContent).toContain('생활 지갑 → 대기자금');
  }
});
