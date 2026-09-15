import type { TileBriefing } from '../types';

export const BRIEFING_LEAD_MAX = 80;

/** 본문의 첫 문장(들)만 80자 안에서 잘라 앞세운다. 나머지는 접힌 상태로 둔다. */
export function briefingLead(body: string): { lead: string; rest: string } {
  const sentences = body.match(/[^.!?。]+[.!?。]?\s*/g)?.map((item) => item.trim()).filter(Boolean) ?? [body];
  let lead = '';
  let index = 0;
  while (index < sentences.length) {
    const candidate = lead ? `${lead} ${sentences[index]}` : sentences[index];
    if (lead && candidate.length > BRIEFING_LEAD_MAX) break;
    lead = candidate;
    index += 1;
  }
  return { lead, rest: sentences.slice(index).join(' ') };
}

export function renderTileBriefing(briefing: TileBriefing, tileLabel: string, tileNumber: number): string {
  const { lead, rest } = briefingLead(briefing.body);
  const more = rest
    ? `<details class="tile-briefing-more"><summary>자세히</summary><p>${rest}</p></details>`
    : '';
  return `<p class="eyebrow">${String(tileNumber).padStart(2, '0')} · ${tileLabel}</p>
    <h2>${briefing.title}</h2>
    <p class="tile-briefing-body">${lead}</p>
    ${more}
    <p class="hint">이 화면은 설명만 보여 줍니다. 확인만으로 행동 횟수가 줄지 않아요. 남은 운용 횟수는 운용 메뉴에서 확인하세요.</p>
    <button class="primary jumbo" data-action="dismiss-tile">확인</button>`;
}
