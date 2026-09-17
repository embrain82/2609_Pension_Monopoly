// @vitest-environment happy-dom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { PensionRoadApp } from '../src/ui/app';
import { defaultSave, STORAGE_KEY } from '../src/ui/ui-state';
import { CHECKPOINT_KEY, checkpointVersion, parseCheckpoint, type PlayCheckpoint } from '../src/ui/play-checkpoint';
import { createGame, startTurn } from '../src/engine/game-engine';
import { avatarEmotion } from '../src/ui/avatars';
import { ARRIVAL_EMOTION_HOLD_MS } from '../src/ui/token-emotion';
import { dicePairForTurn, DICE_ROLL_DURATION_MS, DICE_LAND_HOLD_MS } from '../src/ui/dice';
import { hopPlan } from '../src/ui/token3d';
import { TILE_REVEAL_MS } from '../src/ui/board-discovery';
import type { GameState } from '../src/types';

let root: HTMLElement;
const click = (action: string) => root.querySelector<HTMLElement>(`[data-action="${action}"]`)!.click();
const saved = () => parseCheckpoint(localStorage.getItem(CHECKPOINT_KEY))!;
const fresh = () => createGame('emotion-arrival', 'growth', 500000, { updatedFinance: true, scenario: 'classic', boardVisibility: 'arrival-v1', ghost: false });
function mount(game: GameState, pending = false, reducedMotion = false) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...defaultSave, disclaimerAccepted: true, howtoSeen: true,
    settings: { ...defaultSave.settings, reducedMotion, characters: true } }));
  const data: PlayCheckpoint = { version: checkpointVersion(game), game, arrivalPending: pending, modal: null, lastSummary: null,
    quizCardId: null, quizPicked: null, finalQuizQueue: [], finalQuizTotal: 0, finishing: false, defaultOptionAsk: false };
  localStorage.setItem(CHECKPOINT_KEY, JSON.stringify(data));
  document.body.innerHTML = '<div id="app"></div>'; root = document.querySelector('#app')!;
  new PensionRoadApp(root); click('resume-game');
}
beforeEach(() => {
  vi.useFakeTimers(); localStorage.clear();
  vi.spyOn(Element.prototype, 'animate').mockImplementation((_frames, options) => {
    const duration = typeof options === 'number' ? options : Number(options?.duration ?? 0);
    let reject!: (e: Error) => void, timer: ReturnType<typeof setTimeout>;
    const finished = new Promise<Animation>((resolve, fail) => { reject = fail; timer = setTimeout(() => resolve({} as Animation), duration); });
    return { finished, cancel: () => { clearTimeout(timer); reject(new Error('cancelled')); } } as Animation;
  });
});
afterEach(() => { document.body.innerHTML = ''; vi.restoreAllMocks(); vi.useRealTimers(); });

it('실제 굴리기·공개가 끝나면 1.2초간 표정과 이유를 보여주고 금융 처리는 한 번만 한다', async () => {
  const game = fresh(), faces = dicePairForTurn(game.seed, 0), steps = faces[0] + faces[1]; mount(game);
  const elapsed = DICE_ROLL_DURATION_MS + DICE_LAND_HOLD_MS + (steps - 1) * 260 + hopPlan(true).duration + TILE_REVEAL_MS;
  click('roll-dice'); await vi.advanceTimersByTimeAsync(elapsed);
  const expected = startTurn(game, steps).state;
  expect(saved().game).toEqual(expected); expect(saved().arrivalPending).toBe(true);
  expect(root.querySelector('[role="dialog"]')).toBeNull();
  expect(root.querySelector('.board-emotion')!.textContent).toContain(avatarEmotion(expected).reason);
  expect(root.querySelector('.asset-card .avatar')!.getAttribute('aria-label')).toContain(root.querySelector('.board-emotion strong')!.textContent!);
  await vi.advanceTimersByTimeAsync(ARRIVAL_EMOTION_HOLD_MS - 1);
  expect(root.querySelector('[role="dialog"]')).toBeNull();
  await vi.advanceTimersByTimeAsync(1);
  expect(root.querySelector('[role="dialog"]')).not.toBeNull();
  expect(saved().arrivalPending).toBeUndefined(); expect(saved().game).toEqual(expected);
});
it('운용 버튼을 먼저 누르면 즉시 넘어가고 옛 타이머가 닫은 창을 다시 열지 않는다', async () => {
  const game = startTurn(fresh(), 5).state; mount(game, true);
  click('continue-arrival'); expect(root.querySelector('[role="dialog"]')).not.toBeNull();
  click('close-modal'); await vi.advanceTimersByTimeAsync(2000);
  expect(root.querySelector('[role="dialog"]')).toBeNull(); expect(saved().game).toEqual(game);
});
it('포트폴리오 조회 중에는 진행을 멈추고 닫은 뒤 표시 시간을 다시 확보한다', async () => {
  const game = startTurn(fresh(), 5).state; mount(game, true);
  await vi.advanceTimersByTimeAsync(500); click('open-portfolio');
  await vi.advanceTimersByTimeAsync(3000); expect(saved().modal).toBe('portfolio'); expect(saved().arrivalPending).toBe(true);
  click('close-modal'); await vi.advanceTimersByTimeAsync(1199); expect(saved().modal).toBeNull();
  await vi.advanceTimersByTimeAsync(1); expect(saved().arrivalPending).toBeUndefined(); expect(saved().game).toEqual(game);
});
it('도착 중 새로고침·탭 숨김 후에도 같은 시장 결과를 유지하고 안내만 이어간다', async () => {
  const game = startTurn(fresh(), 5).state; mount(game, true);
  await vi.advanceTimersByTimeAsync(500); mount(saved().game, saved().arrivalPending);
  const hidden = vi.spyOn(document, 'hidden', 'get').mockReturnValue(true);
  document.dispatchEvent(new Event('visibilitychange')); await vi.advanceTimersByTimeAsync(3000);
  expect(saved().arrivalPending).toBe(true); expect(saved().game).toEqual(game);
  hidden.mockRestore(); document.dispatchEvent(new Event('visibilitychange'));
  await vi.advanceTimersByTimeAsync(1200); expect(saved().arrivalPending).toBeUndefined(); expect(saved().game).toEqual(game);
});
it('움직임 줄이기는 추가 도착 대기를 생략하고 기존 진행으로 연결한다', async () => {
  const game = fresh(); mount(game, false, true); click('roll-dice'); await vi.advanceTimersByTimeAsync(0);
  expect(saved().game.turn).toBe(1); expect(saved().arrivalPending).toBeUndefined();
  expect(root.querySelector('[role="dialog"]')).not.toBeNull();
});
it('도착 진행 UI 표시를 구 저장은 생략할 수 있고 잘못된 값은 거부한다', () => {
  mount(startTurn(fresh(), 5).state, true);
  const data = saved(); expect(data).not.toBeNull();
  const old = { ...data }; delete old.arrivalPending;
  expect(parseCheckpoint(JSON.stringify(old))).not.toBeNull();
  expect(parseCheckpoint(JSON.stringify({ ...data, arrivalPending: 'yes' }))).toBeNull();
  expect(parseCheckpoint(JSON.stringify({ ...data, game: fresh() }))).toBeNull();
});
