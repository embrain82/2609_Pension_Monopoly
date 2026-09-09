import { balanceConfig } from '../data/content';
import type { GameState, MarketConfig, MarketStep, ProductId, LifeEvent } from '../types';

export const SCENARIOS = {
  classic: { name: '금리의 두 얼굴', description: '금리 전환과 주가 충격 속에서 균형 찾기' },
  inflation: { name: '물가와의 경주', description: '높은 물가와 긴축 속에서 구매력 지키기' },
  recession: { name: '긴 겨울', description: '낮은 성장과 불규칙한 반등 속에서 버티기' },
  recovery: { name: '회복의 파도', description: '회복 기회와 되돌림 사이에서 위험 관리하기' }
} as const;
export type ScenarioId = keyof typeof SCENARIOS;
export const MISSIONS = {
  pension: { name: '연금 목표', description: '시작할 때 정한 월 연금 달성' },
  cushion: { name: '든든한 생활', description: '순생활자금 1,800만원 이상, 미지급 생활비 0원' },
  purchasing: { name: '구매력 지키기', description: '물가를 반영한 운용지수 100 이상' }
} as const;
export type MissionId = keyof typeof MISSIONS;
// 물가/생애주기만 1턴=가상 3개월. 납입 한도는 한 판 합산, 수익률과 비용은 턴당 교육용 값.
export const SCENARIO_CLOCK = { startYear: 2026, targetYear: 2029, yearsPerTurn: 0.25, turns: 12 } as const;
export function tdfEquity(turn: number): number { return 0.45 - 0.20 * Math.min(12, Math.max(0, turn)) / 12; }
export function scenarioConfig(id: ScenarioId): MarketConfig {
  const c = structuredClone(balanceConfig.market);
  if (id === 'inflation') {
    c.inflationStartPct = 4.5; c.rateStartPct = 3.5;
    for (const r of Object.values(c.regimes)) r.inflationDrift += 0.18;
    c.regimes.hold.transitions = { tightening: 0.6, easing: 0.1 };
  }
  if (id === 'recession') {
    c.rateStartPct = 1.5; c.inflationStartPct = 1;
    for (const r of Object.values(c.regimes)) r.stockDrift -= 0.025;
    c.recoveryDrift = 0.022;
  }
  if (id === 'recovery') {
    for (const r of Object.values(c.regimes)) r.stockDrift += 0.012;
    c.stockNoise = 0.09; c.alertFakeRate = 0.25;
  }
  return c;
}
export function withGlidePath(path: MarketStep[]): MarketStep[] {
  return path.map(s => {
    // 턴 수익률에는 직전 턴 말의 편입 비중 적용. 다음 턴 비중은 그 뒤 축소.
    const equity = tdfEquity(s.turn - 1), bonds = (1 - equity - 0.15) / 2;
    return { ...s, returns: { ...s.returns, tdf: bonds * (s.returns.shortBond + s.returns.longBond) + equity * s.returns.equityEtf + 0.15 * s.returns.deposit } };
  });
}
export function inflatedEvent(state: GameState, event: LifeEvent): LifeEvent {
  return state.campaign && event.kind === 'cost'
    ? { ...event, cost: Math.round(event.cost * state.campaign.priceIndex) } : event;
}
export interface TurnReview {
  turn: number; tile: number; headline: string; actions: string[]; irp: number;
  flow: number; market: number; costs: number; cash: number; index: number; realIndex: number;
  benchmark: number; chapter: boolean;
  holdings: Array<{productId: ProductId; amount: number}>;
}
export interface Campaign {
  scenario: ScenarioId; mission: MissionId; weekly: boolean;
  practice?: boolean;
  startingProfile: GameState['profileId']; startingGoal: number;
  priceIndex: number; index: number; peak: number; drawdown: number;
  open: number; afterMarket: number; flowStart: number;
  benchmark: number; benchmarkOpen: number;
  baselineWeights: Record<ProductId, number>;
  reviews: TurnReview[];
  branches: Array<{ turn: number; state: Omit<GameState, "campaign">; progress: Omit<Campaign, "branches"> }>;
}
export function missionResult(state: GameState, monthly: number): { passed: boolean; progress: string } {
  const d=state.campaign!;
  if(d.mission === 'cushion') return { passed: state.cash-state.livingDebt >= 18_000_000 && state.livingDebt === 0, progress: `순생활자금 ${Math.round((state.cash-state.livingDebt)/10000)} / 1,800만원` };
  if(d.mission === 'purchasing') return { passed: d.index/d.priceIndex >= 1, progress: `실질 운용지수 ${(100*d.index/d.priceIndex).toFixed(1)} / 100` };
  return { passed: monthly >= d.startingGoal, progress: `월 연금 ${Math.round(monthly/10000)} / ${Math.round(d.startingGoal/10000)}만원` };
}

export function replayChapter(state: GameState, turn: number): GameState | null {
  const branch=state.campaign?.branches.find(b=>b.turn===turn);
  if(state.status!=='finished' || !branch) return null;
  return structuredClone({...branch.state,campaign:{...branch.progress,weekly:false,practice:true,branches:state.campaign!.branches.filter(b=>b.turn<=turn)}});
}
