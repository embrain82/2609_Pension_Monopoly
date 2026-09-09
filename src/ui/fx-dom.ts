import { NUMBER_TWEEN_MS, easeOutCubic, formatByKind, interpolate, type NumberKind } from './fx';

const generations = new WeakMap<HTMLElement, number>();

/** 렌더 뒤 `data-anim` 숫자를 시작 값에서 끝 값으로 트윈한다. 동작 줄이기면 즉시 끝 값. */
export function runNumberAnimations(root: ParentNode, skip: boolean, durationMs = NUMBER_TWEEN_MS): void {
  root.querySelectorAll<HTMLElement>('[data-anim]').forEach((node) => {
    const generation = (generations.get(node) ?? 0) + 1;
    generations.set(node, generation);
    if (!node.hasAttribute('data-from')) return;
    const kind = node.dataset.anim as NumberKind;
    const from = Number(node.dataset.from);
    const to = Number(node.dataset.to);
    delete node.dataset.from;
    if (skip || !Number.isFinite(from) || !Number.isFinite(to)) {
      node.textContent = formatByKind(kind, to);
      return;
    }
    node.classList.add(to > from ? 'up' : 'down');
    const start = performance.now();
    const tick = (): void => {
      if (!node.isConnected || generations.get(node) !== generation) return;
      const t = easeOutCubic((performance.now() - start) / durationMs);
      node.textContent = formatByKind(kind, interpolate(from, to, t));
      if (t < 1) requestAnimationFrame(tick);
      else window.setTimeout(() => { if (generations.get(node) === generation) node.classList.remove('up', 'down'); }, 400);
    };
    requestAnimationFrame(tick);
  });
}
