import { describe, expect, it } from 'vitest';
import { investorProfiles } from '../src/data/content';
import { autoplay, createGame, startTurn } from '../src/engine/game-engine';
import { AVATAR_NAMES, CHARACTERS, avatarBody, avatarMood, renderAvatar, renderSpeaker, resultMood, type Mood } from '../src/ui/avatars';
import { renderSpeech } from '../src/ui/speech';

const moods: Mood[] = ['calm', 'tense', 'happy'];

describe('아바타', () => {
  it('캐릭터 5종 × 표정 3종이 모두 서로 다른 접근 가능한 SVG를 만든다', () => {
    const seen = new Set<string>();
    for (const profile of investorProfiles) {
      for (const mood of moods) {
        const svg = renderAvatar(profile.id, mood, 40);
        expect(svg).toContain('role="img"');
        expect(svg).toContain(`aria-label="${AVATAR_NAMES[profile.id]} · `);
        expect(svg).toContain(`class="avatar avatar-${profile.id} mood-${mood}"`);
        expect(svg).toContain('width="40"');
        seen.add(avatarBody(profile.id, mood));
      }
    }
    expect(seen.size).toBe(15);
  });

  it('평온·긴장·기쁨이 같은 캐릭터 이미지의 서로 다른 칸을 표시한다', () => {
    for (const [frame, mood] of moods.entries()) {
      const markup = avatarBody('balanced', mood);
      expect(markup).toContain('href="/assets/characters/allone/danji.png"');
      expect(markup).toContain(`viewBox="${frame * 724 + CHARACTERS.balanced.centers[frame] - 362} ${CHARACTERS.balanced.feet - 656} 724 724"`);
      expect(markup).toContain('overflow="hidden"');
      expect(markup).toContain(`data-mood="${mood}"`);
    }
  });

  it('앵커·코치는 고정 캐릭터다', () => {
    expect(renderSpeaker('anchor')).toContain('앵커 부엉이');
    expect(renderSpeaker('coach')).toContain('코치 펭귄');
  });

  it('표정은 충격·이번 턴 운용 손실·목표 달성에서 바뀐다', () => {
    const fresh = createGame('mood');
    expect(avatarMood(fresh, false)).toBe('calm');
    expect(avatarMood(fresh, true)).toBe('happy');
    const shocked = { ...fresh, turn: 3, lastMarket: { ...fresh.lastMarket, shock: true } };
    expect(avatarMood(shocked, false)).toBe('tense');
    const dropped = { ...fresh, turn: 1, ledger: { open: 100, afterMarket: 95, beforeAction: null,
      marketEffects: [{ productId: 'equityEtf' as const, opening: 100, delta: -5, returnRate: -0.05 }] } };
    expect(avatarMood(dropped, false)).toBe('tense');
    const dipped = { ...dropped, ledger: { ...dropped.ledger,
      marketEffects: [{ productId: 'equityEtf' as const, opening: 100, delta: -3, returnRate: -0.03 }] } };
    expect(avatarMood(dipped, false)).toBe('calm');
    const played = startTurn(autoplay('mood-play')).state;
    expect(moods).toContain(avatarMood(played, false));
  });

  it('전 턴 손실이나 입출금이 이번 턴 표정을 뒤늦게 바꾸지 않는다', () => {
    const fresh = createGame('mood-current');
    const recovered = { ...fresh, turn: 2, irpHistory: [100, 94], ledger: { open: 94, afterMarket: 97,
      beforeAction: null, marketEffects: [{ productId: 'equityEtf' as const, opening: 94, delta: 3, returnRate: 3 / 94 }] } };
    expect(avatarMood(recovered, false)).toBe('calm');
    const falling = { ...recovered, irpHistory: [100, 120], ledger: { ...recovered.ledger, open: 120, afterMarket: 140,
      marketEffects: [{ productId: 'equityEtf' as const, opening: 120, delta: -7, returnRate: -7 / 120 }] } };
    expect(avatarMood(falling, false)).toBe('tense');
  });

  it('대기자금 이자는 이번 턴 것만 더하고, 상품별 장부가 없는 구 저장도 현재 장부를 쓴다', () => {
    const state = { ...createGame('mood-cash'), turn: 2, ledger: { open: 100, afterMarket: 96, beforeAction: null,
      marketEffects: [{ productId: 'equityEtf' as const, opening: 100, delta: -6, returnRate: -0.06 }],
      cashInterest: { turn: 2, opening: 100, rate: 0.02, amount: 2 } } };
    expect(avatarMood(state, false)).toBe('calm');
    expect(avatarMood({ ...state, ledger: { ...state.ledger, cashInterest: { ...state.ledger.cashInterest, turn: 1 } } }, false)).toBe('tense');
    expect(avatarMood({ ...state, ledger: { open: 100, afterMarket: 95, beforeAction: null } }, false)).toBe('tense');
    expect(avatarMood({ ...state, ledger: { open: 0, afterMarket: 0, beforeAction: null } }, false)).toBe('calm');
  });

  it('결과 표정은 별 수를 따른다', () => {
    expect(resultMood(0)).toBe('tense');
    expect(resultMood(1)).toBe('calm');
    expect(resultMood(3)).toBe('happy');
  });
});

describe('말풍선', () => {
  it('캐릭터 켬이면 화자 아바타가, 끔이면 plain 상자가 나오고 문구는 같다', () => {
    const on = renderSpeech('coach', '<p>장기채가 흔들렸어요</p>', { characters: true, title: '한 줄 정리' });
    const off = renderSpeech('coach', '<p>장기채가 흔들렸어요</p>', { characters: false, title: '한 줄 정리' });
    expect(on).toContain('코치 펭귄');
    expect(on).toContain('speech speech-coach');
    expect(off).not.toContain('<svg');
    expect(off).toContain('plain');
    for (const html of [on, off]) {
      expect(html).toContain('한 줄 정리');
      expect(html).toContain('장기채가 흔들렸어요');
    }
  });

  it('플레이어 화자는 선택한 캐릭터·표정 아바타를 쓰고 톤 클래스를 붙인다', () => {
    const html = renderSpeech('player', '텍스트', { characters: true, player: { avatarId: 'growth', mood: 'happy' }, tone: 'positive' });
    expect(html).toContain('avatar-growth mood-happy');
    expect(html).toContain('tone-positive');
    expect(renderSpeech('anchor', '속보', { characters: true, tone: 'shock' })).toContain('tone-shock');
  });
});
