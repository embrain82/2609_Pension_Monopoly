import { describe, expect, it } from 'vitest';
import { createGame, startTurn } from '../src/engine/game-engine';
import { investorProfiles, products } from '../src/data/content';
import { applyProfileToGame, profileDistance } from '../src/engine/profile-engine';
import { calculateScore } from '../src/engine/scoring-engine';
import { loadSave, defaultSave } from '../src/ui/ui-state';

describe('성향과 캐릭터 분리', () => {
  it('5성향 모두 시작 구성·목표 구성의 상품 적합성과 합계가 맞는다', () => {
    for (const p of investorProfiles) {
      expect(Object.values(p.allocation).reduce((a,b) => a+b,0)).toBeCloseTo(1);
      const g = createGame('profile', p.id, 450000, { ghost: false, avatarId: 'aggressive' });
      expect(g.avatarId).toBe('aggressive');
      for (const h of g.holdings) expect(products.find(x => x.id === h.productId)!.riskGrade).toBeGreaterThanOrEqual(p.minRiskGrade);
      const target = { ...g, holdings: products.map(x => ({ productId: x.id, amount: 120000000*p.allocation[x.id], principal: 120000000*p.allocation[x.id], depositTurnsHeld: 0 })), cash: p.safeCash, irpCash: 0 };
      expect(profileDistance(target)).toBeCloseTo(0); expect(calculateScore(target).behaviorProfile).toBe(p.id);
      expect(calculateScore(target).profileAligned).toBe(true); expect(calculateScore(target).stars).toBe(3);
    }
  });
  it('재진단이 동물과 진행 중 자산을 바꾸지 않는다', () => {
    const g = startTurn(createGame('identity', 'aggressive', 500000, { avatarId: 'stable', ghost: false })).state;
    const changed = applyProfileToGame(g, 'stable');
    expect(changed.avatarId).toBe('stable'); expect(changed.holdings).toEqual(g.holdings);
  });
  it('저장 v6의 동물 외형과 컬렉션을 보존하고 v7부터 별도 선택을 기억한다', () => {
    const old = { ...defaultSave, version: 6, avatarId: undefined, profileId: 'growth' };
    expect(loadSave({ getItem: () => JSON.stringify(old) }).avatarId).toBe('growth');
    const selected = { ...defaultSave, profileId: 'stable', avatarId: 'aggressive' };
    expect(loadSave({ getItem: () => JSON.stringify(selected) })).toMatchObject({ profileId: 'stable', avatarId: 'aggressive', version: 7 });
  });
});
