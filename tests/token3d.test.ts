import { describe, expect, it } from 'vitest';
import { boardTiles } from '../src/data/content';
import { createGame, startTurn } from '../src/engine/game-engine';
import { TOKEN_STEP_MS, renderBoardMarkup } from '../src/ui/board';
import { HOP_AIR, HOP_HEIGHT, HOP_MS, LAND_MS, TOKEN_BASE, hopPlan, renderTokenLayer, slideKeyframes, tokenClasses, tokenPercent, tokenTranslate } from '../src/ui/token3d';

describe('2.5D 말 오버레이', () => {
  it('24칸 모두 칸 중심 퍼센트가 0~100 안이고 네 모서리가 맞는다', () => {
    for (const tile of boardTiles) {
      const { x, y } = tokenPercent(tile.index);
      expect(x).toBeGreaterThan(0);
      expect(x).toBeLessThan(100);
      expect(y).toBeGreaterThan(0);
      expect(y).toBeLessThan(100);
    }
    expect(tokenPercent(0)).toEqual({ x: 7.14, y: 7.14 });
    expect(tokenPercent(6)).toEqual({ x: 92.86, y: 7.14 });
    expect(tokenPercent(12)).toEqual({ x: 92.86, y: 92.86 });
    expect(tokenPercent(18)).toEqual({ x: 7.14, y: 92.86 });
    expect(tokenPercent(24)).toEqual(tokenPercent(0));
    expect(tokenTranslate(3)).toBe('translate(50%, 7.14%)');
  });

  it('마크업은 aria-hidden이고 캐릭터 켬이면 아바타, 끔이면 「나」 퍽이다', () => {
    const state = createGame('token3d');
    const on = renderTokenLayer(state, { index: 5, characters: true, mood: 'calm' });
    expect(on).toContain('class="token-layer" aria-hidden="true"');
    expect(on).toContain('data-index="5"');
    expect(on).toContain('data-character-name="단지"');
    expect(on).toContain('transform:translate(78.57%, 7.14%)');
    expect(on).toContain('<svg viewBox="0 0 100 100"');
    expect(on).not.toContain('plain');
    const off = renderTokenLayer(state, { index: 5, characters: false, mood: 'calm' });
    expect(off).toContain('token3d plain');
    expect(off).toContain('<b>나</b>');
    expect(off).not.toContain('<svg');
  });

  it('마크업은 정지 자세만 그리고(hop/land 클래스 없음), 애니메이션은 키프레임 상수가 맡는다', () => {
    expect(tokenClasses({ characters: true })).toBe('token3d');
    expect(tokenClasses({ characters: false })).toBe('token3d plain');
    const state = createGame('token3d-still');
    const markup = renderTokenLayer(state, { index: 2, characters: true, mood: 'happy' });
    expect(markup).not.toMatch(/\b(hop|land)\b/);
  });

  it('점프 계획: 첫 칸부터 마지막 칸까지 같은 높이·같은 공중 시간, 마지막 칸만 착지가 크고 길다', () => {
    const step = hopPlan(false);
    const last = hopPlan(true);
    expect(step.duration).toBe(TOKEN_STEP_MS);
    expect(step.land).toBeCloseTo(HOP_AIR);
    expect(last.duration).toBe(TOKEN_STEP_MS * HOP_AIR + LAND_MS);
    expect(last.land * last.duration).toBeCloseTo(step.land * step.duration);
    for (const plan of [step, last]) {
      expect(plan.puck[0].transform).toBe(TOKEN_BASE);
      expect(plan.puck[plan.puck.length - 1].transform).toBe(TOKEN_BASE);
      const peak = plan.puck[1];
      expect(peak.transform).toContain(`translateY(-${HOP_HEIGHT})`);
      expect(peak.offset).toBeCloseTo(plan.land / 2);
      const touch = plan.puck[2];
      expect(touch.offset).toBeCloseTo(plan.land);
      expect(touch.transform).toContain('scale(1.');
      for (const f of plan.puck) expect(f.transform?.startsWith(TOKEN_BASE)).toBe(true);
      const offsets = plan.puck.map((f) => f.offset ?? 0);
      expect([...offsets].sort((a, b) => a - b)).toEqual(offsets);
      expect(plan.shadow[0].opacity).toBe(1);
      expect(plan.shadow[1].opacity).toBeLessThan(1);
      expect(plan.shadow[plan.shadow.length - 1].opacity).toBe(1);
    }
    expect(step.puck[1].transform).toBe(last.puck[1].transform);
    expect(step.puck[2].transform).toContain('scale(1.08, 0.92)');
    expect(last.puck[2].transform).toContain('scale(1.16, 0.82)');
    expect(HOP_MS).toBe(TOKEN_STEP_MS);
    expect(LAND_MS).toBeGreaterThan(0);
  });

  it('가로 이동은 공중에 있는 동안만 움직이고 닿은 뒤엔 도착 칸에 고정된다', () => {
    const frames = slideKeyframes(1, 2, 0.75);
    expect(frames[0].transform).toBe(tokenTranslate(1));
    expect(frames[0].offset).toBe(0);
    expect(frames[1].transform).toBe(tokenTranslate(2));
    expect(frames[1].offset).toBe(0.75);
    expect(frames[2].transform).toBe(tokenTranslate(2));
    expect(frames[2].offset).toBe(1);
  });

  it('오버레이를 쓰면 SVG에는 말을 그리지 않되 위치 aria-label은 남는다', () => {
    const started = startTurn(createGame('token3d-svg'), 4).state;
    const markup = renderBoardMarkup(started, false, { characters: true, tokenInSvg: false, landed: true });
    expect(markup).not.toContain('player-avatar');
    expect(markup).not.toContain('player-mark');
    expect(markup).toContain(`현재 말은 ${started.position + 1}번 칸`);
    expect(markup).toContain('tile-fx');
    const legacy = renderBoardMarkup(started, false, { characters: true });
    expect(legacy).toContain('player-avatar');
  });
});
