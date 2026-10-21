# 조직 범위 권한 (CAP)

여러 도메인 서비스가 공통으로 쓰는 **조직 단위 데이터 접근 제어** 모듈입니다.

## 왜 만들었나
- 예산·손익·채권채무가 각자 권한 코드를 가지고 있어 판정 기준이 서로 달랐습니다.
- 화면이 보낸 조직 코드를 서버가 그대로 믿어, 조직 선택값만 바꾸면 남의 부서 데이터를 볼 수 있었습니다.
- 상위 부서에 권한을 주면 하위 부서도 보여야 하는데, 새 부서가 생길 때마다 매핑을 다시 해야 했습니다.

## 설계
| 단계 | 내용 |
|---|---|
| 1 | 토큰의 Role Collection 목록을 읽는다 |
| 2 | DB 매핑으로 Role → 허용 조직을 구한다 (관리자 화면에서 관리) |
| 3 | 허용 조직을 **하위 부서까지 자동 전개**한다 (순환 안전한 BFS) |
| 4 | READ는 `applyOrgFilter`로 조회 조건에 강제 주입, CREATE/UPDATE는 `checkWrite`로 기존·변경 조직 모두 검사 |

## 사용 예
```js
const authz = require('./lib/authz');

module.exports = (srv) => {
  srv.before('READ', 'BudgetPlans', (req) => authz.applyOrgFilter(req, 'orgCode'));
  srv.before(['CREATE', 'UPDATE'], 'BudgetPlans', (req) => authz.checkWrite(req, 'orgCode', 'budget.BudgetPlan', '예산안'));
};
```

## 신경 쓴 부분
- **요청 단위 Promise 캐시**: 여러 before 훅이 병렬로 실행돼도 권한 계산은 요청당 한 번만 합니다.
- **허용 조직이 없으면 0건**: 빈 배열을 "제한 없음"으로 오해하지 않도록 매칭되지 않는 값을 넣습니다.
- **기존 조건을 괄호로 묶기**: `$filter=a or b`에 조직 조건을 그냥 붙이면 `a or (b and 조직)`으로 풀려 권한이 새어 나갑니다.
