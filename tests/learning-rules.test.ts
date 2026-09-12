import { describe,it,expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { learningCards,policyRules } from '../src/data/content';
import { LEARNING_RULES,SOURCES } from '../src/data/learning-rules';
describe('F06 공통 학습 기준',()=>{
  it('25문항이 실제 원리·게임 가정·구체 근거에 연결된다',()=>{
    expect(learningCards).toHaveLength(25);
    for(const c of learningCards){
      expect(c.ruleId).toBeTruthy();const r=LEARNING_RULES[c.ruleId!];
      expect(c.actualPrinciple).toBe(r.principle);expect(c.gameAssumption).toBe(r.assumption);
      expect(c.quiz.options[c.quiz.answer]).toBeTruthy();expect(c.quiz.why).toBeTruthy();
      expect(r.sources.every(s=>new URL(SOURCES[s].url).pathname!=='/')).toBe(true);
    }
    expect(learningCards.find(c=>c.id==='db-dc-irp')!.quiz.options).toContain('DB는 사용자(회사), DC는 근로자가 운용한다');
  });
  it('한도와 세율 계산은 보존하고 출처만 올바른 주제로 연결한다',()=>{
    expect(policyRules).toMatchObject({riskAssetLimit:.7,annualContributionLimit:18000000,annualTaxCreditLimit:9000000,taxCreditRate:.132,receivingMonths:240});
    expect(decodeURI(policyRules.source_urls[0])).toContain('퇴직연금감독규정');
    expect(LEARNING_RULES.contribution.principle).toContain('600만원');
    expect(LEARNING_RULES.credit.principle).toContain('지방소득세');
    expect(LEARNING_RULES.risk.assumption).toContain('실제 상품의 적격성 판정이 아닙니다');
  });
  it('현재 사용자 안내에는 개발 정보 대신 플레이 순서가 있고 이전 설명은 별도 보존한다',()=>{
    const user=readFileSync('public/user-manual.html','utf8'),operator=readFileSync('public/operator-manual.html','utf8');
    for(const id of ['start','turn','money','trade','life','finish','help'])expect(user).toContain(`id="${id}"`);
    expect(user).not.toMatch(/pension-road-play-c1|src\/|<code>|legacy-content/);
    expect(user).toContain('지정만으로 매수되지 않습니다');expect(user).toContain('실제 영업일');
    expect(operator).toContain('pension-road-play-c1');expect(operator).toContain('원리');
    expect(user).toContain('manual-archive/user-v1.6.1.html');
    const guide=readFileSync('public/learning-guide.html','utf8');
    for(const c of learningCards)expect(guide).toContain(`href="#rule-${c.ruleId}"`);
  });
});
