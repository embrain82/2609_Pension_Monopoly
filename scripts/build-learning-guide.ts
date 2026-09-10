import {writeFileSync} from 'node:fs';
import {learningCards} from '../src/data/content';
const esc=(s:string)=>s.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
const body=learningCards.map(c=>`<article id="${esc(c.id)}"><h2>${esc(c.title)}</h2><p><b>학습목표</b> ${esc(c.learningObjective??c.key)}</p><p>${esc(c.detail)}</p><p><b>게임 가정</b> ${esc(c.gameAssumption??'')}</p><p>관련 행동: ${esc(c.relatedActions?.join(', ')||'칸·마무리 학습')}</p><details><summary>${esc(c.quiz.q)}</summary><ol>${c.quiz.options.map(o=>`<li>${esc(o)}</li>`).join('')}</ol><p>정답 ${c.quiz.answer+1}: ${esc(c.quiz.why)}</p></details><p><a href="${esc(c.source_url)}" target="_blank" rel="noreferrer">출처</a> · 검수 ${esc(c.reviewed_at)}</p></article>`).join('');
writeFileSync('public/learning-guide.html',`<!doctype html><html lang="ko"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>연금로드 학습 명세</title><style>body{max-width:900px;margin:auto;padding:24px;background:#f5f4ed;color:#173f3b;font:17px/1.8 system-ui}article{background:white;border:1px solid #cdd9ce;border-radius:16px;padding:24px;margin:20px 0}a{color:#17685d}summary{cursor:pointer;font-weight:bold}h1{line-height:1.3}</style><a href="./">게임으로</a><h1>연금로드 학습 명세 · 25문항</h1><p>게임 카드 데이터에서 생성한 학습목표·문항·해설입니다. 실제 금융상품 안내와 게임 가정을 구분하세요. 일반 금융 원리의 근거와 한국 퇴직연금 제도 출처는 서로 대체하지 않습니다.</p><p>운영자는 게임 전후에 금리/매도와 인출/물가/기준가와 결제/DB·DC·IRP의 다섯 개념을 질문하고, 게임 후에는 수치를 바꾼 동형 질문으로 확인하세요. 참가자 코드·사전 정답 수·사후 정답 수·1주 후 정답 수만 별도 기록합니다. 이해도 개선은 실제 참가자 검증 전까지 미확정입니다.</p>${body}</html>`);

// 두 매뉴얼의 현재 버전 안내도 같은 원본에서 갱신한다.
import {readFileSync} from 'node:fs';
import {SCENARIOS,MISSIONS} from '../src/engine/scenario-engine';
const guide=`<section id="step-d"><h2>시나리오·미션·복기 공통 규칙</h2>
<p>시나리오·미션·복기 규칙은 v1.5에도 유지합니다. 디폴트옵션과 진행 저장은 위의 v1.5 안내를 따릅니다.</p>
<h3>1분 시작</h3><ol><li>타이틀 「이번 판 설정」에서 시장과 미션을 고릅니다. 기본값으로 바로 시작해도 됩니다.</li><li>주사위 합으로 자동 이동한 뒤 시장과 자산을 보고 운용합니다. X로 닫거나 포트폴리오를 확인해도 행동이 소모되지 않습니다.</li><li>정산의 「방금 선택과 연결된 한 문제」는 선택 사항입니다. 12턴 뒤 미션 결과와 복기를 확인합니다.</li></ol>
<p>시장: ${Object.values(SCENARIOS).map(s=>s.name).join(' / ')}. 미션: ${Object.values(MISSIONS).map(m=>m.name+' ('+m.description+')').join(' / ')}.</p>
<p>미션·성향·월 연금 목표는 시작 후 고정합니다. 주간 도전은 기본 시장·연금 미션·위험중립형·월 50만원입니다. 캐릭터 외형은 변경할 수 있습니다.</p>
<h3>시간·시장·상품</h3><p>1턴은 물가와 생애주기 계산상 가상 3개월, 총 3년입니다. 연율 물가를 분기 지수로 환산해 누적하고 생활비 사건을 조정합니다. 납입·공제한도는 한 판 합산이며 보드 한 바퀴는 실제 과세연도가 아닙니다. 수익률·상품 보수는 턴당 교육용 값입니다.</p>
<p>보유 예금은 가입 건별 고정 약정을 유지합니다. TDF 2029는 주식 비중이 45%에서 25%로 낮아지고 그 차이가 채권으로 이동합니다. 실제 TDF는 상품마다 구성이 다르고 원금을 보장하지 않습니다. 전망대는 현재 국면에서 만든 가상 20경로의 표본 범위로 실제 미래 확률을 보장하지 않습니다.</p>
<h3>결과 읽기</h3><p>미션 달성 1별, 생활 완충과 미지급 생활비 0원까지 2별, 성향 낙폭 예산까지 3별입니다. 고정 비중 복제나 거래 횟수가 별 조건은 아닙니다. 지식 점수는 기본 4+정답당 2(최대 16)-위반 감점입니다.</p>
<p>자산 증가율에는 납입·이전·인출이 포함됩니다. 운용지수는 시장 수익을 연결하고 매매 영향을 보정한 게임 지표이며 정밀 TWR은 아닙니다. 오늘 가치의 월 연금은 세후 평균을 누적 물가로 나눈 값입니다. 수령 중 미래 물가는 포함하지 않습니다.</p>
<p>「같은 순입출금 기준」은 시작 상품 비중을 매 턴 복원하는 가상 지수입니다. 상품 보수는 반영하지만 실제 주문의 결제·거래비용·예금 약정은 재현하지 않습니다. 「그대로 둔 나」는 생활 선택·납입까지 다른 전체 경로 비교입니다.</p>
<h3>복기와 운영</h3><p>3턴씩 4장의 흐름과 12턴 시장 손익·입출금·매매 영향·보유를 복기합니다. 3·6·9턴 끝에서 분기 연습할 수 있으며, 미래를 본 연습 결과는 최고 기록·컬렉션·업적에 반영하지 않습니다. 「복기 기록 다운로드」로 시나리오·시드·성향·미션·퀴즈가 담긴 JSON을 보관할 수 있습니다. 외부 전송은 없습니다.</p>
<p>오류 재현: 버전·시드·시나리오·성향·미션·문제 턴·선택 순서를 기록하세요. 중단 시 새로고침 후 「이어서 플레이」, 결과는 JSON으로 보관합니다. 브라우저 저장을 삭제하면 진행 기록도 사라집니다. 진행 저장 키는 pension-road-play-c1입니다. 새 판은 c3이며 기존 c1/c2 판은 당시 규칙으로 복원합니다.</p>
<p>학습 목표·출처·게임 가정·25문항은 <a href="./learning-guide.html">공통 학습 명세</a>에서 확인합니다. 운영자는 사전/사후 동형 5문항과 1주 후 재검사를 통해 이해도를 확인하세요. 실제 초보자 시험 결과는 아직 없습니다. 디폴트옵션 직접매매는 위의 v1.5 안내를 따릅니다.</p></section>`;
import {DEFAULT_PORTFOLIOS,DEFAULT_PORTFOLIO_REVIEW} from '../src/data/default-portfolios';
const tradeGuide=`<section id="step-e"><h1>연금로드 v1.5.0 · 디폴트옵션 직접매매</h1><p><a href="./">게임으로</a> · <a href="./learning-guide.html">공통 학습 명세 25문항</a></p>
<p>기존 카드형 운용 메뉴 6개를 유지하고 「디폴트옵션 옵트인/아웃」 하나를 추가했습니다. 그 안에서 직접 매수와 직접 운용 전환을 선택합니다.</p>
<h2>직접 매수 · 옵트인</h2><p>IRP 대기자금으로 선택한 가상 옵션을 매수합니다. 절반·전액·직접 금액을 입력하고 구성과 결제 일정을 확인한 뒤 확정합니다. 묶음 최소 10만원이며 소액도 명시 비중으로 나눕니다. 생활자금·미결제 환매대금은 사용하지 않습니다. 보유 중이면 같은 옵션만 추가 매수할 수 있습니다.</p>
<h2>직접 운용 전환 · 옵트아웃</h2><p>옵션 보유분의 50% 또는 전부를 비율 환매합니다. 직접 매수한 같은 상품은 유지합니다. 대금은 결제 후 IRP 대기자금에 남으며 계좌 밖 인출이 아닙니다. 사전지정값도 유지합니다. 다른 옵션은 전부 환매·결제한 뒤 새로 매수합니다.</p>
<h2>확정·닫기·결제</h2><p>접수 성공 시 구성품 수와 무관하게 행동 1회 사용. X/Esc·포트폴리오 왕복·실패는 0회입니다. 「이번엔 그대로」는 새 주문 없이 남은 행동을 마감합니다. 사전지정만으로 매수되지 않습니다.</p><p>예금은 이번 턴 반영, 펀드는 접수 t → 가격확정 t+1 → 결제 t+2입니다. 게임 시간이며 실제 영업일과 다릅니다. 옵션 주문이나 리밸런싱이 진행 중이면 새 지시가 제한됩니다. 12턴 마지막 주문은 추가 시장·급여 없이 결제만 마칩니다. 예금 중도해지는 발생 이자의 일부를 조정하는 가상 약정입니다.</p>
<h2>운용 출처와 가상 상품</h2><p>일반 매도·교체·리밸런싱은 직접 운용분 대상입니다. 전체 IRP 비중은 포트폴리오에서 함께 봅니다. 생활사건도 옵션 혼합 예금만 따로 청산하지 않으며, 결제 자금이 부족하면 생활비 분할 지급을 이용합니다. 예금 100% 옵션은 즉시 현금화 가능한 자산으로 취급합니다.</p><ul>${DEFAULT_PORTFOLIOS.map(p=>`<li><b>${p.name}</b> · ${p.blurb}</li>`).join('')}</ul><p>${DEFAULT_PORTFOLIO_REVIEW.assumption}</p><p>자동운용 통지·대기와 연결 교체매수는 후속 범위입니다. 현 예금은 만기 후 약정이자 추가 없이 보관되며 자동 상환·재투자는 실행하지 않습니다.</p>
<h2>이어하기·운영 점검</h2><p>새 판 저장 형식 c3 / 규칙 2026-09-10-e. 이전 C/D 판과 그 분기는 기존 규칙으로 완료합니다. 과거 매수 출처를 추정해 변환하지 않습니다. 디폴트옵션 미확정 탭·금액은 포트폴리오 왕복·재접속 시 검토 화면으로 복원하고 주문을 자동 실행하지 않습니다.</p><p>운영자는 같은 TDF의 직접/옵션 보유, 일부 환매, 예금 이자 조정, 주문 진행 중 새로고침, 행동 2회 칸, 12턴 마지막 주문, 3·6·9턴 분기 복원을 확인하세요. 옵션 거래는 외부 납입·공제에 합산되지 않고 비용만 운용성과에 반영됩니다. 반복 거래로 점수나 별을 얻지 않습니다.</p><p>오류 재현 시 버전·시드·성향·시나리오·턴·입력 금액·거래 순서를 기록하고 복기 JSON을 보관하세요. 주문 기록에는 접수·가격확정·결제 상태가 표시됩니다.</p><p><a href="${esc(DEFAULT_PORTFOLIO_REVIEW.source)}">근로자퇴직급여 보장법</a> · <a href="${esc(DEFAULT_PORTFOLIO_REVIEW.regulation)}">퇴직연금감독규정</a> · 검수 ${DEFAULT_PORTFOLIO_REVIEW.reviewedAt}</p></section>`;
for(const file of ['public/user-manual.html','public/operator-manual.html']) {
  const html=readFileSync(file,'utf8');
  const existing=html.match(/<!-- legacy-content:start -->([\s\S]*?)<!-- legacy-content:end -->/);
  let legacy=existing?.[1]??html.split('<body>')[1].split('</body>')[0];
  legacy=legacy.replace(/<section id="step-d">[\s\S]*?<\/section>/,'').replace(/<p style="padding:16px;background:#eaf0e8">[\s\S]*?<\/p>/,'');
  const head=html.split('<body>')[0];
  writeFileSync(file,head+`<body><main style="max-width:1080px;margin:auto;padding:24px">${tradeGuide}${guide}<details id="legacy-manual"><summary>v1.4 이하 이전 설명 · 당시 저장 게임 참고용</summary><p>아래의 디폴트옵션 자동매수·구성·저장 안내는 새 판에 적용하지 않습니다. 현재 규칙은 위의 v1.5 안내를 참고하세요.</p><!-- legacy-content:start -->${legacy}<!-- legacy-content:end --></details></main></body></html>`);
}
