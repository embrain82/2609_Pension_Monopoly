import { describe, expect, it } from 'vitest';
import { investorProfiles } from '../src/data/content';
import { createGame } from '../src/engine/game-engine';
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

  it('새 판은 평온으로 시작한다', () => {
    expect(avatarMood(createGame('mood'))).toBe('calm');
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
