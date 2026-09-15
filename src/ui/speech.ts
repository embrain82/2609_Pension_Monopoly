import type { AvatarId } from '../types';
import { renderAvatar, renderSpeaker, type Mood, type Speaker } from './avatars';

export interface SpeechOptions {
  /** 설정 "캐릭터 표시". 끄면 아바타 없는 같은 상자를 그린다. */
  characters: boolean;
  title?: string;
  /** 플레이어 아바타를 화자로 쓸 때 */
  player?: { avatarId: AvatarId; mood: Mood };
  tone?: 'default' | 'shock' | 'positive';
}

/** 기존 문구를 말풍선 그릇에 담는다. body는 이미 만들어진 HTML이어도 된다. */
export function renderSpeech(speaker: Speaker | 'player', body: string, options: SpeechOptions): string {
  const classes = ['speech', `speech-${speaker}`, options.characters ? '' : 'plain', options.tone && options.tone !== 'default' ? `tone-${options.tone}` : ''].filter(Boolean).join(' ');
  const avatar = !options.characters
    ? ''
    : speaker === 'player'
      ? (options.player ? renderAvatar(options.player.avatarId, options.player.mood, 48) : '')
      : renderSpeaker(speaker, 48);
  const title = options.title ? `<strong class="speech-title">${options.title}</strong>` : '';
  return `<div class="${classes}">${avatar}<div class="bubble">${title}${body}</div></div>`;
}
