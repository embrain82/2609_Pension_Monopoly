// @vitest-environment happy-dom
import { beforeEach, expect, it } from 'vitest';
import { lifeEvents } from '../src/data/content';
import { createGame, performAction, startTurn } from '../src/engine/game-engine';
import { lifeChoicesFor } from '../src/engine/life-engine';
import { PensionRoadApp } from '../src/ui/app';
import { renderLifeModal } from '../src/ui/life-view';
import { renderMarketStory } from '../src/ui/market-story';
import { CHECKPOINT_KEY, parseCheckpoint } from '../src/ui/play-checkpoint';
import { defaultSave, STORAGE_KEY } from '../src/ui/ui-state';
import type { GameState } from '../src/types';

let root: HTMLElement;
const open = (): GameState => ({ ...startTurn(createGame('d2a', 'balanced', 500000,
  { ghost: false, scenario: 'classic', defaultTrading: true, contributionPacing: true }), 5).state,
  currentEventId: null, cash: 10_000_000, irpCash: 1_000_000, actionsLeft: 2 });
const saved = () => parseCheckpoint(localStorage.getItem(CHECKPOINT_KEY))!;
const click = (selector: string) => {
  const button = root.querySelector<HTMLElement>(selector); expect(button, selector).not.toBeNull(); button!.click();
};
function mount(game: GameState) {
  localStorage.setItem(CHECKPOINT_KEY, JSON.stringify({ version: 'c3', game, modal: 'action', lastSummary: null,
    quizCardId: null, quizPicked: null, finalQuizQueue: [], finalQuizTotal: 0, finishing: false, defaultOptionAsk: false }));
  new PensionRoadApp(root); click('[data-action="resume-game"]');
}
beforeEach(() => {
  localStorage.clear(); document.body.innerHTML = '<div id="app"></div>'; root = document.querySelector('#app')!;
  localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...defaultSave, disclaimerAccepted: true, howtoSeen: true,
    settings: { ...defaultSave.settings, reducedMotion: true } }));
});

it('금리 전후·원인·실제 손익 순서이며 추가납입 뒤에도 시장 구간 수치는 같고 상태를 변경하지 않는다', () => {
  const game = open(), before = structuredClone(game);
  const initial = renderMarketStory(game.lastMarket, game.ledger);
  const after = performAction(game, { kind: 'contribute', amount: 1_000_000 });
  expect(after.ok).toBe(true);
  expect(renderMarketStory(after.state.lastMarket, after.state.ledger)).toBe(initial);
  expect(game).toEqual(before);
  root.innerHTML = initial;
  expect([...root.querySelectorAll('h3')].map(e => e.textContent)).toEqual([
    '01 이번 턴 시장 변화', '02 왜 영향을 받나요?', '03 내 보유분에 반영'
  ]);
  expect(root.querySelector('.story-rate-values')?.textContent).toContain((game.lastMarket.ratePct - game.lastMarket.rateDeltaPct).toFixed(2) + '%');
  expect(root.querySelector('.story-rate-delta')?.textContent).toContain('%p');
  expect(root.querySelector('.news-irp b')?.textContent).toContain(Math.round(game.ledger.afterMarket - game.ledger.open).toLocaleString('ko-KR'));
  expect(root.querySelector('.actual-market-impact')).not.toBeNull();
  expect(root.textContent).toContain('추가납입·매매 결과는 포함하지 않습니다');
});

it('금리 변화가 실제로 0이면 동결로 보이고 마지막 턴은 가상 다음 시장을 약속하지 않는다', () => {
  const game = open();
  root.innerHTML = renderMarketStory({ ...game.lastMarket, turn: 12, ratePct: 6, rateDeltaPct: 0 }, game.ledger);
  expect(root.querySelector('.story-rate-delta')?.textContent).toBe('동결 · 0.00%p');
  expect(root.querySelector('.story-rate-values')?.textContent).toContain('6.00%');
  expect(root.querySelector('.news-irp em')?.textContent).toContain('추가 시장 없이 최종 정산');
  expect(root.querySelector('.news-irp em')?.textContent).not.toContain('다음 턴');
});

it('이전 저장의 미기록 손익을 0원으로 추정하지 않고 실제 노출 없음과 구분한다', () => {
  const game = open();
  root.innerHTML = renderMarketStory(game.lastMarket);
  expect(root.querySelector('.news-irp')).toBeNull();
  expect(root.textContent).toContain('이전 저장에는 이 턴의 시장 손익 합계가 없습니다');
  expect(root.querySelector('.market-impact-unavailable')).not.toBeNull();
  root.innerHTML = renderMarketStory(game.lastMarket, { open: 100, afterMarket: 100, marketEffects: [] });
  expect(root.querySelector('.news-irp b')?.textContent).toBe('0원');
  expect(root.textContent).toContain('이번 시장에 노출된 보유분·주문 없음');
});

it.each(['moving', 'bonus', 'severance'])('%s 생활 사건은 실제 선택 금액·장기 영향·선택 불가 사유를 보존한다', id => {
  const event = lifeEvents.find(e => e.id === id)!;
  const game = { ...open(), cash: 0, currentEventId: id }, before = structuredClone(game);
  root.innerHTML = renderLifeModal(game, event);
  for (const choice of lifeChoicesFor(game, event)) {
    const button = root.querySelector<HTMLButtonElement>(`[data-choice="${choice.id}"]`)!;
    expect(button.disabled).toBe(!choice.enabled);
    expect(button.textContent).toContain(choice.label);
    expect(button.textContent).toContain(choice.longTerm);
    expect(button.parentElement!.textContent).toContain(choice.immediate);
    if (!choice.enabled) {
      const ids = button.getAttribute('aria-describedby')!.split(' ');
      expect(ids.some(id => root.querySelector('#' + id)?.textContent === choice.reason)).toBe(true);
    }
  }
  expect(root.querySelector('.event-cost strong')?.textContent).toBe(Math.abs(event.cost).toLocaleString('ko-KR') + '원');
  expect(root.querySelector('.event-cash b')?.textContent).toBe('0원');
  expect(game).toEqual(before);
});

it('두 번 운용 메뉴는 실제 잔액·행동 수를 표시하며 펼침·포트폴리오·X는 거래하지 않는다', () => {
  const game = open(); mount(game);
  expect(root.querySelector('.action-menu-heading .eyebrow')?.textContent).toContain('남은 행동 2회');
  expect(root.querySelector('.action-money')?.textContent).toContain('1,000,000원');
  expect(root.querySelectorAll('.action-menu-choice')).toHaveLength(6);
  const detail = root.querySelector<HTMLDetailsElement>('.market-impact-details')!;
  detail.open = true; detail.dispatchEvent(new Event('toggle'));
  click('[data-action="action-portfolio"]'); click('[data-action="return-action"]');
  expect(root.querySelector<HTMLDetailsElement>('.market-impact-details')!.open).toBe(true);
  expect(root.querySelector('[role="dialog"]')!.lastElementChild!.className).toBe('action-footer');
  click('[data-action="close-modal"]'); click('[data-action="open-action"]');
  expect(saved().game).toEqual(game);
  click('[data-view="contribute"]'); click('[data-action="do-contribute"]');
  expect(saved().game.actionsLeft).toBe(1);
  expect(root.querySelector('.action-menu-heading .eyebrow')?.textContent).toContain('남은 행동 1회');
  expect(root.querySelector('.action-money')?.textContent).toContain('2,000,000원');
});

it('첫 행동 전액 매수 후 비활성 카드에 접근 가능한 사유가 남고 다시 누를 수 없다', () => {
  const first = performAction(open(), { kind: 'buy', productId: 'deposit', amount: 1_000_000 });
  expect(first.ok).toBe(true); mount(first.state);
  const button = root.querySelector<HTMLButtonElement>('.action-menu-choice[data-view="buy"]')!;
  expect(button.disabled).toBe(true);
  expect(button.textContent).toContain('이용 불가');
  const reason = root.querySelector('#' + button.getAttribute('aria-describedby'))!;
  expect(reason.textContent!.length).toBeGreaterThan(5);
  expect(button.contains(reason)).toBe(false);
  button.click(); expect(saved().game).toEqual(first.state);
});
