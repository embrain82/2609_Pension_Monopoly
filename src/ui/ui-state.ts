import { clampGoalMonthly } from '../engine/goal';
import { isProfileId, PROFILE_IDS } from '../engine/profile-engine';
import { isDefaultOptionId } from '../engine/default-option';
import { isAchievementId } from '../engine/achievements';
import type { AchievementId, AnimationSpeed, Collection, ProfileId, SaveData } from '../types';

export const STORAGE_KEY = 'pension-road-save-v1';

export function emptyCollection(): Collection {
  return Object.fromEntries(PROFILE_IDS.map((id) => [id, { plays: 0, bestStars: 0 as const }])) as Collection;
}

export const defaultSave: SaveData = {
  version: 7,
  settings: { reducedMotion: false, sound: false, characters: true, ghost: true, speed: 1, autoSettle: false, settleExpanded: false },
  defaultOption: null,
  achievements: [],
  collection: emptyCollection(),
  unlockedCards: [],
  bestScore: 0,
  lastSeed: '',
  disclaimerAccepted: false,
  bestReturnRate: 0,
  bestGoalRate: 0,
  playCount: 0,
  howtoSeen: false,
  profileId: 'balanced', avatarId: 'balanced',
  goalMonthly: 500_000
};

function finiteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function migrateCollection(value: unknown): Collection {
  const collection = emptyCollection();
  if (!value || typeof value !== 'object') return collection;
  for (const id of PROFILE_IDS as ProfileId[]) {
    const entry = (value as Record<string, { plays?: unknown; bestStars?: unknown } | undefined>)[id];
    if (!entry || typeof entry !== 'object') continue;
    const plays = finiteNumber(entry.plays) && entry.plays >= 0 ? Math.floor(entry.plays) : 0;
    const stars = finiteNumber(entry.bestStars) && [0, 1, 2, 3].includes(entry.bestStars) ? (entry.bestStars as 0 | 1 | 2 | 3) : 0;
    // 판 수가 잘못됐으면 별도 믿지 않는다
    collection[id] = plays > 0 ? { plays, bestStars: stars } : { plays: 0, bestStars: 0 };
  }
  return collection;
}

function migrateAchievements(value: unknown): AchievementId[] {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.filter(isAchievementId))];
}

function migrateSave(value: unknown): SaveData | null {
  if (!value || typeof value !== 'object') return null;
  const data = value as {
    version?: number;
    settings?: { reducedMotion?: unknown; sound?: unknown; characters?: unknown; ghost?: unknown; speed?: unknown; autoSettle?: unknown; settleExpanded?: unknown };
    unlockedCards?: unknown;
    bestScore?: unknown;
    lastSeed?: unknown;
    disclaimerAccepted?: unknown;
    bestReturnRate?: unknown;
    bestGoalRate?: unknown;
    playCount?: unknown;
    howtoSeen?: unknown;
    profileId?: unknown;
    avatarId?: unknown;
    goalMonthly?: unknown;
    defaultOption?: unknown;
    achievements?: unknown;
    collection?: unknown;
  };
  if (!finiteNumber(data.bestScore) || typeof data.lastSeed !== 'string') return null;
  if (!Array.isArray(data.unlockedCards) || !data.unlockedCards.every((item) => typeof item === 'string')) return null;
  if (!data.settings || typeof data.settings.reducedMotion !== 'boolean' || typeof data.settings.sound !== 'boolean') return null;
  if (![1, 2, 3, 4, 5, 6, 7].includes(data.version ?? 0)) return null;
  return {
    version: 7,
    settings: {
      reducedMotion: data.settings.reducedMotion,
      sound: data.settings.sound,
      // v1·v2 저장에는 없던 값. 캐릭터는 기본 켬.
      characters: typeof data.settings.characters === 'boolean' ? data.settings.characters : true,
      // v1~v3 저장에는 없던 값. 고스트("그대로 둔 나")는 기본 켬.
      ghost: typeof data.settings.ghost === 'boolean' ? data.settings.ghost : true,
      // v1~v5 저장에는 없던 값. 속도 1×, 자동 진행 끔, 정산 「자세히」 접힘.
      speed: data.settings.speed === 2 ? 2 : (1 as AnimationSpeed),
      autoSettle: data.settings.autoSettle === true,
      settleExpanded: data.settings.settleExpanded === true
    },
    unlockedCards: data.unlockedCards,
    bestScore: data.bestScore,
    lastSeed: data.lastSeed,
    disclaimerAccepted: Boolean(data.disclaimerAccepted),
    bestReturnRate: finiteNumber(data.bestReturnRate) ? data.bestReturnRate : 0,
    bestGoalRate: finiteNumber(data.bestGoalRate) ? data.bestGoalRate : 0,
    playCount: finiteNumber(data.playCount) ? data.playCount : 0,
    howtoSeen: data.howtoSeen === true,
    avatarId: isProfileId(data.avatarId) ? data.avatarId : isProfileId(data.profileId) ? data.profileId : 'balanced',
    profileId: isProfileId(data.profileId) ? data.profileId : 'balanced',
    goalMonthly: clampGoalMonthly(finiteNumber(data.goalMonthly) ? data.goalMonthly : 500_000),
    // v1~v4 저장에는 없던 값. null이면 다음 판 시작에 고른다.
    defaultOption: isDefaultOptionId(data.defaultOption) ? data.defaultOption : null,
    // v1~v5 저장에는 없던 값. 업적은 빈 배열, 컬렉션은 성향 5종 모두 0판.
    achievements: migrateAchievements(data.achievements),
    collection: migrateCollection(data.collection)
  };
}

export function loadSave(storage: Pick<Storage, 'getItem'> = localStorage): SaveData {
  try {
    const raw = storage.getItem(STORAGE_KEY);
    if (!raw) return structuredClone(defaultSave);
    const parsed: unknown = JSON.parse(raw);
    return migrateSave(parsed) ?? structuredClone(defaultSave);
  } catch {
    return structuredClone(defaultSave);
  }
}

export function saveData(data: SaveData, storage: Pick<Storage, 'setItem'> = localStorage): void {
  try {
    storage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch {
    // 저장 공간 차단은 게임 진행을 막지 않습니다.
  }
}
