/** 주문·세금·부채에는 원 단위, 공간이 좁은 요약에만 축약 금액을 사용한다. */
export const formatWon = (value:number):string => `${(Math.round(value)||0).toLocaleString('ko-KR')}원`;
export function formatShortWon(value:number):string {
  const amount=Math.abs(value);
  if(amount<10000)return formatWon(value);
  return amount>=100000000 ? `${(value/100000000).toFixed(2)}억원` : `${Math.round(value/10000).toLocaleString('ko-KR')}만원`;
}
export const signedWon = (value:number):string => `${value>0?'+':''}${formatWon(value)}`;
export const signedPercent = (value:number):string => `${value>0?'+':''}${(value*100).toFixed(1)}%`;
