// @vitest-environment happy-dom
import { beforeEach, expect, it } from 'vitest';
import { PensionRoadApp } from '../src/ui/app';
import { createGame, startTurn, performAction, resolveLifeEvent } from '../src/engine/game-engine';
import { actionAvailability } from '../src/engine/action-availability';
import { CHECKPOINT_KEY, checkpointVersion, parseCheckpoint } from '../src/ui/play-checkpoint';
import { STORAGE_KEY, defaultSave } from '../src/ui/ui-state';
import type { GameState } from '../src/types';

let root: HTMLElement;
const open = (): GameState => ({ ...startTurn(createGame('beginner-actions', 'balanced', 500000,
  { defaultLifecycle: true, defaultOption: 'lowRisk', contributionPacing: true, ghost: false, scenario: 'classic' }), 5).state,
  currentEventId: null, irpCash: 2000000, cash: 12000000, awaitingAction: true, actionsLeft: 2 });
const saved = () => parseCheckpoint(localStorage.getItem(CHECKPOINT_KEY))!;
const click = (selector: string) => { const el = root.querySelector<HTMLElement>(selector); expect(el, selector).not.toBeNull(); el!.click(); };
function mount(game: GameState) {
  localStorage.setItem(CHECKPOINT_KEY, JSON.stringify({ version: checkpointVersion(game), game, modal: 'action',
    lastSummary: null, quizCardId: null, quizPicked: null, finalQuizQueue: [], finalQuizTotal: 0, finishing: false, defaultOptionAsk: false }));
  new PensionRoadApp(root); click('[data-action="resume-game"]');
}
beforeEach(() => {
  localStorage.clear(); document.body.innerHTML = '<div id="app"></div>'; root = document.querySelector('#app')!;
  localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...defaultSave, disclaimerAccepted: true, howtoSeen: true, quickGuideSeen: true,
    settings: { ...defaultSave.settings, reducedMotion: true } }));
});

it('두 목적 카드와 마감만 먼저 보이고 전체 메뉴·왕복은 거래하지 않는다', () => {
  const g = open(); mount(g);
  expect(root.querySelectorAll('.purpose-choice')).toHaveLength(2);
  expect(root.querySelectorAll('.action-list')).toHaveLength(0);
  expect(root.querySelectorAll('[data-action="do-hold"]')).toHaveLength(1);
  expect(root.querySelectorAll('.beginner-action-hint')).toHaveLength(1);
  click('[data-action="show-all-actions"]');
  expect(root.querySelectorAll('.action-list>article')).toHaveLength(7);
  expect(root.querySelectorAll('.purpose-choice')).toHaveLength(0);
  for (const name of ['contribute', 'buy', 'sell', 'switch', 'rebalance', 'default'] as const)
    expect(root.querySelector<HTMLButtonElement>(`[data-view="${name}"]`)!.disabled).toBe(!actionAvailability(g, name).enabled);
  click('[data-action="show-simple-actions"]');
  expect(root.querySelectorAll('.purpose-choice')).toHaveLength(2); expect(saved().game).toEqual(g);
});

it('목적 카드는 미리보기만 열며 X·포트폴리오 왕복은 행동과 자금을 보존한다', () => {
  const g = open(); mount(g); click('[data-choice="buy"]');
  expect(root.querySelector('.order-review')).not.toBeNull(); expect(saved().game).toEqual(g);
  click('[data-action="action-portfolio"]'); click('[data-action="return-action"]');
  expect(root.querySelector('.order-review')).not.toBeNull(); expect(saved().game).toEqual(g);
  click('[data-action="close-modal"]'); click('[data-action="open-action"]');
  expect(root.querySelector('.beginner-action-menu')).not.toBeNull(); expect(saved().game).toEqual(g);
});

it('첫 전액 펀드 주문 뒤 처리 중 힌트로 바뀌고 조회는 주문 위치를 연다', () => {
  const g = open(); mount(g); click('[data-choice="buy"]');
  const product = root.querySelector<HTMLSelectElement>('#buy-product')!;
  product.value = 'shortBond'; product.dispatchEvent(new Event('change', { bubbles: true }));
  click('[data-preset="max"]'); click('[data-action="do-buy"]');
  const after = saved().game;
  expect(after).toEqual(performAction(g, { kind: 'buy', productId: 'shortBond', amount: g.irpCash }).state);
  expect(after.actionsLeft).toBe(1); expect(root.querySelector('[data-guidance="pending"]')).not.toBeNull();
  expect(root.querySelector('.purpose-choice[data-choice="buy"]')).toBeNull();
  expect(root.querySelector('.hold-row')!.textContent).toContain('접수한 주문은 예정된 턴에 계속 처리');
  click('[data-choice="portfolio-orders"]');
  expect(document.activeElement?.getAttribute('data-portfolio-section')).toBe('orders');
  click('[data-action="return-action"]'); expect(saved().game).toEqual(after);
  click('[data-action="show-all-actions"]');
  expect(root.querySelector<HTMLButtonElement>('[data-view="buy"]')!.disabled).toBe(true);
  expect(root.querySelector('.availability-reason')?.textContent).toBeTruthy();
});

it('생활자금 부족에서는 조회를 우선하고 전체 메뉴의 납입은 숨기지 않는다', () => {
  const g = { ...open(), cash: 500000 }; mount(g);
  expect(root.querySelector('[data-guidance="living"]')).not.toBeNull();
  expect(root.querySelector('[data-choice="contribute"]')).toBeNull();
  click('[data-choice="portfolio-overview"]');
  expect(document.activeElement?.getAttribute('data-portfolio-section')).toBe('overview');
  click('[data-action="return-action"]'); click('[data-action="show-all-actions"]');
  expect(root.querySelector<HTMLButtonElement>('[data-view="contribute"]')!.disabled).toBe(false); expect(saved().game).toEqual(g);
});

it('만기 통지는 접힘 없이 유지하고 만기 조회로 바로 연결한다', () => {
  let g = open();
  while (g.turn < 4) {
    if (g.currentEventId) g = resolveLifeEvent(g, 'cash').state;
    if (g.awaitingAction) g = performAction(g, { kind: 'hold' }).state;
    g = startTurn(g, 1).state;
  }
  mount({ ...g, currentEventId: null, cash: 12000000, actionsLeft: 2 });
  const notice = root.querySelector('[data-default-notice]')!;
  expect(notice).not.toBeNull(); expect(notice.closest('details')).toBeNull();
  expect(saved().game.defaultLifecycle!.cycles[0].presentedTurn).toBe(4);
  expect(root.querySelector('.hold-row')!.textContent).toContain('자동운용 절차는 계속');
  const before = saved().game; click('[data-choice="portfolio-maturity"]');
  expect(document.activeElement?.getAttribute('data-portfolio-section')).toBe('maturity');
  click('[data-action="return-action"]'); expect(saved().game).toEqual(before);
});

it('구 저장에서 그대로 마감이 자동매수하면 버튼과 설명에 그대로 알린다', () => {
  const g = { ...startTurn(createGame('legacy-hold', 'balanced', 500000, { ghost: false, defaultOption: 'lowRisk' }), 5).state,
    cash: 12000000, irpCash: 1000000, currentEventId: null };
  mount(g);
  expect(root.querySelector('[data-action="do-hold"]')!.textContent).toContain('디폴트옵션으로 운용하고 마감');
  expect(root.querySelector('.hold-row')!.textContent).toContain('매수 실행');
  click('[data-action="do-hold"]'); expect(saved().game).toEqual(performAction(g, { kind: 'hold' }).state);
});
