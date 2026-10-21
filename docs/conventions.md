# 코딩 규칙과 디자인 시스템

팀과 AI 코딩 에이전트가 함께 따르는 **단일 규칙 문서**를 만들고 유지했습니다. 그중 핵심을 요약합니다.

## 1. CSS · 디자인 시스템

**새 클래스를 만들기 전에, 이미 정의된 유틸 클래스를 조합한다.**

```xml
<!-- 나쁨: 요소마다 전용 클래스 + CSS 추가 -->
<Text class="salesLabel"/>   <!-- .salesLabel { font-size:14px; font-weight:600; color:#2970F0 } -->

<!-- 좋음: 유틸 조합, CSS 추가 없음 -->
<Text class="custom-text-size-14 custom-text-bold-600 custom-text-color-blue"/>
```

- **3단계 CSS 구조**: 1단계 `style.css`(전역) → 2단계 `<앱>.css`(앱 공통, 클래스 `.<앱>`) → 3단계 `<페이지>.css`(페이지 전용, 클래스 `.<앱>-<페이지>`)
- 2·3단계 스타일은 최상위 클래스 블록 하나 안에서만 작성해 범위를 격리합니다.
- 모든 CSS는 셸 모듈 한 곳에만 둡니다. 다른 모듈 안에서 CSS를 만들지 않습니다.
- Dialog·Popover는 페이지 컨테이너 밖(static area)에 그려지므로, 프래그먼트 루트에 페이지 클래스를 **반드시** 붙입니다.
- 색은 hex를 직접 쓰지 않고 토큰(`--status-blue`, `--bg-app` …)을 씁니다.
- 고치는 순서는 **UI5 속성 먼저, 그다음 CSS**입니다(`alignItems`, `renderType="Bare"`, `gap`, `type="Emphasized"`).
- 작업을 마치면 레이아웃 감사 스크립트로 아이콘 정렬, 카드 빈 공간, 의도치 않은 가로 스크롤 같은 위반이 0건인지 **수치로** 확인합니다.

### Figma → UI5 매핑
| Figma | UI5 |
|---|---|
| 페이지 | `<Page class="common_basic">` + `<Panel class="pageCard">` |
| Primary 버튼 | `type="Emphasized"` + `btn_basic` |
| 라인 버튼 | `type="Transparent"` + `line_btn` |
| 검색바 | `<Toolbar class="search_bar">` + `search_title` + `search_buttons` |
| 상태 배지 | `<ObjectStatus class="statusBadge" data-statuscode="blue">` |
| 팝업 | `<Dialog class="popup_basic">` |

## 2. UI5 컨트롤러

- **인스턴스 변수**: `this._` + 타입 접두(`s/i/o/a/b/m`) + 의미 있는 이름, 선언마다 한 줄 주석
  ```js
  this._oProposalDialog = null; // 제안 등록 다이얼로그
  ```
- **이름은 읽으면 뜻이 보여야 한다**: `oIt`, `nNew`, `aMyAcc` ✗ → `oConditionItem`, `nNewRate`, `aMaterialAccess` ✓
  - 실제 사례: 한 서비스 파일 안에서 한 글자 헬퍼 `g`가 30번 재정의됐고, 그중 2번은 전혀 다른 뜻이었습니다. 이름이 뜻을 담았다면 바로 보였을 문제입니다.
- **프래그먼트 = XML + 전용 컨트롤러 .js 한 쌍**, 호스트가 처음 열 때 한 번만 지연 로딩합니다. `Object.assign`으로 함수를 섞어 넣는 방식은 금지합니다(함수 출처 추적이 어려워짐). → [samples/ui5-fragment-pattern](../samples/ui5-fragment-pattern)
- **포매터는 공용 파일 먼저**: 같은 표시 로직을 컨트롤러마다 따로 정의하지 않습니다. → [samples/ui5-formatter](../samples/ui5-formatter)
- **화면의 모든 숫자는 천단위 쉼표**(연도·코드·ID·전화번호 제외). 차트는 `formatString: "#,##0"`.
- JSONModel은 `setModel`을 한 번만 하고, 이후 갱신은 `setData`로 합니다.
- OData 읽기는 공용 비동기 GET 헬퍼, 쓰기는 V4 batch(`create` / `setProperty` / `delete` + `submitBatch`)를 씁니다.

## 3. CAP 백엔드

- 코드를 고치기 전에 반드시 분석을 먼저 씁니다: `[1] 전체 흐름` `[2] 문제 지점` `[3] 로그 기반 원인` `[4] 구조적 문제` `[5] 수정 방향`
- 검증은 시스템 경계(사용자 입력, 외부/OData 응답)에서만 합니다. 내부에서 보장된 값에 방어 코드를 쌓지 않습니다.
- 대량 데이터 변경 스크립트는 **멱등**으로 작성합니다(여러 번 실행해도 같은 결과).
- 시드는 CSV 일괄 적재·전량 DELETE를 쓰지 않습니다.

## 4. 작업 원칙

- **추정 금지.** 값·동작·필드 존재 여부는 실제 코드·DB·실행 결과로 확인한 뒤 보고합니다. 확인하지 못한 것은 "확인 못 함"이라고 씁니다.
- 빌드·배포·스키마 변경은 사람이 직접 실행합니다. 코드 수정, 검증 스크립트, 정적 분석까지만 자동으로 합니다.
- 되돌리기 어려운 작업(force push, 데이터 영구 삭제)은 매번 확인합니다.
- 긴 작업은 작업 저널에 체크포인트를 남겨, 세션이 끊겨도 이어서 재개할 수 있게 합니다.
