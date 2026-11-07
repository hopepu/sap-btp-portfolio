const cds = require('@sap/cds');
const authz = require('./lib/authz');            // 하위 조직 전개 (samples/cap-authz)
const audit = require('./lib/audit');            // 감사 로그
const supplierMaster = require('./lib/supplierMaster');

const WRITE_ROOT = process.env.SUPPLIER_WRITE_ROOT || 'ORG_FINANCE'; // 쓰기 권한 기준 조직

/**
 * 요청자가 기준 조직(하위 포함) 소속이거나 권한 관리자인지.
 * @param {object} req CAP 요청
 * @returns {Promise<boolean>} 쓸 수 있으면 true
 */
async function canWrite(req) {
    if (req.user.is('role.update')) { return true; }
    const oUser = await SELECT.one.from('user.User').columns('departmentCode').where({ id: req.user.id, useFlag: true });
    if (!oUser || !oUser.departmentCode) { return false; }
    const aDepartments = await SELECT.from('org.Department').columns('code', 'parent_code');
    return authz.expandDescendantsIn([WRITE_ROOT], aDepartments).includes(oUser.departmentCode);
}

/**
 * 라이브러리 결과를 JSON 으로, 업무 오류(status)는 CAP 거절로 바꾼다.
 * @param {object} req CAP 요청
 * @param {Function} fnRun 실행
 * @returns {Promise<string>} 결과 JSON
 */
async function run(req, fnRun) {
    try { return JSON.stringify(await fnRun()); }
    catch (oError) { if (oError.status) { return req.reject(oError.status, oError.message); } throw oError; }
}

/**
 * 화면 값 JSON 읽기.
 * @param {object} req CAP 요청
 * @returns {object|null} 값(못 읽으면 거절하고 null)
 */
function valuesOf(req) {
    try { const oValues = JSON.parse(req.data.values || '{}'); return oValues && typeof oValues === 'object' ? oValues : {}; }
    catch (oError) { req.reject(400, '공급업체 값(JSON)을 읽을 수 없습니다.'); return null; }
}

module.exports = class SupplierMasterService extends cds.ApplicationService {

    /**
     * 핸들러 등록.
     * @returns {Promise<void>}
     */
    async init() {
        this.on('supplierList', async (req) => {
            const oResult = await supplierMaster.list(cds.db);
            oResult.canWrite = await canWrite(req);                  // 화면이 등록·저장 버튼을 켤지
            return JSON.stringify(oResult);
        });

        this.on('supplierDetail', (req) => run(req, async () => {
            const oResult = await supplierMaster.detail(cds.db, String(req.data.code || ''));
            oResult.canWrite = await canWrite(req);
            return oResult;
        }));

        this.on('supplierPreview', (req) => {
            const oValues = valuesOf(req);
            if (!oValues) { return; }
            return run(req, () => supplierMaster.preview(cds.db, String(req.data.code || ''), oValues));
        });

        this.on('saveSupplier', async (req) => {
            if (!(await canWrite(req))) { return req.reject(403, '공급업체 마스터 등록·수정 권한이 없습니다.'); }
            const oValues = valuesOf(req);
            if (!oValues) { return; }
            const sResult = await run(req, () => supplierMaster.save(cds.db,
                { code: req.data.code || null, values: oValues, stamp: req.data.stamp, actor: req.user.id }));
            if (typeof sResult === 'string') {
                const oResult = JSON.parse(sResult);
                if (oResult.changed) {
                    await audit.log(req, { action: req.data.code ? 'SUPPLIER_UPDATE' : 'SUPPLIER_CREATE',
                        objectKey: oResult.code, after: { values: oValues, applied: oResult.applied } });
                }
            }
            return sResult;
        });

        this.on('linkLegacyContracts', async (req) => {
            if (!(await canWrite(req))) { return req.reject(403, '기존 계약 연결 권한이 없습니다.'); }
            return run(req, () => supplierMaster.linkLegacy(cds.db, req.user.id, req.data.apply === true));
        });

        await super.init();
    }
};
