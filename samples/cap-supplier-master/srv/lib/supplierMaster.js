const crypto = require('crypto');
const cds = require('@sap/cds');

const SUPPLIER = 'supplierMaster.Supplier';
const LOG = 'supplierMaster.ChangeLog';
const CONTRACT = 'contract.PurchaseContract'; // { seq, supplierCode, supplierName, bankName, bankAccount, status, endDate }

/** 화면에서 고칠 수 있는 칸. contract=true 는 진행 중 계약에 복사되는 칸. */
const FIELDS = [
    { field: 'name',         label: '업체명',          required: true, contract: true },
    { field: 'bizNo',        label: '사업자등록번호',  required: true },
    { field: 'tradeYn',      label: '거래 여부' },
    { field: 'orderBlock',   label: '발주 차단' },
    { field: 'bankName',     label: '은행',            contract: true },
    { field: 'bankAccount',  label: '계좌번호',        contract: true },
    { field: 'contactName',  label: '담당자' },
    { field: 'contactPhone', label: '담당자 연락처' }
];

/**
 * 업무 오류 — 서비스가 status 를 보고 CAP 거절로 바꾼다.
 * @param {number} iStatus HTTP 상태
 * @param {string} sMessage 사용자에게 보일 문구
 * @returns {Error} 오류
 */
function fail(iStatus, sMessage) {
    const oError = new Error(sMessage);
    oError.status = iStatus;
    return oError;
}

/**
 * 거래 상태.
 * @param {object} oSupplier 공급업체 행
 * @returns {'OK'|'STOP'|'BLOCK'} 정상 / 거래중지 / 발주차단
 */
function stateOf(oSupplier) {
    if (String(oSupplier.orderBlock || '').toUpperCase() === 'Y') { return 'BLOCK'; }
    return String(oSupplier.tradeYn || '').toUpperCase() === 'Y' ? 'OK' : 'STOP';
}

/**
 * 저장 기준 표식 — 원장에 수정 시각 컬럼이 없어서, 칸 값 전체의 해시로 "불러온 뒤 누가 고쳤는지"를 판정한다.
 * @param {object} oSupplier 공급업체 행
 * @returns {string} 16자리 표식
 */
function stampOf(oSupplier) {
    const sText = FIELDS.map((o) => `${o.field}=${oSupplier[o.field] == null ? '' : oSupplier[o.field]}`).join('|');
    return crypto.createHash('sha1').update(sText).digest('hex').slice(0, 16);
}

/**
 * 화면 값 정리 — 아는 칸만 남기고 문자열 앞뒤 공백을 지운다.
 * @param {object} oInput 화면 값
 * @returns {object} 정리된 값
 */
function normalize(oInput) {
    const oValues = {};
    FIELDS.forEach((o) => {
        if (!(o.field in oInput)) { return; }
        const vValue = oInput[o.field];
        oValues[o.field] = typeof vValue === 'string' ? vValue.trim() : vValue;
    });
    return oValues;
}

/**
 * 바뀐 칸 — null·undefined·'' 는 같은 값으로 본다.
 * @param {object} oBefore 저장 전 행
 * @param {object} oValues 정리된 화면 값
 * @returns {object[]} [{ field, label, contract, oldValue, newValue }]
 */
function diffOf(oBefore, oValues) {
    const fnText = (v) => (v === null || v === undefined ? '' : String(v));
    return FIELDS.filter((o) => o.field in oValues && fnText(oBefore[o.field]) !== fnText(oValues[o.field]))
        .map((o) => ({ field: o.field, label: o.label, contract: !!o.contract,
            oldValue: fnText(oBefore[o.field]), newValue: fnText(oValues[o.field]) }));
}

/**
 * 진행 중 계약 — 종료일이 오늘 이후이고 해지되지 않은 것.
 * @param {object} oDb db 서비스
 * @param {string} sCode 공급업체 코드
 * @returns {Promise<object[]>} 계약 행
 */
async function activeContracts(oDb, sCode) {
    const sToday = new Date().toISOString().slice(0, 10);
    return oDb.run(SELECT.from(CONTRACT).where({ supplierCode: sCode, status: { '!=': 'TERMINATED' }, endDate: { '>=': sToday } }));
}

/**
 * 이력 쓰기.
 * @param {object} oDb db 서비스
 * @param {object[]} aRows 이력 행
 * @returns {Promise<void>}
 */
async function writeLog(oDb, aRows) {
    if (aRows.length) { await oDb.run(INSERT.into(LOG).entries(aRows)); }
}

/**
 * 다음 공급업체 코드 — 'SUP' + 7자리 순번.
 * @param {object} oDb db 서비스
 * @returns {Promise<string>} 새 코드
 */
async function nextCode(oDb) {
    const oLast = await oDb.run(SELECT.one.from(SUPPLIER).columns('code').where({ code: { like: 'SUP%' } }).orderBy('code desc'));
    const iNext = oLast ? Number(oLast.code.slice(3)) + 1 : 1;
    return `SUP${String(iNext).padStart(7, '0')}`;
}

/**
 * 목록과 상태별 건수.
 * @param {object} oDb db 서비스
 * @returns {Promise<object>} { suppliers, counts }
 */
async function list(oDb) {
    const aSuppliers = await oDb.run(SELECT.from(SUPPLIER).orderBy('name'));
    const oCounts = { OK: 0, STOP: 0, BLOCK: 0 };
    const aCards = aSuppliers.map((o) => { const sState = stateOf(o); oCounts[sState] += 1; return { ...o, state: sState }; });
    return { suppliers: aCards, counts: oCounts };
}

/**
 * 상세 — 마스터 칸 · 저장 표식 · 계약 · 이력.
 * @param {object} oDb db 서비스
 * @param {string} sCode 공급업체 코드
 * @returns {Promise<object>} { supplier, state, stamp, contracts, history }
 */
async function detail(oDb, sCode) {
    const oSupplier = await oDb.run(SELECT.one.from(SUPPLIER).where({ code: sCode }));
    if (!oSupplier) { throw fail(404, `공급업체 ${sCode}이(가) 없습니다.`); }
    const aContracts = await oDb.run(SELECT.from(CONTRACT).where({ supplierCode: sCode }).orderBy('endDate desc'));
    const aHistory = await oDb.run(SELECT.from(LOG).where({ supplierCode: sCode }).orderBy('createdAt desc'));
    return { supplier: oSupplier, state: stateOf(oSupplier), stamp: stampOf(oSupplier), contracts: aContracts, history: aHistory };
}

/**
 * 저장 미리보기 — 무엇이 바뀌고, 진행 중 계약 몇 건에 반영되는지, 거래 상태가 나빠지는지.
 * @param {object} oDb db 서비스
 * @param {string} sCode 공급업체 코드
 * @param {object} oInput 화면 값
 * @returns {Promise<object>} { changes, contracts, warning }
 */
async function preview(oDb, sCode, oInput) {
    const oBefore = await oDb.run(SELECT.one.from(SUPPLIER).where({ code: sCode }));
    if (!oBefore) { throw fail(404, `공급업체 ${sCode}이(가) 없습니다.`); }
    const aChanges = diffOf(oBefore, normalize(oInput));
    const aActive = await activeContracts(oDb, sCode);
    const bContractFields = aChanges.some((o) => o.contract);
    const sAfter = stateOf({ ...oBefore, ...normalize(oInput) });
    return {
        changes: aChanges,
        contracts: bContractFields ? aActive : [],
        warning: sAfter !== 'OK' && stateOf(oBefore) === 'OK' && aActive.length
            ? `진행 중 계약 ${aActive.length}건은 그대로 진행되고, 새 계약·공급업체 지정만 막힙니다.` : null
    };
}

/**
 * 저장 — 신규는 등록만, 수정은 마스터를 고치고 계약에 복사되는 칸이 바뀌었으면 진행 중 계약에도 반영한다.
 * 요청 트랜잭션 안에서 실행되므로, 중간에 실패하면 마스터·계약·이력이 함께 되돌아간다.
 * @param {object} oDb db 서비스
 * @param {object} oInput { code, values, stamp, actor }
 * @returns {Promise<object>} { code, changed, applied, warning }
 */
async function save(oDb, oInput) {
    const sActor = oInput.actor || 'system';
    const oValues = normalize(oInput.values || {});
    const sBatchId = cds.utils.uuid();

    if (oValues.bizNo) {                                               // 사업자번호 중복 금지(자기 자신 제외)
        const oDup = await oDb.run(SELECT.one.from(SUPPLIER).columns('code', 'name')
            .where({ bizNo: oValues.bizNo, code: { '!=': oInput.code || '-' } }));
        if (oDup) { throw fail(409, `사업자등록번호 ${oValues.bizNo}은(는) 이미 ${oDup.name}(${oDup.code})에 등록돼 있습니다.`); }
    }

    if (!oInput.code) {                                                // 신규 등록
        FIELDS.filter((o) => o.required).forEach((o) => { if (!oValues[o.field]) { throw fail(400, `${o.label}을(를) 입력하세요.`); } });
        const sCode = await nextCode(oDb);
        await oDb.run(INSERT.into(SUPPLIER).entries({ ...oValues, code: sCode, tradeYn: oValues.tradeYn || 'Y', orderBlock: oValues.orderBlock || 'N' }));
        await writeLog(oDb, FIELDS.filter((o) => oValues[o.field] != null).map((o) => ({
            ID: cds.utils.uuid(), supplierCode: sCode, batchId: sBatchId, action: 'CREATE', field: o.field, fieldLabel: o.label,
            oldValue: null, newValue: String(oValues[o.field]).slice(0, 300), appliedContracts: 0, createdBy: sActor, modifiedBy: sActor })));
        return { code: sCode, changed: Object.keys(oValues).length, applied: 0, warning: null };
    }

    const oBefore = await oDb.run(SELECT.one.from(SUPPLIER).where({ code: oInput.code }));
    if (!oBefore) { throw fail(404, `공급업체 ${oInput.code}이(가) 없습니다.`); }
    if (oInput.stamp !== stampOf(oBefore)) {                           // 낙관적 동시성 — 불러온 뒤 다른 사람이 고쳤다
        throw fail(409, '불러온 뒤 다른 사람이 이 공급업체를 고쳤습니다. 다시 열어 지금 값으로 고치세요.');
    }
    FIELDS.filter((o) => o.required && o.field in oValues).forEach((o) => { if (!oValues[o.field]) { throw fail(400, `${o.label}은(는) 비울 수 없습니다.`); } });

    const aChanges = diffOf(oBefore, oValues);
    if (!aChanges.length) { return { code: oInput.code, changed: 0, applied: 0, warning: null }; }

    const oSet = Object.fromEntries(aChanges.map((o) => [o.field, oValues[o.field]]));
    await oDb.run(UPDATE(SUPPLIER).set(oSet).where({ code: oInput.code }));
    const oAfter = { ...oBefore, ...oSet };

    const aActive = await activeContracts(oDb, oInput.code);
    const aContractChanges = aChanges.filter((o) => o.contract);       // 계약에 복사되는 칸이 바뀌었을 때만 반영
    if (aContractChanges.length && aActive.length) {
        const oContractSet = { supplierName: oAfter.name, bankName: oAfter.bankName, bankAccount: oAfter.bankAccount };
        await oDb.run(UPDATE(CONTRACT).set(oContractSet).where({ seq: { in: aActive.map((o) => o.seq) } }));
    }
    const iApplied = aContractChanges.length ? aActive.length : 0;

    await writeLog(oDb, aChanges.map((o) => ({
        ID: cds.utils.uuid(), supplierCode: oInput.code, batchId: sBatchId, action: 'UPDATE', field: o.field, fieldLabel: o.label,
        oldValue: o.oldValue.slice(0, 300), newValue: o.newValue.slice(0, 300), appliedContracts: o.contract ? iApplied : 0,
        createdBy: sActor, modifiedBy: sActor })));

    return {
        code: oInput.code, changed: aChanges.length, applied: iApplied,
        warning: stateOf(oAfter) !== 'OK' && stateOf(oBefore) === 'OK' && aActive.length
            ? `진행 중 계약 ${aActive.length}건은 그대로 진행되고, 새 계약·공급업체 지정만 막힙니다.` : null
    };
}

/**
 * 기존 계약 연결 — 공급업체 코드 없이 이름·사업자번호로만 이어진 계약의 거래처를 마스터에 등록하고 계약에 코드를 채운다.
 * 연결은 "값을 바꾸는 반영"이 아니라 "코드를 잇는 것"이라 종료 계약까지 모두 잇는다.
 * @param {object} oDb db 서비스
 * @param {string} sActor 작성자
 * @param {boolean} bApply false 면 미리보기만
 * @returns {Promise<object>} { suppliers: [{ key, name, bizNo, code, created, contracts }], contracts }
 */
async function linkLegacy(oDb, sActor, bApply) {
    const aOrphans = await oDb.run(SELECT.from(CONTRACT).columns('seq', 'supplierName', 'bizNo').where({ supplierCode: null }));
    const mGroups = new Map();                                         // 사업자번호(없으면 이름) 기준으로 묶는다
    aOrphans.forEach((o) => {
        const sKey = o.bizNo || `NAME:${o.supplierName}`;
        if (!mGroups.has(sKey)) { mGroups.set(sKey, { key: sKey, name: o.supplierName, bizNo: o.bizNo || null, seqs: [] }); }
        mGroups.get(sKey).seqs.push(o.seq);
    });

    const aResult = [];
    for (const oGroup of mGroups.values()) {
        const oExisting = oGroup.bizNo ? await oDb.run(SELECT.one.from(SUPPLIER).columns('code').where({ bizNo: oGroup.bizNo })) : null;
        let sCode = oExisting ? oExisting.code : null;
        if (bApply) {
            if (!sCode) {
                sCode = await nextCode(oDb);
                await oDb.run(INSERT.into(SUPPLIER).entries({ code: sCode, name: oGroup.name, bizNo: oGroup.bizNo, tradeYn: 'Y', orderBlock: 'N' }));
            }
            await oDb.run(UPDATE(CONTRACT).set({ supplierCode: sCode }).where({ seq: { in: oGroup.seqs }, supplierCode: null }));
            await writeLog(oDb, [{ ID: cds.utils.uuid(), supplierCode: sCode, batchId: cds.utils.uuid(), action: 'LINK', field: 'code',
                fieldLabel: '기존 계약 연결', oldValue: null, newValue: `${oGroup.seqs.length}건`, appliedContracts: oGroup.seqs.length,
                createdBy: sActor, modifiedBy: sActor }]);
        }
        aResult.push({ key: oGroup.key, name: oGroup.name, bizNo: oGroup.bizNo, code: sCode, created: !oExisting, contracts: oGroup.seqs.length });
    }
    return { suppliers: aResult, contracts: aOrphans.length };
}

module.exports = { list, detail, preview, save, linkLegacy, stampOf };
