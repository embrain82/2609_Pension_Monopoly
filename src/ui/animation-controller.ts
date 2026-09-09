/** 취소된 장면의 타이머·애니메이션 완료가 새 게임을 진행시키지 못하게 한다. */
export class AnimationController {
  private generation = 0;
  private pending = new Set<() => void>();
  private animations = new Set<Animation>();
  begin(): number { this.cancel(); return this.generation; }
  valid(id: number): boolean { return id === this.generation; }
  cancel(): void {
    this.generation++;
    for (const cancel of this.pending) cancel();
    this.pending.clear();
    for (const animation of this.animations) animation.cancel();
    this.animations.clear();
  }
  wait(ms: number, id: number): Promise<boolean> {
    return new Promise(resolve => {
      const cancel = () => { clearTimeout(timer); resolve(false); };
      const timer = setTimeout(() => { this.pending.delete(cancel); resolve(this.valid(id)); }, ms);
      if (!this.valid(id)) cancel(); else this.pending.add(cancel);
    });
  }
  async play(animations: Animation[], id: number): Promise<boolean> {
    if (!this.valid(id)) { animations.forEach(a => a.cancel()); return false; }
    animations.forEach(a => this.animations.add(a));
    try { await Promise.all(animations.map(a => a.finished)); } catch { return false; }
    finally { animations.forEach(a => this.animations.delete(a)); }
    return this.valid(id);
  }
}
