import type { AnimationController } from './animation-controller';

export interface BoardViewport { top: number; bottom: number; scroll: number; maxScroll: number }
/** 판이 이미 보이면 그대로. 높이가 부족하면 보이는 면적이 최대가 되도록 위를 맞춘다. */
export function boardScrollTarget(rect: Pick<DOMRect, 'top' | 'bottom' | 'height'>, viewport: BoardViewport): number {
  if (rect.height <= 0 || viewport.bottom <= viewport.top) return viewport.scroll;
  const fits = rect.height <= viewport.bottom - viewport.top;
  if (fits && rect.top >= viewport.top - 1 && rect.bottom <= viewport.bottom + 1) return viewport.scroll;
  // 큰 보드가 이미 가시 영역을 채우는 경우에도 화면을 다시 끌어당기지 않는다.
  if (!fits && rect.top <= viewport.top && rect.bottom >= viewport.bottom) return viewport.scroll;
  const available = viewport.bottom - viewport.top;
  const desiredTop = viewport.top + (fits ? Math.max(0, (available - rect.height) / 2) : 0);
  return Math.max(0, Math.min(viewport.maxScroll, viewport.scroll + rect.top - desiredTop));
}

export type BoardRevealResult = 'shown' | 'interrupted' | 'cancelled';
/** 기다릴 스크롤이 없으면 null을 반환해 동작 줄이기의 즉시 턴 진행을 보존한다. */
export function revealBoard(board: HTMLElement | null, footer: HTMLElement | null, motion: AnimationController,
  id: number, instant: boolean): Promise<BoardRevealResult> | null {
  if (!board) return null;
  const viewport = window.visualViewport;
  const top = (viewport?.offsetTop ?? 0) + 12;
  let bottom = (viewport?.offsetTop ?? 0) + (viewport?.height ?? window.innerHeight) - 12;
  const bar = footer?.getBoundingClientRect();
  if (bar && bar.height > 0 && bar.top < bottom && bar.bottom > top) bottom = Math.max(top, bar.top - 12);
  const scroller = document.scrollingElement ?? document.documentElement;
  const start = window.scrollY;
  const target = boardScrollTarget(board.getBoundingClientRect(), { top, bottom, scroll: start,
    maxScroll: Math.max(0, scroller.scrollHeight - document.documentElement.clientHeight) });
  if (Math.abs(target - start) < 2) return null;
  if (instant) { window.scrollTo({ top: target, behavior: 'instant' }); return null; }
  return animateScroll(start, target, motion, id);
}

async function animateScroll(start: number, target: number, motion: AnimationController, id: number): Promise<BoardRevealResult> {
  let interrupted = false;
  const interrupt = () => { interrupted = true; };
  const onKey = (event: KeyboardEvent) => { if (['ArrowUp','ArrowDown','PageUp','PageDown','Home','End',' '].includes(event.key)) interrupt(); };
  window.addEventListener('wheel', interrupt, { passive: true });
  window.addEventListener('touchstart', interrupt, { passive: true });
  window.addEventListener('pointerdown', interrupt, { passive: true });
  window.addEventListener('keydown', onKey);
  try {
    // 브라우저의 가변적인 스크롤 시간 대신 약 320ms 안에 완료한다.
    for (let step = 1; step <= 20; step++) {
      if (!await motion.wait(16, id)) return 'cancelled';
      if (interrupted) return 'interrupted';
      const t = step / 20, eased = t * t * (3 - 2 * t);
      window.scrollTo({ top: start + (target - start) * eased, behavior: 'instant' });
    }
    return 'shown';
  } finally {
    window.removeEventListener('wheel', interrupt); window.removeEventListener('touchstart', interrupt);
    window.removeEventListener('pointerdown', interrupt); window.removeEventListener('keydown', onKey);
  }
}
