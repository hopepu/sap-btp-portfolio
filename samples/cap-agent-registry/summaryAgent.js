// 손익 요약 영역 에이전트 — 대시보드 상단 요약 배너를 맡는다.
const { runAgent, shapeResult } = require('./runAgent');

const AREA = 'summary';      // 영역 코드
const LABEL = '손익 요약';   // 화면 표시명

const tools = [
  {
    name: 'pl_summarize_month', // == CAP 액션명
    description: '선택한 조직·월의 손익 실적을 계획·전년과 비교해 요약한다.',
    parameters: {
      type: 'object',
      properties: {
        orgCode: { type: 'string', description: '조직코드' },
        yearMonth: { type: 'string', description: '대상 월(YYYYMM)' }
      },
      required: ['orgCode', 'yearMonth']
    }
  }
];

/**
 * 도구 실행부.
 * @param {string} sToolName 도구명
 * @param {object} oArgs 도구 인자
 * @param {object} req CAP 요청(권한 판정용)
 * @returns {Promise<string>} 결과 JSON 문자열
 */
async function run(sToolName, oArgs, req) {
  const oPayload = await buildPayload(oArgs, req); // 권한 범위 안에서 집계한 숫자
  const oResult = await runAgent('pl-summary-banner', oPayload, { yearMonth: oArgs.yearMonth });
  return shapeResult(oResult, 'pl-summary-banner');
}

/**
 * 프롬프트에 넣을 숫자를 모은다. LLM 에게 계산을 맡기지 않고, 서버가 집계한 값만 넘긴다.
 * @param {object} oArgs 도구 인자
 * @param {object} req CAP 요청
 * @returns {Promise<object>} 프롬프트 데이터
 */
async function buildPayload(oArgs, req) {
  const authz = require('../cap-authz/authz');
  const oScope = await authz.intersectOrgScope(req, [oArgs.orgCode]); // 요청 조직을 권한으로 깎는다
  if (oScope.denied) { return { error: '조직 권한 없음' }; }
  const aRows = await SELECT.from('pl.MonthlyActual')
    .columns('kpiCode', 'actual', 'plan', 'lastYear')
    .where({ orgCode: { in: oScope.codes || [oArgs.orgCode] }, yearMonth: oArgs.yearMonth });
  return { yearMonth: oArgs.yearMonth, rows: aRows };
}

module.exports = { area: AREA, label: LABEL, tools, run };
