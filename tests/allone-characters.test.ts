// @vitest-environment happy-dom
import { beforeEach, expect, it } from 'vitest';
import { PensionRoadApp } from '../src/ui/app';
import { CHARACTERS, CHARACTER_IDS } from '../src/ui/avatars';
import { defaultSave, STORAGE_KEY, loadSave } from '../src/ui/ui-state';
import { CHECKPOINT_KEY, parseCheckpoint } from '../src/ui/play-checkpoint';
import { calculateScore } from '../src/engine/scoring-engine';

let root: HTMLElement;
function mount() {
  document.body.innerHTML = '<div id="app"></div>';
  root = document.querySelector('#app')!;
  new PensionRoadApp(root);
}
const click = (action: string) => root.querySelector<HTMLButtonElement>(`[data-action="${action}"]`)!.click();
const pick = (id: string) => root.querySelector<HTMLButtonElement>(`[data-action="pick-avatar"][data-avatar="${id}"]`)!.click();
beforeEach(() => { localStorage.clear(); mount(); });

it('다섯 이름을 그림 카드로 고르고 선택 표시·새로고침 저장이 일치한다', () => {
  expect(CHARACTER_IDS.map(id => CHARACTERS[id].name)).toEqual(['올리', '원이', '단지', '달리', '코리']);
  expect(root.querySelectorAll('.character-choice')).toHaveLength(5);
  for (const id of CHARACTER_IDS) {
    pick(id);
    expect(root.querySelectorAll('.character-choice[aria-pressed="true"]')).toHaveLength(1);
    expect(root.querySelector('.character-choice[aria-pressed="true"]')!.getAttribute('data-avatar')).toBe(id);
    expect(root.querySelector('.title-cover [data-character]')!.getAttribute('data-character')).toBe(CHARACTERS[id].asset);
    expect(loadSave(localStorage).avatarId).toBe(id);
  }
  mount();
  expect(root.querySelector('.character-choice[aria-pressed="true"]')!.textContent).toContain('코리');
});

it('기존 컬렉션 기록을 유지하고 진행 중 캐릭터 변경은 금융 상태·점수·주사위를 바꾸지 않는다', () => {
  const collection = { ...defaultSave.collection, growth: { plays: 4, bestStars: 3 } };
  localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...defaultSave, collection, profileId: 'stable', avatarId: 'growth', profileAssessment: {profileId:'stable', origin:'confirmed'}, disclaimerAccepted: true, howtoSeen: true }));
  mount(); click('begin'); click('prepare-continue'); click('confirm-default-option');
  const before = parseCheckpoint(localStorage.getItem(CHECKPOINT_KEY))!.game;
  const score = calculateScore(before);
  click('open-settings');
  for (const id of CHARACTER_IDS) {
    pick(id);
    const after = parseCheckpoint(localStorage.getItem(CHECKPOINT_KEY))!.game;
    expect(after).toEqual({ ...before, avatarId: id });
    expect(calculateScore(after)).toEqual(score);
    expect(loadSave(localStorage).collection.growth).toEqual({ plays: 4, bestStars: 3 });
  }
  click('close-modal');
  expect(root.querySelector('.token-pos')!.getAttribute('data-character-name')).toBe('코리');
  const after = parseCheckpoint(localStorage.getItem(CHECKPOINT_KEY))!.game;
  mount(); click('resume-game');
  expect(parseCheckpoint(localStorage.getItem(CHECKPOINT_KEY))!.game).toEqual(after);
  expect(root.querySelector('.token-pos')!.getAttribute('data-character-name')).toBe('코리');
});

it('이미지 오류가 나면 같은 캐릭터의 모든 표시와 재렌더에 이름 대체 표시를 유지한다', () => {
  root.querySelector('[data-character-image="danji"]')!.dispatchEvent(new Event('error'));
  const check = () => {
    for (const art of root.querySelectorAll('[data-character="danji"]')) {
      expect(art.querySelector('.avatar-fallback')!.getAttribute('visibility')).toBe('visible');
      expect(art.querySelector('.avatar-frame')!.getAttribute('visibility')).toBe('hidden');
    }
  };
  check(); pick('growth'); pick('balanced'); check();
  expect(root.querySelector('[data-character="dalli"] .avatar-frame')!.getAttribute('visibility')).not.toBe('hidden');
});

it('캐릭터 표시를 끄면 그림 없이 이름으로 고르고 보드의 나 말로 진행할 수 있다', () => {
  localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...defaultSave, settings: { ...defaultSave.settings, characters: false } }));
  mount();
  expect(root.querySelectorAll('.character-choice')).toHaveLength(5);
  expect(root.querySelector('.character-choice svg')).toBeNull();
  pick('stable');
  expect(loadSave(localStorage).avatarId).toBe('stable');
  expect(root.querySelector('.title-cover')!.getAttribute('aria-label')).toBeNull();
  expect(root.querySelector('.title-cover svg')!.getAttribute('aria-label')).toContain('나 말');
});
