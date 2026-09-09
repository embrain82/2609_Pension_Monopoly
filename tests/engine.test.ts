import { describe, expect, it } from 'vitest';
import { balanceConfig, boardTiles, lifeEvents, marketScenario, marketShocks, policyRules } from '../src/data/content';
import { applyGoalToGame, autoplay, clampGoalMonthly, createGame, performAction, resolveActionAmount, resolveLifeEvent, startTurn } from '../src/engine/game-engine';
import { applyMarketStep, generateMarketPath, rateShockReturn } from '../src/engine/market-engine';
import { buyProduct, portfolioValue, rebalancePortfolio, rebalanceShares, sellProduct, settleOrders, settleAllOrders, switchProduct } from '../src/engine/portfolio-engine';
import { canBuyForProfile, canBuyRiskAsset, contributionCredit, decideBuyAgainstRiskLimit, effectiveRiskRatio, maxBuyWithinRiskLimit, riskAssetRatio } from '../src/engine/policy-engine';
import { calculateScore, monthlyPension } from '../src/engine/scoring-engine';
import { applyProfileToGame, profileFromScore } from '../src/engine/profile-engine';
import { defaultSave, loadSave, STORAGE_KEY } from '../src/ui/ui-state';

describe('재현 가능한 게임', () => {
  it('동일 시드는 동일한 결과를 만든다', () => {
    const a = autoplay('same-seed');
    const b = autoplay('same-seed');
    expect(a.lifeEventSchedule).toEqual(b.lifeEventSchedule);
    expect(a.eventHistory).toEqual(b.eventHistory);
    expect(portfolioValue(a)).toBeCloseTo(portfolioValue(b), 6);
  });

  it('12턴 후 반드시 종료한다', () => {
    const state = autoplay('finish');
    expect(state.turn).toBe(12);
    expect(state.status).toBe('finished');
  });
});

describe('시장 우선 턴 루프', () => {
  it('주사위 없이 턴을 시작하고 이번 턴 수익률을 미리 보여 준다', () => {
    const started = startTurn(createGame('loop'));
    expect(started.ok).toBe(true);
    expect(started.state.turn).toBe(1);
    expect(started.state.awaitingAction || Boolean(started.state.currentEventId)).toBe(true);
    expect(started.state.lastMarket.turn).toBe(1);
    expect(started.state.lastMarket.returns.equityEtf).toBeDefined();
  });

  it('말은 주사위 칸 수만큼 이동하고 턴 번호와 분리된다', () => {
    const started = startTurn(createGame('token-steps'), 7);
    expect(started.state.turn).toBe(1);
    expect(started.state.position).toBe(7);
    const second = startTurn(
      { ...started.state, awaitingAction: false, currentEventId: null },
      6
    );
    if (second.ok) expect(second.state.position).toBe(13);
  });

  it('한 판에 생활사건을 시드당 3회만 넣는다', () => {
    const created = createGame('life-three');
    expect(created.lifeEventSchedule).toHaveLength(3);
    const turns = created.lifeEventSchedule.map((item) => item.turn);
    expect(new Set(turns).size).toBe(3);
    expect(turns.every((turn) => turn >= 2 && turn <= 11)).toBe(true);

    let state = created;
    let events = 0;
    while (state.status === 'playing') {
      state = startTurn(state).state;
      if (state.currentEventId) {
        events += 1;
        state = resolveLifeEvent(state, 'cash').state;
      }
      const acted = performAction(state, { kind: 'hold' });
      state = acted.ok ? acted.state : performAction(state, { kind: 'hold' }).state;
    }
    expect(events).toBe(3);
  });

  it('생활사건은 도착 칸이 시장 뉴스여도 시드 스케줄이면 발생한다', () => {
    const created = createGame('news-life-overlap');
    const first = created.lifeEventSchedule[0];
    let state = created;
    while (state.turn < first.turn - 1) {
      state = startTurn(state, 1).state;
      if (state.currentEventId) state = resolveLifeEvent(state, 'cash').state;
      const acted = performAction(state, { kind: 'hold' });
      state = acted.ok ? acted.state : performAction(state, { kind: 'hold' }).state;
    }
    const marketIndex = boardTiles.find((tile) => tile.kind === 'market')!.index;
    const steps = (marketIndex - state.position + boardTiles.length) % boardTiles.length || boardTiles.length;
    const started = startTurn(state, steps);
    expect(started.state.turn).toBe(first.turn);
    expect(boardTiles[started.state.position]).toMatchObject({ kind: 'market', label: '시장 뉴스' });
    expect(started.state.currentEventId).toBe(first.eventId);
    expect(started.message).toBe('생활사건이 발생했습니다.');
  });

  it('생활 사건 칸에 도착해도 스케줄이 없으면 실제 사건이 열리지 않는다', () => {
    const lifeIndex = boardTiles.find((tile) => tile.kind === 'life')!.index;
    const started = startTurn(createGame('life-tile-only'), lifeIndex);
    expect(started.state.turn).toBe(1);
    expect(boardTiles[started.state.position].kind).toBe('life');
    expect(started.state.currentEventId).toBeNull();
    expect(started.state.awaitingAction).toBe(true);
    expect(started.message).not.toBe('생활사건이 발생했습니다.');
  });

  it('학습 카드는 턴을 막지 않고 해금만 한다', () => {
    const started = startTurn(createGame('cards'));
    expect(started.state.unlockedCards.length).toBeGreaterThan(0);
    if (!started.state.currentEventId) {
      expect(started.state.awaitingAction).toBe(true);
      expect(performAction(started.state, { kind: 'hold' }).ok).toBe(true);
    }
  });

  it('신호가 뜬 턴과 충격 턴에 관련 학습 카드를 해금한다', () => {
    const created = createGame('alert-cards');
    const alertTurn = created.marketPath.find((step) => step.alert)!.turn;
    const shockStep = created.marketPath.find((step) => step.shock)!;
    let state = created;
    while (state.turn < Math.max(alertTurn, shockStep.turn)) {
      state = startTurn(state).state;
      if (state.turn === alertTurn) expect(state.unlockedCards).toContain('signal-vs-forecast');
      if (state.turn === shockStep.turn) {
        const shock = marketShocks.find((item) => item.id === shockStep.shockId)!;
        expect(state.unlockedCards).toContain(shock.cardId);
      }
      if (state.currentEventId) state = resolveLifeEvent(state, 'cash').state;
      state = performAction(state, { kind: 'hold' }).state;
    }
  });

  it('금액 프리셋은 기본·절반·가능액을 계산한다', () => {
    const state = { ...createGame('amount'), irpCash: 8_000_000 };
    expect(resolveActionAmount(state, 'buy', 'default')).toBe(balanceConfig.tradeAmount);
    expect(resolveActionAmount(state, 'buy', 'half')).toBe(4_000_000);
    expect(resolveActionAmount(state, 'buy', 'max')).toBe(8_000_000);
  });
});

describe('정책과 주문', () => {
  it('위험자산 한도 초과 매수를 차단한다', () => {
    const state = { ...createGame('risk'), irpCash: 200_000_000 };
    const result = canBuyRiskAsset(state, 'equityEtf', 200_000_000);
    expect(result.ok).toBe(false);
    expect(result.reason).toContain('한도');
  });

  it('시장 상승의 사후 한도 초과는 즉시 규칙 위반이 아니다', () => {
    const base = createGame('market-limit');
    const state = { ...base, holdings: [
      { productId: 'deposit' as const, amount: 30_000_000, principal: 30_000_000, depositTurnsHeld: 0 },
      { productId: 'equityEtf' as const, amount: 70_000_000, principal: 70_000_000, depositTurnsHeld: 0 }
    ] };
    const market = { ...state.lastMarket, returns: { ...state.lastMarket.returns, deposit: 0, equityEtf: 0.5 } };
    const moved = applyMarketStep(state, market);
    expect(moved.marketLimitExceeded).toBe(true);
    expect(moved.ruleBreaches).toBe(0);
    expect(canBuyRiskAsset(moved, 'equityEtf', 1_000_000).ok).toBe(false);
  });

  it('사후 한도 초과 뒤에는 예금·채권 매수는 되고 위험자산 매수는 막는다', () => {
    const base = createGame('safe-after-cap', 'growth');
    const state = {
      ...base,
      awaitingAction: true,
      currentEventId: null,
      irpCash: 5_000_000,
      holdings: [
        { productId: 'deposit' as const, amount: 30_000_000, principal: 30_000_000, depositTurnsHeld: 4 },
        { productId: 'equityEtf' as const, amount: 70_000_000, principal: 70_000_000, depositTurnsHeld: 0 }
      ]
    };
    const moved = applyMarketStep(state, {
      ...state.lastMarket,
      returns: { ...state.lastMarket.returns, deposit: 0, equityEtf: 0.5 }
    });
    expect(moved.marketLimitExceeded).toBe(true);
    expect(canBuyRiskAsset(moved, 'deposit', 1_000_000).ok).toBe(true);
    expect(canBuyRiskAsset(moved, 'shortBond', 1_000_000).ok).toBe(true);
    expect(canBuyRiskAsset(moved, 'equityEtf', 1_000_000).ok).toBe(false);
    expect(canBuyRiskAsset(moved, 'balanced', 1_000_000).ok).toBe(false);

    const bought = buyProduct(moved, 'deposit', 1_000_000);
    expect(bought.ok).toBe(true);
    expect(bought.state.irpCash).toBe(4_000_000);
    expect(riskAssetRatio(bought.state)).toBeLessThanOrEqual(riskAssetRatio(moved) + 0.00001);

    const acted = performAction(moved, { kind: 'buy', productId: 'deposit', amount: 1_000_000 });
    expect(acted.ok).toBe(true);
    expect(acted.state.awaitingAction).toBe(false);
  });

  it('성공한 운용 뒤에는 정산 요약을 붙인다', () => {
    let state = startTurn(createGame('action-summary'), 1).state;
    if (state.currentEventId) state = resolveLifeEvent(state, 'cash').state;
    const result = performAction(state, { kind: 'hold' });
    expect(result.ok).toBe(true);
    expect(result.summary?.turn).toBe(state.turn);
    expect(result.summary?.actionLine).toBe(result.message);
    expect(result.summary?.nextHints.length).toBeGreaterThan(0);

    const rejected = performAction(state, { kind: 'buy' });
    expect(rejected.ok).toBe(false);
    expect(rejected.summary).toBeUndefined();
  });

  it('TDF 예외 속성을 유효 위험비율에 반영한다', () => {
    expect(effectiveRiskRatio('tdf')).toBe(0);
    expect(effectiveRiskRatio('tdf')).toBeLessThan(0.8);
  });

  it('납입 한도와 세액공제 대상 한도를 분리한다', () => {
    expect(policyRules.annualContributionLimit).toBeGreaterThan(policyRules.annualTaxCreditLimit);
    const result = contributionCredit(policyRules.annualTaxCreditLimit, 1_000_000);
    expect(result.eligible).toBe(0);
    expect(result.benefit).toBe(0);
  });

  it('펀드는 주문 대기, ETF는 즉시 체결한다', () => {
    const state = { ...createGame('orders', 'growth'), irpCash: 20_000_000 };
    const fund = buyProduct(state, 'longBond', 5_000_000);
    const etf = buyProduct(state, 'equityEtf', 5_000_000);
    expect(fund.state.pendingOrders).toHaveLength(1);
    expect(fund.state.holdings.some((item) => item.productId === 'longBond')).toBe(false);
    expect(etf.state.pendingOrders).toHaveLength(0);
    expect(etf.state.holdings.find((item) => item.productId === 'equityEtf')!.amount - state.holdings.find(h => h.productId === 'equityEtf')!.amount).toBe(5_000_000);
    expect(portfolioValue(fund.state)).toBeCloseTo(portfolioValue(state), 2);
  });

  it('교체매매는 위험 한도까지만 매수하고 나머지는 대기자금으로 남긴다', () => {
    let state = startTurn(createGame('switch-cap', 'growth')).state;
    if (state.currentEventId) state = resolveLifeEvent(state, 'cash').state;
    const deposit = state.holdings.find((holding) => holding.productId === 'deposit')?.amount ?? 0;
    const switched = switchProduct(state, 'deposit', 'equityEtf', deposit);
    expect(switched.ok).toBe(true);
    const etf = switched.state.holdings.find((holding) => holding.productId === 'equityEtf')?.amount ?? 0;
    expect(etf).toBeGreaterThan(100000);
    expect(etf - (state.holdings.find(h => h.productId === 'equityEtf')?.amount ?? 0)).toBeLessThan(deposit);
    expect(switched.state.irpCash).toBeGreaterThan(100000);
    expect(riskAssetRatio(switched.state)).toBeLessThanOrEqual(policyRules.riskAssetLimit + 0.00001);
    expect(switched.message).toMatch(/대기자금/);

    const acted = performAction(state, {
      kind: 'switch',
      fromProductId: 'deposit',
      toProductId: 'equityEtf',
      amount: deposit
    });
    expect(acted.ok).toBe(true);
    expect(acted.state.awaitingAction).toBe(false);
  });

  it('위험한도 안에서 살 수 있는 최대 금액을 계산한다', () => {
    const state = {
      ...createGame('cap-math'),
      irpCash: 80_000_000,
      holdings: [{ productId: 'deposit' as const, amount: 20_000_000, principal: 20_000_000, depositTurnsHeld: 4 }]
    };
    const capped = maxBuyWithinRiskLimit(state, 'equityEtf', 80_000_000);
    expect(capped).toBe(70_000_000);
    expect(canBuyRiskAsset(state, 'equityEtf', capped).ok).toBe(true);
    expect(canBuyRiskAsset(state, 'equityEtf', 80_000_000).ok).toBe(false);
    expect(maxBuyWithinRiskLimit(state, 'equityEtf', 50_000_000)).toBe(50_000_000);
    expect(maxBuyWithinRiskLimit(state, 'deposit', 80_000_000)).toBe(80_000_000);
  });

  it('대기자금 매수가 한도를 넘으면 70% 금액을 제안하고 수락 시에만 그 금액만 산다', () => {
    const state = {
      ...createGame('buy-cap-ask', 'growth'),
      awaitingAction: true,
      currentEventId: null,
      irpCash: 80_000_000,
      holdings: [{ productId: 'deposit' as const, amount: 20_000_000, principal: 20_000_000, depositTurnsHeld: 4 }]
    };
    const decision = decideBuyAgainstRiskLimit(state, 'equityEtf', 80_000_000);
    expect(decision.kind).toBe('confirm');
    if (decision.kind !== 'confirm') return;
    expect(decision.capped).toBe(70_000_000);
    expect(decision.leftover).toBe(10_000_000);
    expect(decision.message).toMatch(/한도까지는 70,000,000원/);
    expect(decision.message).toMatch(/거기까지만 매수할까요/);

    const rejected = buyProduct(state, 'equityEtf', decision.requested);
    expect(rejected.ok).toBe(false);
    expect(rejected.state.irpCash).toBe(80_000_000);

    const bought = buyProduct(state, 'equityEtf', decision.capped);
    expect(bought.ok).toBe(true);
    expect(bought.state.irpCash).toBe(10_000_000);
    expect(bought.state.holdings.find((item) => item.productId === 'equityEtf')?.amount).toBe(70_000_000);
    expect(riskAssetRatio(bought.state)).toBeLessThanOrEqual(policyRules.riskAssetLimit + 0.00001);

    const acted = performAction(state, { kind: 'buy', productId: 'equityEtf', amount: decision.capped });
    expect(acted.ok).toBe(true);
    expect(acted.state.awaitingAction).toBe(false);
    expect(acted.state.irpCash).toBeGreaterThanOrEqual(10_000_000);
  });

  it('한도 안 매수와 이미 한도를 넘긴 매수는 확인 없이 처리한다', () => {
    const inside = {
      ...createGame('buy-cap-ok', 'growth'),
      irpCash: 5_000_000,
      holdings: [{ productId: 'deposit' as const, amount: 20_000_000, principal: 20_000_000, depositTurnsHeld: 4 }]
    };
    expect(decideBuyAgainstRiskLimit(inside, 'equityEtf', 5_000_000)).toEqual({ kind: 'execute', amount: 5_000_000 });

    const over = applyMarketStep({
      ...createGame('buy-cap-over', 'growth'),
      holdings: [
        { productId: 'deposit' as const, amount: 30_000_000, principal: 30_000_000, depositTurnsHeld: 0 },
        { productId: 'equityEtf' as const, amount: 70_000_000, principal: 70_000_000, depositTurnsHeld: 0 }
      ]
    }, {
      ...createGame('buy-cap-over', 'growth').lastMarket,
      returns: { ...createGame('buy-cap-over', 'growth').lastMarket.returns, deposit: 0, equityEtf: 0.5 }
    });
    const blocked = decideBuyAgainstRiskLimit({ ...over, irpCash: 5_000_000 }, 'equityEtf', 5_000_000);
    expect(blocked.kind).toBe('reject');
    if (blocked.kind === 'reject') expect(blocked.message).toMatch(/한도|넘/);
  });

  it('펀드 교체 정산도 위험 한도까지만 매수하고 나머지는 대기자금으로 남긴다', () => {
    const base = startTurn(createGame('switch-fund-cap', 'growth')).state;
    const state = {
      ...base,
      awaitingAction: true,
      currentEventId: null,
      irpCash: 0,
      holdings: [
        { productId: 'deposit' as const, amount: 20_000_000, principal: 20_000_000, depositTurnsHeld: 4 },
        { productId: 'shortBond' as const, amount: 50_000_000, principal: 50_000_000, depositTurnsHeld: 0 },
        { productId: 'equityEtf' as const, amount: 30_000_000, principal: 30_000_000, depositTurnsHeld: 0 }
      ]
    };
    const reserved = switchProduct(state, 'shortBond', 'equityEtf', 50_000_000);
    expect(reserved.ok).toBe(true);
    expect(reserved.state.pendingOrders).toHaveLength(1);

    const settled = settleOrders({ ...reserved.state, turn: reserved.state.turn + 2 });
    const etf = settled.holdings.find((holding) => holding.productId === 'equityEtf')?.amount ?? 0;
    expect(etf).toBeGreaterThan(30_000_000);
    expect(etf).toBeLessThan(80_000_000);
    expect(settled.irpCash).toBeGreaterThan(100000);
    expect(riskAssetRatio(settled)).toBeLessThanOrEqual(policyRules.riskAssetLimit + 0.00001);
    expect(settled.logs.some((log) => /대기자금/.test(log.message))).toBe(true);
  });

  it('성향보다 높은 위험등급 상품은 매수·바꾸기를 거절한다', () => {
    expect(canBuyForProfile('balanced', 'equityEtf').ok).toBe(false);
    expect(canBuyForProfile('balanced', 'balanced').ok).toBe(true);
    expect(canBuyForProfile('stable', 'balanced').ok).toBe(false);
    expect(canBuyForProfile('stable', 'shortBond').ok).toBe(true);
    expect(canBuyForProfile('growth', 'equityEtf').ok).toBe(true);

    const cash = { ...createGame('suit-buy', 'balanced'), irpCash: 20_000_000, awaitingAction: true, currentEventId: null };
    const bought = buyProduct(cash, 'equityEtf', 5_000_000);
    expect(bought.ok).toBe(false);
    expect(bought.message).toMatch(/등급|성향/);
    expect(bought.state.holdings.find((item) => item.productId === 'equityEtf')?.amount ?? 0).toBe(0);

    const started = startTurn(createGame('suit-switch', 'balanced')).state;
    const ready = started.currentEventId ? resolveLifeEvent(started, 'cash').state : started;
    const deposit = ready.holdings.find((holding) => holding.productId === 'deposit')?.amount ?? 0;
    const switched = switchProduct(ready, 'deposit', 'equityEtf', deposit);
    expect(switched.ok).toBe(false);
    expect(switched.state.holdings.find((holding) => holding.productId === 'deposit')?.amount).toBeCloseTo(deposit, 0);

    const funded = { ...ready, irpCash: 5_000_000 };
    const acted = performAction(funded, { kind: 'buy', productId: 'equityEtf', amount: 1_000_000 });
    expect(acted.ok).toBe(false);
    expect(acted.message).toMatch(/등급|성향/);
    expect(acted.state.awaitingAction).toBe(true);
  });

  it('리밸런싱은 성향 밖 상품을 담지 않는다', () => {
    const shares = rebalanceShares('stable');
    expect(shares.equityEtf).toBe(0);
    expect(shares.balanced).toBe(0);
    expect(shares.longBond).toBe(0);
    expect(shares.tdf).toBe(0);
    expect(shares.deposit + shares.shortBond).toBeCloseTo(1, 10);
    expect(shares.deposit / shares.shortBond).toBeCloseTo(0.8 / 0.2, 10);

    const before = createGame('rebalance-stable', 'stable');
    const submitted = rebalancePortfolio(before);
    const result = { ...submitted, state: settleAllOrders(submitted.state) };
    expect(result.ok).toBe(true);
    expect(portfolioValue(result.state)).toBeCloseTo(portfolioValue(before), 2);
    expect(result.state.holdings.find((holding) => holding.productId === 'equityEtf')?.amount ?? 0).toBe(0);
    expect(result.state.holdings.find((holding) => holding.productId === 'balanced')?.amount ?? 0).toBe(0);
    expect(result.state.holdings.find((holding) => holding.productId === 'longBond')?.amount ?? 0).toBe(0);
    expect(result.state.holdings.find((holding) => holding.productId === 'deposit')?.amount ?? 0).toBeCloseTo(portfolioValue(before) * shares.deposit, 2);
  });

  it('이자 발생 전 예금 해지는 원금을 보전한다', () => {
    const state = createGame('deposit');
    const sold = sellProduct(state, 'deposit', 8_000_000);
    expect(sold.ok).toBe(true);
    expect(sold.state.irpCash).toBe(8_000_000);
    expect(portfolioValue(sold.state)).toBe(portfolioValue(state));
  });
});

describe('시장, 리밸런싱, 생활사건', () => {
  it('금리 상승 시 장기채가 단기채보다 민감하다', () => {
    expect(rateShockReturn('longBond', 1)).toBeLessThan(rateShockReturn('shortBond', 1));
  });

  it('리밸런싱 후 목표 위험비중에 접근한다', () => {
    const submitted = rebalancePortfolio(createGame('rebalance', 'aggressive'));
    const settled = settleAllOrders(submitted.state);
    const targetRisk = 0.15 + 0.55;
    expect(riskAssetRatio(settled)).toBeCloseTo(targetRisk, 5);
    expect(settled.pendingOrders).toHaveLength(0);
  });

  it('중도인출 가능·불가능 사건을 구분한다', () => {
    const allowed = lifeEvents.find((event) => event.eligibleWithdrawal)!;
    const blocked = lifeEvents.find((event) => !event.eligibleWithdrawal && event.cost > 0)!;
    const a = resolveLifeEvent({ ...createGame('a'), turn: 1, currentEventId: allowed.id }, 'withdraw');
    const b = resolveLifeEvent({ ...createGame('b'), turn: 1, currentEventId: blocked.id }, 'withdraw');
    expect(a.ok).toBe(true);
    expect(b.ok).toBe(false);
  });
});

describe('점수와 저장 복구', () => {
  it('월 연금 목표는 지금 판에 바로 들어가고 범위를 벗어나지 않는다', () => {
    expect(clampGoalMonthly(370_000)).toBe(350_000);
    expect(clampGoalMonthly(800_000)).toBe(700_000);
    const game = createGame('goal-now', 'balanced', 500_000);
    const next = applyGoalToGame(game, 600_000);
    expect(next.goalMonthly).toBe(600_000);
    expect(game.goalMonthly).toBe(500_000);
  });

  it('월 연금과 별 등급을 정확히 계산한다', () => {
    expect(monthlyPension(120_000_000)).toBe(500_000);
    const base = autoplay('stars');
    const rebalanced = rebalancePortfolio({ ...base, profileId: 'balanced', goalMonthly: 400_000 }).state;
    const strong = { ...rebalanced, cash: 10_000_000, maxDrawdown: 0.05, goalMonthly: 400_000 };
    expect(calculateScore(strong).stars).toBe(3);
  });

  it('점수는 유효 범위이고 NaN이 아니다', () => {
    for (let i = 0; i < 50; i += 1) {
      const score = calculateScore(autoplay(`score-${i}`));
      expect(Number.isFinite(score.totalScore)).toBe(true);
      expect(score.totalScore).toBeGreaterThanOrEqual(0);
      expect(score.totalScore).toBeLessThanOrEqual(100);
    }
  });

  it('LocalStorage 데이터가 없거나 손상되어도 복구한다', () => {
    const missing = { getItem: () => null };
    const broken = { getItem: (key: string) => key === STORAGE_KEY ? '{oops' : null };
    expect(loadSave(missing)).toEqual(defaultSave);
    expect(loadSave(broken)).toEqual(defaultSave);
  });

  it('모든 기본 행동이 실제 상태를 바꾼다', () => {
    let state = startTurn(createGame('actions')).state;
    if (state.currentEventId) state = resolveLifeEvent(state, 'cash').state;
    const result = performAction(state, { kind: 'contribute', amount: balanceConfig.contributionAmount });
    expect(result.ok).toBe(true);
    expect(result.state.turn).toBe(1);
    expect(result.state.contributionTotal).toBeGreaterThan(0);
  });

  it('시작 대비 수익률과 납입 제외 운용수익률을 구분한다', () => {
    const score = calculateScore(autoplay('returns'));
    expect(Number.isFinite(score.returnRate)).toBe(true);
    expect(Number.isFinite(score.investmentReturnRate)).toBe(true);
    expect(score.returnRate).toBeGreaterThan(score.investmentReturnRate - 1e-9);
  });

  it('정산마다 IRP 이력을 쌓아 12턴 뒤 길이 13이 된다', () => {
    const start = createGame('history');
    expect(start.irpHistory).toEqual([balanceConfig.startingIrp]);
    const done = autoplay('history');
    expect(done.irpHistory).toHaveLength(13);
    expect(done.irpHistory.at(-1)).toBeCloseTo(calculateScore(done).irpValue, 0);
  });

  it('v2·v3 저장 데이터는 캐릭터·고스트 켬으로 v4가 되고, 끔 설정은 유지한다', () => {
    const v2 = { getItem: () => JSON.stringify({ version: 2, settings: { reducedMotion: false, sound: true }, unlockedCards: [], bestScore: 1, lastSeed: 'x' }) };
    const v3 = { getItem: () => JSON.stringify({ version: 3, settings: { reducedMotion: false, sound: false, characters: false }, unlockedCards: [], bestScore: 1, lastSeed: 'x' }) };
    const v4 = { getItem: () => JSON.stringify({ version: 4, settings: { reducedMotion: false, sound: false, characters: true, ghost: false }, unlockedCards: [], bestScore: 1, lastSeed: 'x' }) };
    expect(loadSave(v2).settings).toEqual({ reducedMotion: false, sound: true, characters: true, ghost: true, speed: 1, autoSettle: false, settleExpanded: false });
    expect(loadSave(v3).settings.characters).toBe(false);
    expect(loadSave(v3).settings.ghost).toBe(true);
    expect(loadSave(v4).settings.ghost).toBe(false);
    expect(loadSave(v4).version).toBe(7);
    expect(defaultSave.settings.sound).toBe(false);
    expect(defaultSave.settings.ghost).toBe(true);
  });

  it('v1 저장 데이터를 v4 기본값으로 복구한다', () => {
    const legacy = {
      getItem: (key: string) => key === STORAGE_KEY
        ? JSON.stringify({ version: 1, settings: { reducedMotion: true, sound: false }, unlockedCards: ['rate-bond'], bestScore: 88, lastSeed: 'abc' })
        : null
    };
    const loaded = loadSave(legacy);
    expect(loaded.version).toBe(7);
    expect(loaded.settings.reducedMotion).toBe(true);
    expect(loaded.settings.characters).toBe(true);
    expect(loaded.settings.ghost).toBe(true);
    expect(loaded.disclaimerAccepted).toBe(false);
    expect(loaded.bestScore).toBe(88);
    expect(loaded.unlockedCards).toEqual(['rate-bond']);
    expect(loaded.playCount).toBe(0);
    expect(loaded.howtoSeen).toBe(false);
    expect(loaded.profileId).toBe('balanced');
    expect(loaded.goalMonthly).toBe(500_000);
  });

  it('저장 데이터의 월 연금 목표를 복구한다', () => {
    const stored = {
      getItem: (key: string) => key === STORAGE_KEY
        ? JSON.stringify({ ...defaultSave, goalMonthly: 600_000 })
        : null
    };
    expect(loadSave(stored).goalMonthly).toBe(600_000);
  });

  it('목표 없는 옛 저장은 기본 50만 원이다', () => {
    const legacy = {
      getItem: (key: string) => key === STORAGE_KEY
        ? JSON.stringify({ version: 1, settings: { reducedMotion: true, sound: false }, unlockedCards: ['rate-bond'], bestScore: 88, lastSeed: 'abc' })
        : null
    };
    expect(loadSave(legacy).goalMonthly).toBe(500_000);
  });

  it('저장 데이터의 투자자성향을 복구한다', () => {
    const stored = {
      getItem: (key: string) => key === STORAGE_KEY
        ? JSON.stringify({ ...defaultSave, profileId: 'stable' })
        : null
    };
    expect(loadSave(stored).profileId).toBe('stable');
  });
});

describe('투자자성향 진단', () => {
  it('보수적 답변 합계 5~7점은 안정형이다', () => {
    expect(profileFromScore(5)).toBe('stable');
    expect(profileFromScore(6)).toBe('stable');
    expect(profileFromScore(7)).toBe('stable');
    expect(profileFromScore(8)).toBe('stableGrowth');
    expect(profileFromScore(11)).toBe('balanced');
  });

  it('진행 중 게임의 성향을 진단 결과로 바로 바꾼다', () => {
    const game = createGame('diag-now', 'balanced');
    const next = applyProfileToGame(game, profileFromScore(5));
    expect(next.profileId).toBe('stable');
    expect(game.profileId).toBe('balanced');
  });
});

describe('시장 진폭과 충격 턴', () => {
  it('템플릿 JSON의 충격 턴은 6턴과 8턴에 있다', () => {
    const shocks = marketScenario.filter((step) => step.shock).map((step) => step.turn);
    expect(shocks).toEqual([6, 8]);
  });

  it('템플릿 JSON 충격 턴의 대표 자산 움직임이 기존보다 크다', () => {
    const hike = marketScenario.find((step) => step.turn === 6)!;
    const vol = marketScenario.find((step) => step.turn === 8)!;
    expect(hike.returns.longBond).toBeLessThan(-0.08);
    expect(vol.returns.equityEtf).toBeLessThan(-0.07);
  });
});

describe('시드 기반 시장 경로', () => {
  it('같은 시드는 같은 12턴 경로를 만든다', () => {
    const a = generateMarketPath('market-same');
    const b = generateMarketPath('market-same');
    expect(a).toEqual(b);
    expect(a).toHaveLength(12);
    expect(a.map((step) => step.turn)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
  });

  it('다른 시드는 다른 경로를 만들고 고정 JSON과 같지 않다', () => {
    const a = generateMarketPath('market-alpha');
    const b = generateMarketPath('market-beta');
    expect(a).not.toEqual(b);
    expect(a).not.toEqual(marketScenario);
  });

  it('충격 턴을 2~3회 두고 모든 상품 수익률을 채운다', () => {
    const path = generateMarketPath('market-shocks');
    const shocks = path.filter((step) => step.shock).map((step) => step.turn);
    expect(shocks.length).toBeGreaterThanOrEqual(2);
    expect(shocks.length).toBeLessThanOrEqual(3);
    expect(new Set(shocks).size).toBe(shocks.length);
    expect(shocks.every((turn) => turn >= 4 && turn <= 11)).toBe(true);
    const clamp = balanceConfig.market.returnClamp;
    for (const step of path) {
      for (const productId of ['deposit', 'shortBond', 'longBond', 'balanced', 'equityEtf', 'tdf'] as const) {
        expect(Number.isFinite(step.returns[productId])).toBe(true);
        expect(step.returns[productId]).toBeGreaterThanOrEqual(-clamp);
        expect(step.returns[productId]).toBeLessThanOrEqual(clamp);
      }
    }
  });

  it('시드가 바뀌면 충격 턴 위치도 달라질 수 있다', () => {
    const pairs = new Set(
      Array.from({ length: 24 }, (_, index) => generateMarketPath(`shock-vary-${index}`)
        .filter((step) => step.shock)
        .map((step) => step.turn)
        .join(','))
    );
    expect(pairs.size).toBeGreaterThan(1);
    expect([...pairs].some((pair) => pair !== '6,8')).toBe(true);
  });

  it('새 게임은 시드 경로를 갖고 시작 전 수익률은 0이다', () => {
    const created = createGame('fresh-market');
    expect(created.marketPath).toEqual(generateMarketPath('fresh-market'));
    expect(created.lastMarket.turn).toBe(0);
    expect(created.lastMarket.returns.equityEtf).toBe(0);
    expect(created.lastMarket.returns.deposit).toBe(0);
  });

  it('충격 턴은 카탈로그의 국면 이름과 같은 방향의 움직임을 갖는다', () => {
    for (let index = 0; index < 20; index += 1) {
      const shocks = generateMarketPath(`shock-copy-${index}`).filter((step) => step.shock);
      expect(shocks.length).toBeGreaterThanOrEqual(2);
      for (const step of shocks) {
        const shock = marketShocks.find((item) => item.id === step.shockId)!;
        expect(shock).toBeDefined();
        expect(step.phase).toBe(shock.phase);
        const text = `${step.headline} ${step.reason} ${step.signal}`;
        if (shock.id === 'rate-bigstep') {
          expect(step.returns.longBond).toBeLessThanOrEqual(-0.09);
          expect(step.returns.longBond).toBeLessThan(step.returns.shortBond);
          expect(text).toMatch(/장기채|금리/);
        }
        if (shock.id === 'equity-crash') {
          expect(step.returns.equityEtf).toBeLessThanOrEqual(-0.09);
          expect(text).toMatch(/주식|변동/);
          expect(step.phase).toBe('위험자산 충격');
        }
        if (shock.positive) {
          const best = Math.max(...Object.values(step.returns));
          expect(best).toBeGreaterThanOrEqual(0.05);
        }
      }
    }
  });

  it('턴 시작과 정산은 고정 JSON이 아니라 시드 경로를 읽는다', () => {
    const created = createGame('path-read');
    const started = startTurn(created);
    expect(started.state.lastMarket).toEqual(created.marketPath[0]);
    let state = started.state;
    if (state.currentEventId) state = resolveLifeEvent(state, 'cash').state;
    const held = performAction(state, { kind: 'hold' });
    expect(held.ok).toBe(true);
    expect(held.state.lastMarket.returns).toEqual(created.marketPath[0].returns);
  });
});

describe('생활자금 부족 시 IRP 보호', () => {
  it('보유 형태와 무관하게 비허용 사건은 생활자금·미지급 비용으로 처리한다', () => {
    for (const productId of ['deposit', 'balanced', 'equityEtf'] as const) {
      const state = { ...createGame('life-cover'), cash: 1_000_000, irpCash: 4_000_000, currentEventId: 'moving',
        holdings: [{ productId, amount: 8_000_000, principal: 8_000_000, depositTurnsHeld: 0 }] };
      const out = resolveLifeEvent(state, 'cash');
      expect(out.ok).toBe(true);
      expect(out.state.cash).toBe(0);
      expect(out.state.livingDebt).toBe(1_500_000);
      expect(out.state.cashShortages).toBe(1);
      expect(out.state.holdings).toEqual(state.holdings);
      expect(out.state.irpCash).toBe(state.irpCash);
      expect(out.state.pendingOrders).toEqual(state.pendingOrders);
    }
  });
});
