namespace supplierMaster;

using { cuid, managed } from '@sap/cds/common';

/**
 * 공급업체 마스터 원장 — 기존 시스템 테이블이라 수정 시각 컬럼이 없다.
 */
entity Supplier {
    key code         : String(10);   // 공급업체 코드 (자동 채번)
        name         : String(80);
        bizNo        : String(12);   // 사업자등록번호 — 중복 금지
        tradeYn      : String(1);    // Y 거래 / N 거래중지
        orderBlock   : String(1);    // Y 발주차단
        bankName     : String(60);   // 계약에 복사되는 칸
        bankAccount  : String(40);   // 계약에 복사되는 칸
        contactName  : String(40);
        contactPhone : String(20);
}

/**
 * 변경 이력 — 칸 하나가 한 줄.
 * 같은 저장은 batchId 로 묶고, 그 저장이 진행 중 계약 몇 건에 반영됐는지 남긴다.
 */
entity ChangeLog : cuid, managed {
    supplierCode     : String(10);
    batchId          : String(36);   // 한 번의 저장 묶음
    action           : String(10);   // CREATE | UPDATE | LINK
    field            : String(30);
    fieldLabel       : String(50);   // 화면 이름
    oldValue         : String(300);
    newValue         : String(300);
    appliedContracts : Integer;      // 이 저장으로 바뀐 진행 중 계약 수
}
