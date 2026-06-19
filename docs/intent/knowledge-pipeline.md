# Intent: Knowledge Pipeline

Canonical direction: [RAG + LLM Wiki product direction](./rag-llm-wiki-product-direction.md)

- **Outcome (결과물)**: Gmail/Drive 원문을 RAG로 넓게 찾고, 사용자가 고른 근거를 `정보 묶음`으로 저장한 뒤, 로컬 LLM이 이를 LLM Wiki 형태로 정리해 Obsidian/Notion 등 개인 지식 베이스로 보낼 수 있는 파이프라인.
- **User (사용자)**: 민감한 개인 데이터를 안전하게 다루면서, 어디에 어떤 자료가 있는지 빠르게 찾고, 검토한 근거를 다시 쓸 수 있는 Wiki 지식층으로 축적하려는 사용자(본인).
- **Why now (배경)**: 검색 결과만 있으면 매번 다시 읽고 해석해야 하고, Wiki만 있으면 최신 원문과 누락 자료를 놓친다. RAG는 원문 근거 수집 엔진으로 유지하고, LLM Wiki는 선택된 근거를 사람이 읽고 재사용하기 쉬운 정리층으로 추가해야 한다.
- **Success (성공 기준)**: 사용자가 대충 말해도 관련 Gmail/Drive 자료와 원문 위치를 찾고, 필요한 항목을 `정보 묶음`으로 저장하며, 그 묶음에서 출처 링크가 살아 있는 Wiki 페이지 초안을 만들 수 있다.
- **Constraint (제한 사항)**: 프라이버시 보호를 위해 원문 검색과 정리의 기본 경로는 로컬 우선이어야 한다. 외부 LLM으로 Gmail/Drive-derived content를 보내는 경우에는 명시적 경고와 사용자 선택이 필요하다.
- **Out of scope (범위 외)**: RAG를 제거하고 Wiki 검색만 남기는 방향, Gmail/Drive 전체를 백그라운드에서 자동 Wiki화하는 기능, 이메일 클라이언트 자체를 완벽히 대체하는 기능.

## Next Priority

다음 구현 우선순위는 새 생성 기능이 아니라 **검색 성능 강화**다.

- RAG 후보를 더 넓게 찾고, UI에서 필터링한다.
- 매칭 이유, 원문 위치, 날짜, 사람/파일 메타데이터를 더 신뢰 가능하게 보여준다.
- 관련 있음/없음, 중요, 제외 같은 피드백 루프로 검색 품질 개선 기반을 만든다.
- 이 기준을 통과한 뒤 `정보 묶음 -> LLM Wiki 페이지 만들기`를 추가한다.

## Implementation Boundary (2026-06-19)

- `/api/pipeline/run`은 하위 호환용 검색 후보 반환 경로로만 유지한다. 이 경로는 Gmail/Drive-derived content를 바로 LLM에 보내 요약하지 않는다.
- 최종 Wiki 생성은 `벡터 자료 찾기 -> 정보 묶음 -> artifact_type=wiki` 경로에서만 수행한다.
- 조건 기반 Wiki 화면은 메타데이터/스니펫 기반 후보 초안이다. 원문 검토와 정보 묶음 확정 전에는 최종 Wiki로 취급하지 않는다.
