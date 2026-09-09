export type ProductId = 'deposit' | 'shortBond' | 'longBond' | 'balanced' | 'equityEtf' | 'tdf';
export type ProductKind = 'deposit' | 'fund' | 'etf';
export type TileKind = 'start' | 'product' | 'market' | 'life' | 'trade' | 'rebalance' | 'policy' | 'profile' | 'outlook';
export type Trend = 'up' | 'down' | 'flat';
export type ProfileId = 'stable' | 'stableGrowth' | 'balanced' | 'growth' | 'aggressive';

export interface Product {
  id: ProductId;
  name: string;
  shortName: string;
  kind: ProductKind;
  description: string;
  legal_classification: string;
  principal_guaranteed: boolean;
  tdf_exception_eligible: boolean;
  classification_reviewed_at: string;
  source_url: string;
  duration: number;
  /** 교육 모형의 턴당 보수율(실제 상품의 연 보수율 아님). */
  feeRate: number;
  riskLabel: string;
  riskGrade: number;
  regulatoryRisk: boolean;
  equityExposure: number;
}

export type Regime = 'easing' | 'hold' | 'tightening' | 'pivot';
export type ShockFamily = 'rate' | 'equity';

export interface MarketAlert {
  level: 1 | 2;
  text: string;
  hint: string;
}

export interface MarketStep {
  turn: number;
  phase: string;
  headline: string;
  signal: string;
  reason: string;
  /** 1~5 표시 레벨. ratePct에서 파생. */
  rate: number;
  inflation: number;
  stocks: number;
  ratePct: number;
  rateDeltaPct: number;
  inflationPct: number;
  stockIndex: number;
  stockReturn: number;
  regime: Regime;
  returns: Record<ProductId, number>;
  shock?: boolean;
  shockId?: string;
  alert?: MarketAlert;
}

export interface MarketShock {
  id: string;
  family: ShockFamily;
  positive: boolean;
  phase: string;
  headline: string;
  signal: string;
  reason: string;
  rateDeltaPct: number[];
  inflationDeltaPct: number;
  stockMovePct: number;
  forceMax?: Partial<Record<ProductId, number>>;
  forceMin?: Partial<Record<ProductId, number>>;
  regimeAfter?: Regime;
  regimeAfterChance?: number;
  recovery?: boolean;
  alertStrong: string;
  alertHint: string;
  cardId: string;
}

export interface RegimeConfig {
  phase: string;
  moveChance: number;
  direction: -1 | 0 | 1;
  stepWeights: [number, number];
  stockDrift: number;
  inflationDrift: number;
  transitions: Partial<Record<Regime, number>>;
}

export interface MarketConfig {
  rateStartPct: number;
  rateMinPct: number;
  rateMaxPct: number;
  rateStepPct: number;
  inflationStartPct: number;
  inflationMinPct: number;
  inflationMaxPct: number;
  stockStartIndex: number;
  depositBase: number;
  depositPerRatePct: number;
  depositNoise: number;
  bondCarryPerRatePct: number;
  bondSensitivityPerPct: number;
  bondNoise: number;
  equityPremium: number;
  stockNoise: number;
  equityNoise: number;
  recoveryDrift: number;
  recoveryTurns: number;
  returnClamp: number;
  shockCountWeights: [number, number];
  shockSlots: [[number, number], [number, number], [number, number]];
  alertStrongRate: number;
  alertFakeRate: number;
  regimes: Record<Regime, RegimeConfig>;
}

export type LifeEventKind = 'cost' | 'bonus' | 'transfer';

export interface LifeEvent {
  id: string;
  /** cost: 지출(cost>0) · bonus: 생활자금 보너스(cost<0) · transfer: 퇴직급여 이전(cost<0, IRP 또는 세후 생활자금) */
  kind: LifeEventKind;
  title: string;
  body: string;
  cost: number;
  eligibleWithdrawal: boolean;
  learningCardId: string;
}

/**
 * 생활사건 선택지. 비용: cash·deposit·withdraw / 보너스: contribute-all·contribute-half·cash / 이전: transfer-irp·cash.
 * `cash`는 어떤 사건에서도 "IRP를 건드리지 않고 생활자금 쪽으로"라는 뜻이라 항상 고를 수 있다(예전 호출 호환).
 */
export type LifeChoice = 'cash' | 'deposit' | 'withdraw' | 'contribute-all' | 'contribute-half' | 'transfer-irp';

export interface LifeChoiceOption {
  id: LifeChoice;
  label: string;
  enabled: boolean;
  /** 비활성 이유 */
  reason?: string;
  /** 즉시 비용·효과 한 줄 */
  immediate: string;
  /** 장기 비용·효과 한 줄 */
  longTerm: string;
}

/** 이번 턴 생활사건을 어떻게 해결했는지. 정산 「사건」 블록과 "다른 선택이었다면" 줄의 재료 */
export interface LifeResolution {
  eventId: string;
  title: string;
  kind: LifeEventKind;
  choice: LifeChoice;
  choiceLabel: string;
  /** 사건 금액(지출 +, 보너스·이전 −) */
  cost: number;
  cashDelta: number;
  irpDelta: number;
  /** 예금 해지 불이익 */
  penalty: number;
  /** 중도인출 수수료 또는 일시 수령 세금 */
  fee: number;
  sales: Array<{ productId: ProductId; amount: number; penalty: number }>;
  shortage: boolean;
  /** "다른 선택이었다면" 비교 한 줄 */
  alternative: string;
  message: string;
}

/** 카드 1장 = 3지선다 1문항. `answer`는 `options`의 정답 위치 */
export interface QuizQuestion {
  q: string;
  options: string[];
  answer: 0 | 1 | 2;
  /** 정답·오답 뒤 함께 보이는 해설 */
  why: string;
}

export interface LearningCard {
  id: string;
  category: '시장' | '상품' | '제도' | '운용';
  title: string;
  key: string;
  detail: string;
  source_url: string;
  reviewed_at: string;
  simplified: boolean;
  quiz: QuizQuestion;
}

/** 판에서 처음 넘는 순간 한 번만 울리는 이정표 */
export type MilestoneId = 'goal-50' | 'goal-75' | 'goal-90' | 'goal-100' | 'drawdown-12';

export interface Milestone {
  id: MilestoneId;
  turn: number;
  title: string;
  detail: string;
  /** cheer: 축하 배너 / warn: 경고 배너 */
  tone: 'cheer' | 'warn';
}

/** 퀴즈 한 번의 기록. 카드마다 한 판에 한 번만 출제된다 */
export interface QuizRecord {
  cardId: string;
  correct: boolean;
  turn: number;
}

export interface PolicyRules {
  reviewed_at: string;
  source_urls: string[];
  simplified: boolean;
  riskAssetLimit: number;
  annualContributionLimit: number;
  annualTaxCreditLimit: number;
  taxCreditRate: number;
  receivingMonths: number;
  /** 연금 수령 시 연금소득세(교육용 단순화) */
  pensionTaxRate: number;
  /** 일시금 수령 시 기타소득세(교육용 단순화) */
  lumpSumTaxRate: number;
  payoutReviewedAt: string;
}

/** 12턴 뒤 최종 결정. 연금(20년 분할) 또는 일시금 */
export type PayoutChoice = 'annuity20' | 'lumpSum';

export interface PayoutPlan {
  choice: PayoutChoice;
  taxRate: number;
  tax: number;
  /** 세후 총액 */
  net: number;
  /** 세후 월 수령(일시금은 240개월로 나눈 환산) */
  monthlyNet: number;
  /** 목표 판정에 쓰는 연금 기준 세전 월액. 연금은 IRP÷240, 일시금은 세후 총액을 연금 세후 기준으로 환산 */
  monthlyBasis: number;
}

export interface BalanceConfig {
  maxTurns: number;
  boardSize: number;
  startingIrp: number;
  startingCash: number;
  salarySurplusPerTurn: number;
  defaultGoal: number;
  minGoal: number;
  maxGoal: number;
  contributionAmount: number;
  tradeAmount: number;
  safeCashThreshold: number;
  diversificationMin: number;
  nearGoalRate: number;
  profileAlignBand: number;
  maxDrawdownThreshold: number;
  depositMaturityTurns: number;
  defaultAllocation: Record<ProductId, number>;
  rebalanceAllocation: Record<ProductId, number>;
  market: MarketConfig;
}

/** 디폴트옵션(사전지정운용). 「그대로」를 고르면 대기자금이 이 상품들로 균등 매수된다. */
export type DefaultOptionId = 'principal' | 'lowRisk' | 'midRisk' | 'highRisk';

export interface DefaultOption {
  id: DefaultOptionId;
  name: string;
  products: ProductId[];
  blurb: string;
}

export interface InvestorProfile {
  id: ProfileId;
  name: string;
  minScore: number;
  maxScore: number;
  expectedRiskRatio: number;
  maxDrawdown: number;
  minRiskGrade: number;
  description: string;
}

export type TileEffectKind =
  | 'tax-refund' | 'spotlight' | 'signal-preview' | 'extra-life' | 'double-action'
  | 'policy-brief' | 'rebalance-bonus' | 'outlook' | 'profile-check' | 'diversify-check';

export interface BoardTile {
  index: number;
  kind: TileKind;
  label: string;
  /** 도착 시 적용되는 효과. 출발 칸(연말정산)은 통과해도 적용된다. */
  effect: TileEffectKind;
  /** spotlight 칸이 가리키는 상품 */
  productId?: ProductId;
}

/** 이번 턴 도착·통과 칸이 실제로 일으킨 효과. 속보 카드 스트립과 정산 블록에 그대로 쓴다. */
export interface TileEffect {
  kind: TileEffectKind;
  tileIndex: number;
  title: string;
  detail: string;
  /** 환급액 등 금액 효과 */
  amount?: number;
  productId?: ProductId;
  /** signal-preview: 다음 턴 스텝의 신호. 없으면 null */
  alert?: MarketAlert | null;
  /** outlook: 월 연금 하위·중위·상위 */
  range?: { low: number; mid: number; high: number };
  understanding?: number;
  cardId?: string;
  eventId?: string;
}

/** 이번 턴 장부. 정산 장면이 "시장이 한 일"과 "내가 한 일"을 나눠 보이기 위한 세 지점. */
export interface TurnLedger {
  /** 턴 시작(시장 반영 전) IRP */
  open: number;
  /** 시장 반영·주문 체결 직후 IRP */
  afterMarket: number;
  /** 첫 행동 직전(생활사건 뒤) 스냅샷. 아직 행동 전이면 null */
  beforeAction: { irp: number; risk: number; holdings: Record<ProductId, number> } | null;
}

export interface GhostTrack {
  /** 같은 시드·같은 주사위·무행동 경로의 IRP. 시작 포함 길이 13 */
  irpHistory: number[];
  finalCash: number;
}

export interface TileBriefing {
  title: string;
  body: string;
  cardId: string;
}

export interface TileBriefingSet {
  index: number;
  label: string;
  kind: TileKind;
  pool: TileBriefing[];
}

export interface Holding {
  productId: ProductId;
  amount: number;
  principal: number;
  depositTurnsHeld: number;
  units?: number;
  lots?: DepositLot[];
}

export interface PendingOrder {
  id: string;
  side: 'buy' | 'sell';
  productId: ProductId;
  amount: number;
  submittedTurn: number;
  settlesTurn: number;
  stage: 'received' | 'priced';
  units?: number;
  priceTurn?: number;
  groupId?: string;
  targetProductId?: ProductId;
}

export type ActionKind = 'contribute' | 'buy' | 'sell' | 'switch' | 'rebalance' | 'hold';

export interface GameLog {
  turn: number;
  type: string;
  message: string;
  impact?: number;
}

export interface DepositLot {
  principal: number;
  amount: number;
  openedTurn: number;
  maturityTurn: number;
  ratePerTurn: number;
}

export interface AccountBasis {
  retirement: number;
  retirementTax: number;
  deducted: number;
  nonDeducted: number;
}

export interface CashFlow {
  turn: number;
  kind: 'contribution' | 'transfer' | 'withdrawal';
  amount: number;
}

export interface GameState {
  accountType: 'IRP';
  rulesetVersion: '2026-09-09-p0';
  accountBasis: AccountBasis;
  cashFlows: CashFlow[];
  livingDebt: number;
  prices: Record<ProductId, number>;
  orderSequence: number;
  rebalancePlan: Record<ProductId, number> | null;

  seed: string;
  rngState: number;
  status: 'playing' | 'finished';
  turn: number;
  position: number;
  phase: string;
  goalMonthly: number;
  profileId: ProfileId;
  cash: number;
  irpCash: number;
  holdings: Holding[];
  pendingOrders: PendingOrder[];
  contributionTotal: number;
  taxCreditEligible: number;
  taxCreditBenefit: number;
  maxIrpValue: number;
  maxDrawdown: number;
  /** 시작 IRP와 매 턴 정산 후 IRP. 12턴을 마치면 길이 13. */
  irpHistory: number[];
  cashShortages: number;
  ruleBreaches: number;
  marketLimitExceeded: boolean;
  understandingPoints: number;
  rebalanceCount: number;
  riskBuyCount: number;
  safeActionCount: number;
  unlockedCards: string[];
  eventHistory: string[];
  logs: GameLog[];
  lastMarket: MarketStep;
  marketPath: MarketStep[];
  awaitingAction: boolean;
  currentEventId: string | null;
  lifeEventSchedule: Array<{ turn: number; eventId: string }>;
  ledger: TurnLedger;
  /** 이번 턴 도착·통과 칸 효과(0~2개). 다음 턴 시작에 비운다. */
  tileEffects: TileEffect[];
  /** 이번 턴 남은 행동 수. 기본 1, 운용지시 칸 2. 마감 뒤 0. */
  actionsLeft: number;
  /** 이번 턴 성공한 행동 메시지. 정산 요약의 actionLine이 된다. */
  turnActionLines: string[];
  /** 납입 세액공제 중 아직 환급되지 않은 금액. 연말정산 칸 통과 시 생활자금으로 돌아온다. */
  pendingTaxCredit: number;
  taxCreditRefunded: number;
  /** 상품 거리 도착: 이번 턴 그 상품의 정보 강조·이해 +1(일반 거래 규칙 유지) */
  spotlightProductId: ProductId | null;
  /** 리밸런싱 칸 도착 턴이면 그 턴 번호. 그 턴 리밸런싱은 이해 +2 */
  rebalanceBonusTurn: number | null;
  /** 생활 사건 칸으로 추가된 사건 수(판당 최대 1) */
  extraLifeEvents: number;
  tileEffectsEnabled: boolean;
  ghost: GhostTrack | null;
  /** 12턴 뒤 고른 수령 방식. 아직이면 null(점수는 연금 기준) */
  payoutChoice: PayoutChoice | null;
  /** 지정한 디폴트옵션. null이면 「그대로」가 대기자금을 건드리지 않는다(고스트·시뮬 기준선) */
  defaultOption: DefaultOptionId | null;
  /** 이번 턴 생활사건 해결 기록. 다음 턴 시작에 비운다 */
  lifeResolution: LifeResolution | null;
  /** 이번 판에 푼 퀴즈. 정답 수가 지식 점수에 들어간다 */
  quizLog: QuizRecord[];
  /** 연속 정답 수. 오답이면 0 */
  quizStreak: number;
  /** 이번 턴 출제 대기 카드. 속보를 닫은 뒤 모달로 뜨고 다음 턴 시작에 비운다 */
  pendingQuizCardId: string | null;
  /** 이번 판에 이미 넘은 이정표. 시작 시점에 이미 넘은 것은 배너 없이 여기에 들어간다 */
  milestonesHit: MilestoneId[];
  /** 이번 턴 마감에 처음 넘은 이정표. 정산 배너가 쓰고 다음 턴 시작에 비운다 */
  turnMilestones: Milestone[];
  /** 업적 판정용 행동 기록 */
  record: PlayRecord;
}

export interface TurnProductDelta {
  productId: ProductId;
  name: string;
  delta: number;
}

export interface TurnSummary {
  turn: number;
  /** 이번 턴 성공한 행동을 " · "로 이은 한 줄 */
  actionLine: string;
  actionLines: string[];
  /** 턴 시작(시장 반영 전) IRP */
  irpOpen: number;
  /** 시장 반영·주문 체결 직후 IRP */
  irpAfterMarket: number;
  /** 첫 행동 직전 IRP(생활사건 반영 뒤) */
  irpBefore: number;
  irpAfter: number;
  /** 시장이 한 일: irpAfterMarket − irpOpen */
  marketDelta: number;
  /** 생활사건이 한 일: irpBefore − irpAfterMarket */
  lifeDelta: number;
  /** 내가 한 일: irpAfter − irpBefore */
  actionDelta: number;
  riskBefore: number;
  riskAfter: number;
  tileEffects: TileEffect[];
  /** 같은 턴 끝 고스트 IRP. 고스트가 없으면 null */
  ghostIrp: number | null;
  /** 이번 턴 생활사건 해결 기록. 없으면 null */
  lifeEvent: LifeResolution | null;
  /** 이번 턴 마감에 처음 넘은 이정표(0~2개) */
  milestones: Milestone[];
  marketHeadline: string;
  shock: boolean;
  alert?: MarketAlert;
  marketLimitExceeded: boolean;
  productDeltas: TurnProductDelta[];
  nextHints: string[];
  productReturns: Record<ProductId, number>;
  /** 정산 후 IRP 평가액 대비 보유 비중. */
  holdingShares: Record<ProductId, number>;
  /** 보유 중 |수익률 × 비중|이 가장 큰 상품. 보유가 없으면 null. */
  biggestMover: ProductId | null;
  reaction: string;
}

export interface ActionResult {
  ok: boolean;
  message: string;
  state: GameState;
  expectedRiskRatio?: number;
  summary?: TurnSummary;
}

export interface ScoreResult {
  monthlyPension: number;
  goalRate: number;
  goalMet: boolean;
  irpValue: number;
  cash: number;
  riskRatio: number;
  diversification: number;
  maxDrawdown: number;
  stars: 0 | 1 | 2 | 3;
  starTitle: string;
  totalScore: number;
  incomeScore: number;
  stabilityScore: number;
  knowledgeScore: number;
  behaviorProfile: ProfileId;
  profileAligned: boolean;
  bestDecision: string;
  improvement: string;
  relatedCardIds: string[];
  returnRate: number;
  investmentReturnRate: number;
  /** 적용된 수령 방식 계산(미선택이면 연금 기준) */
  payout: PayoutPlan;
}

/** 판 하나의 행동 기록. 점수에는 들어가지 않고 업적 판정에만 쓴다 */
export interface PlayRecord {
  /** 리밸런싱에 성공한 턴 */
  rebalanceTurns: number[];
  /** 마감 시 5% 이상 보유 상품이 3종 이상이었던 턴 수 */
  diversifiedTurns: number;
  /** 「그대로」에서 디폴트옵션이 실제로 매수한 횟수 */
  defaultOptionRuns: number;
  /** 생활사건 선택 기록 */
  lifeChoices: Array<{ eventId: string; choice: LifeChoice }>;
}

export type AchievementId =
  | 'goal-reached' | 'three-stars' | 'calm-seas' | 'diversified-12' | 'pre-shock-rebalance' | 'tax-credit-max'
  | 'quiz-perfect' | 'ghost-crusher' | 'annuity-choice' | 'default-option-run' | 'severance-to-irp' | 'all-profiles';

export interface AchievementDef {
  id: AchievementId;
  title: string;
  detail: string;
  /** 판 하나에서 판정(game) / 저장 누적에서 판정(meta) */
  scope: 'game' | 'meta';
}

/** 성향(캐릭터)별 완주 기록. 도감 「캐릭터 컬렉션」의 재료 */
export type Collection = Record<ProfileId, { plays: number; bestStars: 0 | 1 | 2 | 3 }>;

export type AnimationSpeed = 1 | 2;

export interface SaveData {
  version: 6;
  settings: {
    reducedMotion: boolean;
    sound: boolean;
    characters: boolean;
    ghost: boolean;
    /** 애니메이션 속도. 2면 주사위·말·숫자·속보·정산 연출이 절반 길이 */
    speed: AnimationSpeed;
    /** 정산 창 자동 진행(2.5초). 마지막·충격·이정표·사건 턴은 제외 */
    autoSettle: boolean;
    /** 정산 창 「자세히」 펼침 기억 */
    settleExpanded: boolean;
  };
  /** 마지막으로 고른 디폴트옵션. null이면 다음 판 시작에 고른다 */
  defaultOption: DefaultOptionId | null;
  achievements: AchievementId[];
  collection: Collection;
  unlockedCards: string[];
  bestScore: number;
  lastSeed: string;
  disclaimerAccepted: boolean;
  bestReturnRate: number;
  bestGoalRate: number;
  playCount: number;
  howtoSeen: boolean;
  profileId: ProfileId;
  goalMonthly: number;
}
