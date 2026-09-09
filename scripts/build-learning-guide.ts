import {writeFileSync} from 'node:fs';
import {learningCards} from '../src/data/content';
const esc=(s:string)=>s.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
const body=learningCards.map(c=>`<article id="${esc(c.id)}"><h2>${esc(c.title)}</h2><p><b>학습목표</b> ${esc(c.learningObjective??c.key)}</p><p>${esc(c.detail)}</p><p><b>게임 가정</b> ${esc(c.gameAssumption??'')}</p><p>관련 행동: ${esc(c.relatedActions?.join(', ')||'칸·마무리 학습')}</p><details><summary>${esc(c.quiz.q)}</summary><ol>${c.quiz.options.map(o=>`<li>${esc(o)}</li>`).join('')}</ol><p>정답 ${c.quiz.answer+1}: ${esc(c.quiz.why)}</p></details><p><a href="${esc(c.source_url)}" target="_blank" rel="noreferrer">출처</a> · 검수 ${esc(c.reviewed_at)}</p></article>`).join('');
writeFileSync('public/learning-guide.html',`<!doctype html><html lang="ko"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>연금로드 학습 명세</title><style>body{max-width:900px;margin:auto;padding:24px;background:#f5f4ed;color:#173f3b;font:17px/1.8 system-ui}article{background:white;border:1px solid #cdd9ce;border-radius:16px;padding:24px;margin:20px 0}a{color:#17685d}summary{cursor:pointer;font-weight:bold}h1{line-height:1.3}</style><a href="./">게임으로</a><h1>연금로드 학습 명세 · 25문항</h1><p>게임 카드 데이터에서 생성한 학습목표·문항·해설입니다. 실제 금융상품 안내와 게임 가정을 구분하세요. 일반 금융 원리의 근거와 한국 퇴직연금 제도 출처는 서로 대체하지 않습니다.</p><p>운영자는 게임 전후에 금리/매도와 인출/물가/기준가와 결제/DB·DC·IRP의 다섯 개념을 질문하고, 게임 후에는 수치를 바꾼 동형 질문으로 확인하세요. 참가자 코드·사전 정답 수·사후 정답 수·1주 후 정답 수만 별도 기록합니다. 이해도 개선은 실제 참가자 검증 전까지 미확정입니다.</p>${body}</html>`);

// 두 매뉴얼의 현재 버전 안내도 같은 원본에서 갱신한다.
import {readFileSync} from 'node:fs';
import {SCENARIOS,MISSIONS} from '../src/engine/scenario-engine';
const guide=`<section id="step-d"><h2>현재 버전 v1.4.0 · D 스텝</h2>
<p>이 안내는 아래의 이전 버전 설명보다 우선합니다. 이미 저장된 C판은 기존 규칙으로 끝내며 새 게임부터 D 규칙을 적용합니다.</p>
<h3>1분 시작</h3><ol><li>타이틀 「이번 판 설정」에서 시장과 미션을 고릅니다. 기본값으로 바로 시작해도 됩니다.</li><li>주사위 합으로 자동 이동한 뒤 시장과 자산을 보고 운용합니다. X로 닫거나 포트폴리오를 확인해도 행동이 소모되지 않습니다.</li><li>정산의 「방금 선택과 연결된 한 문제」는 선택 사항입니다. 12턴 뒤 미션 결과와 복기를 확인합니다.</li></ol>
<p>시장: ${Object.values(SCENARIOS).map(s=>s.name).join(' / ')}. 미션: ${Object.values(MISSIONS).map(m=>m.name+' ('+m.description+')').join(' / ')}.</p>
<p>미션·성향·월 연금 목표는 시작 후 고정합니다. 주간 도전은 기본 시장·연금 미션·위험중립형·월 50만원입니다. 캐릭터 외형은 변경할 수 있습니다.</p>
<h3>시간·시장·상품</h3><p>1턴은 물가와 생애주기 계산상 가상 3개월, 총 3년입니다. 연율 물가를 분기 지수로 환산해 누적하고 생활비 사건을 조정합니다. 납입·공제한도는 한 판 합산이며 보드 한 바퀴는 실제 과세연도가 아닙니다. 수익률·상품 보수는 턴당 교육용 값입니다.</p>
<p>보유 예금은 가입 건별 고정 약정을 유지합니다. TDF 2029는 주식 비중이 45%에서 25%로 낮아지고 그 차이가 채권으로 이동합니다. 실제 TDF는 상품마다 구성이 다르고 원금을 보장하지 않습니다. 전망대는 현재 국면에서 만든 가상 20경로의 표본 범위로 실제 미래 확률을 보장하지 않습니다.</p>
<h3>결과 읽기</h3><p>미션 달성 1별, 생활 완충과 미지급 생활비 0원까지 2별, 성향 낙폭 예산까지 3별입니다. 고정 비중 복제나 거래 횟수가 별 조건은 아닙니다. 지식 점수는 기본 4+정답당 2(최대 16)-위반 감점입니다.</p>
<p>자산 증가율에는 납입·이전·인출이 포함됩니다. 운용지수는 시장 수익을 연결하고 매매 영향을 보정한 게임 지표이며 정밀 TWR은 아닙니다. 오늘 가치의 월 연금은 세후 평균을 누적 물가로 나눈 값입니다. 수령 중 미래 물가는 포함하지 않습니다.</p>
<p>「같은 순입출금 기준」은 시작 상품 비중을 매 턴 복원하는 가상 지수입니다. 상품 보수는 반영하지만 실제 주문의 결제·거래비용·예금 약정은 재현하지 않습니다. 「그대로 둔 나」는 생활 선택·납입까지 다른 전체 경로 비교입니다.</p>
<h3>복기와 운영</h3><p>3턴씩 4장의 흐름과 12턴 시장 손익·입출금·매매 영향·보유를 복기합니다. 3·6·9턴 끝에서 분기 연습할 수 있으며, 미래를 본 연습 결과는 최고 기록·컬렉션·업적에 반영하지 않습니다. 「복기 기록 다운로드」로 시나리오·시드·성향·미션·퀴즈가 담긴 JSON을 보관할 수 있습니다. 외부 전송은 없습니다.</p>
<p>오류 재현: 버전·시드·시나리오·성향·미션·문제 턴·선택 순서를 기록하세요. 중단 시 새로고침 후 「이어서 플레이」, 결과는 JSON으로 보관합니다. 브라우저 저장을 삭제하면 진행 기록도 사라집니다. 이전 C 저장 호환을 위해 키 pension-road-play-c1과 형식 c2를 유지하며 D campaign 정보를 추가합니다.</p>
<p>학습 목표·출처·게임 가정·25문항은 <a href="./learning-guide.html">공통 학습 명세</a>에서 확인합니다. 운영자는 사전/사후 동형 5문항과 1주 후 재검사를 통해 이해도를 확인하세요. 실제 초보자 시험 결과는 아직 없습니다. 디폴트옵션 거래 재설계는 별도 보류 상태입니다.</p></section>`;
for(const file of ['public/user-manual.html','public/operator-manual.html']) {
  let html=readFileSync(file,'utf8');
  html=html.replace(/<section id="step-d">[\s\S]*?<\/section>/,'');
  html=html.replace('<body>','<body>').replace('</body>',guide+'</body>');
  if(!html.includes('현재 안내: D')) html=html.replace('<body>','<body><p style="padding:16px;background:#eaf0e8">현재 안내: D · <a href="#step-d">v1.4.0 새 규칙·시나리오·미션·복기</a> · <a href="./learning-guide.html">공통 학습 명세 25문항</a></p>');
  writeFileSync(file,html);
}
