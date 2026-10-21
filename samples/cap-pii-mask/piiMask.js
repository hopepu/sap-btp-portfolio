/**
 * 개인정보 칸 가리기 — 사람 정보 엔티티의 계좌·주소는 본인과 관리 권한자만 본다.
 *
 * 사용자 목록은 값 도움·결재선 선택 등 여러 화면이 쓰므로 목록 자체는 막지 않고,
 * 조회 결과에서 민감 칸만 비워 내려보낸다(after READ 훅).
 */
const PERSON_ENTITIES = ['Users', 'Employees'];                    // 사람 한 명이 한 행인 엔티티
const SENSITIVE_COLUMNS = ['accountNumber', 'bankCode', 'address']; // 가릴 칸
const SELF_COLUMNS = ['userId', 'employeeId'];                     // 엔티티마다 다른 "본인 ID" 칸
const ADMIN_SCOPE = 'UserAdmin';                                   // 사용자 관리 권한

/**
 * 요청자가 관리 권한자인지 요청마다 한 번만 판정한다.
 * @param {object} req CAP 요청
 * @returns {boolean} 관리 권한자면 true
 */
function isAdmin(req) {
  if (req._bPiiAdmin === undefined) {
    try {
      req._bPiiAdmin = !req.user || req.user._is_privileged || req.user.is(ADMIN_SCOPE); // 내부 호출·관리자는 원본
    } catch (oError) {
      req._bPiiAdmin = false; // 판정 실패는 가리는 쪽(안전 기본값)
    }
  }
  return req._bPiiAdmin;
}

/**
 * 행이 요청자 본인 것인지.
 * @param {object} oRow 조회 행
 * @param {string} sUserId 요청자 ID
 * @returns {boolean} 본인이면 true
 */
function isSelf(oRow, sUserId) {
  return !!sUserId && SELF_COLUMNS.some((sColumn) => oRow[sColumn] === sUserId);
}

/**
 * 서비스에 사람 정보 엔티티가 있으면 조회 결과의 민감 칸을 가리는 훅을 단다.
 * @param {object} srv CAP 서비스
 * @returns {void}
 */
function install(srv) {
  const aTargetEntities = PERSON_ENTITIES.filter((sName) => srv.entities[sName]
    && SENSITIVE_COLUMNS.some((sColumn) => srv.entities[sName].elements[sColumn])); // 민감 칸을 실제로 가진 엔티티만
  if (!aTargetEntities.length) { return; }

  srv.after('READ', aTargetEntities, (vResult, req) => {
    const aRows = Array.isArray(vResult) ? vResult : (vResult ? [vResult] : []); // 단건·목록 공통 처리
    if (!aRows.length || isAdmin(req)) { return; }
    const sUserId = req.user && req.user.id; // 요청자
    aRows.forEach((oRow) => {
      if (isSelf(oRow, sUserId)) { return; } // 본인 정보는 본인이 본다
      SENSITIVE_COLUMNS.forEach((sColumn) => { if (sColumn in oRow) { oRow[sColumn] = null; } });
    });
  });
}

module.exports = { install };
