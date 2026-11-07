using supplierMaster from '../db/supplierMaster';

/**
 * 공급업체 마스터 — 조회는 로그인 사용자 전체, 쓰기는 담당 조직(하위 포함)·권한 관리자.
 * 화면이 한 번에 필요한 묶음(목록 + 상태별 건수, 상세 + 계약 + 이력)을 함수 하나로 돌려준다.
 */
@path    : 'supplier-master'
@requires: 'authenticated-user'
service SupplierMasterService {

    @readonly
    entity ChangeLogs as projection on supplierMaster.ChangeLog;

    // 목록 — 카드(이름·사업자번호·담당자·거래 상태·진행 중 계약 수)와 상태별 건수(JSON)
    function supplierList() returns LargeString;

    // 상세 — 마스터 칸 · 저장 표식(stamp) · 이 업체의 계약(진행 중 먼저) · 변경 이력(JSON)
    function supplierDetail(code : String(10)) returns LargeString;

    // 저장 미리보기 — 바뀐 칸 · 반영될 진행 중 계약 · 거래 상태 경고(JSON)
    function supplierPreview(code : String(10), values : LargeString) returns LargeString;

    // 저장 — code 가 비면 신규 등록(채번), 있으면 수정 + 진행 중 계약 반영
    action saveSupplier(code : String(10), values : LargeString, stamp : String(20)) returns LargeString;

    // 기존 계약 연결 — 공급업체 코드 없이 이름으로만 이어진 계약을 마스터에 등록·연결 (apply=false 면 미리보기)
    action linkLegacyContracts(apply : Boolean) returns LargeString;
}
