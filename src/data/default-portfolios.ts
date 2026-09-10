import { investorProfiles } from './content';
import type { DefaultOption, DefaultOptionId, DefaultScope, ProductId, ProfileId } from '../types';

export interface DefaultPortfolio extends DefaultOption {
  version: 'e1'; riskGrade: number; weights: Partial<Record<ProductId, number>>;
  principalGuaranteed: boolean;
}
// 실제 승인 상품이 아닌, 승인 제도의 예금/TDF/BF 운용유형을 모사한 교육용 계약.
// balanced는 이 묶음 안에서 BF 운용유형을 가정한다. 구 C/D 카탈로그는 변경하지 않는다.
export const DEFAULT_PORTFOLIOS: DefaultPortfolio[] = [
  {id:'principal',version:'e1',name:'원리금보장형',products:['deposit'],weights:{deposit:1},riskGrade:6,principalGuaranteed:true,blurb:'예금 100%. 약정 만기까지 원금과 이자 보장 가정. 물가 위험은 남습니다.'},
  {id:'lowRisk',version:'e1',name:'저위험',products:['deposit','tdf'],weights:{deposit:.7,tdf:.3},riskGrade:5,principalGuaranteed:false,blurb:'예금 70% · TDF 30%. 일부 손실 가능성이 있는 가상 5등급 포트폴리오.'},
  {id:'midRisk',version:'e1',name:'중위험',products:['deposit','balanced'],weights:{deposit:.3,balanced:.7},riskGrade:4,principalGuaranteed:false,blurb:'예금 30% · 혼합형(BF 가정) 70%. 가상 4등급, 성장과 완충을 함께 고려합니다.'},
  {id:'highRisk',version:'e1',name:'고위험',products:['balanced','tdf'],weights:{balanced:.7,tdf:.3},riskGrade:3,principalGuaranteed:false,blurb:'혼합형(BF 가정) 70% · TDF 30%. 가상 3등급, 주식·금리 변동과 원금 손실 가능.'}
];
export const DEFAULT_PORTFOLIO_REVIEW = {
  reviewedAt:'2026-09-10', version:'e1',
  source:'https://www.law.go.kr/LSW/lsLinkCommonInfo.do?chrClsCd=010202&lsJoLnkSeq=1030452711',
  regulation:'https://www.law.go.kr/LSW/admRulSideInfoP.do?admRulSeq=2100000231486&joNo=0011&urlMode=admRulScJoRltInfoR',
  assumption:'승인 운용유형을 모사한 가상 상품입니다. 실제 승인 상품·공식 위험등급이 아닙니다. 옵션분에만 한도 예외를 가정하며 손실위험·주식노출은 그대로 계산합니다.'
};
export function defaultPortfolio(id: DefaultOptionId): DefaultPortfolio { return DEFAULT_PORTFOLIOS.find(p=>p.id===id)!; }
export function allowedPortfolios(profileId: ProfileId): DefaultPortfolio[] {
  const profile=investorProfiles.find(p=>p.id===profileId)!;
  return DEFAULT_PORTFOLIOS.filter(p=>p.riskGrade>=profile.minRiskGrade);
}
export function validDefaultScope(scope: DefaultScope | undefined, productId: ProductId): boolean {
  return !!scope && scope.optionVersion==='e1' && !!scope.mandateId && !!DEFAULT_PORTFOLIOS.find(p=>p.id===scope.optionId)?.products.includes(productId);
}
