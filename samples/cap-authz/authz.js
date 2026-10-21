const cds = require('@sap/cds');

/**
 * 조직 범위 권한 판정 — 여러 도메인(손익·예산·채권채무)이 같이 쓰는 한 벌.
 *
 *   1) 사용자 → Role Collection          : 로그인 토큰(xs.system.attributes)
 *   2) Role Collection → 허용 조직코드    : DB 매핑 테이블(관리자 화면이 관리)
 *   3) 토큰 속성 `org` 의 조직코드를 더한다
 *   4) 전사 조회는 scope `org.all` 보유자만
 *   5) 허용 조직은 하위 부서까지 펼친다 — 상위 부서 권한은 앞으로 생길 하위 부서까지 포함한다
 *
 * 핵심 원칙: 화면이 보낸 조직값을 그대로 믿지 않고, 서버가 사용자 권한과의 교집합으로 깎는다.
 */

const ENTITY_DEPARTMENT = 'org.Department';             // { code, parent_code, unit }
const ENTITY_ROLE_MAPPING = 'authz.RoleOrgMapping';      // { roleName, orgPermission_ID }
const ENTITY_PERMISSION_DEPT = 'authz.OrgPermissionDept'; // { orgPermission_ID, department_code }
const NO_MATCH_CODE = '__NONE__';                         // 허용 조직이 없을 때 0건을 만드는 값

/**
 * 전사 접근 권한 보유 여부.
 * @param {object} req CAP 요청
 * @returns {boolean} 전사 권한이면 true
 */
function isOrgAll(req) {
  return req.user.is('org.all');
}

/**
 * CAP 이 검증한 토큰에서 Role Collection 목록을 꺼낸다.
 * @param {object} req CAP 요청
 * @returns {string[]} Role Collection 이름 목록
 */
function getRoleCollections(req) {
  const oToken = req.user.authInfo && req.user.authInfo.token; // 배치·내부 호출은 토큰이 없다
  if (!oToken) { return []; }
  const oAttributes = oToken.getPayload()['xs.system.attributes'] || {}; // 시스템 속성 묶음
  return oAttributes['xs.rolecollections'] || [];
}

/**
 * 부서코드 목록을 하위 부서까지 너비 우선으로 펼친다.
 * 이미 넣은 코드는 다시 넣지 않으므로 부모 관계에 순환이 있어도 끝난다.
 * @param {string[]} aStartCodes 시작 부서코드
 * @param {object[]} aDepartments 부서 마스터 [{ code, parent_code }]
 * @returns {string[]} 시작 코드 + 모든 하위 코드
 */
function expandDescendantsIn(aStartCodes, aDepartments) {
  const mParentToChildCodes = new Map(); // 부모코드 → 자식코드 목록
  aDepartments.forEach((oDept) => {
    if (oDept.parent_code) {
      mParentToChildCodes.set(oDept.parent_code, (mParentToChildCodes.get(oDept.parent_code) || []).concat(oDept.code));
    }
  });
  const setExpandedCodes = new Set(aStartCodes); // 결과 집합(중복 방지 겸 순환 방지)
  const aPendingCodes = [...setExpandedCodes];   // 아직 자식을 펼치지 않은 코드
  while (aPendingCodes.length) {
    (mParentToChildCodes.get(aPendingCodes.shift()) || []).forEach((sChildCode) => {
      if (!setExpandedCodes.has(sChildCode)) { setExpandedCodes.add(sChildCode); aPendingCodes.push(sChildCode); }
    });
  }
  return [...setExpandedCodes];
}

/**
 * 요청 단위로 한 번만 읽는 부서 마스터.
 * @param {object} req CAP 요청
 * @returns {Promise<object[]>} 부서 마스터
 */
async function loadDepartments(req) {
  if (!req._authzDepartments) {
    req._authzDepartments = await SELECT.from(ENTITY_DEPARTMENT).columns('code', 'parent_code', 'unit');
  }
  return req._authzDepartments;
}

/**
 * 허용 조직 계산(캐시 없음).
 * @param {object} req CAP 요청
 * @returns {Promise<{all: boolean, codes: string[]}>} 허용 조직
 */
async function loadAuthorizedOrgCodes(req) {
  if (isOrgAll(req)) { return { all: true, codes: [] }; }

  let aCodes = [].concat(req.user.attr.org || []); // 토큰 속성으로 받은 조직
  const aRoleNames = getRoleCollections(req);
  if (aRoleNames.length) {
    const aMappings = await SELECT.from(ENTITY_ROLE_MAPPING).columns('orgPermission_ID').where({ roleName: { in: aRoleNames } });
    const aPermissionIds = [...new Set(aMappings.map((oMapping) => oMapping.orgPermission_ID).filter(Boolean))];
    if (aPermissionIds.length) {
      const aDeptRows = await SELECT.from(ENTITY_PERMISSION_DEPT).columns('department_code').where({ orgPermission_ID: { in: aPermissionIds } });
      aCodes = aCodes.concat(aDeptRows.map((oRow) => oRow.department_code)); // 복수 Role 의 허용 조직은 합산
    }
  }
  const aUniqueCodes = [...new Set(aCodes.filter(Boolean))];
  return { all: false, codes: aUniqueCodes.length ? expandDescendantsIn(aUniqueCodes, await loadDepartments(req)) : [] };
}

/**
 * 요청 사용자의 허용 조직. 계산 결과가 아니라 Promise 를 먼저 캐시해,
 * before 훅이 병렬로 돌아도 한 번만 계산한다.
 * @param {object} req CAP 요청
 * @returns {Promise<{all: boolean, codes: string[]}>} 허용 조직
 */
function getAuthorizedOrgCodes(req) {
  if (!req._authzOrgs) { req._authzOrgs = loadAuthorizedOrgCodes(req); }
  return req._authzOrgs;
}

/**
 * 이 조직코드를 처리할 수 있는지.
 * @param {object} req CAP 요청
 * @param {string} sOrgCode 조직코드
 * @returns {Promise<boolean>} 허용이면 true
 */
async function isOrgAllowed(req, sOrgCode) {
  if (!sOrgCode) { return false; } // 조직 미확정 데이터는 처리 대상이 아니다
  const oAuth = await getAuthorizedOrgCodes(req);
  return oAuth.all || oAuth.codes.includes(sOrgCode);
}

/**
 * 목록·상세·집계·다운로드 공통 조회 제한 — 화면·합계·파일의 범위가 같아진다.
 * @param {object} req CAP 요청(READ)
 * @param {string} sColumn 조직코드 컬럼
 * @returns {Promise<void>}
 */
async function applyOrgFilter(req, sColumn) {
  const oAuth = await getAuthorizedOrgCodes(req);
  if (oAuth.all) { return; }
  const aCodes = oAuth.codes.length ? oAuth.codes : [NO_MATCH_CODE]; // 허용 조직이 없으면 "전체"가 아니라 0건
  andWhereTokens(req.query, [{ ref: [sColumn] }, 'in', { list: aCodes.map((sCode) => ({ val: sCode })) }]);
}

/**
 * 기존 조회 조건을 한 덩어리로 묶은 뒤 새 조건을 AND 로 붙인다.
 * 묶지 않으면 $filter 의 'a or b' 와 섞여 «a or (b and 조직)» 으로 풀려 권한이 새어 나간다.
 * @param {object} oQuery CQN SELECT
 * @param {Array} aConditionTokens 붙일 조건 토큰
 * @returns {void}
 */
function andWhereTokens(oQuery, aConditionTokens) {
  const aExistingWhere = oQuery.SELECT.where;
  oQuery.SELECT.where = aExistingWhere && aExistingWhere.length
    ? [{ xpr: aExistingWhere }, 'and', { xpr: aConditionTokens }]
    : [{ xpr: aConditionTokens }];
}

/**
 * 화면이 요청한 조직 목록을 사용자의 허용 조직으로 깎는다.
 * @param {object} req CAP 요청
 * @param {string[]|null} aRequestedCodes 요청 조직코드(null = 전사 요청)
 * @returns {Promise<{codes: (string[]|null), denied: boolean}>} codes 가 null 이면 전사 허용
 */
async function intersectOrgScope(req, aRequestedCodes) {
  const oAuth = await getAuthorizedOrgCodes(req);
  if (oAuth.all) { return { codes: aRequestedCodes, denied: false }; }
  const aKeptCodes = aRequestedCodes ? aRequestedCodes.filter((sCode) => oAuth.codes.includes(sCode)) : oAuth.codes; // 전사 요청은 허용 범위로 축소
  return { codes: aKeptCodes, denied: aKeptCodes.length === 0 };
}

/**
 * 생성·수정 시 관리조직 검증. 조직을 바꾸는 수정은 기존·변경 조직 모두에 권한이 있어야 한다.
 * @param {object} req CAP 요청(CREATE/UPDATE)
 * @param {string} sColumn 조직코드 컬럼
 * @param {string} sEntity db 엔티티명
 * @param {string} sLabel 메시지용 대상 이름
 * @returns {Promise<void>}
 */
async function checkWrite(req, sColumn, sEntity, sLabel) {
  const sNewCode = req.data ? req.data[sColumn] : undefined; // 요청이 지정한 새 조직

  if (req.event === 'CREATE' && !sNewCode) { return req.reject(400, `${sLabel} 관리조직은 필수입니다.`); }

  if (req.event === 'UPDATE') {
    const sId = req.data.ID || (req.params[0] && (req.params[0].ID || req.params[0])); // 수정 대상 키
    const oOldRow = await SELECT.one.from(sEntity).columns(sColumn).where({ ID: sId });
    if (oOldRow && !await isOrgAllowed(req, oOldRow[sColumn])) {
      return req.reject(403, `${sLabel} 의 기존 관리조직에 대한 권한이 없습니다.`);
    }
  }
  if (sNewCode !== undefined) {
    const oDept = await SELECT.one.from(ENTITY_DEPARTMENT).columns('code').where({ code: sNewCode });
    if (!oDept) { return req.reject(400, `관리조직코드(${sNewCode})가 조직 마스터에 없습니다.`); }
    if (!await isOrgAllowed(req, sNewCode)) { return req.reject(403, `관리조직(${sNewCode})에 대한 권한이 없습니다.`); }
  }
}

module.exports = {
  getRoleCollections,
  expandDescendantsIn,
  getAuthorizedOrgCodes,
  isOrgAllowed,
  applyOrgFilter,
  andWhereTokens,
  intersectOrgScope,
  checkWrite
};
