/**
 * MCP 도구 실행 핸들러 레지스트리 — 도구 설정의 handler 키 → 실제 실행 함수의 단일 정본.
 * 관리 화면의 [실행 핸들러] 선택 목록도 이 파일의 메타데이터에서 나온다.
 *
 * 리플렉션으로 함수를 훑지 않고 명시적으로 선언하는 이유
 *   - 라벨·파라미터·필요 스코프 같은 메타데이터를 화면에 함께 내려줄 수 있다
 *   - 내부 유틸 함수가 실수로 도구로 노출되지 않는다
 *   - 아직 구현되지 않은 핸들러(implemented:false)를 화면에서 구분해 보여줄 수 있다
 *
 * 모든 핸들러 시그니처는 같다:
 *   async ({ system, params, config, ctx }) => ({ ok, data, message })
 *   system : 연동 시스템 카탈로그 행(Destination 이름 등)
 *   params : 실행 시점 인자
 *   config : 도구별 고정 설정
 *   ctx    : CAP 요청(사용자 토큰 전달 등)
 */
const mail = require('./handlers/mail');
const http = require('./handlers/httpCall');
const ai = require('./handlers/aiExtract');

const HANDLERS = [
  {
    key: 'mail.send',
    label: '메일 발송',
    system: 'Mail',
    params: [
      { name: 'to', type: 'string', required: true, label: '받는 사람' },
      { name: 'subject', type: 'string', required: true, label: '제목' },
      { name: 'body', type: 'string', required: true, label: '본문' }
    ],
    config: [],               // 호출 URL 은 핸들러 코드가 가진다
    needsDestination: false,  // 자체 토큰 + API 별 호스트라 Destination 을 거치지 않는다
    scopes: ['mail.send'],
    implemented: true,
    run: mail.send
  },
  {
    key: 'http.call',
    label: '범용 HTTP 호출 (모든 시스템)',
    system: null, // 시스템 무관
    params: [
      { name: 'query', type: 'object', required: false, label: '쿼리 파라미터' },
      { name: 'body', type: 'object', required: false, label: '요청 바디' }
    ],
    // 원격지 고유 인코딩이 필요할 때만 변환기 이름을 지정한다.
    // 이것만으로 흡수되는 시스템은 전용 핸들러를 새로 만들 필요가 없다.
    config: [
      { name: 'requestType', type: 'string', required: false, label: '요청 전처리(비우면 그대로 전송)' },
      { name: 'responseType', type: 'string', required: false, label: '응답 후처리(비우면 원본 그대로)' }
    ],
    usesHttpConfig: true,     // 메서드·경로는 도구 설정에서 받는다
    needsDestination: true,   // 호스트와 인증은 언제나 Destination 이 준다
    scopes: [],
    implemented: true,
    run: http.call
  },
  {
    key: 'ai.extract',
    label: '자유 텍스트 → JSON 추출 (AI)',
    system: null,
    params: [
      { name: 'text', type: 'string', required: true, label: '추출할 텍스트' },
      { name: 'fields', type: 'string', required: false, label: '뽑을 항목(쉼표 구분, 예: 품목, 수량:number, 납기)', noBind: true }
    ],
    config: [
      // 추출 결과는 다음 액션의 입력이 된다. 그 모양은 프롬프트 레지스트리에 이미 있으므로 가리키기만 한다
      // (두 군데 적으면 한쪽만 고쳐졌을 때 추출은 성공하는데 다음 액션이 못 받는다).
      { name: 'agentName', type: 'string', required: false, label: '입력 변수를 가져올 에이전트' },
      { name: 'maxOutputTokens', type: 'number', required: false, label: '출력 토큰 상한(기본 8192)' }
    ],
    usesHttpConfig: false,
    needsDestination: false,
    scopes: [],
    implemented: true,
    outputsOf: ai.outputsOf, // 다음 단계가 고를 수 있는 출력 컬럼
    run: ai.extract
  }
];

const BY_KEY = HANDLERS.reduce((mByKey, oHandler) => { mByKey[oHandler.key] = oHandler; return mByKey; }, {}); // 키 → 핸들러

/**
 * 화면 선택 목록 — 실행 함수(run)는 빼고 메타데이터만 내려준다.
 * @returns {object[]} 핸들러 메타데이터 목록
 */
function list() {
  return HANDLERS.map((oHandler) => ({
    key: oHandler.key,
    label: oHandler.label,
    system: oHandler.system,
    params: oHandler.params || [],
    config: oHandler.config || [],
    scopes: oHandler.scopes || [],
    needsDestination: oHandler.needsDestination === true,
    usesHttpConfig: oHandler.usesHttpConfig === true,
    implemented: oHandler.implemented
  }));
}

/**
 * 키로 핸들러 정의를 찾는다.
 * @param {string} sKey 핸들러 키
 * @returns {object|undefined} 핸들러 정의
 */
function get(sKey) {
  return BY_KEY[sKey];
}

module.exports = { list, get, HANDLERS };
