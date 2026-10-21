sap.ui.define([
  "sap/ui/base/Object",
  "sap/ui/model/json/JSONModel"
], function (BaseObject, JSONModel) {
  "use strict";

  // 부서 선택 다이얼로그 전용 컨트롤러 — DeptValueHelp.fragment.xml 과 1:1 한 쌍
  return BaseObject.extend("sample.budget.controller.fragment.DeptValueHelp", {

    /**
     * @param {sap.ui.core.mvc.Controller} oHost 호스트 컨트롤러
     */
    constructor: function (oHost) {
      this._oHost = oHost;            // 호스트 컨트롤러
      this._bWired = false;           // 다이얼로그 1회 초기화 여부
    },

    /** @returns {sap.ui.core.mvc.View} 호스트 뷰 */
    getView: function () { return this._oHost.getView(); },

    /**
     * 호스트 뷰 기준으로 컨트롤을 찾는다(프래그먼트 id = 호스트 뷰 id).
     * @param {string} sId 컨트롤 id
     * @returns {sap.ui.core.Control} 컨트롤
     */
    byId: function (sId) { return this._oHost.byId(sId); },

    /**
     * 다이얼로그를 연다. 모델·이벤트 연결은 처음 한 번만 한다.
     * @returns {void}
     */
    open: function () {
      const oDialog = this.byId("deptValueHelpDialog"); // 프래그먼트 루트 Dialog
      if (!this._bWired) {
        oDialog.setModel(new JSONModel({ keyword: "", items: [] }), "vh"); // 모델은 뷰가 아니라 Dialog 자신에 둔다
        oDialog.attachBeforeOpen(this._resetSearch, this);                  // 열 때마다 검색 초기화
        this.getView().addDependent(oDialog);                               // 호스트 뷰의 모델·수명주기 상속
        this._bWired = true;
      }
      oDialog.open();
    },

    /**
     * 열 때마다 검색어와 목록을 초기화한다.
     * @returns {void}
     */
    _resetSearch: function () {
      this.byId("deptValueHelpDialog").getModel("vh").setData({ keyword: "", items: [] }); // setModel 반복 대신 setData
    },

    /**
     * 확인·닫기 버튼 공용 처리 — XML 에서 넘긴 동작 이름으로 분기한다.
     * @param {sap.ui.base.Event} oEvent 버튼 press 이벤트
     * @param {string} sAction "Confirm" | "Close"
     * @returns {void}
     */
    onDialogAction: function (oEvent, sAction) {
      const oDialog = this.byId("deptValueHelpDialog"); // 대상 다이얼로그
      if (sAction === "Confirm") {
        const oSelectedItem = this.byId("deptList").getSelectedItem(); // 선택 행
        if (oSelectedItem) { this._oHost.applySelectedDept(oSelectedItem.getBindingContext("vh").getObject()); } // 결과는 호스트 메서드로
      }
      oDialog.close();
    }
  });
});
