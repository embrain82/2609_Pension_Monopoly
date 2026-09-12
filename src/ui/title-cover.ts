import { boardPosition } from './board';
import { AVATAR_ANIMALS, avatarBody } from './avatars';
import type { ProfileId } from '../types';
/** 기존 24칸 좌표와 동물 SVG를 재사용한 정적 표지. 게임 상태나 RNG를 생성하지 않는다. */
export function renderTitleCover(avatar: ProfileId, characters: boolean): string {
  const colors = ['#deead6','#dce9ef','#f7e1d8','#eee3c9'];
  return `<div class="title-cover"><svg viewBox="0 0 360 244" role="img" aria-label="네 지역을 잇는 24칸 보드와 ${characters ? AVATAR_ANIMALS[avatar] : '나'} 말 · 12턴의 은퇴설계">
    <rect x="54" y="6" width="252" height="232" rx="24" fill="#e5eadf"/>
    <g transform="translate(68 10) scale(.32)"><rect width="700" height="700" rx="28" fill="#fffdf4" stroke="#b8cac1" stroke-width="3"/>
    ${Array.from({length:24},(_,i)=>{const p=boardPosition(i);return `<rect x="${p.x+5}" y="${p.y+5}" width="90" height="90" rx="14" fill="${colors[Math.floor(i/6)]}" stroke="#54776d" stroke-width="2"/>`;}).join('')}
    <path d="M160 530H490l-25 -22m25 22l-25 22" fill="none" stroke="#88a598" stroke-width="8" stroke-linecap="round"/>
    </g><ellipse cx="180" cy="142" rx="42" ry="9" fill="#b8cac1"/>
    ${characters ? `<svg x="134" y="54" width="92" height="92" viewBox="0 0 100 100">${avatarBody(avatar,'calm')}</svg>` : '<circle cx="180" cy="105" r="30" fill="#205b54"/><text x="180" y="115" fill="white" text-anchor="middle" font-size="28">나</text>'}
    <text x="180" y="176" text-anchor="middle" fill="#205b54" font-size="16" font-weight="800">12번의 선택으로 은퇴설계</text>
    <g transform="translate(34 163) rotate(-12)"><rect width="43" height="43" rx="9" fill="white" stroke="#205b54" stroke-width="2"/><g fill="#205b54"><circle cx="12" cy="12" r="3"/><circle cx="31" cy="31" r="3"/><circle cx="21.5" cy="21.5" r="3"/></g></g>
    <g transform="translate(286 40) rotate(10)"><rect width="43" height="43" rx="9" fill="white" stroke="#205b54" stroke-width="2"/><g fill="#205b54">${[12,31].flatMap(x=>[12,31].map(y=>`<circle cx="${x}" cy="${y}" r="3"/>`)).join('')}</g></g>
    </svg></div>`;
}
