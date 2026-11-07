// 새 칸 백필 스크립트 — 기존 행의 빈 칸(NULL)을 원천 데이터에서 찾아 채운다.
//
// 사용:  node backfillColumn.js           (미리보기: 대조 · 건수만)
//        node backfillColumn.js apply     (빈 칸만 채움 — 멱등, 되돌리기 = 백업된 ID 들을 NULL 로)
//
// 원칙
//   1) 기본은 미리보기. 실제 반영은 'apply' 를 명시해야만 한다.
//   2) 대상 칸이 아직 배포되지 않았으면 아무것도 하지 않는다(엔티티 배포 여부 확인).
//   3) 빈 칸(NULL)만 채운다 — 사람이 이미 입력한 값은 건드리지 않고, 몇 번 돌려도 결과가 같다.
//   4) 채우기 전에 "채울 행 ID" 를 파일로 백업한다 — 되돌리기는 그 ID 들만 NULL 로.
//   5) UPDATE 는 묶음 단위(파라미터 바인딩)로 보낸다.
const fs = require('fs');
const path = require('path');
const cds = require('@sap/cds');

const TABLE = 'FINANCE_SALES_PIPELINE';                     // 대상 테이블(물리 이름)
const COLUMN = 'SALES_ORG_CODE';                            // 새로 추가한 칸
const SOURCE_FILE = path.join(__dirname, 'data', 'pipeline_source.json'); // 원천: [{ opportunityNo, orgName }]
const BACKUP_FILE = path.join(__dirname, 'backup', `backup_${TABLE.toLowerCase()}_${new Date().toISOString().slice(0, 10)}.json`);
const CHUNK = 500;
const bApply = process.argv[2] === 'apply';

/**
 * 행 키를 소문자로 맞춘다(HANA 원문 SQL 결과는 대문자 키).
 * @param {object[]} aRows 결과 행
 * @returns {object[]} 소문자 키 행
 */
function toLowerCaseKeys(aRows) {
    return (aRows || []).map((oRow) => Object.fromEntries(Object.entries(oRow).map(([sKey, vValue]) => [sKey.toLowerCase(), vValue])));
}

(async () => {
    const oDb = await cds.connect.to('db');

    // 2) 칸이 배포됐는지 먼저 확인
    const [oColumn] = toLowerCaseKeys(await oDb.run(
        'SELECT COUNT(*) AS cnt FROM TABLE_COLUMNS WHERE SCHEMA_NAME = CURRENT_SCHEMA AND TABLE_NAME = ? AND COLUMN_NAME = ?', [TABLE, COLUMN]));
    if (!Number(oColumn.cnt)) { console.log(`${TABLE}.${COLUMN} 칸이 아직 없습니다 — 엔티티를 먼저 배포하세요.`); process.exit(1); }

    // 원천 → 조직 코드 매핑
    const aDepartments = toLowerCaseKeys(await oDb.run('SELECT code, name FROM ORG_DEPARTMENT'));
    const mNameToCode = new Map(aDepartments.map((o) => [o.name, o.code]));
    const mOpportunityToOrg = new Map();
    const aUnknownOrg = new Set();
    JSON.parse(fs.readFileSync(SOURCE_FILE, 'utf8')).forEach((o) => {
        const sCode = mNameToCode.get(o.orgName);
        if (sCode) { mOpportunityToOrg.set(o.opportunityNo, sCode); } else { aUnknownOrg.add(o.orgName); }
    });

    // 3) 빈 칸인 행만 대상
    const aTargets = toLowerCaseKeys(await oDb.run(`SELECT ID, OPPORTUNITY_NO FROM ${TABLE} WHERE ${COLUMN} IS NULL`));
    const mByOrg = new Map();                                // 조직 코드 → [ID]
    let iNoSource = 0;
    aTargets.forEach((o) => {
        const sOrg = mOpportunityToOrg.get(o.opportunity_no);
        if (!sOrg) { iNoSource += 1; return; }
        if (!mByOrg.has(sOrg)) { mByOrg.set(sOrg, []); }
        mByOrg.get(sOrg).push(o.id);
    });

    const iFill = [...mByOrg.values()].reduce((n, a) => n + a.length, 0);
    console.log(`빈 칸 ${aTargets.length}행 · 채울 수 있음 ${iFill}행 · 원천 없음 ${iNoSource}행 · 매핑 안 되는 조직명 ${aUnknownOrg.size}개`);
    mByOrg.forEach((aIds, sOrg) => console.log(`  ${sOrg}: ${aIds.length}행`));
    if (aUnknownOrg.size) { console.log('  매핑 안 되는 조직명:', [...aUnknownOrg].join(', ')); }

    // 1) 기본은 미리보기
    if (!bApply) { console.log('미리보기 — 반영하려면 apply'); process.exit(0); }

    // 4) 백업 후 반영
    fs.mkdirSync(path.dirname(BACKUP_FILE), { recursive: true });
    fs.writeFileSync(BACKUP_FILE, JSON.stringify({ table: TABLE, column: COLUMN, ids: Object.fromEntries(mByOrg) }, null, 2));
    console.log('백업:', BACKUP_FILE);

    let iUpdated = 0;
    for (const [sOrg, aIds] of mByOrg) {
        for (let i = 0; i < aIds.length; i += CHUNK) {                     // 5) 묶음 단위 UPDATE
            const aChunk = aIds.slice(i, i + CHUNK);
            const iCount = await oDb.run(
                `UPDATE ${TABLE} SET ${COLUMN} = ? WHERE ${COLUMN} IS NULL AND ID IN (${aChunk.map(() => '?').join(',')})`, [sOrg, ...aChunk]);
            iUpdated += Number(iCount) || 0;
        }
    }
    console.log(`반영 ${iUpdated}행 완료`);
    process.exit(0);
})().catch((oError) => { console.error(oError); process.exit(1); });
