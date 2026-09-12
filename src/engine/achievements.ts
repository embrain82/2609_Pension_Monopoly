import { contributionRuleLabel } from './contribution-engine';
import { balanceConfig, investorProfiles, policyRules } from '../data/content';
import type { AchievementDef, AchievementId, Collection, GameState, ProfileId, ScoreResult } from '../types';
import { PROFILE_IDS } from './profile-engine';
import { calculateScore, monthlyPension } from './scoring-engine';

/** 「고스트 격파」 기준: 그대로 둔 나보다 월 연금이 이만큼 앞서야 한다 */
export const GHOST_CRUSH_GAP = 50_000;
/** 「잔잔한 항해」 기준 최대 낙폭 */
export const CALM_SEAS_DRAWDOWN = 0.05;
/** 「퀴즈 만점」 최소 문항 */
export const QUIZ_PERFECT_MIN = 3;
/** 「사전지정운용」 최소 자동 매수 횟수 */
export const DEFAULT_OPTION_RUNS = 2;

export const ACHIEVEMENTS: AchievementDef[] = [
  { id: 'goal-reached', title: '목표 도착', detail: '월 연금 목표를 달성했다(연금 수령 기준).', scope: 'game' },
  { id: 'three-stars', title: '별 셋', detail: '목표·생활자금·낙폭·분산·성향 다섯 조건을 모두 통과했다.', scope: 'game' },
  { id: 'calm-seas', title: '잔잔한 항해', detail: `12턴 최대 낙폭을 ${Math.round(CALM_SEAS_DRAWDOWN * 100)}% 안에서 지켰다.`, scope: 'game' },
  { id: 'diversified-12', title: '분산 8턴', detail: `8턴 이상 마감에 5% 이상 보유 상품이 ${balanceConfig.diversificationMin}종 이상이었다.`, scope: 'game' },
  { id: 'pre-shock-rebalance', title: '충격 전 리밸런싱', detail: '충격이 오기 바로 전 턴에 리밸런싱했다. 신호를 읽고 위험을 맞춘 것.', scope: 'game' },
  { id: 'tax-credit-max', title: '공제 한도 채움', detail: `세액공제 대상 납입 ${(policyRules.annualTaxCreditLimit / 10_000).toFixed(0)}만 원을 다 채웠다.`, scope: 'game' },
  { id: 'quiz-perfect', title: '퀴즈 만점', detail: `${QUIZ_PERFECT_MIN}문항 이상 풀고 전부 맞혔다.`, scope: 'game' },
  { id: 'ghost-crusher', title: '고스트 격파', detail: `그대로 둔 나보다 월 연금 ${(GHOST_CRUSH_GAP / 10_000).toFixed(0)}만 원 이상 앞섰다.`, scope: 'game' },
  { id: 'annuity-choice', title: '일시금 유혹 거절', detail: '연금(20년)으로 받기를 골랐다. 세율 차이를 숫자로 확인한 선택.', scope: 'game' },
  { id: 'default-option-run', title: '사전지정운용', detail: `디폴트옵션 매수 체험을 완료했다. 새 판은 1회, 이전 판은 ${DEFAULT_OPTION_RUNS}회 기준. 점수·별 추가 보상은 없다.`, scope: 'game' },
  { id: 'severance-to-irp', title: '퇴직급여는 IRP로', detail: '이직 퇴직급여를 지금 받지 않고 IRP로 이전했다(과세 이연).', scope: 'game' },
  { id: 'all-profiles', title: '다섯 캐릭터 완주', detail: '선택 가능한 동물 5종 모두 한 번 이상 12턴을 완주했다.', scope: 'meta' }
];

const BY_ID = new Map(ACHIEVEMENTS.map((item) => [item.id, item]));

export function isAchievementId(value: unknown): value is AchievementId {
  return typeof value === 'string' && BY_ID.has(value as AchievementId);
}

export function achievementDef(id: AchievementId): AchievementDef {
  return BY_ID.get(id)!;
}

/** 이번 판 고스트 대비 월 연금 격차(내 판단 − 그대로 둔 나). 고스트가 없으면 null */
export function ghostPensionGap(state: GameState): number | null {
  if (!state.ghost) return null;
  const mine = state.irpHistory.at(-1);
  const ghost = state.ghost.irpHistory.at(-1);
  if (mine === undefined || ghost === undefined) return null;
  return monthlyPension(mine) - monthlyPension(ghost);
}

/** 충격이 오기 바로 전 턴에 리밸런싱한 적이 있는가 */
export function rebalancedBeforeShock(state: GameState): boolean {
  return state.record.rebalanceTurns.some((turn) => state.marketPath.find((step) => step.turn === turn + 1)?.shock === true);
}

const GAME_CHECKS: Record<Exclude<AchievementId, 'all-profiles'>, (state: GameState, score: ScoreResult) => boolean> = {
  'goal-reached': (_state, score) => score.goalMet,
  'three-stars': (_state, score) => score.stars === 3,
  'calm-seas': (state) => state.maxDrawdown <= CALM_SEAS_DRAWDOWN,
  'diversified-12': (state) => state.record.diversifiedTurns >= 8,
  'pre-shock-rebalance': (state) => rebalancedBeforeShock(state),
  'tax-credit-max': (state) => state.taxCreditEligible >= policyRules.annualTaxCreditLimit - 1,
  'quiz-perfect': (state) => state.quizLog.length >= QUIZ_PERFECT_MIN && state.quizLog.every((record) => record.correct),
  'ghost-crusher': (state) => (ghostPensionGap(state) ?? Number.NEGATIVE_INFINITY) >= GHOST_CRUSH_GAP,
  'annuity-choice': (state) => state.payoutChoice === 'annuity20',
  'default-option-run': (state) => state.record.defaultOptionRuns >= (state.defaultTrading ? 1 : DEFAULT_OPTION_RUNS),
  'severance-to-irp': (state) => state.record.lifeChoices.some((item) => item.choice === 'transfer-irp')
};

/** 끝난 판에서 성립한 판 업적. 진행 중이면 빈 배열 */
export function evaluateGame(state: GameState): AchievementId[] {
  if (state.status !== 'finished') return [];
  const score = calculateScore(state);
  return ACHIEVEMENTS
    .filter((item) => item.scope === 'game' && GAME_CHECKS[item.id as keyof typeof GAME_CHECKS](state, score))
    .map((item) => item.id);
}

/** 저장 누적(컬렉션)에서 성립한 업적 */
export function evaluateMeta(collection: Collection): AchievementId[] {
  return PROFILE_IDS.every((id) => collection[id].plays > 0) ? ['all-profiles'] : [];
}

/** 이번 판으로 새로 열린 업적(이미 가진 것 제외). 컬렉션은 이번 판이 반영된 뒤의 값을 넘긴다 */
export function newlyUnlocked(owned: AchievementId[], state: GameState, collection: Collection): AchievementId[] {
  const have = new Set(owned);
  return [...evaluateGame(state), ...evaluateMeta(collection)].filter((id) => !have.has(id));
}

/** 완주 1판을 컬렉션에 더한다 */
export function recordCollection(collection: Collection, profileId: ProfileId, stars: 0 | 1 | 2 | 3): Collection {
  const entry = collection[profileId];
  return { ...collection, [profileId]: { plays: entry.plays + 1, bestStars: Math.max(entry.bestStars, stars) as 0 | 1 | 2 | 3 } };
}

function isoWeek(date: Date): { year: number; week: number } {
  const day = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const weekday = day.getUTCDay() || 7;
  day.setUTCDate(day.getUTCDate() + 4 - weekday);
  const yearStart = Date.UTC(day.getUTCFullYear(), 0, 1);
  return { year: day.getUTCFullYear(), week: Math.ceil(((day.getTime() - yearStart) / 86_400_000 + 1) / 7) };
}

const WEEKLY_PREFIX = 'weekly-';

/** 이번 주 시드 `weekly-YYYY-Www`(ISO 주). 같은 주에 시작한 모든 판이 같은 시장·주사위·사건을 만난다 */
export function weeklySeed(date = new Date()): string {
  const { year, week } = isoWeek(date);
  return `${WEEKLY_PREFIX}${year}-W${String(week).padStart(2, '0')}`;
}

export function isWeeklySeed(seed: string): boolean {
  return /^weekly-\d{4}-W\d{2}$/.test(seed);
}

/** `weekly-2026-W36` → `2026-W36` */
export function weeklyLabel(seed: string): string {
  return isWeeklySeed(seed) ? seed.slice(WEEKLY_PREFIX.length) : seed;
}

const won = (value: number) => `${Math.round(value).toLocaleString('ko-KR')}원`;
const signedWon = (value: number) => `${value > 0 ? '+' : ''}${won(value)}`;

export interface ShareTextOptions {
  /** 이번 판에 새로 연 업적 */
  newAchievements?: AchievementId[];
  url?: string;
}

/** 결과 화면 「결과 복사」 본문. 목표·별·수익률·고스트 격차·새 업적·시드를 여섯 줄 안에 */
export function resultShareText(state: GameState, score: ScoreResult, options: ShareTextOptions = {}): string {
  const profile = investorProfiles.find((item) => item.id === state.profileId);
  const stars = `${'★'.repeat(score.stars)}${'☆'.repeat(3 - score.stars)}`;
  const gap = ghostPensionGap(state);
  const lines = [
    `연금로드 12턴 결과 · ${profile?.name ?? state.profileId}`,
    `월 연금 ${won(score.monthlyPension)} / 목표 ${won(state.goalMonthly)} (${Math.round(score.goalRate * 100)}%) · 별 ${stars} · ${score.totalScore}점`,
    `수익률 ${score.returnRate > 0 ? '+' : ''}${(score.returnRate * 100).toFixed(1)}% · 최대 낙폭 ${(score.maxDrawdown * 100).toFixed(1)}%${gap === null ? '' : ` · 그대로 둔 나 대비 월 ${signedWon(gap)}`}`
  ];
  if (options.newAchievements?.length) lines.push(`새 업적: ${options.newAchievements.map((id) => achievementDef(id).title).join(' · ')}`);
  lines.push(`${isWeeklySeed(state.seed) ? `주간 시드 ${weeklyLabel(state.seed)} · 같은 시장에 도전해 보세요` : `시드 ${state.seed}`} · ${contributionRuleLabel(state)}`);
  if (options.url) lines.push(options.url);
  return lines.join('\n');
}
