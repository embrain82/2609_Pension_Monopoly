import type { GameState } from '../types';
import { renderQuickGuide } from './quick-guide';

export function shouldShowHowTo(howtoSeen: boolean): boolean {
  return !howtoSeen;
}

export function shouldShowLearningTip(state: GameState, tipDismissed: boolean, waitingForDice: boolean): boolean {
  return !tipDismissed && state.turn >= 1 && !waitingForDice;
}

export function buyNeedsContribution(irpCash: number): boolean {
  return irpCash < 100000;
}

export function renderHowToModal(automatic = false): string {
  return `<p class="eyebrow">30초 그림 안내 · 언제든 다시 보기</p>
    <h2>한 판은 이렇게 진행돼요</h2>${renderQuickGuide()}
    <button class="primary jumbo" data-action="dismiss-howto">알겠어요 · 돌아가기</button>
    <details class="quick-guide-more" data-preserve-open><summary>자금·상품·만기 규칙 더 알아보기</summary>
    <ol class="howto-steps">
      <li><b>1</b><div><strong>주사위 굴리기</strong><p>두 주사위의 합만큼 자동으로 이동합니다. 도착한 칸의 효과를 확인하세요.</p></div></li>
      <li><b>2</b><div><strong>시장이 먼저 움직입니다</strong><p>속보의 「내 보유분에 실제 반영」에서 원화 변화를 보세요. 상품별 시장 예시는 내 수익과 다릅니다. 지금 주문은 이후 시장부터 영향을 받습니다.</p></div></li>
      <li><b>3</b><div><strong>먼저 납입, 그다음 매수</strong><p>시작할 때 대기자금은 0원입니다. 새 게임의 개인 추가납입은 보너스와 합산해 턴당 200만원까지입니다(게임 진행용 한도). 납입하거나 기존 상품을 매도·교체해 운용할 수 있습니다. 주식 ETF는 적극투자형·공격투자형 진단 뒤에만 살 수 있습니다. 납입의 세액공제는 연말정산 칸을 지날 때 생활자금으로 돌아옵니다.</p></div></li>
      <li><b>4</b><div><strong>정산 한 번</strong><p>거래를 실행하면 정산 요약이 열립니다. 확인만 하려면 운용 창 맨 아래 「포트폴리오 확인」, 나가려면 오른쪽 위 ×를 누르세요. 한 턴에 운용은 한 번, 운용지시 칸에 서면 두 번입니다.</p></div></li>
    </ol>
    <p>12턴 동안 선택한 미션에 도전합니다. 도착한 칸마다 작은 효과가 하나씩 있고, 같은 입출금의 기준 지수와 성과를 비교합니다. 고스트는 생활 선택·납입까지 다른 보조 경로입니다. 오른쪽 위 성향 이름을 확인하고, 성향 허용 범위보다 위험이 큰 상품은 살 수 없습니다. 이 안내는 설정에서 다시 볼 수 있습니다.</p>
    ${automatic ? '<p>예금 만기자금은 다음 턴 통지, 통지가 표시된 다음 턴 자동주문으로 이어집니다. 기다리는 동안 직접 운용할 수 있습니다. 실제 제도의 4주·통지 후 2주 절차를 게임 단계로 압축했으며, 모든 현금이 자동운용 대상은 아닙니다.</p>' : ''}
    </details>`;
}

export function renderSettingsHowToButton(): string {
  return `<button class="secondary" data-action="open-howto">게임 방법 다시 보기</button>`;
}
