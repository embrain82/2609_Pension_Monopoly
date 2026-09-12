import { CARD_RULES, LEARNING_RULES, SOURCES, CONTENT_REVIEWED_AT } from './learning-rules';
import productsJson from './products.json';
import marketJson from './market-scenarios.json';
import lifeJson from './life-events.json';
import policyJson from './policy-rules.json';
import learningJson from './learning-cards.json';
import profilesJson from './investor-profiles.json';
import balanceJson from './balance-config.json';
import tileBriefingsJson from './tile-briefings.json';
import marketShocksJson from './market-shocks.json';
import defaultOptionsJson from './default-options.json';
import type { BalanceConfig, BoardTile, DefaultOption, InvestorProfile, LearningCard, LifeEvent, MarketShock, MarketStep, PolicyRules, Product, TileBriefingSet } from '../types';

export const products = productsJson as Product[];
export const marketScenario = marketJson as MarketStep[];
export const marketShocks = marketShocksJson as MarketShock[];
export const lifeEvents = lifeJson as LifeEvent[];
export const policyRules = policyJson as PolicyRules;
export const learningCards: LearningCard[] = learningJson.map(card => {
  const ruleId = CARD_RULES[card.id], rule = LEARNING_RULES[ruleId];
  return { ...card, ruleId, actualPrinciple: rule.principle, gameAssumption: rule.assumption,
    source_url: SOURCES[rule.sources[0]].url, reviewed_at: CONTENT_REVIEWED_AT } as LearningCard;
});
export const investorProfiles = profilesJson as InvestorProfile[];
export const balanceConfig = balanceJson as BalanceConfig;
export const tileBriefings = tileBriefingsJson as TileBriefingSet[];
export const defaultOptions = defaultOptionsJson as DefaultOption[];

/** 칸 종류·이름·효과. 효과 규칙은 src/engine/tile-effects.ts, 설명 글은 tile-briefings.json. */
const tileKinds: Array<Omit<BoardTile, 'index'>> = [
  { kind: 'start', label: '연말정산', effect: 'tax-refund' },
  { kind: 'product', label: '예금 거리', effect: 'spotlight', productId: 'deposit' },
  { kind: 'market', label: '시장 뉴스', effect: 'signal-preview' },
  { kind: 'product', label: '단기채 거리', effect: 'spotlight', productId: 'shortBond' },
  { kind: 'life', label: '생활 사건', effect: 'extra-life' },
  { kind: 'trade', label: '운용지시', effect: 'double-action' },
  { kind: 'product', label: '장기채 거리', effect: 'spotlight', productId: 'longBond' },
  { kind: 'policy', label: '제도 안내', effect: 'policy-brief' },
  { kind: 'product', label: '혼합형 거리', effect: 'spotlight', productId: 'balanced' },
  { kind: 'market', label: '시장 뉴스', effect: 'signal-preview' },
  { kind: 'rebalance', label: '리밸런싱', effect: 'rebalance-bonus' },
  { kind: 'product', label: 'ETF 거리', effect: 'spotlight', productId: 'equityEtf' },
  { kind: 'outlook', label: '은퇴 전망대', effect: 'outlook' },
  { kind: 'product', label: 'TDF 거리', effect: 'spotlight', productId: 'tdf' },
  { kind: 'market', label: '시장 뉴스', effect: 'signal-preview' },
  { kind: 'life', label: '생활 사건', effect: 'extra-life' },
  { kind: 'trade', label: '운용지시', effect: 'double-action' },
  { kind: 'product', label: '분산 광장', effect: 'diversify-check' },
  { kind: 'policy', label: '제도 안내', effect: 'policy-brief' },
  { kind: 'product', label: '금리 전망길', effect: 'signal-preview' },
  { kind: 'profile', label: '성향 점검', effect: 'profile-check' },
  { kind: 'market', label: '시장 뉴스', effect: 'signal-preview' },
  { kind: 'life', label: '생활 사건', effect: 'extra-life' },
  { kind: 'rebalance', label: '리밸런싱', effect: 'rebalance-bonus' }
];

export const boardTiles: BoardTile[] = tileKinds.map((tile, index) => ({ ...tile, index }));

export function validateContent(): void {
  if (products.length !== 6 || marketScenario.length !== 12) {
    throw new Error('필수 콘텐츠 수가 올바르지 않습니다.');
  }
  if (marketScenario.filter((step) => step.shock).map((step) => step.turn).join() !== '6,8') {
    throw new Error('충격 턴은 6턴과 8턴이어야 합니다.');
  }
  if (marketScenario.length + lifeEvents.length + learningCards.length < 30) {
    throw new Error('콘텐츠 항목은 최소 30개여야 합니다.');
  }
  const cardIds = new Set(learningCards.map((card) => card.id));
  if (tileBriefings.length !== boardTiles.length || tileBriefings.some((set, index) => set.index !== index || set.pool.length !== 5)) {
    throw new Error('도착 칸 설명 풀은 24칸마다 5개여야 합니다.');
  }
  if (tileBriefings.some((set) => set.pool.some((item) => !item.title || !item.body || !cardIds.has(item.cardId)))) {
    throw new Error('도착 칸 설명의 제목·본문·학습 카드가 올바르지 않습니다.');
  }
  if (products.some((product) => !Number.isInteger(product.riskGrade) || product.riskGrade < 1 || product.riskGrade > 6)) {
    throw new Error('상품 위험등급은 1~6여야 합니다.');
  }
  if (investorProfiles.some((profile) => !Number.isInteger(profile.minRiskGrade) || profile.minRiskGrade < 1 || profile.minRiskGrade > 6)) {
    throw new Error('성향별 매수 가능 등급이 올바르지 않습니다.');
  }
  const productIds = new Set<string>(products.map((product) => product.id));
  const shockIds = new Set(marketShocks.map((shock) => shock.id));
  if (marketShocks.length !== 6 || shockIds.size !== 6) {
    throw new Error('시장 충격 카탈로그는 서로 다른 6종이어야 합니다.');
  }
  if (marketShocks.some((shock) => [...Object.keys(shock.forceMax ?? {}), ...Object.keys(shock.forceMin ?? {})].some((key) => !productIds.has(key)) || !cardIds.has(shock.cardId))) {
    throw new Error('시장 충격의 강제치 키와 학습 카드가 올바르지 않습니다.');
  }
  if (marketScenario.some((step) => step.shock && !shockIds.has(step.shockId ?? ''))) {
    throw new Error('시장 템플릿의 충격 턴은 카탈로그 id를 가리켜야 합니다.');
  }
  const regimes = Object.keys(balanceConfig.market.regimes).sort().join();
  if (regimes !== 'easing,hold,pivot,tightening') {
    throw new Error('시장 국면 설정은 easing·hold·tightening·pivot 네 개여야 합니다.');
  }
  if (boardTiles[0].effect !== 'tax-refund' || boardTiles.some((tile) => tile.effect === 'spotlight' && !productIds.has(tile.productId ?? ''))) {
    throw new Error('출발 칸은 연말정산 환급이어야 하고, 상품 거리 칸은 실제 상품을 가리켜야 합니다.');
  }
  if (boardTiles.filter((tile) => tile.effect === 'spotlight').length !== products.length) {
    throw new Error('상품 거리 칸은 상품 6종마다 하나여야 합니다.');
  }
  if (learningCards.some((card) => !card.quiz || !card.quiz.q || !card.quiz.why || card.quiz.options.length !== 3
    || card.quiz.options.some((option) => !option) || new Set(card.quiz.options).size !== 3
    || !Number.isInteger(card.quiz.answer) || card.quiz.answer < 0 || card.quiz.answer > 2)) {
    throw new Error('학습 카드마다 3지선다 퀴즈(질문·서로 다른 선택지 3개·정답 위치·해설)가 있어야 합니다.');
  }
  const QUIZ_BOARD_WORDS = /턴|속보|게임|주사위|칸|마무리 퀴즈/;
  if (learningCards.some((card) => QUIZ_BOARD_WORDS.test(card.quiz.q) || card.quiz.options.some((option) => QUIZ_BOARD_WORDS.test(option)))) {
    throw new Error('퀴즈 질문·선택지는 보드 규칙(턴·속보·게임 등)이 아니라 제도·상품·시장 상식이어야 합니다.');
  }
}
