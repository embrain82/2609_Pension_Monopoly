import type { Mood } from './avatars';

/** 승인된 시안 강도. 판정과 금융 상태는 기존 엔진/avatarMood에 맡긴다. */
export const TOKEN_EMOTION_LEVEL = { calm: 1, tense: 3, happy: 3 } as const;

/** 이동량은 한 칸=100 기준. 말 SVG 크기가 달라도 같은 칸 비율로 움직인다. */
export function tokenEmotionPlan(mood: Mood, tileToAvatar = 1, speed = 1): { frames: Keyframe[]; options: KeyframeAnimationOptions } {
  const frames: Keyframe[] = mood === 'calm'
    ? [{ transform: 'scale(1,1)' }, { transform: 'scale(1.01,1.025)' }, { transform: 'scale(1,1)' }]
    : mood === 'tense'
      ? [0, -1, 1, -1, 1, 0].map(sign => ({ transform: `translateX(${sign * 4 * tileToAvatar}px) rotate(${sign * 2.5}deg)` }))
      : [
        { transform: 'translateY(0) rotate(0deg) scale(1,1)' },
        { transform: `translateY(${-12 * tileToAvatar}px) rotate(-5deg) scale(1,1)` },
        { transform: 'translateY(0) rotate(0deg) scale(1.06,0.94)' },
        { transform: `translateY(${-7.2 * tileToAvatar}px) rotate(5deg) scale(1,1)` },
        { transform: 'translateY(0) rotate(0deg) scale(1,1)' }
      ];
  return { frames, options: { duration: ({ calm: 1600, tense: 700, happy: 1000 }[mood]) * speed, easing: 'ease-in-out', iterations: 1 } };
}

export interface TokenEmotionView {
  key: string;
  mood: Mood;
  character: string;
  actor: SVGElement | null;
  token: HTMLElement | null;
  board: HTMLElement | null;
  footer: HTMLElement | null;
  imageSrc: string;
  blocked: boolean;
  disabled: boolean;
  speed: number;
}

/** 말 이동과 독립적으로, 보일 때 한 번만 재생하는 UI 연출. 저장 상태에 포함하지 않는다. */
export class TokenEmotionPlayer {
  private pending: string | null = null;
  private view: TokenEmotionView | null = null;
  private animation: Animation | null = null;
  private listening = false;
  private readonly images = new Map<string, 'loading' | 'ready' | 'failed'>();
  private readonly retry = () => this.tryPlay();

  queue(key: string): void { this.reset(); this.pending = key; }
  reset(): void { this.suspend(); this.pending = null; this.view = null; }
  /** 안내창이나 숨겨진 탭에서는 중단. 아직 재생하지 않았다면 다음 보드 표시까지 보류한다. */
  suspend(): void {
    this.animation?.cancel(); this.animation = null;
    if (!this.listening) return;
    window.removeEventListener('scroll', this.retry, true);
    window.removeEventListener('resize', this.retry);
    window.visualViewport?.removeEventListener('scroll', this.retry);
    window.visualViewport?.removeEventListener('resize', this.retry);
    this.listening = false;
  }

  update(next: TokenEmotionView): void {
    const previous = this.view;
    this.view = next;
    if (this.pending && this.pending !== next.key) this.pending = null;
    if (previous && (previous.key !== next.key || previous.character !== next.character)) {
      this.suspend(); this.pending = null;
    } else if (previous && (previous.actor !== next.actor || previous.mood !== next.mood)) this.suspend();
    if (next.disabled || !next.actor || !next.token || !next.imageSrc) { this.suspend(); this.pending = null; return; }
    if (next.blocked || document.hidden) { this.suspend(); return; }
    if (!this.pending) return;
    if (!this.listening) {
      window.addEventListener('scroll', this.retry, { capture: true, passive: true });
      window.addEventListener('resize', this.retry, { passive: true });
      window.visualViewport?.addEventListener('scroll', this.retry, { passive: true });
      window.visualViewport?.addEventListener('resize', this.retry, { passive: true });
      this.listening = true;
    }
    this.prepareImage(next.imageSrc);
    this.tryPlay();
  }

  private prepareImage(src: string): void {
    if (this.images.has(src)) return;
    this.images.set(src, 'loading');
    const image = new Image();
    image.onload = () => { this.images.set(src, 'ready'); this.tryPlay(); };
    image.onerror = () => {
      this.images.set(src, 'failed');
      if (this.view?.imageSrc === src) { this.suspend(); this.pending = null; }
    };
    image.src = src;
    if (image.complete && image.naturalWidth > 0) this.images.set(src, 'ready');
  }

  private tryPlay(): void {
    const view = this.view;
    if (!view || this.pending !== view.key || view.blocked || view.disabled || document.hidden) return;
    const actor = view.actor, token = view.token;
    if (!actor?.isConnected || !token?.isConnected) { this.reset(); return; }
    if (this.images.get(view.imageSrc) === 'failed') { this.suspend(); this.pending = null; return; }
    if (this.images.get(view.imageSrc) !== 'ready') return;
    const rect = token.getBoundingClientRect();
    const viewport = window.visualViewport;
    const top = viewport?.offsetTop ?? 0, left = viewport?.offsetLeft ?? 0;
    let bottom = top + (viewport?.height ?? window.innerHeight);
    const right = left + (viewport?.width ?? window.innerWidth);
    const footer = view.footer?.getBoundingClientRect();
    if (footer && footer.height > 0 && footer.top < bottom && footer.bottom > top) bottom = Math.min(bottom, footer.top);
    const visibleArea = Math.max(0, Math.min(rect.right, right) - Math.max(rect.left, left)) * Math.max(0, Math.min(rect.bottom, bottom) - Math.max(rect.top, top));
    if (rect.width <= 0 || rect.height <= 0 || visibleArea < rect.width * rect.height * .5) return;
    const avatarWidth = actor.ownerSVGElement?.getBoundingClientRect().width ?? 0;
    const tileWidth = (view.board?.getBoundingClientRect().width ?? 0) / 7;
    const plan = tokenEmotionPlan(view.mood, avatarWidth > 0 && tileWidth > 0 ? tileWidth / avatarWidth : 1, view.speed);
    // 다시 그리거나 중단된 뒤에도 반복하지 않는다. 이동·금융 처리를 기다리게 하지 않는다.
    this.pending = null; this.suspend();
    if (typeof actor.animate !== 'function') return;
    try {
      const animation = actor.animate(plan.frames, plan.options);
      this.animation = animation;
      void animation.finished.then(() => { if (this.animation === animation) this.animation = null; }, () => { if (this.animation === animation) this.animation = null; });
    } catch { /* WAAPI 미지원 시 현재의 정지 표정을 유지한다. */ }
  }
}
