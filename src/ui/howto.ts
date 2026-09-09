import type { GameState } from '../types';
import { renderSpeech } from './speech';

export function shouldShowHowTo(howtoSeen: boolean): boolean {
  return !howtoSeen;
}

export function shouldShowLearningTip(state: GameState, tipDismissed: boolean, waitingForDice: boolean): boolean {
  return !tipDismissed && state.turn >= 1 && !waitingForDice;
}

export function buyNeedsContribution(irpCash: number): boolean {
  return irpCash < 100000;
}

export function renderHowToModal(characters = true): string {
  return `<p class="eyebrow">처음 한 번만 보여 줍니다</p>
    <h2>한 턴은 이렇게 진행됩니다</h2>
    ${renderSpeech('coach', '<p>저는 코치예요. 정산마다 한 줄 정리와 다음 판단을 말풍선으로 알려 드릴게요. 보드 위의 동물이 바로 당신의 말이고, 충격 턴엔 긴장한 표정이 됩니다.</p>', { characters })}
    <ol class="howto-steps">
      <li><b>1</b><div><strong>주사위 굴리기</strong><p>나온 숫자만큼 말이 이동합니다.</p></div></li>
      <li><b>2</b><div><strong>시장이 먼저 움직입니다</strong><p>속보의 수익률은 이미 잔고에 반영된 뒤입니다. 지금 고르는 행동은 다음 턴 흐름에 거는 것입니다.</p></div></li>
      <li><b>3</b><div><strong>먼저 납입, 그다음 매수</strong><p>시작할 때 대기자금은 0원입니다. 사려면 먼저 납입하세요. 주식 ETF는 적극투자형·공격투자형 진단 뒤에만 살 수 있습니다. 납입의 세액공제는 연말정산 칸을 지날 때 생활자금으로 돌아옵니다.</p></div></li>
      <li><b>4</b><div><strong>정산 한 번</strong><p>행동을 고르면 정산 요약이 열립니다. 한 턴에 운용은 한 번, 운용지시 칸에 서면 두 번입니다.</p></div></li>
    </ol>
    <p>12턴 동안 목표 월 연금에 도전합니다. 도착한 칸마다 작은 효과가 하나씩 있고, "그대로 둔 나"(고스트)와 나란히 비교됩니다. 오른쪽 위 성향 이름을 확인하고, 성향 허용 범위보다 위험이 큰 상품은 살 수 없습니다. 이 안내는 설정에서 다시 볼 수 있습니다.</p>
    <button class="primary jumbo" data-action="dismiss-howto">알겠어요</button>`;
}

export function renderSettingsHowToButton(): string {
  return `<button class="secondary" data-action="open-howto">게임 방법 다시 보기</button>`;
}
