import { accountPayout } from '../src/engine/account-engine';
import { describe, expect, it } from 'vitest';
import { learningCards, policyRules } from '../src/data/content';
import { autoplay, choosePayout, createGame } from '../src/engine/game-engine';
import { calculateScore, monthlyPension, payoutFactor, payoutPlan } from '../src/engine/scoring-engine';

describe('수령 방식(3.6)', () => {
  it('정책 데이터에 교육용 세율 두 개가 있다', () => {
    expect(policyRules.pensionTaxRate).toBe(0.055);
    expect(policyRules.lumpSumTaxRate).toBe(0.165);
    expect(policyRules.lumpSumTaxRate).toBeGreaterThan(policyRules.pensionTaxRate);
  });

  it('payoutPlan: 연금은 세후 월 수령, 일시금은 세후 총액과 월 환산', () => {
    const irp = 120_000_000;
    const annuity = payoutPlan(irp, 'annuity20');
    expect(annuity.taxRate).toBe(0.055);
    expect(annuity.tax).toBeCloseTo(6_600_000, 0);
    expect(annuity.net).toBeCloseTo(113_400_000, 0);
    expect(annuity.monthlyNet).toBeCloseTo(113_400_000 / 240, 2);
    expect(annuity.monthlyBasis).toBeCloseTo(irp / 240, 2);

    const lump = payoutPlan(irp, 'lumpSum');
    expect(lump.taxRate).toBe(0.165);
    expect(lump.tax).toBeCloseTo(19_800_000, 0);
    expect(lump.net).toBeCloseTo(100_200_000, 0);
    expect(lump.monthlyNet).toBeCloseTo(100_200_000 / 240, 2);
    // 연금 기준 환산: 세후 총액을 연금 세후 기준으로 되돌린 세전 월액
    expect(lump.monthlyBasis).toBeCloseTo((irp * payoutFactor('lumpSum')) / 240, 2);
    expect(lump.monthlyBasis).toBeLessThan(annuity.monthlyBasis);
  });

  it('payoutFactor: 연금 1, 일시금 (1−0.165)/(1−0.055)', () => {
    expect(payoutFactor('annuity20')).toBe(1);
    expect(payoutFactor('lumpSum')).toBeCloseTo(0.835 / 0.945, 6);
  });

  it('monthlyPension 기본값은 연금(세전 IRP÷240)으로 기존 수식과 같다', () => {
    expect(monthlyPension(120_000_000)).toBeCloseTo(500_000, 6);
    expect(monthlyPension(120_000_000, 'annuity20')).toBeCloseTo(500_000, 6);
    expect(monthlyPension(120_000_000, 'lumpSum')).toBeCloseTo(500_000 * payoutFactor('lumpSum'), 6);
  });

  it('수령 방식을 정하지 않은 상태의 점수는 연금 기준과 같다(시뮬·고스트 불변)', () => {
    const finished = autoplay('payout-seed', 'balanced');
    expect(finished.payoutChoice).toBeNull();
    const asIs = calculateScore(finished);
    const annuity = calculateScore(choosePayout(finished, 'annuity20').state);
    expect(annuity.monthlyPension).toBeCloseTo(asIs.monthlyPension, 6);
    expect(annuity.goalRate).toBeCloseTo(asIs.goalRate, 6);
    expect(annuity.stars).toBe(asIs.stars);
  });

  it('일시금 달성률은 그 계좌의 재원별 수령 계산과 일치한다', () => {
    const finished = autoplay('payout-seed-2', 'contributor');
    const annuity = calculateScore(choosePayout(finished, 'annuity20').state);
    const lump = calculateScore(choosePayout(finished, 'lumpSum').state);
    expect(lump.goalRate).toBeCloseTo(accountPayout(lump.irpValue, 'lumpSum', finished.accountBasis).monthlyBasis / finished.goalMonthly, 6);
    expect(lump.monthlyPension).toBeLessThan(annuity.monthlyPension);
    expect(lump.stars).toBeLessThanOrEqual(annuity.stars);
    expect(lump.payout.choice).toBe('lumpSum');
    expect(lump.payout.net).toBeLessThan(annuity.payout.net);
  });

  it('choosePayout은 끝난 판에서만 되고, 카드 2장을 열고, 로그를 남긴다', () => {
    const playing = createGame('payout-seed-3', 'balanced');
    expect(choosePayout(playing, 'annuity20').ok).toBe(false);
    const finished = autoplay('payout-seed-3', 'passive');
    const chosen = choosePayout(finished, 'lumpSum');
    expect(chosen.ok).toBe(true);
    expect(chosen.state.payoutChoice).toBe('lumpSum');
    expect(chosen.state.unlockedCards).toContain('pension-tax');
    expect(chosen.state.unlockedCards).toContain('payout-choice');
    expect(chosen.state.logs.at(-1)?.type).toBe('payout');
    // 다시 고르면 바뀐다(모달에서 되돌리기 없음이지만 엔진은 허용)
    expect(choosePayout(chosen.state, 'annuity20').state.payoutChoice).toBe('annuity20');
  });

  it('학습 카드에 연금소득세·수령 요건 카드가 있다', () => {
    const ids = learningCards.map((card) => card.id);
    expect(ids).toContain('pension-tax');
    expect(ids).toContain('payout-choice');
    expect(learningCards.find((card) => card.id === 'pension-tax')?.category).toBe('제도');
  });
});
