// 도구가 등록 프롬프트를 호출하는 단일 경로.
// 도구마다 호출 코드를 따로 짜면 인자 계약이 갈라져 한쪽만 고쳐지는 사고가 난다.
const cds = require('@sap/cds');

/**
 * 등록 프롬프트를 이름으로 호출한다. 현재 버전 선택은 백엔드가 사용 여부·현재 버전 플래그로 한다.
 * @param {string} sAgentName 레지스트리 키(예 'pl-summary-banner') — GUID 가 아닌 이름이라 버전 교체에 견딘다
 * @param {object} oData 프롬프트에 넘길 데이터
 * @param {object} [oVars] 선언된 입력 변수값
 * @returns {Promise<{status: string, text: string, data: string}>} 실행 결과
 */
async function runAgent(sAgentName, oData, oVars) {
  const oAiService = await cds.connect.to('AiAssistantService'); // AI 단일 진입점
  return oAiService.send('run_agent', {
    agent: sAgentName,
    request: JSON.stringify({ vars: oVars || {}, data: oData }) // 데이터는 인라인으로 넘긴다
  });
}

/**
 * 실행 결과를 도구 반환 문자열로 정리한다.
 * 실패를 빈 문자열로 돌려주면 워크플로 단계가 "성공했는데 내용이 없는" 상태가 되므로 사유를 남긴다.
 * @param {object} oResult runAgent 결과
 * @param {string} sAgentName 호출한 프롬프트 이름
 * @returns {string} 결과 JSON 문자열(실패 시 사유 JSON)
 */
function shapeResult(oResult, sAgentName) {
  const sBody = String((oResult && (oResult.data || oResult.text)) || '')
    .replace(/^```json\s*|\s*```$/g, '') // /^```json\s*|\s*```$/g = 앞뒤 코드펜스 제거
    .trim();
  if (!oResult || oResult.status === 'error' || !sBody) {
    return JSON.stringify({ error: `프롬프트 '${sAgentName}' 호출 실패`, detail: String((oResult && oResult.text) || '응답 없음').slice(0, 500) });
  }
  return sBody;
}

module.exports = { runAgent, shapeResult };
