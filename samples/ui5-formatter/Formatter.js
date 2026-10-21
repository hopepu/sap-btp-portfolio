sap.ui.define([
  "sap/ui/core/format/DateFormat"
], function (DateFormat) {
  "use strict";

  // 공용 표시 포매터 — 화면마다 같은 표시 로직을 따로 정의하지 않도록 이 파일을 먼저 찾고, 없으면 여기에 추가한다
  const oKstTimestampFormat = DateFormat.getDateTimeInstance({ pattern: "yyyy-MM-dd HH:mm", UTC: false }); // 로컬 일시 표시

  const FORMATS = {
    /**
     * 천단위 쉼표(ko-KR). 화면의 모든 숫자는 이 형식을 쓴다(연도·코드·ID 제외).
     * @param {number|string} vValue 값
     * @param {number} [iDigits] 소수 자리(기본 0)
     * @returns {string} 표시 문자열
     */
    comma: function (vValue, iDigits) {
      if (vValue === null || vValue === undefined || vValue === "") { return ""; }
      const nValue = Number(vValue) || 0; // 숫자가 아니면 0
      const iFractionDigits = Number(iDigits) || 0; // 소수 자리
      return nValue.toLocaleString("ko-KR", { minimumFractionDigits: iFractionDigits, maximumFractionDigits: iFractionDigits });
    },

    /**
     * 억 단위 금액(소수 1자리).
     * @param {number} vValue 원 단위 금액
     * @returns {string} "1,234.5억"
     */
    hundredMillion: function (vValue) {
      return FORMATS.comma((Number(vValue) || 0) / 1e8, 1) + "억";
    },

    /**
     * 비율(소수 2자리 + %). 분모가 0 이라 Infinity/NaN 이 오면 "-" 로 표시한다.
     * @param {number} vValue 비율 값
     * @returns {string} "12.34%"
     */
    rate: function (vValue) {
      const nValue = Number(vValue); // 숫자 변환
      if (!isFinite(nValue)) { return "-"; }
      return FORMATS.comma(nValue, 2) + "%";
    },

    /**
     * 로컬 일시.
     * @param {Date|string} vDate 일시
     * @returns {string} "yyyy-MM-dd HH:mm"
     */
    timestamp: function (vDate) {
      if (!vDate) { return ""; }
      return oKstTimestampFormat.format(vDate instanceof Date ? vDate : new Date(vDate));
    }
  };

  return {
    /**
     * XML 뷰용 단일 진입점: formatter: '.plFormat' → Formatter.plFormat(값, '<종류>', 추가1)
     * @param {*} vValue 값
     * @param {string} sType 포맷 종류(comma | hundredMillion | rate | timestamp)
     * @param {*} [vExtra] 포맷별 추가 인자
     * @returns {string} 표시 문자열
     */
    plFormat: function (vValue, sType, vExtra) {
      const fnFormat = FORMATS[sType]; // 종류별 포맷 함수
      return fnFormat ? fnFormat(vValue, vExtra) : String(vValue === undefined || vValue === null ? "" : vValue);
    },
    FORMATS: FORMATS
  };
});
