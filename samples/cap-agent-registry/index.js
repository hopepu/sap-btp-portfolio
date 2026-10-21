// 손익 도메인 에이전트 레지스트리 — 영역 에이전트(요약·차이·리스크·예측)를 한곳에 모은다.
// 계약은 하나뿐이다: 도구명 == CAP 서비스 액션명. 이것만 지키면 A2A 엔진·도구 선택기가 코드 수정 없이 찾는다.
//
// 새 영역 추가: ① <area>Agent.js 작성 ② AGENTS 배열에 추가
const summaryAgent = require('./summaryAgent');

const AGENTS = [summaryAgent]; // 이 도메인의 영역 에이전트(실서비스는 요약·차이·리스크·예측·대시보드·전문가 6종)
const DOMAIN = '손익관리';                    // 프롬프트 레지스트리의 도메인 값과 같아야 한다

/**
 * 전 영역 도구 선언.
 * @returns {object[]} 도구 선언 배열
 */
function tools() {
  return AGENTS.reduce((aAllTools, oArea) => aAllTools.concat(oArea.tools || []), []);
}

module.exports = {
  AGENTS,
  DOMAIN,
  tools,

  /**
   * A2A·챗봇이 부른 이름이 이 도메인 도구인지.
   * @param {string} sToolName 도구명
   * @returns {boolean} 이 도메인 도구면 true
   */
  handles(sToolName) {
    return tools().some((oTool) => oTool.name === sToolName);
  },

  /**
   * 도구명 → 선언된 인자 이름(워크플로 편집기가 입력 칸을 그릴 때 쓴다).
   * @param {string} sToolName 도구명
   * @returns {string[]|null} 인자 이름 목록(모르는 도구면 null)
   */
  argNames(sToolName) {
    const oTool = tools().find((oOne) => oOne.name === sToolName);
    if (!oTool) { return null; }
    const oProperties = oTool.parameters && oTool.parameters.properties; // JSON Schema 형식 인자
    return oProperties ? Object.keys(oProperties) : [];
  },

  /**
   * 도구마다 같은 이름의 CAP 액션을 등록한다(액션 1개 = 도구 1개).
   * @param {object} srv CAP 서비스
   * @returns {void}
   */
  register(srv) {
    AGENTS.forEach((oArea) => {
      (oArea.tools || []).forEach((oTool) => {
        srv.on(oTool.name, (req) => oArea.run(oTool.name, req.data || {}, req));
      });
    });
  }
};
