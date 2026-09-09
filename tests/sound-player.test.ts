/// <reference lib="dom" />
import { describe, expect, it, vi } from 'vitest';
import { SoundPlayer } from '../src/ui/sound-dom';

function audio(initial = 'suspended') {
  const start = vi.fn(), stop = vi.fn();
  let resolve: () => void = () => {};
  const source = () => ({ start, stop, connect: vi.fn(), disconnect: vi.fn(), frequency: { setValueAtTime: vi.fn() } });
  const ctx = { state: initial, currentTime: 1, destination: {}, sampleRate: 48000,
    resume: vi.fn(() => new Promise<void>(r => { resolve = () => { ctx.state = 'running'; r(); }; })),
    createGain: () => ({ gain: { setValueAtTime: vi.fn(), exponentialRampToValueAtTime: vi.fn() }, connect: vi.fn(), disconnect: vi.fn() }),
    createOscillator: source, createBufferSource: source,
    createBuffer: () => ({ getChannelData: () => new Float32Array(24000) }) };
  return { ctx: ctx as unknown as AudioContext, raw: ctx, start, stop, resume: () => resolve() };
}

describe('브라우저 오디오 활성화', () => {
  it('비동기 resume 완료 전 첫 효과음을 버리지 않고 활성화 후 시작한다', async () => {
    const fake = audio(); const player = new SoundPlayer(() => true, () => fake.ctx);
    const unlock = player.unlock(); const played = player.play('arrive');
    expect(fake.start).not.toHaveBeenCalled(); expect(fake.raw.resume).toHaveBeenCalledTimes(1);
    fake.resume(); expect(await unlock).toBe(true); expect(await played).toBe(true);
    expect(fake.start).toHaveBeenCalledTimes(1); expect(player.status).toBe('ready');
  });
  it('켜진 설정 복원 및 interrupted 이후 제스처에서 복구한다', async () => {
    const fake = audio('interrupted'); const player = new SoundPlayer(() => true, () => fake.ctx);
    const played = player.play('news'); fake.resume(); expect(await played).toBe(true);
    expect(fake.start).toHaveBeenCalledTimes(2);
  });
  it('resume 대기 중 끄면 예약음도 취소되고 다시 켜도 이전 음이 되살아나지 않는다', async () => {
    const fake = audio(); let enabled = true; const player = new SoundPlayer(() => enabled, () => fake.ctx);
    const played = player.play('arrive'); enabled = false; player.stop(); enabled = true;
    fake.resume(); expect(await played).toBe(false); expect(fake.start).not.toHaveBeenCalled();
    expect(await player.play('arrive')).toBe(true); player.stop(); expect(fake.stop).toHaveBeenCalled();
  });
  it('차단/미지원/생성 실패가 게임 예외나 거짓 재생 성공을 만들지 않는다', async () => {
    const fake = audio(); fake.raw.resume.mockRejectedValueOnce(new Error('blocked'));
    const player = new SoundPlayer(() => true, () => fake.ctx);
    expect(await player.play('dice')).toBe(false); expect(player.status).toBe('blocked');
    const unsupported = new SoundPlayer(() => true, () => null);
    expect(await unsupported.play('dice')).toBe(false); expect(unsupported.status).toBe('unsupported');
    expect(await new SoundPlayer(() => true, () => { throw Error('device'); }).play('dice')).toBe(false);
  });
  it('소리 끔에서는 오디오 객체를 생성하지 않는다', async () => {
    const factory = vi.fn(() => audio().ctx); const player = new SoundPlayer(() => false, factory);
    expect(await player.play('dice')).toBe(false); expect(factory).not.toHaveBeenCalled();
  });
});
