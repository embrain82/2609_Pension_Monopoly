import { brandIcon, operationIcon } from './design-system';

/** Short, replayable explanation. It never reads or changes the game engine. */
export function renderQuickGuide(): string {
  const steps = [
    [brandIcon(), '주사위 굴리기', '두 주사위의 합만큼 이동해요. 도착한 칸을 확인해요.'],
    [operationIcon('rebalance'), '시장 확인하기', '금리·주가 변화가 내 보유상품에 먼저 반영돼요.'],
    [operationIcon('switch'), '행동 고르기', '돈을 넣거나 상품을 사고팔아요. 그대로 두어도 돼요.'],
    [operationIcon('default'), '결과 확인하기', '돈이 바뀐 이유를 보고 다음 턴을 준비해요.']
  ];
  return `<div class="quick-guide">
    <p class="quick-guide-goal">12턴 동안 이번 판의 목표에 도전해요.<br>생활자금과 감당할 수 있는 변동도 함께 챙겨요.</p>
    <ol class="quick-guide-cuts" aria-label="한 턴의 네 단계">${steps.map(([icon, title, copy], i) => `<li><span class="quick-guide-picture" aria-hidden="true">${icon}<b>${i + 1}</b></span><strong>${title}</strong><p>${copy}</p></li>`).join('')}</ol>
    <p class="quick-guide-arrival"><strong>도착한 칸의 상품을 꼭 살 필요는 없어요.</strong><br>다른 상품을 살펴보거나 이번 턴은 그대로 둘 수 있어요.</p>
    <ul class="quick-guide-rules"><li>보통 <b>행동 1회</b> · 운용지시 칸은 <b>2회</b></li><li>조회·취소는 <b>행동 0회</b></li><li>그대로 두어도 기존 주문·자동운용 대기는 이어져요.</li></ul>
  </div>`;
}
