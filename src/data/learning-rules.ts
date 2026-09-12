/** 교육 콘텐츠의 공통 기준. 금융 계산 상수와 분리해 관리한다. */
export const CONTENT_VERSION = '2026-09-12-p1';
export const CONTENT_REVIEWED_AT = '2026-09-12';
export const SOURCES = {
  irp: { title: '하나은행 개인형 IRP 핵심설명서 · 2026.02', url: 'https://pension.kebhana.com/files/POR/Notice/PSNL_IRP_PRD_INVTM.pdf', scope: '한국 IRP · 금융감독원 배포 공통 설명서' },
  tax: { title: '소득세법 제59조의3 · 연금계좌세액공제', url: 'https://www.law.go.kr/LSW/lsLawLinkInfo.do?chrClsCd=010202&lsJoLnkSeq=1000819707', scope: '한국 세법 · 열람 본문 시행 2026-01-01' },
  withdrawal: { title: '퇴직급여법 시행령 제18조 · 개인형 IRP 중도인출', url: 'https://www.law.go.kr/LSW/lsLinkCommonInfo.do?chrClsCd=010202&lspttninfSeq=71031', scope: '한국 법령 · 열람 본문 시행 2026-03-24' },
  risk: { title: '퇴직연금감독규정 · 투자한도', url: 'https://www.law.go.kr/행정규칙/퇴직연금감독규정', scope: '한국 감독규정 · 현행 원문 연결' },
  tdf: { title: '금융위원회 · 적격 TDF 투자한도 예외 도입', url: 'https://www.fsc.go.kr/po010106/73294', scope: '2018년 제도 도입 근거 · 실제 적격성은 현행 감독기준·상품 설명서 확인' },
  default: { title: '금융위원회 · 사전지정운용제도 시행', url: 'https://www.fsc.go.kr/po010101/78021', scope: '2022년 제도 도입 설명 · 신규 가입과 기존 만기 절차 구분' },
  db: { title: '고용노동부 · 퇴직연금제도', url: 'https://www.moel.go.kr/retirementpay.do', scope: '한국 DB·DC·IRP 개념' },
  allocation: { title: 'SEC Investor.gov · 자산배분과 분산', url: 'https://www.investor.gov/introduction-investing/getting-started/asset-allocation', scope: '일반 투자 원리 · 한국 IRP 법규 근거가 아님' },
  bond: { title: 'SEC Investor.gov · 금리와 고정금리 채권', url: 'https://www.investor.gov/introduction-investing/general-resources/news-alerts/alerts-bulletins/investor-bulletins-86', scope: '일반 채권 원리 · 다른 조건이 같을 때' },
  fund: { title: 'SEC Investor.gov · 펀드와 ETF의 가격', url: 'https://www.investor.gov/introduction-investing/general-resources/news-alerts/alerts-bulletins/characteristics-mutual-funds-exchange-traded-funds', scope: '미국 상품의 가격 원리 · 한국 상품별 결제 일정 근거가 아님' },
  buffer: { title: 'FDIC · 예상 밖 지출을 위한 저축', url: 'https://www.fdic.gov/consumer-resource-center/2025-01/saving-unexpected-and-your-future', scope: '일반 생활자금 원리 · 미국 예금보호를 한국 IRP에 적용하지 않음' },
  glide: { title: 'SEC Investor.gov · 타깃데이트펀드', url: 'https://www.investor.gov/introduction-investing/general-resources/news-alerts/alerts-bulletins/investor-bulletins/target-date-funds-investor-bulletin', scope: '일반 TDF 원리 · 한국 적격 TDF 판정과 별개' }
} as const;
export type SourceId = keyof typeof SOURCES;
export interface LearningRule { title: string; principle: string; assumption: string; sources: SourceId[] }
export const LEARNING_RULES = {
  contribution: { title: '납입과 세액공제', principle: '개인 납입 기본 한도는 연금계좌 합산 연 1,800만원입니다. 세액공제 대상은 연금저축 600만원, 퇴직연금계좌와 합산 900만원까지입니다. 퇴직급여 이전·ISA 만기 이전 등은 별도 조건입니다.', assumption: '한 판에 기본 한도 1년분을 합산합니다. 턴당 개인 납입 200만원은 게임 진행용 제한이며 실제 법정 한도가 아닙니다.', sources: ['irp','tax'] },
  credit: { title: '세액공제율과 환급', principle: '국세 공제율은 소득 조건에 따라 12% 또는 15%이며 지방소득세 포함 비교는 13.2% 또는 16.5%입니다. 실제 공제액은 소득·산출세액 등 개인 조건에 따릅니다.', assumption: '13.2%를 적용하고 연말정산 칸 통과 때 생활자금으로 지급합니다. 실제 환급 시점이나 금액을 보장하지 않습니다.', sources: ['tax','irp'] },
  withdrawal: { title: '계좌 안 매도와 계좌 밖 인출', principle: 'IRP 상품 매도 대금은 계좌 안에 남습니다. 중도인출은 법정 사유와 요건이 필요하며, 일반 생활비 부족만으로 허용되지 않습니다.', assumption: '비적격 생활사건은 생활자금으로 지급하고 부족분은 미지급 생활비로 남깁니다. 매도·중도인출·계좌 해지는 서로 구분합니다.', sources: ['withdrawal','irp'] },
  risk: { title: '위험자산 한도와 예외', principle: 'DC·IRP의 위험자산 투자에는 한도가 있고 감독기준을 충족한 운용방법에는 예외가 적용될 수 있습니다. 적격 TDF나 승인 디폴트옵션이라는 이유로 손실 위험이 없어지지는 않습니다.', assumption: '위험자산 70% 모형과 가상 적격 TDF·승인 유형을 사용합니다. 상품 분류·성향별 허용 등급은 교육용이며 실제 상품의 적격성 판정이 아닙니다.', sources: ['risk','tdf','default'] },
  payout: { title: '연금·일시금과 재원별 과세', principle: '세액공제받지 않은 원금, 퇴직급여, 공제받은 원금·운용수익의 과세를 구분합니다. 연금수령에는 나이·가입기간·수령한도 등의 조건이 있습니다.', assumption: '55세부터 20년 분할, 수령 중 운용수익·미래 물가 없음으로 비교합니다. 20년은 의무 기간이 아닙니다. 목표용 월 환산액과 세후 수령 비교를 구분합니다.', sources: ['irp'] },
  default: { title: '사전지정·옵트인·옵트아웃', principle: '사전지정과 상품 매수는 별개입니다. 자동 적용은 신규 가입·기존 만기 자금의 요건과 통지·대기 절차를 따르며, 직접 매수하는 옵트인과 구분됩니다.', assumption: '직접 옵트인·옵트아웃만 체험합니다. 지정만으로 매수하지 않고 자동운용·연결 교체매수는 실행하지 않습니다.', sources: ['default'] },
  profile: { title: '투자자성향', principle: '투자기간·손실 감내 수준·재무 상황 등을 고려해 자산배분을 판단합니다. 성향은 높고 낮음의 서열이 아니며 캐릭터 외형과 다릅니다.', assumption: '5문항은 교육용 진단입니다. 시작 전에 확인한 성향을 판 종료까지 고정하며 실제 금융회사의 적합성 평가를 대체하지 않습니다.', sources: ['allocation'] },
  bond: { title: '금리·채권·만기', principle: '다른 조건이 같으면 금리 상승은 기존 고정금리 채권 가격에 하락 압력이 됩니다. 만기가 긴 채권은 금리 변화에 더 민감할 수 있습니다.', assumption: '턴별 금리·주가·상품 수익은 가상 모형입니다. 일반 원리와 이번 보유분의 실제 원화 변화를 구분하고 다음 시장을 확정적으로 예측하지 않습니다.', sources: ['bond'] },
  deposit: { title: '예금 약정', principle: '기존 고정금리 예금은 약정을 따르며 만기 전 매도에는 중도해지 불이익이 있을 수 있습니다.', assumption: '가입 건별 금리·만기를 유지하고 만기 이후 추가 이자 없이 보관합니다. 자동 상환·재투자·금융회사 부도·예금보호 지급 절차는 모사하지 않습니다. IRP 전체의 원금을 보장하지 않습니다.', sources: ['irp'] },
  order: { title: '주문·가격확정·결제', principle: '펀드의 기준가와 ETF의 시장가격을 구분합니다. 주문 접수·적용 가격 확정·대금 결제는 다른 단계이며 구체 일정은 상품 설명서와 접수 시각을 확인해야 합니다.', assumption: '펀드는 접수 t → 가격 t+1 → 결제 t+2, 예금·ETF는 즉시 처리합니다. 게임 시간이며 실제 영업일이 아닙니다. 마지막 턴은 새 시장·급여 없이 정산만 끝냅니다.', sources: ['fund','irp'] },
  buffer: { title: '생활자금과 유동성', principle: '필요할 때 쓸 수 있는 자금은 예상 밖 지출에 대응하고 장기 투자자산의 급한 처분을 줄이는 데 도움이 됩니다.', assumption: '생활자금과 IRP 대기자금은 별개입니다. 매 턴 생활자금 유입과 생활사건 비용은 교육용 모형입니다.', sources: ['buffer'] },
  allocation: { title: '분산·리밸런싱·전망', principle: '투자기간과 위험 감수 능력에 맞춰 자산을 나누고 달라진 비중을 점검합니다. 분산이 손실을 없애거나 전망의 적중을 보장하지는 않습니다.', assumption: '성향별 목표 비중과 가상 시장을 사용합니다. 같은 입출금 기준 지수와 생활 선택까지 다른 고스트는 별개의 비교입니다.', sources: ['allocation'] },
  db: { title: 'DB·DC·IRP', principle: 'DB는 사용자(회사)가 적립금을 운용하고, DC는 근로자가 운용을 지시합니다. 개인형 IRP에서는 가입자가 운용방법을 선택합니다.', assumption: '이 게임은 개인형 IRP 운용 체험입니다. DB 적립금 운용 게임이 아닙니다.', sources: ['db'] },
  glide: { title: 'TDF와 구매력', principle: 'TDF는 목표 시점에 맞춰 자산배분을 조정하지만 같은 목표연도라도 구성·위험·비용이 다를 수 있습니다. 명목 자산 증가와 물가 반영 구매력은 다릅니다.', assumption: 'TDF 2029 주식 비중을 45%에서 25%로 낮춥니다. 12턴은 물가·생애주기상 가상 3년이며 납입 한도는 별도로 한 판에 1년분을 합산합니다.', sources: ['glide','allocation'] }
} satisfies Record<string, LearningRule>;
export type LearningRuleId = keyof typeof LEARNING_RULES;
export const CARD_RULES: Record<string, LearningRuleId> = {
  'signal-vs-forecast':'allocation','rate-bond':'bond',duration:'bond','deposit-rate':'deposit','fund-order':'order','etf-order':'order','risk-limit':'risk','tdf-exception':'risk','contribution-limit':'contribution','tax-credit':'credit','irp-withdrawal':'withdrawal','emergency-cash':'buffer',diversification:'allocation',rebalance:'allocation',profile:'profile','pension-assumption':'payout',liquidity:'buffer','pension-tax':'payout','payout-choice':'payout','default-option':'default','db-dc-irp':'db','sale-vs-withdrawal':'withdrawal','pricing-vs-settlement':'order','inflation-value':'glide','tdf-glide':'glide'
};
