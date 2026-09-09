import { profileDistance, profileLimits } from './profile-engine';
import { accountPayout } from './account-engine';
import { balanceConfig, investorProfiles, policyRules, products } from '../data/content';
import type { GameState, PayoutChoice, PayoutPlan, ProfileId, ScoreResult } from '../types';
import { portfolioValue } from './portfolio-engine';
import { canBuyForProfile, riskAssetRatio } from './policy-engine';

/**
 * 목표 판정 계수. 게임의 월 연금 단위는 "연금으로 받을 때 세전 IRP÷240"이다. 일시금은 세금이 더 붙으므로
 * 세후 총액을 연금 세후 기준으로 되돌린 만큼만 인정한다: (1−일시금세율)/(1−연금세율).
 */
export function payoutFactor(choice: PayoutChoice): number {
  if (choice === 'lumpSum') return (1 - policyRules.lumpSumTaxRate) / (1 - policyRules.pensionTaxRate);
  return 1;
}

export function payoutPlan(irpValue: number, choice: PayoutChoice): PayoutPlan {
  const taxRate = choice === 'lumpSum' ? policyRules.lumpSumTaxRate : policyRules.pensionTaxRate;
  const tax = irpValue * taxRate;
  const net = irpValue - tax;
  return {
    choice,
    taxRate,
    tax,
    net,
    monthlyNet: net / policyRules.receivingMonths,
    monthlyBasis: (irpValue * payoutFactor(choice)) / policyRules.receivingMonths
  };
}

export function monthlyPension(irpValue: number, choice: PayoutChoice = 'annuity20'): number {
  return (irpValue * payoutFactor(choice)) / policyRules.receivingMonths;
}

export function diversificationCount(state: GameState): number {
  const total = portfolioValue(state);
  if (total <= 0) return 0;
  return state.holdings.filter((holding) => holding.amount / total >= 0.05).length;
}

export function diversificationNeeded(profileId: ProfileId): number {
  const allowed = products.filter((product) => canBuyForProfile(profileId, product.id).ok).length;
  return Math.min(balanceConfig.diversificationMin, Math.max(1, allowed));
}

export function behaviorProfile(state: GameState): ProfileId {
  let closest = investorProfiles.find(p => p.id === state.profileId)!;
  for (const profile of investorProfiles) {
    if (profileDistance(state, profile.id) < profileDistance(state, closest.id) - 0.000001) closest = profile;
  }
  return closest.id;
}

/** 지식 점수 항목별 상한. 기본 4 + 퀴즈 8 + 이해 6 + 리밸런싱 4(합 22) − 규칙 위반 5/회, 0~20으로 자른다 */
export const KNOWLEDGE_CAPS = { base: 4, quiz: 8, understanding: 6, rebalance: 4, breachPenalty: 5 } as const;

export interface KnowledgeBreakdown {
  quizCorrect: number;
  quiz: number;
  understanding: number;
  rebalance: number;
  penalty: number;
  total: number;
}

/** 지식 점수(0~20)의 항목 분해. 퀴즈 정답 ×2(최대 8), 이해 포인트(최대 6), 리밸런싱 ×2(최대 4) */
export function knowledgeBreakdown(state: GameState): KnowledgeBreakdown {
  const quizCorrect = state.quizLog.filter((record) => record.correct).length;
  const quiz = Math.min(KNOWLEDGE_CAPS.quiz, quizCorrect * 2);
  const understanding = Math.min(KNOWLEDGE_CAPS.understanding, Math.max(0, state.understandingPoints));
  const rebalance = Math.min(KNOWLEDGE_CAPS.rebalance, state.rebalanceCount * 2);
  const penalty = state.ruleBreaches * KNOWLEDGE_CAPS.breachPenalty;
  const total = Math.min(20, Math.max(0, KNOWLEDGE_CAPS.base + quiz + understanding + rebalance - penalty));
  return { quizCorrect, quiz, understanding, rebalance, penalty, total };
}

export function knowledgeScoreOf(state: GameState): number {
  return knowledgeBreakdown(state).total;
}

export function starTitle(stars: 0 | 1 | 2 | 3): string {
  return ['연금 설계 입문자', '목표에 가까워진 적립가', '균형 잡힌 적립가', '지속 가능한 연금 설계자'][stars];
}

export function starChecklist(state: GameState, score: ScoreResult): { label: string; passed: boolean }[] {
  const need = diversificationNeeded(state.profileId);
  return [
    { label: `월 연금이 목표의 ${Math.round(balanceConfig.nearGoalRate * 100)}%에 닿음`, passed: score.goalRate >= balanceConfig.nearGoalRate },
    { label: `생활자금 ${(profileLimits(state).safeCash / 10000).toFixed(0)}만 원`, passed: state.cash - state.livingDebt >= profileLimits(state).safeCash },
    { label: `낙폭 ${Math.round(profileLimits(state).maxDrawdown * 100)}% 이하`, passed: state.maxDrawdown <= profileLimits(state).maxDrawdown },
    { label: `분산 ${need}종 이상`, passed: score.diversification >= need },
    { label: `성향 목표 구성 차이 ${Math.round(balanceConfig.profileAlignBand * 100)}%p 이내`, passed: score.profileAligned }
  ];
}

const won = (value: number) => `${Math.round(value).toLocaleString('ko-KR')}원`;

export interface StarLock {
  /** 지금 별 수 */
  stars: 0 | 1 | 2 | 3;
  /** 다음 별. 3별이면 null */
  nextStars: 1 | 2 | 3 | null;
  /** 다음 별을 잠근 첫 조건. 3별이면 null */
  reason: string | null;
  /** 체크리스트 5개 중 통과 수 */
  passed: number;
  total: number;
  /** "5개 중 3개 통과 · 다음 별까지: 생활자금 600만 원" 한 줄 */
  line: string;
}

/**
 * 별이 왜 거기서 멈췄는지. 별 규칙(목표 95% → 1, 목표 100%+생활자금 → 2, +낙폭·분산·성향 → 3)을 그대로
 * 따라가며 다음 별을 잠근 **첫** 조건 하나만 말한다. 결과 화면의 "잠긴 별" 설명과 코치 대사가 쓴다.
 */
export function starLockReason(state: GameState, score: ScoreResult): StarLock {
  const checklist = starChecklist(state, score);
  const passed = checklist.filter((item) => item.passed).length;
  const total = checklist.length;
  const gap = Math.max(0, state.goalMonthly - score.monthlyPension);
  let nextStars: StarLock['nextStars'] = null;
  let reason: string | null = null;
  if (score.stars === 0) {
    nextStars = 1;
    const nearGap = Math.max(0, state.goalMonthly * balanceConfig.nearGoalRate - score.monthlyPension);
    reason = `월 연금이 목표의 ${Math.round(balanceConfig.nearGoalRate * 100)}%(${won(state.goalMonthly * balanceConfig.nearGoalRate)})에 ${won(nearGap)} 모자랍니다`;
  } else if (score.stars === 1) {
    nextStars = 2;
    // 별 1 = (95% 이상·미달) 또는 (달성·생활자금 부족). 둘 중 어느 쪽인지로 다음 조건이 갈린다.
    reason = !score.goalMet
      ? `목표 월 연금 ${won(state.goalMonthly)}에 ${won(gap)} 모자랍니다`
      : `생활자금 ${won(state.cash)}이 기준 ${won(profileLimits(state).safeCash)}에 ${won(profileLimits(state).safeCash - state.cash)} 모자랍니다`;
  } else if (score.stars === 2) {
    nextStars = 3;
    const need = diversificationNeeded(state.profileId);
    reason = state.maxDrawdown > profileLimits(state).maxDrawdown
      ? `최대 낙폭 ${Math.round(state.maxDrawdown * 100)}%가 기준 ${Math.round(profileLimits(state).maxDrawdown * 100)}%를 넘었습니다`
      : score.diversification < need
        ? `5% 이상 보유 상품이 ${score.diversification}종 — ${need}종 이상이어야 합니다`
        : `목표 구성에서 옮겨야 할 비중 ${Math.round(profileDistance(state) * 100)}%가 허용 범위보다 ${Math.round(balanceConfig.profileAlignBand * 100)}%p 넘게 다릅니다`;
  }
  const line = reason
    ? `${total}개 조건 중 ${passed}개 통과 · 별 ${nextStars}개까지: ${reason}`
    : `${total}개 조건을 모두 통과했습니다`;
  return { stars: score.stars, nextStars, reason, passed, total, line };
}

export interface ShortfallPlan {
  /** 목표 − 월 연금 */
  gapMonthly: number;
  /** 그 차이를 메우는 데 필요한 IRP 추가 평가액(수령 방식 계수 반영) */
  neededIrp: number;
  /** 이번 판 남은 납입 한도 */
  contributionRoom: number;
  /** 필요 금액이 남은 납입 한도 안이면 true — "더 넣었다면 도달" */
  withinLimit: boolean;
  /** 그만큼 납입했을 때 공제 한도 안에서 돌아왔을 환급 추정 */
  refundEstimate: number;
  line: string;
}

/**
 * 목표 미달일 때 "얼마가 모자랐고, 무엇을 했으면 닿았을지"를 숫자로 말한다. 목표 달성이면 null.
 * 필요 IRP = 부족 월 연금 × 240 ÷ payoutFactor. 남은 납입 한도 안이면 납입만으로 닿을 수 있었고,
 * 한도 밖이면 운용 수익이 있어야 했다는 뜻이다. 환급 추정은 공제 한도(연 900만)와 공제율로 잡는다.
 */
export function shortfallPlan(state: GameState, score: ScoreResult): ShortfallPlan | null {
  if (score.goalMet) return null;
  const gapMonthly = state.goalMonthly - score.monthlyPension;
  const choice: PayoutChoice = state.payoutChoice ?? 'annuity20';
  // 계좌별 현재 세후 비교 비율을 사용한 근사치. 추가 납입으로 재원 구성이 바뀌면 다시 계산해야 한다.
  const currentFactor = score.irpValue > 0 ? score.payout.monthlyBasis * policyRules.receivingMonths / score.irpValue : 1;
  const neededIrp = (gapMonthly * policyRules.receivingMonths) / currentFactor;
  const contributionRoom = Math.max(0, policyRules.annualContributionLimit - state.contributionTotal);
  const withinLimit = neededIrp <= contributionRoom;
  const creditRoom = Math.max(0, policyRules.annualTaxCreditLimit - state.taxCreditEligible);
  // 환급은 실제로 더 넣을 수 있는 금액 안에서, 공제 한도까지만 돌아온다.
  const refundEstimate = Math.min(neededIrp, contributionRoom, creditRoom) * policyRules.taxCreditRate;
  const payoutNote = choice === 'lumpSum' ? '(일시금은 세금이 더 붙어 필요액이 늘어납니다) ' : '';
  const line = withinLimit
    ? `월 ${won(gapMonthly)} 부족 → 현재 재원 비율 기준 근사 IRP ${won(neededIrp)}이 더 있었으면 목표. ${payoutNote}남은 납입 한도 ${won(contributionRoom)} 안이라 납입만으로 닿을 수 있었고, 그 납입은 세액공제 약 ${won(refundEstimate)}로 일부 돌아옵니다.`
    : `월 ${won(gapMonthly)} 부족 → 현재 재원 비율 기준 근사 IRP ${won(neededIrp)}이 더 있었어야 합니다. ${payoutNote}남은 납입 한도 ${won(contributionRoom)}를 넘어 납입만으로는 부족했고, 운용 수익(분산·리밸런싱)이 함께 필요했습니다.`;
  return { gapMonthly, neededIrp, contributionRoom, withinLimit, refundEstimate, line };
}

export function calculateScore(state: GameState): ScoreResult {
  const irpValue = portfolioValue(state);
  const choice: PayoutChoice = state.payoutChoice ?? 'annuity20';
  const payout = accountPayout(irpValue, choice, state.accountBasis);
  const pension = payout.monthlyBasis;
  const goalRate = state.goalMonthly <= 0 ? 0 : pension / state.goalMonthly;
  const goalMet = goalRate >= 1;
  const riskRatio = riskAssetRatio(state);
  const diversification = diversificationCount(state);
  const actualProfile = behaviorProfile(state);
  const profileAligned = profileDistance(state) <= balanceConfig.profileAlignBand;
  const safeCash = state.cash - state.livingDebt >= profileLimits(state).safeCash;
  const drawdownOk = state.maxDrawdown <= profileLimits(state).maxDrawdown;
  const diversified = diversification >= diversificationNeeded(state.profileId);
  const nearGoal = goalRate >= balanceConfig.nearGoalRate;

  let stars: 0 | 1 | 2 | 3 = 0;
  if (nearGoal && !goalMet) stars = 1;
  if (goalMet && !safeCash) stars = 1;
  if (goalMet && safeCash) stars = 2;
  if (stars === 2 && drawdownOk && diversified && profileAligned) stars = 3;

  const incomeScore = Math.min(50, Math.max(0, goalRate * 50));
  const stabilityScore = Math.min(30, Math.max(0,
    (safeCash ? 9 : Math.max(0, 9 * Math.max(0, state.cash - state.livingDebt) / profileLimits(state).safeCash)) +
    (drawdownOk ? 9 : Math.max(0, 9 * (1 - state.maxDrawdown))) +
    Math.min(7, diversification * 2.4) +
    Math.max(0, 5 - state.cashShortages * 2)
  ));
  const knowledgeScore = knowledgeScoreOf(state);
  const totalScore = Math.round(Math.min(100, Math.max(0, incomeScore + stabilityScore + knowledgeScore)));
  const returnRate = balanceConfig.startingIrp <= 0 ? 0 : (irpValue - balanceConfig.startingIrp) / balanceConfig.startingIrp;
  const investmentReturnRate = balanceConfig.startingIrp <= 0 ? 0 : (irpValue - balanceConfig.startingIrp - state.cashFlows.reduce((sum, flow) => sum + flow.amount, 0)) / balanceConfig.startingIrp;

  const bestDecision = state.rebalanceCount > 0
    ? '시장 변화 뒤 목표비중을 다시 맞춰 위험을 관리한 결정'
    : state.contributionTotal > 0
      ? '생활자금과 IRP를 나누면서 추가납입한 결정'
      : '급한 판단을 피하고 시장 흐름을 끝까지 확인한 결정';
  const improvement = !safeCash
    ? 'IRP 납입 전 비상생활자금 기준을 먼저 확보해보세요.'
    : !diversified
      ? '서로 다르게 움직이는 자산 3종 이상으로 분산해보세요.'
      : state.rebalanceCount === 0
        ? '시장 국면이 바뀐 뒤 리밸런싱으로 목표 위험비중을 회복해보세요.'
        : !profileAligned
          ? '공식 리밸런싱 목표 위험비중에 더 가깝게 맞춰보세요.'
          : '목표 월 연금을 지키면서 시장에 맞게 매매 타이밍을 실험해보세요.';

  return {
    monthlyPension: pension, goalRate, goalMet, irpValue, cash: state.cash, riskRatio,
    diversification, maxDrawdown: state.maxDrawdown, stars, starTitle: starTitle(stars), totalScore,
    incomeScore: Math.round(incomeScore), stabilityScore: Math.round(stabilityScore), knowledgeScore: Math.round(knowledgeScore),
    behaviorProfile: actualProfile, profileAligned, bestDecision, improvement,
    relatedCardIds: ['pension-assumption', !safeCash ? 'emergency-cash' : !diversified ? 'diversification' : 'rebalance'],
    returnRate, investmentReturnRate,
    payout
  };
}
