import { writeFileSync, readFileSync } from 'node:fs';
import { createGame } from '../../../src/engine/game-engine';
import { resolveLifeChoice } from '../../../src/engine/life-engine';
import { renderLifeModal } from '../../../src/ui/life-view';
import { portfolioValue } from '../../../src/engine/portfolio-engine';
import { lifeEvents, learningCards } from '../../../src/data/content';
const dir = new URL('./',import.meta.url);
const state = {...createGame('review-boundary', 'balanced',500000,{ghost:false,scenario:'classic',mission:'pension',defaultTrading:true,contributionPacing:true}),turn:6,cash:1_000_000,currentEventId:'moving',actionsLeft:1};
const event = lifeEvents.find(e=>e.id==='moving')!;
const markup = renderLifeModal(state,event,{cash:state.cash});
const resolution = resolveLifeChoice(state,'cash');
const evidence = {
  kind:'controlled-boundary-fixture', description:'Natural runs A/B did not encounter cash shortage; this is an isolated renderer/engine boundary check, not a third completed playthrough.',
  input:{cash:state.cash,event:event.id,cost:event.cost},
  uiClaimsAutomaticSale:markup.includes('자동 매도해 냅니다'),
  actual:{ok:resolution.ok,cash:resolution.state.cash,livingDebt:resolution.state.livingDebt,irpBefore:portfolioValue(state),irpAfter:portfolioValue(resolution.state),message:resolution.state.lifeResolution?.message},
  quizCount:learningCards.length,
  genericHomepageSources:learningCards.filter(c=>c.source_url==='https://www.fss.or.kr').map(c=>c.id)
};
writeFileSync(new URL('boundary-evidence.json',dir),JSON.stringify(evidence,null,2));
const css = readFileSync(new URL('../../../src/styles/main.css',dir),'utf8');
writeFileSync(new URL('boundary-fixture.html',dir),`<!doctype html><html lang="ko"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>경계조건 검증 · 생활자금 부족</title><style>${css}</style><body><div class="modal-backdrop"><section class="modal-sheet modal-life" role="dialog"><p style="padding:12px;background:#f9e9c5;color:#3c291a">검증용 고정 상태 · 생활자금 100만원 / 이사비 250만원<br>실제 완료 플레이 A·B와 구분한 경계조건 화면입니다.</p>${markup}</section></div></body></html>`);
console.log(JSON.stringify(evidence,null,2));
