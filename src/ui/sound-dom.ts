import { toneScript, type SoundName } from './sound';

export type AudioStatus = 'off' | 'ready' | 'blocked' | 'unsupported';
/** resume를 기다린 뒤 재생한다. 끔/탭 이동은 예약된 효과음도 취소한다. */
export class SoundPlayer {
  private ctx: AudioContext | null = null;
  private noise: AudioBuffer | null = null;
  private resuming: Promise<void> | null = null;
  private generation = 0;
  private voices = new Set<AudioScheduledSourceNode>();
  status: AudioStatus = 'off';

  constructor(private readonly enabled: () => boolean,
    private readonly createContext = (): AudioContext | null => {
      const root = globalThis as typeof globalThis & { webkitAudioContext?: typeof AudioContext };
      const Context = root.AudioContext ?? root.webkitAudioContext;
      return Context ? new Context() : null;
    }) {}

  async unlock(): Promise<boolean> {
    if (!this.enabled()) { this.status = 'off'; return false; }
    try {
      if (!this.ctx || this.ctx.state === 'closed') { this.ctx = this.createContext(); this.noise = null; }
      if (!this.ctx) { this.status = 'unsupported'; return false; }
      if (this.ctx.state !== 'running') {
        // suspended 및 Safari의 interrupted 상태를 사용자 제스처에서 복구한다.
        this.resuming ??= this.ctx.resume().finally(() => { this.resuming = null; });
        await this.resuming;
      }
      const running = String(this.ctx.state) === 'running';
      this.status = !this.enabled() ? 'off' : running ? 'ready' : 'blocked';
      return this.enabled() && running;
    } catch { this.status = 'blocked'; return false; }
  }

  stop(): void {
    this.generation++;
    for (const source of this.voices) { try { source.stop(); } catch { /* 이미 종료됨 */ } }
    this.voices.clear();
    if (!this.enabled()) this.status = 'off';
  }

  async play(name: SoundName): Promise<boolean> {
    const generation = this.generation;
    if (!await this.unlock() || generation !== this.generation || !this.enabled()) return false;
    const ctx = this.ctx!;
    try {
      const now = ctx.currentTime + 0.015;
      for (const step of toneScript(name)) {
        const gain = ctx.createGain();
        gain.gain.setValueAtTime(0.0001, now + step.at);
        gain.gain.exponentialRampToValueAtTime(step.gain, now + step.at + 0.01);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + step.at + step.dur);
        gain.connect(ctx.destination);
        let source: AudioBufferSourceNode | OscillatorNode;
        if (step.wave === 'noise') {
          source = ctx.createBufferSource(); source.buffer = this.noiseBuffer(ctx);
        } else {
          source = ctx.createOscillator(); source.type = step.wave;
          source.frequency.setValueAtTime(step.freq, now + step.at);
        }
        source.connect(gain);
        this.voices.add(source);
        source.onended = () => { this.voices.delete(source); source.disconnect(); gain.disconnect(); };
        source.start(now + step.at); source.stop(now + step.at + step.dur);
      }
      return true;
    } catch { this.status = 'blocked'; return false; }
  }

  private noiseBuffer(ctx: AudioContext): AudioBuffer {
    if (this.noise) return this.noise;
    const buffer = ctx.createBuffer(1, ctx.sampleRate * 0.5, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    return this.noise = buffer;
  }
}
