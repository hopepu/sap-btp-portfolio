# 도메인 에이전트 레지스트리 (CAP)

업무 도메인별 AI 에이전트를 **같은 계약**으로 등록하는 구조입니다. 설계 배경은 [docs/ai-agent-platform.md](../../docs/ai-agent-platform.md)에 있습니다.

| 파일 | 역할 |
|---|---|
| `index.js` | 레지스트리: 도구 선언 수집, 도구명 → 인자 조회, CAP 액션 등록 |
| `summaryAgent.js` | 영역 에이전트 예시: 도구 선언 + 실행부 + 프롬프트 데이터 구성 |
| `runAgent.js` | 모든 도구가 프롬프트를 부르는 **단일 경로** + 결과 정리 |

## 계약
```
도구명 == CAP 서비스 액션명
```
이 하나만 지키면 A2A 워크플로 엔진, 챗봇, 도구 선택기가 새 도메인 도구를 코드 수정 없이 찾습니다.

## 등록
```js
// aiOfficeService.js
const plAgents = require('./plAgents');
module.exports = (srv) => { plAgents.register(srv); };
```

## 원칙
- **LLM은 계산하지 않는다**: 숫자는 서버가 권한 범위 안에서 집계해 넘기고, LLM은 해석과 문장만 맡습니다.
- **이름으로 호출**: 프롬프트를 GUID가 아니라 이름으로 불러, 프롬프트 버전을 바꿔도 코드가 바뀌지 않습니다.
- **실패는 사유와 함께**: 빈 응답을 성공으로 넘기지 않습니다.
