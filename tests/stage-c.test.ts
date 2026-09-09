import { describe, it, expect } from 'vitest';
import { createGame, startTurn, performAction, resolveLifeEvent } from '../src/engine/game-engine';
import { chooseRoute, routeOptions, reflectRegion, stampVisit } from '../src/engine/route-engine';
import { dicePairForTurn } from '../src/engine/random-engine';
import { parseCheckpoint, type PlayCheckpoint } from '../src/ui/play-checkpoint';
const base = () => createGame('c-routes', 'balanced', 500000, { ghost: false });
const snapshot = (game = base()): PlayCheckpoint => ({ version: 'c1', game, modal: 'action', lastSummary: null, quizCardId: null, quizPicked: null, finalQuizQueue: [], finalQuizTotal: 0, finishing: false, defaultOptionAsk: false, routePending: false });
describe('경로와 지역 미션', () => {
  it('토큰 소비는 한 번이고 선택 전에는 자산·시장·급여가 변하지 않는다', () => {
    const g = base(), chosen = chooseRoute(g, 'short');
    expect(chosen.ok).toBe(true); expect(chosen.state.cash).toBe(g.cash); expect(chosen.state.holdings).toEqual(g.holdings);
    expect(chosen.state.turn).toBe(0); expect(chosen.state.route.tokens).toBe(g.route.tokens - 1 + (dicePairForTurn(g.seed,0)[0] === dicePairForTurn(g.seed,0)[1] ? 1 : 0));
    expect(chooseRoute(chosen.state,'short').ok).toBe(false);
    expect(chooseRoute({ ...g, route: { ...g.route, tokens: 0 } }, 'short').ok).toBe(false);
  });
  it('두 길은 시장 경로를 바꾸지 않고 턴 재시작을 차단한다', () => {
    const g = { ...base(), position: 21, pendingTaxCredit: 100000 };
    for (const option of routeOptions(g)) {
      const chosen = chooseRoute(g,option.mode).state;
      const next = startTurn(chosen,option.steps).state;
      expect(next.turn).toBe(1); expect(next.lastMarket).toEqual(g.marketPath[0]);
      expect(next.position).toBe(option.position);
      expect(next.taxCreditRefunded).toBe(option.crossesStart ? 100000 : 0);
      expect(startTurn(next,option.steps).ok).toBe(false);
      expect(stampVisit(next).route.visits).toEqual(next.route.visits);
    }
  });
  it('더블과 지역 도장은 제한된 토큰만 보상하고 점수·자금은 바꾸지 않는다', () => {
    const g = base(); const visited = { ...g, route: { ...g.route, visits: [0,1] } };
    const reflected = reflectRegion(visited,0,2);
    expect(reflected.ok).toBe(true); expect(reflected.state.route.badges).toEqual([0]);
    expect(reflected.state.route.tokens).toBe(3); expect(reflected.state.cash).toBe(g.cash);
    expect(reflected.state.understandingPoints).toBe(g.understandingPoints);
    expect(reflectRegion(reflected.state,0,2).ok).toBe(false);
    expect(reflectRegion(g,0,0).ok).toBe(false);
  });
  it('100시드의 두 경로 정책이 모두 12턴에 종료되고 미결 주문이 없다', () => {
    for(let seed=0;seed<100;seed++) for(const mode of ['sum','short'] as const) {
      let g = createGame(`c-${seed}`, 'balanced', 500000, { ghost:false });
      while(g.status === 'playing') {
        const choice = chooseRoute(g, mode === 'short' && g.route.tokens > 0 ? 'short' : 'sum');
        expect(choice.ok).toBe(true);
        const steps = choice.state.route.choices.at(-1)!.steps;
        g = startTurn(choice.state,steps).state;
        if(g.currentEventId) g = resolveLifeEvent(g,'cash').state;
        g = performAction(g,{kind:'hold'}).state;
      }
      expect(g.turn).toBe(12); expect(g.pendingOrders).toHaveLength(0);
      expect(g.route.tokens).toBeGreaterThanOrEqual(0); expect(g.route.tokens).toBeLessThanOrEqual(4);
    }
  });
});
describe('결정 경계 저장', () => {
  it('경로 확정과 거래 후 스냅샷을 그대로 복원하고 재선택·재시작을 막는다', () => {
    const chosen = chooseRoute(base(),'short').state;
    const restored = parseCheckpoint(JSON.stringify({ ...snapshot(chosen), routePending:true, modal:'route' }))!;
    expect(restored.game).toEqual(chosen); expect(chooseRoute(restored.game,'sum').ok).toBe(false);
    const active = startTurn(chosen,chosen.route.choices[0].steps).state;
    expect(parseCheckpoint(JSON.stringify(snapshot(active)))!.game).toEqual(active);
    expect(startTurn(active).ok).toBe(false);
  });
  it('깨진 JSON·다른 버전·누락 상태·잘못된 위치를 복원하지 않는다', () => {
    for(const raw of ['{', '{}', JSON.stringify({...snapshot(),version:'b'}), JSON.stringify({...snapshot(),game:{...base(),position:99}})]) expect(parseCheckpoint(raw)).toBeNull();
  });
});
