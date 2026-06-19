# LLM Wiki Research Application Notes

**Status:** active
**Date:** 2026-06-20
**Research source:** [`docs/로컬 LLM 위키 설계 연구.md`](../로컬%20LLM%20위키%20설계%20연구.md)
**Applies to:** Gmail/Drive RAG search, 정보 묶음, LLM Wiki artifact, Obsidian/Notion export

## Purpose

이 문서는 Gemini Deep Research 결과를 현재 프로젝트 고도화에 사용할 때의 적용 기준이다.
연구 문서는 설계 근거로 사용하되, 수식/도식은 복사 과정에서 깨졌을 수 있으므로 구현 근거로 직접 인용하지 않는다.

현재 제품의 기준 문서는 [`RAG + LLM Wiki product direction`](./rag-llm-wiki-product-direction.md)이다. 이 문서는 그 기준을 바꾸지 않고, 다음 구현 판단에 필요한 주의점과 후보 작업을 정리한다.

## Keep As Product Invariants

고도화할 때 아래 원칙은 유지한다.

1. **Find first, organize second.** 답변 생성보다 Gmail/Drive 자료 위치 발견과 근거 수집이 먼저다.
2. **RAG and Wiki are complementary.** Wiki는 원문 검색을 대체하지 않는다. 원문 RAG는 최신 자료, 누락 자료, 출처 확인을 계속 담당한다.
3. **Wiki must be grounded.** 최종 Wiki artifact는 사용자가 고른 `정보 묶음`/`Evidence Set`에서만 생성한다.
4. **Source links survive.** Wiki 결과에는 Gmail message/thread id, Drive file id/link, page/heading/chunk 위치 등 원문 좌표가 남아야 한다.
5. **Candidate is not final.** 조건 기반 Wiki 화면의 메타데이터/스니펫 초안은 후보일 뿐, 검토된 최종 Wiki가 아니다.
6. **External LLM warning stays.** Gmail/Drive-derived content가 외부 endpoint로 나갈 수 있으면 명시적 경고와 확인을 유지한다.
7. **No ingest-all auto summary.** 전체 Gmail/Drive를 백그라운드에서 무차별 자동 요약해 Wiki로 편입하지 않는다.

## Things To Treat Carefully

### 1. Broken formulas and copied diagrams

- 연구 문서의 일부 수식/도식은 `![][image...]` 형태로 깨져 있다.
- `recall@k`, `MRR`, `nDCG`, `RRF k=60` 같은 개념은 참고하되, 구현 수식은 별도 검증 후 코드에 넣는다.
- 수식 기반 판단이 필요한 경우 테스트 fixture와 작은 계산 단위 테스트를 먼저 만든다.

### 2. Model and dependency recommendations are provisional

- `bge-m3`, `BGE-Reranker-Lite`, `cross-encoder/ms-marco-MiniLM-L-6-v2`, `Qwen`, `Llama` 등 모델명은 확정 요구사항이 아니다.
- 새 모델/패키지는 로컬 설치 크기, Windows 호환성, CPU/GPU 메모리, 지연 시간, 라이선스, 오프라인 실행 가능 여부를 검증한 뒤 도입한다.
- 검색 성능 개선은 먼저 현재 ChromaDB/BM25/RRF/metadata seam을 강화하고, reranker는 옵션으로 붙인다.

### 3. Automatic Git commit is unsafe by default

- 연구 문서의 자동 `git add`/`commit` 권고는 기본 동작으로 채택하지 않는다.
- Obsidian vault나 사용자 로컬 노트에 대해 자동 commit을 하려면 명시 설정, 미리보기 diff, rollback 안내, 실패 복구가 필요하다.
- 프로젝트 repo commit과 사용자 지식 vault commit은 분리해서 생각한다.

### 4. Wiki folder separation needs product wording

- 연구 문서의 `wiki/candidates/`와 `wiki/topics/` 분리는 유용하다.
- 다만 사용자 화면에서는 기술 용어보다 `후보 초안`, `검토됨`, `공식 Wiki`, `원문 확인 필요` 같은 한국어 상태를 우선한다.
- Obsidian export와 앱 내부 evidence store가 같은 상태 모델을 공유할지 먼저 정해야 한다.

### 5. Knowledge graph should be incremental

- `wiki_nodes`, `wiki_edges`, entity graph는 장기적으로 유용하지만 첫 구현 대상은 아니다.
- 우선 `EvidenceRecord -> EvidenceSet -> WikiArtifact -> CitationMap`의 무결성을 안정화한다.
- 사람/프로젝트/조직/결정사항 entity 추출은 Wiki artifact metadata에 얕게 추가한 뒤 검색 품질에 도움이 되는지 평가한다.

### 6. Merge must not overwrite user notes

- 기존 Wiki 파일을 통째로 재생성하거나 덮어쓰는 방식은 금지한다.
- 병합은 `append`, `section update`, `conflict required`, `new page` 같은 제한된 작업으로 나눈다.
- 충돌이 있으면 자동 해결하지 말고 사용자 검토 상태로 남긴다.

### 7. Search result widening must not lower trust

- 후보를 넓히는 것은 맞지만, 관련 없는 Drive filename fallback이나 노이즈 메일이 상위권을 점령하면 실패다.
- 결과 카드에는 매칭 이유, 출처, 날짜/위치, 원문 열기 단서가 있어야 한다.
- 넓은 후보 풀은 UI 필터와 피드백 버튼이 함께 있어야 실제 사용성이 생긴다.

### 8. Gmail body indexing boundary remains strict

- 기본 Gmail metadata search는 본문 전체 fetch/index를 하지 않는다.
- 본문 vectorization은 사용자가 선택한 메시지/스레드 또는 명시 처리 경로에서만 수행한다.
- 이 경계를 바꾸는 구현은 보안/프라이버시 회귀로 보고 테스트를 먼저 추가한다.

## Next Implementable Work

### P0. Research-to-product alignment note

- 이 문서를 유지하면서 연구 문서에서 바로 구현 가능한 항목만 product direction/checklist에 연결한다.
- 완료 기준: `rag-llm-wiki-product-direction.md`, `rag-search-quality-checklist.md`, 이 문서가 서로 충돌하지 않는다.

### P1. Wiki artifact schema and linter

**Goal:** `정보 묶음 -> Wiki artifact` 결과가 항상 출처 좌표와 구조를 가진다.

구현 후보:
- `WikiArtifact` frontmatter 스키마 정의: `id`, `title`, `type`, `source_count`, `evidence_set_id`, `created_at`, `status`.
- `CitationMap` 검증: 모든 인용 marker가 실제 `EvidenceRecord`를 가리키는지 확인.
- `INSUFFICIENT_EVIDENCE` 또는 `source_missing` 상태를 허용하되, 이를 성공 Wiki로 취급하지 않는다.
- Pydantic 기반 backend linter 추가.

검증:
- evidence set 0개/1개/다수 케이스.
- citation 누락, 잘못된 evidence id, 원문 위치 없는 항목 실패 테스트.

### P1. Candidate vs approved Wiki state

**Goal:** 후보 초안과 검토된 Wiki를 상태/저장 위치/UI에서 분리한다.

구현 후보:
- artifact status: `candidate`, `needs_review`, `approved`, `conflict`, `stale`.
- 조건 기반 Wiki 결과는 기본 `candidate`로만 저장.
- `정보 묶음`에서 생성한 결과도 사용자가 승인하기 전에는 `approved`가 아니다.
- UI copy: `후보 초안`, `검토 필요`, `승인됨`, `원문 변경 확인 필요`.

검증:
- 후보 artifact가 검색에서 낮은 가중치 또는 별도 필터로만 보이는지 확인.
- 승인 전 Obsidian/Notion export 버튼의 문구와 경고가 명확한지 확인.

### P1. Search quality evaluation set

**Goal:** 검색 고도화가 체감 개선인지 숫자로 확인한다.

구현 후보:
- `python-backend/tests/fixtures/rag_eval_cases.json` 같은 작은 golden set 추가.
- 필드: `query`, `expected_source`, `expected_ids`, `must_have_terms`, `notes`.
- metric script: recall@5, recall@12, MRR, duplicate rate, missing source_location rate.
- 개인정보가 들어가지 않는 synthetic fixture부터 시작하고, 사용자의 실제 로컬 smoke는 문서 로그로만 남긴다.

검증:
- fixture 기반 unit/integration test.
- `docs/testing/rag-search-quality-checklist.md` Run Log 업데이트.

### P1. Explainable match reason upgrade

**Goal:** 사용자가 결과를 보고 왜 잡혔는지 이해한다.

구현 후보:
- backend match metadata를 정규화: `semantic`, `keyword`, `metadata`, `query_expansion`, `wiki_link`.
- UI 결과 카드에 한 줄 설명: `제목/보낸 사람/본문/확장어/위키 링크 중 무엇이 매칭됐는지`.
- 낮은 신뢰 후보는 숨기지 말고 접힘 영역 또는 낮은 순위로 표시한다.

검증:
- 모든 non-empty result에 `metadata.match_reason`이 있는지 테스트.
- Gmail-only/Drive-only/source toggle에서도 설명이 유지되는지 확인.

### P2. Existing Wiki re-indexing as additional search target

**Goal:** 승인된 Wiki가 원문 검색을 보조하되 대체하지 않는다.

구현 후보:
- approved Wiki markdown만 별도 source type으로 색인.
- Wiki 검색 결과는 연결된 원문 citation과 함께 보여준다.
- 원문 결과와 Wiki 결과를 분리 표시하거나 source filter로 제어한다.

주의:
- Wiki 내용이 원문보다 상위에 무조건 뜨면 원문 확인성이 떨어질 수 있다.
- candidate Wiki는 기본 검색 대상에서 제외하거나 낮은 가중치로 둔다.

### P2. Stale source detection

**Goal:** 원문이 바뀌었는데 Wiki가 오래된 상태로 남는 문제를 줄인다.

구현 후보:
- `EvidenceRecord.source_location` 또는 metadata에 `modified_time`, `content_hash` 가능한 값 저장.
- Drive 파일 modifiedTime과 Wiki artifact 생성 당시 값을 비교.
- 차이가 있으면 artifact status를 `stale` 또는 `source_changed`로 표시.

주의:
- Gmail 메시지는 수정보다 thread 추가/후속 메일이 중요할 수 있다.
- 처음부터 완전 자동 동기화보다 “원문 변경 가능성 표시”가 적절하다.

### P2. Safe merge planner

**Goal:** 기존 Wiki를 덮어쓰지 않고 변경 후보만 만든다.

구현 후보:
- LLM output을 전체 markdown이 아니라 JSON patch plan으로 제한: `append_section`, `update_section`, `create_page`, `conflict`.
- backend가 허용된 operation만 적용.
- conflict는 사용자 검토 전 저장하지 않는다.

검증:
- 기존 사용자 문구가 보존되는지 snapshot test.
- 같은 근거를 두 번 적용해도 중복 섹션이 폭증하지 않는지 테스트.

### P3. Optional local reranker

**Goal:** 현재 hybrid retrieval 이후 상위 후보 정밀도를 올린다.

구현 후보:
- 기본 OFF인 reranker 설정 추가.
- 상위 15~20개 후보에만 적용.
- latency, memory, model download path, Windows fallback을 기록.

주의:
- 새 의존성/모델 다운로드가 필요하면 별도 승인 및 문서화가 필요하다.
- reranker 없이도 baseline 검색 품질 테스트가 먼저 있어야 한다.

### P3. Entity/topic metadata extraction

**Goal:** Wiki artifact를 사람/프로젝트/조직/결정사항 중심으로 다시 찾기 쉽게 만든다.

구현 후보:
- artifact metadata에 `people`, `projects`, `organizations`, `decisions`, `tasks` 배열 추가.
- 검색 query expansion에서 승인된 Wiki metadata만 힌트로 사용.
- UI에서 필터 chip으로 노출.

주의:
- entity graph DB부터 도입하지 않는다.
- 추출 실패/오탐을 사용자가 수정할 수 있어야 한다.

## Suggested Work Order

1. `WikiArtifact` schema/linter와 citation 검증.
2. candidate/approved/stale/conflict 상태 모델.
3. 검색 품질 golden set과 recall/MRR smoke.
4. match reason UI/metadata 강화.
5. approved Wiki 재색인.
6. stale source detection.
7. safe merge planner.
8. optional reranker.
9. entity/topic metadata.
10. graph view 또는 Obsidian graph 연동.

## Do Not Implement From The Research Without Re-checking

- 깨진 수식 그대로 구현.
- 모델명 기반 dependency 추가.
- 전체 Gmail/Drive 자동 Wiki화.
- 후보 초안을 승인 Wiki처럼 검색/저장.
- 기존 Markdown을 LLM 출력으로 통째 덮어쓰기.
- 사용자 vault에 자동 git commit을 기본값으로 적용.
- 외부 LLM 경고 우회.

## Verification Gate For Future Work

LLM Wiki 고도화 작업은 최소한 아래를 통과해야 완료로 본다.

```powershell
npm run build
cd python-backend
python -m unittest discover -s tests
cd ..
git diff --check
```

기능별 추가 확인:

- Search changes: [`docs/testing/rag-search-quality-checklist.md`](../testing/rag-search-quality-checklist.md)를 업데이트한다.
- Wiki generation changes: citation map, source location, artifact status 테스트를 추가한다.
- UI changes: `DESIGN.md`를 먼저 확인하고 Google Material 3 톤을 유지한다.
- External LLM path: 경고/확인/취소 동작을 테스트한다.
