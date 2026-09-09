import { describe, it, expect } from 'vitest';
import { createGame, startTurn, performAction, resolveLifeEvent } from '../src/engine/game-engine';
import { reflectRegion, stampVisit } from '../src/engine/route-engine';
import { dicePairForTurn } from '../src/engine/random-engine';
import { parseCheckpoint, type PlayCheckpoint } from '../src/ui/play-checkpoint';
const base = () => createGame('c-routes', 'balanced', 500000, { ghost: false });
const snapshot = (game = base()): PlayCheckpoint => ({ version: 'c2', game, modal: 'action', lastSummary: null, quizCardId: null, quizPicked: null, finalQuizQueue: [], finalQuizTotal: 0, finishing: false, defaultOptionAsk: false });
describe('주사위 합 이동과 지역 미션', () => {
  it('합계 이동에서 시장·환급은 한 번만 처리된다', () => {
    const g = { ...base(), position: 23, pendingTaxCredit: 100000 };
    const faces = dicePairForTurn(g.seed, g.turn), steps = faces[0] + faces[1];
    const next = startTurn(g, steps).state;
    expect(next.turn).toBe(1); expect(next.lastMarket).toEqual(g.marketPath[0]);
    expect(next.position).toBe((23 + steps) % 24); expect(next.taxCreditRefunded).toBe(100000);
    expect(startTurn(next, steps).ok).toBe(false);
    expect(stampVisit(next).route.visits).toEqual(next.route.visits);
  });
  it('지역 도장은 한 번만 받으며 점수·자금·행동을 바꾸지 않는다', () => {
    const g = base(), visited = { ...g, route: { ...g.route, visits: [0,1] } };
    const reflected = reflectRegion(visited,0,2);
    expect(reflected.ok).toBe(true); expect(reflected.state.route.badges).toEqual([0]);
    expect(reflected.state.cash).toBe(g.cash); expect(reflected.state.holdings).toEqual(g.holdings);
    expect(reflected.state.actionsLeft).toBe(g.actionsLeft);
    expect(reflected.state.understandingPoints).toBe(g.understandingPoints);
    expect(reflected.state.route).not.toHaveProperty('tokens');
    expect(reflectRegion(reflected.state,0,2).ok).toBe(false); expect(reflectRegion(g,0,0).ok).toBe(false);
  });
  it('200시드 모두 합계 이동으로 12턴에 종료되고 미결 주문이 없다', () => {
    for(let seed=0;seed<200;seed++) {
      let g = createGame(`c-${seed}`, 'balanced', 500000, { ghost:false });
      while(g.status === 'playing') {
        const faces = dicePairForTurn(g.seed,g.turn);
        const next = startTurn(g,faces[0]+faces[1]); expect(next.ok).toBe(true); g=next.state;
        if(g.currentEventId) g = resolveLifeEvent(g,'cash').state;
        g = performAction(g,{kind:'hold'}).state;
      }
      expect(g.turn).toBe(12); expect(g.pendingOrders).toHaveLength(0);
    }
  });
});
describe('결정 경계 저장 호환', () => {
  it('기존 짧은 경로 선택 대기는 이동 전으로 복원하고 금융 상태를 보존한다', () => {
    const game=base();
    const legacy={...snapshot(game),version:'c1',modal:'route',routePending:true,
      game:{...game,route:{...game.route,tokens:1,doubleRewarded:false,choices:[{turn:1,mode:'short',steps:4}]}}};
    const restored=parseCheckpoint(JSON.stringify(legacy))!;
    expect(restored.version).toBe('c2'); expect(restored.modal).toBeNull();
    expect(restored.game).toEqual(game); expect(restored).not.toHaveProperty('routePending');
  });
  it('이미 실행한 거래·탐험 기록은 구형 저장에서도 그대로 보존한다', () => {
    let game=startTurn(base(),5).state;
    game=performAction(game,{kind:'contribute'}).state;
    game={...game,route:{visits:[1,5],badges:[0],reflections:[{region:0,reason:2}]}};
    const legacy={...snapshot(game),version:'c1',routePending:false,game:{...game,route:{...game.route,tokens:3,doubleRewarded:true,choices:[{turn:1,mode:'short',steps:5}]}}};
    expect(parseCheckpoint(JSON.stringify(legacy))!.game).toEqual(game);
    expect(parseCheckpoint(JSON.stringify(snapshot(game)))!.game).toEqual(game);
  });
  it('깨진 JSON·다른 버전·누락 상태·잘못된 위치를 복원하지 않는다', () => {
    for(const raw of ['{', '{}', JSON.stringify({...snapshot(),version:'b'}), JSON.stringify({...snapshot(),game:{...base(),position:99}})]) expect(parseCheckpoint(raw)).toBeNull();
  });
});
