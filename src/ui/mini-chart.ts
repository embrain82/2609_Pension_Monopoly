import { formatWon as exactWon, signedWon } from './format';
export interface ChangeRow { label: string; value: number; kind: 'market' | 'flow' | 'trade'; }
/** 대칭 0축. 작은 금액을 최소 1천원 축으로 표시해 한두 원을 큰 수익처럼 그리지 않는다. */
export function changeDomain(values: number[]): number {
  const max = Math.max(1000, ...values.map(Math.abs));
  const power = 10 ** Math.floor(Math.log10(max));
  return [1,2,5,10].map(n=>n*power).find(n=>n>=max)!;
}
export function changeGeometry(value: number, domain: number): {x:number; width:number} {
  const width = Math.min(140, Math.abs(value) / domain * 140);
  return { x: value < 0 ? 160 - width : 160, width };
}
const escape = (s:string) => s.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
export function renderChangeChart(rows: ChangeRow[], label: string): string {
  const domain = changeDomain(rows.map(r=>r.value));
  return `<figure class="change-chart"><figcaption>${escape(label)}</figcaption><p class="chart-axis">← 감소 <span>0원 기준</span> 증가 →<small>좌우 끝 각각 ${exactWon(domain)} · 같은 금액 축</small></p><ul>${rows.map(row=>{
    const g=changeGeometry(row.value,domain);
    return `<li class="change-row ${row.kind}"><div><span>${escape(row.label)}</span><b>${signedWon(row.value)}</b></div><svg viewBox="0 0 320 24" preserveAspectRatio="none" aria-hidden="true"><path class="chart-track" d="M20 12H300"/><rect x="${g.x}" y="6" width="${g.width}" height="12" rx="2"/><path class="zero-line" d="M160 1V23"/>${row.value===0?'<circle cx="160" cy="12" r="3"/>':''}</svg></li>`;
  }).join('')}</ul></figure>`;
}
