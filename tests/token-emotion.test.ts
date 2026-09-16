// @vitest-environment happy-dom
import { afterEach, beforeEach, expect, it, vi, type MockInstance } from 'vitest';
import { TokenEmotionPlayer, TOKEN_EMOTION_LEVEL, TOKEN_EMOTION_REPEAT_GAP_MS, tokenEmotionPlan, type TokenEmotionView } from '../src/ui/token-emotion';

let player: TokenEmotionPlayer;
let view: TokenEmotionView;
let load: () => void;
let fail: () => void;
let animation: MockInstance<Element['animate']>;
let cancels: Array<ReturnType<typeof vi.fn>>;
const rect = (x: number, y: number, width: number, height: number) => new DOMRect(x, y, width, height);

beforeEach(() => {
  vi.useFakeTimers();
  document.body.innerHTML = '<div id="board"><div id="token"><svg viewBox="0 0 100 100"><g id="actor"></g></svg></div></div><footer></footer>';
  const actor = document.querySelector<SVGElement>('#actor')!;
  const token = document.querySelector<HTMLElement>('#token')!;
  const board = document.querySelector<HTMLElement>('#board')!;
  const footer = document.querySelector<HTMLElement>('footer')!;
  vi.spyOn(token, 'getBoundingClientRect').mockReturnValue(rect(100, 100, 80, 80));
  vi.spyOn(board, 'getBoundingClientRect').mockReturnValue(rect(0, 0, 700, 700));
  vi.spyOn(actor.ownerSVGElement!, 'getBoundingClientRect').mockReturnValue(rect(100, 100, 80, 80));
  vi.spyOn(footer, 'getBoundingClientRect').mockReturnValue(rect(0, 700, 800, 100));
  vi.stubGlobal('Image', class {
    onload: (() => void) | null = null;
    onerror: (() => void) | null = null;
    complete = false;
    naturalWidth = 0;
    set src(_value: string) { load = () => this.onload?.(); fail = () => this.onerror?.(); }
  });
  cancels = [];
  animation = vi.spyOn(Element.prototype, 'animate').mockImplementation((_frames, options) => {
    const duration = typeof options === 'number' ? options : Number(options?.duration ?? 0);
    let timer: ReturnType<typeof setTimeout>;
    let reject!: (error: Error) => void;
    const finished = new Promise<Animation>((resolve, no) => { reject = no; timer = setTimeout(() => resolve({} as Animation), duration); });
    const cancel = vi.fn(() => { clearTimeout(timer); reject(new Error('cancelled')); }); cancels.push(cancel);
    return { finished, cancel } as unknown as Animation;
  });
  player = new TokenEmotionPlayer();
  view = { key: 'seed:1', mood: 'happy', character: 'woni', actor, token, board, footer, imageSrc: '/woni.png', blocked: false, disabled: false, speed: 1 };
});
afterEach(() => { player.reset(); vi.useRealTimers(); vi.restoreAllMocks(); vi.unstubAllGlobals(); document.body.innerHTML = ''; });

it('승인된 강도는 평온 1·긴장/기쁨 3이며 빠르게 설정해도 이동 폭은 같다', () => {
  expect(TOKEN_EMOTION_LEVEL).toEqual({ calm: 1, tense: 3, happy: 3 });
  for (const mood of ['calm', 'tense', 'happy'] as const) {
    const normal = tokenEmotionPlan(mood), fast = tokenEmotionPlan(mood, 1, .5);
    expect(fast.frames).toEqual(normal.frames);
    expect(Number(fast.options.duration)).toBe(Number(normal.options.duration) / 2);
    expect(normal.options.iterations).toBe(1);
  }
});
it('안내창을 닫으면 시작하고 2초 간격으로 반복하며 재렌더·스크롤로 중복하지 않는다', async () => {
  player.update({ ...view, blocked: true }); expect(animation).not.toHaveBeenCalled();
  player.update(view); expect(animation).not.toHaveBeenCalled(); load();
  expect(animation).toHaveBeenCalledOnce(); expect(animation.mock.instances[0]).toBe(view.actor);
  expect((animation.mock.calls[0][0] as Keyframe[])[1].transform).toContain('translateY(-15px)');
  player.update(view); window.dispatchEvent(new Event('scroll'));
  await vi.advanceTimersByTimeAsync(1000 + TOKEN_EMOTION_REPEAT_GAP_MS - 1);
  expect(animation).toHaveBeenCalledOnce();
  player.update(view); window.dispatchEvent(new Event('scroll'));
  await vi.advanceTimersByTimeAsync(1); expect(animation).toHaveBeenCalledTimes(2);
  await vi.advanceTimersByTimeAsync(3000); expect(animation).toHaveBeenCalledTimes(3);
});
it('포트폴리오·운용창을 열면 재생과 예약 모두 취소하고 닫을 때 다시 반복한다', async () => {
  player.update(view); load();
  player.update({ ...view, blocked: true }); expect(cancels[0]).toHaveBeenCalledOnce();
  await vi.advanceTimersByTimeAsync(10000); expect(animation).toHaveBeenCalledOnce();
  player.update(view); expect(animation).toHaveBeenCalledTimes(2);
  await vi.advanceTimersByTimeAsync(1000); // 다음 반복을 기다리는 중에 다시 안내창 열기
  player.update({ ...view, blocked: true });
  await vi.advanceTimersByTimeAsync(10000); expect(animation).toHaveBeenCalledTimes(2);
  player.update(view); await vi.advanceTimersByTimeAsync(3000);
  expect(animation).toHaveBeenCalledTimes(4);
});
it('화면 밖·하단 조작부 뒤로 스크롤하면 멈추고 보이는 순간 다시 재생한다', async () => {
  vi.mocked(view.token!.getBoundingClientRect).mockReturnValue(rect(100, 720, 80, 80));
  player.update(view); load(); expect(animation).not.toHaveBeenCalled();
  vi.mocked(view.token!.getBoundingClientRect).mockReturnValue(rect(100, 100, 80, 80));
  window.dispatchEvent(new Event('scroll')); expect(animation).toHaveBeenCalledOnce();
  vi.mocked(view.token!.getBoundingClientRect).mockReturnValue(rect(100, -200, 80, 80));
  window.dispatchEvent(new Event('scroll')); expect(cancels[0]).toHaveBeenCalledOnce();
  await vi.advanceTimersByTimeAsync(10000); expect(animation).toHaveBeenCalledOnce();
  vi.mocked(view.token!.getBoundingClientRect).mockReturnValue(rect(100, 100, 80, 80));
  window.dispatchEvent(new Event('scroll')); expect(animation).toHaveBeenCalledTimes(2);
});
it('늦게 로드된 이미지도 안내창·숨겨진 탭·이동 뒤에서 재생하지 않는다', async () => {
  player.update(view); player.update({ ...view, blocked: true }); load();
  expect(animation).not.toHaveBeenCalled();
  const hidden = vi.spyOn(document, 'hidden', 'get').mockReturnValue(true);
  player.update(view); expect(animation).not.toHaveBeenCalled();
  hidden.mockReturnValue(false); player.update(view); expect(animation).toHaveBeenCalledOnce();
  player.suspend(); await vi.advanceTimersByTimeAsync(10000);
  expect(animation).toHaveBeenCalledOnce();
  // 이동 중의 이미지 완료·스크롤 이벤트도 suspend를 해제하지 않는다.
  load(); window.dispatchEvent(new Event('scroll')); expect(animation).toHaveBeenCalledOnce();
  player.update(view); expect(animation).toHaveBeenCalledTimes(2);
});
it('이어서 하기도 현재 표정으로 반복하고 화면을 나간 후에는 남은 예약이 없다', async () => {
  player.update(view); load(); await vi.advanceTimersByTimeAsync(1000);
  player.reset(); await vi.advanceTimersByTimeAsync(10000); expect(animation).toHaveBeenCalledOnce();
  player.update(view); expect(animation).toHaveBeenCalledTimes(2);
  await vi.advanceTimersByTimeAsync(3000); expect(animation).toHaveBeenCalledTimes(3);
});
it('새 턴·캐릭터·표정·속도 변경은 이전 반복을 취소하고 현재 상태만 보여준다', async () => {
  player.update(view); load();
  player.update({ ...view, key: 'seed:2', mood: 'tense', speed: .5 });
  expect(cancels[0]).toHaveBeenCalledOnce();
  expect(animation.mock.calls[1][1]).toMatchObject({ duration: 350 });
  const next = { ...view, key: 'seed:2', character: 'kori', imageSrc: '/kori.png' };
  player.update(next); expect(cancels[1]).toHaveBeenCalledOnce();
  await vi.advanceTimersByTimeAsync(10000); expect(animation).toHaveBeenCalledTimes(2);
  load(); expect(animation).toHaveBeenCalledTimes(3);
  await vi.advanceTimersByTimeAsync(3000); expect(animation).toHaveBeenCalledTimes(4);
});
it('움직임 줄이기·캐릭터 끄기는 반복을 멈추며 해제 후 다시 재생한다', async () => {
  player.update(view); load();
  player.update({ ...view, disabled: true });
  await vi.advanceTimersByTimeAsync(10000);
  expect(cancels[0]).toHaveBeenCalledOnce(); expect(animation).toHaveBeenCalledOnce();
  player.update(view); await vi.advanceTimersByTimeAsync(3000);
  expect(animation).toHaveBeenCalledTimes(3);
});
it('이미지 실패·분리된 DOM에서는 반복 예약을 정리한다', async () => {
  player.update(view); fail(); player.update(view);
  await vi.advanceTimersByTimeAsync(10000); expect(animation).not.toHaveBeenCalled();
  player.update({ ...view, imageSrc: '/other.png' }); load();
  expect(animation).toHaveBeenCalledOnce(); view.actor!.remove();
  window.dispatchEvent(new Event('scroll'));
  await vi.advanceTimersByTimeAsync(10000); expect(animation).toHaveBeenCalledOnce();
});
it('모바일 너비 변경은 이전 좌표의 연출을 취소하고 새 배율로 한 번만 시작한다', () => {
  player.update(view); load();
  vi.mocked(view.actor!.ownerSVGElement!.getBoundingClientRect).mockReturnValue(rect(100, 100, 50, 50));
  window.dispatchEvent(new Event('resize'));
  expect(cancels[0]).toHaveBeenCalledOnce();
  expect((animation.mock.calls[1][0] as Keyframe[])[1].transform).toContain('translateY(-24px)');
  player.update(view); expect(animation).toHaveBeenCalledTimes(2);
});
