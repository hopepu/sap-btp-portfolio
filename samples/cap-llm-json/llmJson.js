/**
 * LLM 호출 래퍼 — "텍스트를 넣고 정해진 모양의 JSON 을 받는다" 하나만 한다.
 * API 키는 반드시 환경변수(또는 BTP 사용자 제공 서비스)로만 받는다. 코드에 키를 두지 않는다.
 */
const cds = require('@sap/cds');
const { GoogleGenAI } = require('@google/genai');

const LOG = cds.log('llm');
const DEFAULT_MODEL = 'gemini-2.5-flash';
const DEFAULT_MAX_OUTPUT_TOKENS = 8192;

let _oClient = null; // 키 기준으로 재사용하는 클라이언트
let _sClientKey = ''; // 클라이언트를 만든 키

/**
 * 환경변수의 키로 클라이언트를 돌려준다(키가 바뀌면 새로 만든다).
 * @returns {GoogleGenAI|null} 클라이언트(키가 없으면 null)
 */
function getClient() {
  const sApiKey = process.env.GEMINI_API_KEY; // 키는 환경에서만
  if (!sApiKey) { return null; }
  if (!_oClient || _sClientKey !== sApiKey) { _oClient = new GoogleGenAI({ apiKey: sApiKey }); _sClientKey = sApiKey; }
  return _oClient;
}

/**
 * 프롬프트를 보내고 JSON 을 받는다. schema 를 주면 모델이 그 모양을 어길 수 없다.
 * @param {object} oOptions 호출 재료
 * @param {string} oOptions.prompt 프롬프트
 * @param {object} [oOptions.schema] 응답 JSON 스키마
 * @param {string} [oOptions.model] 모델명
 * @param {number} [oOptions.maxOutputTokens] 출력 토큰 상한
 * @param {number} [oOptions.thinkingBudget] 추론 예산(0=끔, -1=자동). 단순 추출은 끄고, 다단계 설계만 켠다
 * @returns {Promise<{ok: boolean, data: object|null, text?: string, tokens?: number, message: string}>} 결과
 */
async function extractJson(oOptions) {
  const oClient = getClient();
  if (!oClient) { return { ok: false, data: null, message: 'GEMINI_API_KEY 환경변수가 없습니다.' }; }

  const oConfig = {
    temperature: 0, // 같은 입력 → 같은 결과여야 다음 단계 입력으로 조합할 수 있다
    maxOutputTokens: Number(oOptions.maxOutputTokens || DEFAULT_MAX_OUTPUT_TOKENS), // 입력이 길면 출력도 길다 — 넉넉히
    responseMimeType: 'application/json',
    thinkingConfig: { thinkingBudget: Number(oOptions.thinkingBudget || 0) } // 추출은 추론 불필요(지연 감소)
  };
  if (oOptions.schema) { oConfig.responseSchema = oOptions.schema; }

  const nStartedAt = Date.now(); // 지연 측정
  let oResponse;
  try {
    oResponse = await oClient.models.generateContent({ model: oOptions.model || DEFAULT_MODEL, contents: String(oOptions.prompt || ''), config: oConfig });
  } catch (oError) {
    return { ok: false, data: null, message: `LLM 호출 실패: ${oError.message}` };
  }
  LOG.info(`[llm] ${oOptions.model || DEFAULT_MODEL} ${Date.now() - nStartedAt}ms`);

  const sText = String(oResponse.text || '').trim(); // 응답 본문
  const nTokens = Number((oResponse.usageMetadata || {}).totalTokenCount || 0); // 사용 토큰
  const sFinishReason = String(((oResponse.candidates || [])[0] || {}).finishReason || ''); // 종료 사유

  // 잘림을 먼저 판정한다. 상한에 걸려 잘린 것을 "JSON 이 아니다"로 뭉뚱그리면 프롬프트만 붙들게 된다.
  if (/MAX_TOKENS/i.test(sFinishReason)) {
    return { ok: false, data: null, text: sText, tokens: nTokens, message: `출력 한도(${oConfig.maxOutputTokens} 토큰)에 걸려 응답이 잘렸습니다.` };
  }
  if (!sText) { return { ok: false, data: null, tokens: nTokens, message: `빈 응답 (종료 사유: ${sFinishReason || '알 수 없음'})` }; }

  const sJson = sText.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '').trim(); // JSON 모드에서도 섞여 오는 코드펜스 제거
  try {
    return { ok: true, data: JSON.parse(sJson), text: sText, tokens: nTokens, message: 'OK' };
  } catch (oError) {
    return { ok: false, data: null, text: sText, tokens: nTokens, message: '응답이 JSON 이 아닙니다. 원문은 text 에 있습니다.' };
  }
}

module.exports = { extractJson, DEFAULT_MODEL };
