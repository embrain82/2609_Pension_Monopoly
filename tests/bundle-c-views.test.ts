import { describe, expect, it } from 'vitest';
import { ACHIEVEMENTS } from '../src/engine/achievements';
import { autoplay, createGame } from '../src/engine/game-engine';
import { renderAchievementGallery, renderCollectionGallery, renderLifeResolvedStrip, renderNewAchievements, renderSeedLine, renderWeeklyButton } from '../src/ui/achievements-view';
import { emptyCollection } from '../src/ui/ui-state';
import type { LifeResolution } from '../src/types';

describe('업적·컬렉션·주간 시드 뷰', () => {
  it('새 업적 카드는 없으면 빈 문자열, 있으면 순서대로 --i를 달고 제목·설명을 보인다', () => {
    expect(renderNewAchievements([])).toBe('');
    const html = renderNewAchievements(['goal-reached', 'quiz-perfect']);
    expect(html).toContain('새 업적 2개');
    expect(html).toContain('style="--i:0"');
    expect(html).toContain('style="--i:1"');
    expect(html).toContain('목표 도착');
    expect(html).toContain('퀴즈 만점');
    expect(html.indexOf('목표 도착')).toBeLessThan(html.indexOf('퀴즈 만점'));
  });

  it('업적 도감은 12개를 모두 보이되 가진 것만 earned, 누적 업적은 표시가 붙는다', () => {
    const html = renderAchievementGallery(['three-stars']);
    expect(html.match(/class="achievement /g)).toHaveLength(ACHIEVEMENTS.length);
    expect(html.match(/achievement earned/g)).toHaveLength(1);
    expect(html.match(/achievement locked/g)).toHaveLength(ACHIEVEMENTS.length - 1);
    expect(html).toContain('누적 업적');
    for (const def of ACHIEVEMENTS) expect(html).toContain(def.title);
  });

  it('캐릭터 컬렉션은 성향 5종을 보이고 완주 수·최고 별을 쓴다', () => {
    let collection = emptyCollection();
    collection = { ...collection, balanced: { plays: 3, bestStars: 2 } };
    const html = renderCollectionGallery(collection, true);
    expect(html.match(/class="collection-card /g)).toHaveLength(5);
    expect(html).toContain('1 / 5 캐릭터 완주');
    expect(html).toContain('3판 완주');
    expect(html).toContain('★★☆');
    expect(html).toContain('단지');
    expect(html).toContain('아직 완주 없음');
    const plain = renderCollectionGallery(collection, false);
    expect(plain).not.toContain('<svg');
    expect(plain).toContain('collection-initial');
  });

  it('시드 줄은 주간 시드면 배지를 바꾸고 「결과 복사」 버튼을 둔다', () => {
    const weekly = renderSeedLine(createGame('weekly-2026-W36', 'balanced', 500_000, { ghost: false }));
    expect(weekly).toContain('seed-badge weekly');
    expect(weekly).toContain('주간 시드 2026-W36');
    expect(weekly).toContain('data-action="copy-result"');
    const plain = renderSeedLine(createGame('abc-123', 'balanced', 500_000, { ghost: false }));
    expect(plain).not.toContain('weekly');
    expect(plain).toContain('시드 abc-123');
  });

  it('주간 시드 버튼은 그 주 시드를 data-seed에 담는다', () => {
    const html = renderWeeklyButton(new Date(2026, 8, 6));
    expect(html).toContain('data-action="weekly-seed"');
    expect(html).toContain('data-seed="weekly-2026-W36"');
    expect(html).toContain('2026-W36');
  });

  it('사건 해결 머리글은 사건 제목·선택·「이제 운용」을 잇는다', () => {
    const resolution: LifeResolution = { eventId: 'repair', title: '집수리', kind: 'cost', choice: 'cash', choiceLabel: '생활자금으로 지급', cost: 2_200_000, cashDelta: -2_200_000, irpDelta: 0, penalty: 0, fee: 0, sales: [], shortage: false, alternative: '', message: '' };
    const html = renderLifeResolvedStrip(resolution);
    expect(html).toContain('사건 해결됨');
    expect(html).toContain('집수리');
    expect(html).toContain('생활자금으로 지급');
    expect(html).toContain('이제 운용');
  });

  it('완주한 판의 기록은 결과 텍스트 재료가 되는 record를 가진다', () => {
    const state = autoplay('views-record', 'balanced');
    expect(state.record.rebalanceTurns.length).toBeGreaterThan(0);
    expect(state.record.lifeChoices.length).toBe(state.eventHistory.length);
  });
});
