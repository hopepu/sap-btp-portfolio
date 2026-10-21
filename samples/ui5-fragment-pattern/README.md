# 프래그먼트 + 전용 컨트롤러 패턴 (UI5)

다이얼로그나 값 도움(Value Help) 같은 프래그먼트를 **XML 한 개 + 전용 컨트롤러 .js 한 개**로 묶고, 호스트 화면이 처음 열 때 한 번만 로드하는 패턴입니다.

```
controller/Main.controller.js                 호스트 — 지연 로딩, 결과 수신
controller/fragment/DeptValueHelp.js          전용 컨트롤러 — 다이얼로그의 모든 동작
view/fragment/DeptValueHelp.fragment.xml      프래그먼트
```

## 왜 이렇게 했나
이전에는 프래그먼트 함수를 `Object.assign`으로 호스트 컨트롤러에 섞어 넣었습니다.
그러자 "이 함수가 어디서 왔는지" 추적하기 어려웠고, 이름이 같은 함수가 조용히 덮어써지는 문제가 생겼습니다.

## 규칙
- 프래그먼트 id = 호스트 뷰 id → 전용 컨트롤러가 `host.byId()`로 컨트롤을 찾습니다.
- 다이얼로그 모델은 뷰가 아니라 **Dialog 자신**에 둡니다(리소스 절약, 사용 범위가 분명함).
- 열 때마다 해야 하는 초기화는 `attachBeforeOpen`, 한 번만 할 일은 `_bWired` 플래그로 처리합니다.
- 비슷한 버튼 동작은 XML에서 동작 이름을 넘겨 한 함수에서 분기합니다.
- `sap.ui.require` 경로는 실제 파일명과 **대소문자까지** 일치해야 합니다(배포 환경은 대소문자를 구분함).
