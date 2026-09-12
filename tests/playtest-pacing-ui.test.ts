// @vitest-environment happy-dom
import { beforeEach, expect, it } from 'vitest';
import { PensionRoadApp } from '../src/ui/app';
import { createGame, performAction, startTurn } from '../src/engine/game-engine';
import { CHECKPOINT_KEY, parseCheckpoint } from '../src/ui/play-checkpoint';
import { defaultSave, STORAGE_KEY } from '../src/ui/ui-state';
import { calculateScore } from '../src/engine/scoring-engine';
import { resultShareText } from '../src/engine/achievements';
import type { GameState } from '../src/types';

let root: HTMLElement;
const saved = () => parseCheckpoint(localStorage.getItem(CHECKPOINT_KEY))!;
const click = (selector: string) => { const button = root.querySelector<HTMLElement>(selector); expect(button, selector).not.toBeNull(); button!.click(); };
const open = (paced = true): GameState => ({ ...startTurn(createGame('pacing-ui', 'balanced', 500000,
  { ghost: false, defaultTrading: true, scenario: 'classic', contributionPacing: paced }), 5).state,
  cash: 13_400_000, irpCash: 1_000_000, currentEventId: null, awaitingAction: true, actionsLeft: 2 });
function mount(game = open()) {
  localStorage.setItem(CHECKPOINT_KEY, JSON.stringify({ version: 'c3', game, modal: 'action', lastSummary: null,
    quizCardId: null, quizPicked: null, finalQuizQueue: [], finalQuizTotal: 0, finishing: false, defaultOptionAsk: false }));
  new PensionRoadApp(root); click('[data-action="resume-game"]'); return game;
}
beforeEach(() => {
  localStorage.clear(); document.body.innerHTML = '<div id="app"></div>'; root = document.querySelector('#app')!;
  localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...defaultSave, disclaimerAccepted: true, howtoSeen: true, settings: { ...defaultSave.settings, reducedMotion: true } }));
});

it('실제 새 판에만 턴 한도를 넣고 구 판의 이어하기는 보존한다', () => {
  new PensionRoadApp(root); click('[data-action="begin"]'); click('[data-action="prepare-continue"]'); click('[data-action="confirm-default-option"]');
  expect(saved().game.contributionPacing).toEqual({ version: 'v1', perTurnLimit: 2_000_000 });
});
it('구 저장에는 200만원 제한을 표시하거나 적용하지 않는다', () => {
  mount(open(false)); click('[data-view="contribute"]');
  expect(root.textContent).toContain('이전 규칙으로 진행 중');
  expect(root.querySelector('.contribution-budget')).toBeNull();
  click('[data-action="amount-preset"][data-preset="max"]');
  expect(root.querySelector<HTMLButtonElement>('[data-action="do-contribute"]')!.dataset.amount).toBe('13400000');
});
it('최대 납입액·미리보기·실행액이 같고 첫 최대 납입 뒤 메뉴의 제한 사유를 표시한다', () => {
  mount(); click('[data-view="contribute"]'); click('[data-action="amount-preset"][data-preset="max"]');
  expect(root.querySelector('.contribution-preview')!.textContent).toContain('납입 2,000,000원');
  expect(root.querySelector('.contribution-preview')!.textContent).toContain('생활자금 11,400,000원');
  expect(root.querySelector('[data-action="do-contribute"]')!.textContent).toBe('200만원 납입');
  click('[data-action="do-contribute"]');
  expect(saved().game.contributionTotal).toBe(2_000_000); expect(saved().game.actionsLeft).toBe(1);
  expect(root.querySelector<HTMLButtonElement>('[data-view="contribute"]')!.disabled).toBe(true);
  expect(root.querySelector('#reason-contribute')!.textContent).toContain('이번 턴 추가납입 한도를 모두 사용');
  expect(root.querySelector<HTMLButtonElement>('[data-view="buy"]')!.disabled).toBe(false);
});
it('100만원씩 두 번 납입하고 최대와 같은 고정 버튼을 중복 표시하지 않는다', () => {
  mount(); click('[data-view="contribute"]'); click('[data-action="do-contribute"]');
  click('[data-view="contribute"]');
  expect(root.querySelector('[data-preset="default"]')).toBeNull();
  expect(root.querySelector('[data-preset="max"]')!.getAttribute('aria-pressed')).toBe('true');
  click('[data-action="do-contribute"]');
  expect(saved().game.contributionTotal).toBe(2_000_000); expect(saved().game.actionsLeft).toBe(0);
});
it('가능액보다 큰 고정 버튼은 비활성이고 실제 남은 금액을 선택한다', () => {
  mount(performAction(open(), { kind: 'contribute', amount: 1_250_000 }).state);
  click('[data-view="contribute"]');
  expect(root.querySelector<HTMLButtonElement>('[data-preset="default"]')!.disabled).toBe(true);
  expect(root.querySelector('[data-preset="default"]')!.textContent).toContain('가능액보다 큼');
  expect(root.querySelector('[data-action="do-contribute"]')!.textContent).toBe('75만원 납입');
});
it('모든 운용 화면의 맨 아래에 포트폴리오 버튼 하나와 X만 남긴다', () => {
  const g = mount();
  for (const view of ['menu', 'contribute', 'buy', 'sell', 'switch', 'rebalance', 'default']) {
    if (view !== 'menu') click(`[data-action="action-view"][data-view="${view}"]`);
    const dialog = root.querySelector('[role="dialog"]')!;
    expect(dialog.lastElementChild!.className).toBe('action-footer');
    expect(dialog.querySelectorAll('[data-action="action-portfolio"]')).toHaveLength(1);
    expect(dialog.querySelectorAll('[data-action="close-modal"]')).toHaveLength(1);
    expect(dialog.textContent).not.toContain('취소하고 보드로');
    if (view === 'default') expect(dialog.querySelector('.market-impact-details')).toBeNull();
    if (view !== 'menu') click('[data-action="action-view"][data-view="menu"]');
  }
  expect(saved().game).toEqual(g);
});
it('펼침·금액·스크롤은 포트폴리오 왕복에서 보존하고 새로고침은 한도만 복원한다', () => {
  mount(); click('[data-view="contribute"]'); click('[data-preset="half"]');
  const details = root.querySelector<HTMLDetailsElement>('.market-impact-details')!;
  details.open = true; details.dispatchEvent(new Event('toggle'));
  click('[data-preset="max"]');
  expect(root.querySelector<HTMLDetailsElement>('.market-impact-details')!.open).toBe(true);
  expect(root.querySelector('[data-market-toggle-label]')!.textContent).toBe('접기');
  root.querySelector<HTMLElement>('.modal-sheet')!.scrollTop = 420;
  click('[data-action="action-portfolio"]'); click('[data-action="return-action"]');
  expect(root.querySelector<HTMLElement>('.modal-sheet')!.scrollTop).toBe(420);
  expect(document.activeElement).toBe(root.querySelector('[data-action="action-portfolio"]'));
  expect(root.querySelector('[data-action="do-contribute"]')!.textContent).toBe('200만원 납입');
  expect(root.querySelector<HTMLDetailsElement>('.market-impact-details')!.open).toBe(true);
  click('[data-action="do-contribute"]');
  document.body.innerHTML = '<div id="second"></div>'; root = document.querySelector('#second')!;
  new PensionRoadApp(root); click('[data-action="resume-game"]');
  expect(saved().game.contributionTotal).toBe(2_000_000);
  expect(root.querySelector<HTMLButtonElement>('[data-view="contribute"]')!.disabled).toBe(true);
  expect(root.querySelector<HTMLDetailsElement>('.market-impact-details')!.open).toBe(false);
});
it('오래된 확정 금액이면 행동을 차감하지 않고 재확인을 안내한다', () => {
  const g = mount(); click('[data-view="contribute"]');
  root.querySelector<HTMLElement>('[data-action="do-contribute"]')!.dataset.amount = '3000000';
  click('[data-action="do-contribute"]');
  expect(saved().game).toEqual(g); expect(root.textContent).toContain('갱신된 금액을 확인');
});
it('공유 결과에서 같은 시드의 서로 다른 납입 규칙을 구분한다', () => {
  for (const paced of [false, true]) {
    const g = open(paced), text = resultShareText(g, calculateScore(g));
    expect(text).toContain(paced ? '추가납입 턴당 200만원' : '추가납입 이전 규칙');
  }
});

it('운용에서 정산으로 넘어가면 제목부터 보이고 포트폴리오 왕복 이외의 스크롤은 초기화한다', () => {
  mount({...open(),actionsLeft:1}); click('[data-view="contribute"]');
  root.querySelector<HTMLElement>('.modal-sheet')!.scrollTop=640;
  click('[data-action="do-contribute"]');
  expect(root.querySelector('[data-action="dismiss-settle"]')).not.toBeNull();
  expect(root.querySelector<HTMLElement>('.modal-sheet')!.scrollTop).toBe(0);
});
