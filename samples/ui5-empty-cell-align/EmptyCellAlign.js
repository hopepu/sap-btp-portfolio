/**
 * 빈 칸 가운데 정렬 — 표의 값이 비어 있으면("-" 등) 칸을 가운데 정렬로 바꾸는 공용 유틸.
 *
 * 처음 버전은 MutationObserver 콜백에서 바뀐 노드마다 closest / querySelectorAll 을 바로 돌렸다.
 * 큰 표를 다시 그리면 노드 수천 개마다 DOM 검색이 돌아 한 화면에서 CPU 1.6초 이상을 썼다.
 *
 * 바꾼 방식:
 *   1) 콜백에서는 DOM 을 찾지 않고 "바뀐 요소"만 Set 에 모은다.
 *   2) 다음 프레임(requestAnimationFrame)에 한 번만 칸을 찾는다.
 *   3) 바깥 요소가 함께 바뀌었으면 안쪽 요소는 건너뛴다 — 바깥에서 한 번에 잡힌다.
 *   4) 안에 <td> 가 없는 요소는 칸 찾기를 하지 않는다 — 대부분의 변경은 표 밖이다.
 * 칸 판정(무엇을 빈 칸으로 볼지)은 그대로 두고, "언제·얼마나 자주 찾는지"만 바꿨다.
 */
sap.ui.define([], function () {
    "use strict";

    var CELL_SELECTOR = "td.sapUiTableCell, td.sapMListTblCell"; // 대상 칸
    var EMPTY_TEXTS = ["", "-", "0"];                            // 빈 값으로 보는 글자
    var CENTER_CLASS = "emptyCellCenter";

    var oPendingRoots = new Set();   // 이번 프레임에 바뀐 요소
    var oPendingCells = new Set();   // 이번 프레임에 다시 볼 칸
    var bScheduled = false;
    var oObserver = null;

    /**
     * 칸 하나 판정 — 글자가 빈 값이면 가운데 정렬.
     * @param {HTMLElement} oCell 칸
     * @returns {void}
     */
    function applyCell(oCell) {
        if (!oCell.isConnected) { return; }
        var sText = (oCell.textContent || "").trim();
        oCell.classList.toggle(CENTER_CLASS, EMPTY_TEXTS.indexOf(sText) >= 0);
    }

    /**
     * 바뀐 요소들에서 다시 볼 칸을 모은다 — 요소를 품은 칸 + 요소 안의 칸.
     * @param {Set<HTMLElement>} oRoots 바뀐 요소 모음
     * @returns {void}
     */
    function collectCells(oRoots) {
        oRoots.forEach(function (oRoot) {
            if (!oRoot.isConnected) { return; }                              // 이미 화면에서 빠진 요소
            for (var oAncestor = oRoot.parentElement; oAncestor; oAncestor = oAncestor.parentElement) {
                if (oRoots.has(oAncestor)) { return; }                       // 바깥 요소가 함께 바뀜 — 그쪽에서 잡힌다
            }
            var oCell = oRoot.closest(CELL_SELECTOR);
            if (oCell) { oPendingCells.add(oCell); }                         // 칸 안의 글자가 바뀐 경우
            if (oRoot.getElementsByTagName("td").length) {                   // 칸을 품은 요소만 칸을 찾는다
                oRoot.querySelectorAll(CELL_SELECTOR).forEach(function (oInner) { oPendingCells.add(oInner); });
            }
        });
    }

    /**
     * 모아 둔 요소·칸을 한 번에 처리한다(같은 프레임의 여러 변경을 묶는다).
     * @returns {void}
     */
    function flush() {
        bScheduled = false;
        var oRoots = oPendingRoots;
        oPendingRoots = new Set();
        collectCells(oRoots);
        var aCells = Array.from(oPendingCells);
        oPendingCells.clear();
        aCells.forEach(applyCell);
    }

    /**
     * 바뀐 노드를 요소 단위로 모은다 — 여기서는 DOM 을 찾지 않는다.
     * @param {Node} oNode 바뀐 노드
     * @returns {void}
     */
    function queueRoot(oNode) {
        var oElement = oNode.nodeType === Node.ELEMENT_NODE ? oNode : oNode.parentElement;
        if (oElement) { oPendingRoots.add(oElement); }
    }

    /**
     * 변경 감시 콜백 — 칸·바뀐 요소를 모아 다음 프레임에 처리한다.
     * @param {MutationRecord[]} aRecords 변경 기록
     * @returns {void}
     */
    function onMutations(aRecords) {
        aRecords.forEach(function (oRecord) {
            if (oRecord.type === "characterData") { queueRoot(oRecord.target); return; }
            if (oRecord.target.nodeType === Node.ELEMENT_NODE && oRecord.target.matches(CELL_SELECTOR)) {
                oPendingCells.add(oRecord.target);
                return;
            }
            oRecord.addedNodes.forEach(queueRoot);
        });
        if (!bScheduled) { bScheduled = true; window.requestAnimationFrame(flush); }
    }

    return {
        /**
         * 감시 시작 — 앱 시작 시 한 번.
         * @param {HTMLElement} [oRoot] 감시할 영역(기본: body)
         * @returns {void}
         */
        start: function (oRoot) {
            if (oObserver) { return; }
            oObserver = new MutationObserver(onMutations);
            oObserver.observe(oRoot || document.body, { childList: true, subtree: true, characterData: true });
            queueRoot(oRoot || document.body);
            bScheduled = true;
            window.requestAnimationFrame(flush);
        },

        /**
         * 감시 종료.
         * @returns {void}
         */
        stop: function () {
            if (oObserver) { oObserver.disconnect(); oObserver = null; }
        }
    };
});
