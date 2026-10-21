sap.ui.define([
  "sap/ui/core/mvc/Controller",
  "sap/ui/core/Fragment"
], function (Controller, Fragment) {
  "use strict";

  // 예산 목록 화면 — 부서 선택 다이얼로그를 처음 열 때 한 번만 지연 로딩한다
  return Controller.extend("sample.budget.controller.Main", {

    /**
     * 화면 초기화.
     * @returns {void}
     */
    onInit: function () {
      this._oDeptValueHelp = null; // 부서 선택 다이얼로그 전용 컨트롤러(최초 호출 시 생성)
    },

    /**
     * 부서 선택 다이얼로그를 연다. 최초 호출 때만 전용 컨트롤러와 프래그먼트를 로드한다.
     * @param {sap.ui.base.Event} oEvent 버튼 press 이벤트
     * @returns {Promise<void>}
     */
    onOpenDeptValueHelp: async function (oEvent) {
      if (!this._oDeptValueHelp) {
        const DeptValueHelp = await new Promise(function (fnResolve) {
          sap.ui.require(["sample/budget/controller/fragment/DeptValueHelp"], fnResolve); // 파일명과 대소문자까지 일치해야 한다
        });
        this._oDeptValueHelp = new DeptValueHelp(this); // 호스트(this) 주입
        await Fragment.load({
          id: this.getView().getId(), // 프래그먼트 id = 호스트 뷰 id → 전용 컨트롤러가 host.byId 로 찾는다
          name: "sample.budget.view.fragment.DeptValueHelp",
          controller: this._oDeptValueHelp
        });
      }
      this._oDeptValueHelp.open();
    },

    /**
     * 다이얼로그가 고른 부서를 검색 조건에 반영한다(전용 컨트롤러가 호출).
     * @param {object} oDept 선택 부서 { code, name }
     * @returns {void}
     */
    applySelectedDept: function (oDept) {
      this.getView().getModel("search").setProperty("/orgCode", oDept.code); // 검색 조건 갱신
      this.getView().getModel("search").setProperty("/orgName", oDept.name); // 표시용 이름
    }
  });
});
