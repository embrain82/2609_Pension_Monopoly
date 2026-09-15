import type { AvatarId } from '../types';
import { CHARACTER_IDS, CHARACTERS, renderAvatar } from './avatars';

export function renderCharacterPicker(selected: AvatarId, characters: boolean, place: string): string {
  return `<fieldset class="character-picker" id="${place}-avatar-pick"><legend>내 캐릭터</legend>
    <p class="character-picker-hint">함께 여행할 친구를 골라주세요. 투자성향과는 별개예요.</p>
    <div class="character-options">${CHARACTER_IDS.map(id => {
      const character = CHARACTERS[id], picked = selected === id;
      return `<button type="button" class="character-choice" data-action="pick-avatar" data-avatar="${id}" data-key="${place}-avatar-${id}" aria-pressed="${picked}" aria-label="${character.name} 캐릭터 선택">
        ${characters ? `<span class="character-portrait" aria-hidden="true">${renderAvatar(id, 'calm', 88)}</span>` : ''}
        <strong>${character.name}</strong><span class="character-status" aria-hidden="true">${picked ? '✓ 선택됨' : '선택'}</span>
      </button>`;
    }).join('')}</div>
  </fieldset>`;
}
