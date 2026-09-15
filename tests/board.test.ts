import { describe, expect, it } from 'vitest';
import { boardTiles } from '../src/data/content';
import { createGame, startTurn } from '../src/engine/game-engine';
import { dicePairForTurn, diceSteps } from '../src/ui/dice';
import { boardPosition, movePath, boardViewFor, renderBoardMarkup, tokenTileIndex } from '../src/ui/board';

describe('24칸 보드', () => {
  it('24칸이 사각형 루프의 서로 다른 좌표에 놓인다', () => {
    const spots = Array.from({ length: 24 }, (_, index) => boardPosition(index));
    expect(new Set(spots.map((spot) => `${spot.x},${spot.y}`)).size).toBe(24);
    expect(boardPosition(0)).toEqual({ x: 0, y: 0 });
    expect(boardPosition(6)).toEqual({ x: 600, y: 0 });
    expect(boardPosition(12)).toEqual({ x: 600, y: 600 });
    expect(boardPosition(18)).toEqual({ x: 0, y: 600 });
  });

  it('말은 주사위 두 눈의 합만큼 이동하고 24칸에서 순환한다', () => {
    expect(tokenTileIndex(0)).toBe(0);
    expect(tokenTileIndex(24)).toBe(0);
    expect(tokenTileIndex(25)).toBe(1);
    const created = createGame('board-token');
    const faces = dicePairForTurn(created.seed, created.turn);
    const steps = diceSteps(faces);
    expect(steps).toBeGreaterThanOrEqual(2);
    expect(steps).toBeLessThanOrEqual(12);
    const started = startTurn(created, steps).state;
    expect(started.position).toBe(tokenTileIndex(steps));
    expect(started.turn).toBe(1);

    const wrapped = startTurn({ ...createGame('board-wrap'), position: 20 }, 8).state;
    expect(wrapped.position).toBe(4);

    const path = movePath(20, 8);
    expect(path).toEqual([21, 22, 23, 0, 1, 2, 3, 4]);
    expect(path).toHaveLength(8);
    expect(path.at(-1)).toBe(4);
  });

  it('보드 마크업은 24칸과 말 위치를 포함한다', () => {
    const started = startTurn(createGame('board-markup'), 4).state;
    const markup = renderBoardMarkup(started, false);
    expect(markup).toContain('class="board"');
    expect(markup.match(/class="tile /g)?.length).toBe(boardTiles.length);
    expect(markup).toContain('player-mark');
    expect(markup).toContain(started.phase);
    expect(markup).toContain(`금리 ${started.lastMarket.ratePct.toFixed(2)}%`);
  });

  it('주사위 대기 중에는 다음 시장 신호를 보드 중앙에 넣지 않는다', () => {
    const created = createGame('board-wait');
    const markup = renderBoardMarkup(created, true);
    expect(markup).toContain('주사위를 굴려');
    expect(markup).not.toContain(created.marketPath[0].signal);
  });

  it('캐릭터 표시를 켜면 말이 선택한 캐릭터 아바타가 되고, 도착 직후엔 칸 이펙트가 붙는다', () => {
    const started = startTurn(createGame('board-avatar'), 3).state;
    const plain = renderBoardMarkup(started, false);
    expect(plain).toContain('player-mark');
    expect(plain).not.toContain('player-avatar');
    const withAvatar = renderBoardMarkup(started, false, { characters: true, mood: 'tense', landed: true });
    expect(withAvatar).toContain('class="player-avatar"');
    expect(withAvatar).toContain('data-mood="tense"');
    expect(withAvatar).not.toContain('player-mark');
    expect(withAvatar).toContain(' landed"');
    expect(withAvatar.match(/class="tile-fx"/g)?.length).toBe(1);
    const lastHop = renderBoardMarkup(started, false, { characters: true, landed: true, hopping: true });
    expect(lastHop).toContain('tile-fx');
    const midHop = renderBoardMarkup(started, false, { characters: true, landed: false, hopping: true });
    expect(midHop).not.toContain('tile-fx');
  });

  it('칸은 이동 중에도 강조 클래스를 받지 않는다(위치는 말이 보여 준다)', () => {
    const state = createGame('board-no-outline');
    for (const view of [
      boardViewFor(state, { tokenHopping: false, tokenFocus: 0, landed: false }),
      boardViewFor(state, { tokenHopping: true, tokenFocus: 3, landed: false }),
      boardViewFor(state, { tokenHopping: true, tokenFocus: 8, landed: true })
    ]) {
      const markup = renderBoardMarkup(state, true, view);
      expect(markup).not.toContain(' hopping');
      expect(markup.match(/ active/g)?.length).toBe(1);
    }
  });

  it('이동 마지막 칸 렌더에서 말이 출발 칸으로 되돌아가지 않는다', () => {
    const state = createGame('board-last-tick');
    const origin = state.position;
    const destination = 8;
    const lastTick = boardViewFor(state, { tokenHopping: true, tokenFocus: destination, landed: true });
    expect(lastTick).toEqual({ focusIndex: destination, hopping: true, landed: true });
    const markup = renderBoardMarkup(state, true, lastTick);
    expect(markup).toContain(`현재 말은 ${destination + 1}번 칸`);
    expect(markup).not.toContain(`현재 말은 ${origin + 1}번 칸`);
    expect(markup).toContain(' landed"');
    expect(markup).toContain('이동 중');
    expect(markup).toContain(`${destination + 1}번`);
    expect(markup).not.toContain('주사위를 굴려');
  });

  it('이동 중간 틱은 tokenFocus를 따르고 landed는 붙지 않는다', () => {
    const state = createGame('board-mid-tick');
    const view = boardViewFor(state, { tokenHopping: true, tokenFocus: 3, landed: false });
    expect(view).toEqual({ focusIndex: 3, hopping: true, landed: false });
    const markup = renderBoardMarkup(state, true, view);
    expect(markup).toContain('현재 말은 4번 칸');
    expect(markup).not.toContain('landed');
    expect(markup).toContain('이동 중');
  });

  it('이동이 아니면 state.position을 쓰고, 도착 뒤 첫 렌더는 새 위치에 landed를 붙인다', () => {
    const started = startTurn(createGame('board-idle'), 5).state;
    expect(boardViewFor(started, { tokenHopping: false, tokenFocus: 0, landed: false }).focusIndex).toBe(started.position);
    const reveal = boardViewFor(started, { tokenHopping: false, tokenFocus: started.position, landed: true });
    expect(reveal).toEqual({ focusIndex: started.position, hopping: false, landed: true });
  });
});
