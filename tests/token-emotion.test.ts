// @vitest-environment happy-dom
import { afterEach, beforeEach, expect, it, vi, type MockInstance } from 'vitest';
import { TokenEmotionPlayer, TOKEN_EMOTION_LEVEL, tokenEmotionPlan, type TokenEmotionView } from '../src/ui/token-emotion';

let player: TokenEmotionPlayer;
let view: TokenEmotionView;
let load: () => void;
let fail: () => void;
let animation: MockInstance<Element['animate']>;
let cancels: Array<ReturnType<typeof vi.fn>>;
const rect = (x: number, y: number, width: number, height: number) => new DOMRect(x, y, width, height);

beforeEach(() => {
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
  animation = vi.spyOn(Element.prototype, 'animate').mockImplementation(() => {
    let reject!: (error: Error) => void;
    const finished = new Promise<Animation>((_resolve, no) => { reject = no; });
    const cancel = vi.fn(() => reject(new Error('cancelled'))); cancels.push(cancel);
    return { finished, cancel } as unknown as Animation;
  });
  player = new TokenEmotionPlayer();
  view = { key: 'seed:1', mood: 'happy', character: 'woni', actor, token, board, footer, imageSrc: '/woni.png', blocked: false, disabled: false, speed: 1 };
});
afterEach(() => { player.reset(); vi.restoreAllMocks(); vi.unstubAllGlobals(); document.body.innerHTML = ''; });

it('승인된 강도는 평온 1·긴장/기쁨 3이며 빠르게 설정해도 이동 폭은 같다', () => {
  expect(TOKEN_EMOTION_LEVEL).toEqual({ calm: 1, tense: 3, happy: 3 });
  for (const mood of ['calm', 'tense', 'happy'] as const) {
    const normal = tokenEmotionPlan(mood), fast = tokenEmotionPlan(mood, 1, .5);
    expect(fast.frames).toEqual(normal.frames);
    expect(Number(fast.options.duration)).toBe(Number(normal.options.duration) / 2);
    expect(normal.options.iterations).toBe(1);
  }
});
it('안내창이 닫히고 이미지가 준비된 뒤 한 번 재생하며 재렌더·조회로 반복하지 않는다', () => {
  player.queue(view.key); player.update({ ...view, blocked: true });
  expect(animation).not.toHaveBeenCalled();
  player.update(view); expect(animation).not.toHaveBeenCalled(); load();
  expect(animation).toHaveBeenCalledTimes(1);
  expect(animation.mock.instances[0]).toBe(view.actor);
  // 100px 칸 / 80px 말 배율로, 말 SVG의 12 단위를 실제 칸의 12%로 보정한다.
  expect((animation.mock.calls[0][0] as Keyframe[])[1].transform).toContain('translateY(-15px)');
  player.update(view); player.update({ ...view, blocked: true }); player.update(view);
  window.dispatchEvent(new Event('scroll'));
  expect(animation).toHaveBeenCalledTimes(1); expect(cancels[0]).toHaveBeenCalledOnce();
});
it('스크롤로 화면 밖에 있거나 하단 조작부에 가려진 말은 보일 때까지 기다린다', () => {
  vi.mocked(view.token!.getBoundingClientRect).mockReturnValue(rect(100, 720, 80, 80));
  player.queue(view.key); player.update(view); load();
  expect(animation).not.toHaveBeenCalled();
  vi.mocked(view.token!.getBoundingClientRect).mockReturnValue(rect(100, 100, 80, 80));
  window.dispatchEvent(new Event('scroll'));
  expect(animation).toHaveBeenCalledOnce();
});
it('늦게 로드된 이미지도 안내창이나 숨겨진 탭 뒤에서 재생하지 않는다', () => {
  player.queue(view.key); player.update(view); player.update({ ...view, blocked: true }); load();
  expect(animation).not.toHaveBeenCalled();
  const hidden = vi.spyOn(document, 'hidden', 'get').mockReturnValue(true);
  player.update(view); expect(animation).not.toHaveBeenCalled();
  hidden.mockReturnValue(false); player.update(view);
  expect(animation).toHaveBeenCalledOnce();
});
it('새로고침·이어서 하기는 재생 대기열이 없고, 다음 도착만 새로 재생한다', () => {
  player.update(view); expect(animation).not.toHaveBeenCalled();
  player.queue(view.key); player.update(view); load();
  player.reset(); player.update(view); expect(animation).toHaveBeenCalledOnce();
  player.queue('seed:2'); player.update({ ...view, key: 'seed:2', mood: 'tense' });
  expect(animation).toHaveBeenCalledTimes(2);
});
it('캐릭터 변경과 새 이동은 보류된 이전 연출을 취소한다', () => {
  player.queue(view.key); player.update(view);
  player.update({ ...view, character: 'kori', imageSrc: '/kori.png' }); load();
  expect(animation).not.toHaveBeenCalled();
  player.queue(view.key); player.update({ ...view, imageSrc: '/uncached.png' }); player.reset(); load();
  window.dispatchEvent(new Event('scroll')); expect(animation).not.toHaveBeenCalled();
});
it('움직임 줄이기는 진행 중인 연출을 멈추고 다시 켜도 반복하지 않는다', () => {
  player.queue(view.key); player.update(view); load();
  player.update({ ...view, disabled: true }); player.update(view);
  expect(cancels[0]).toHaveBeenCalledOnce(); expect(animation).toHaveBeenCalledOnce();
});
it('이미지 실패·캐릭터 끔·분리된 DOM에서는 재생하지 않는다', () => {
  player.queue(view.key); player.update(view); fail(); player.update(view);
  expect(animation).not.toHaveBeenCalled();
  player.queue(view.key); player.update({ ...view, imageSrc: '/other.png', disabled: true });
  expect(animation).not.toHaveBeenCalled();
  player.queue(view.key); player.update({ ...view, imageSrc: '/other.png' });
  view.actor!.remove(); load(); expect(animation).not.toHaveBeenCalled();
});
