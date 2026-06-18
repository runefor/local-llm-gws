# RAG Search Quality Test Checklist

**Status:** active
**Date:** 2026-06-18
**Scope:** Gmail/Drive RAG search quality, evidence selection readiness, LLM Wiki handoff readiness

## Goal

검색 성능 강화의 통과 기준은 사용자가 대충 말해도 관련 Gmail/Drive 자료를 충분히 넓게 찾고, 결과 카드에서 왜 잡혔는지와 어디서 열 수 있는지를 확인할 수 있는 것이다.

이 체크리스트는 `RAG 검색 -> 정보 묶음 -> LLM Wiki` 방향을 유지하면서, 다음 구현 전에 검색 품질이 실제로 나아졌는지 검증하는 기준이다.

## Pass Criteria

검색 강화 작업은 아래 기준을 만족해야 다음 단계인 `정보 묶음 -> LLM Wiki 페이지 만들기`로 넘어갈 수 있다.

- 관련 자료가 한두 개만 과하게 좁게 나오지 않고, Gmail/Drive 후보를 넓게 보여준다.
- 결과마다 출처, 제목, 날짜 또는 위치 라벨, 원문 열기 단서가 남아 있다.
- 결과마다 매칭 이유가 보이며, 의미 검색/키워드 검색/확장 쿼리 단서가 최소한 디버깅 가능하게 남아 있다.
- Gmail은 선택된 메시지 벡터화 원칙을 깨지 않는다. 전체 메일 본문 자동 인덱싱을 다시 도입하지 않는다.
- 검색 결과를 선택해 `정보 묶음`으로 저장할 수 있고, 저장된 묶음의 원문 링크/메타데이터가 유지된다.
- 외부 LLM 전송 경고는 Gmail/Drive-derived content 생성 전에 유지된다.

## Automated Checks

수정 후 매번 실행한다.

```powershell
npm run build
cd python-backend
python -m unittest discover -s tests
cd ..
git diff --check
```

필수 확인 항목:

- `test_retriever_expands_domain_query_hints`: 한국어 도메인 검색어가 보수적으로 확장된다.
- `test_query_expansion_is_bounded_for_repeated_noisy_terms`: 중복/공백이 섞인 검색어도 확장 쿼리가 중복 없이 제한된다.
- `test_match_metadata_uses_content_and_source_metadata_terms`: 본문뿐 아니라 제목, 보낸 사람, owner 메타데이터에서도 매칭 단서를 잡는다.
- `test_retrieve_chunks_uses_expanded_queries_and_wide_candidate_pool`: 확장 쿼리별 벡터 검색을 실행하고, UI 필터링을 위해 넓은 후보 풀을 요청한다.
- `test_low_signal_drive_filename_fallback_is_filtered`: 내용 없는 Drive 파일명 fallback이 상위 검색 결과를 오염시키지 않는다.
- `test_chunk_to_evidence_record_preserves_location_metadata`: 원문 URL, 위치 라벨, chunk/page/heading/offset 메타데이터가 evidence로 보존된다.
- `test_rrf_keeps_keyword_only_result_with_match_metadata`: BM25 단독 결과도 매칭 이유를 가진다.
- `test_rrf_merges_semantic_and_keyword_match_metadata`: 의미 검색과 키워드 검색이 같은 결과를 찾으면 매칭 메타데이터가 합쳐진다.
- `test_search_evidence_returns_query_expansions`: `/api/rag/search` 계열 응답에 확장 쿼리와 매칭 이유가 남는다.
- `test_metadata_search_does_not_fetch_full_body_or_index`: Gmail 메타데이터 검색이 본문 가져오기나 자동 인덱싱을 하지 않는다.
- `test_legacy_rag_index_rejects_gmail_full_body_indexing`: 레거시 전체 Gmail 본문 인덱싱이 막혀 있다.
- TypeScript build: `RagSearchPanel`이 `match_reason` 표시와 `top_k: 12` 요청을 타입 오류 없이 빌드한다.

## Strict And Adversarial Checks

검색 강화가 단순 정상 케이스만 통과하지 않도록 아래 항목을 추가로 확인한다.

- 중복 검색어: `계약 계약 일정 일정`처럼 같은 단어가 반복돼도 결과 중복과 확장 쿼리 폭증이 없어야 한다.
- 노이즈 검색어: `지원자!!! 면접??? 자료 2026 @@`처럼 기호와 숫자가 섞여도 검색이 실패하지 않아야 한다.
- 영어 힌트: `contract deadline` 같은 영어 단서가 들어와도 검색 응답 구조가 유지되어야 한다.
- 빈 검색어: 공백만 들어오면 실패 대신 빈 결과로 끝나야 한다.
- 출처 분리: Gmail-only, Drive-only, Gmail+Drive 검색에서 요청한 출처 밖 결과가 섞이면 실패다.
- 중복 제거: 같은 chunk가 확장 쿼리나 RRF 병합 때문에 중복 노출되면 실패다.
- 설명 가능성: 결과가 있는 경우 모든 결과에 `metadata.match_reason`과 `source_location`이 있어야 한다.

## Manual Smoke Scenarios

실제 로컬 앱과 사용자의 인덱싱된 Gmail/Drive 데이터가 있을 때 실행한다. 실행 결과는 이 문서 하단의 `Run Log`에 날짜별로 기록한다.

### 1. Broad Natural Query

- 입력 예: `지난번 계약 일정`, `지원자 면접 자료`, `견적 비용 정리`
- 기대 결과:
  - 5개 이상 후보가 표시된다. 데이터가 적으면 인덱스 총량 대비 합리적인 수로 판단한다.
  - 결과 카드에 `매칭 근거`가 보인다.
  - 확장어 예: 계약서, deadline, interview, proposal 등이 관련 결과를 넓히는 데 쓰인다.
  - 관련 없는 Drive 파일명 fallback 결과가 상위권을 과도하게 차지하지 않는다.

### 2. Source Toggle

- Gmail + Drive 모두 선택 후 검색한다.
- Gmail만 선택하고 같은 검색어를 다시 실행한다.
- Drive만 선택하고 같은 검색어를 다시 실행한다.
- 기대 결과:
  - 선택한 출처 밖의 결과가 섞이지 않는다.
  - 출처 필터를 바꿔도 UI가 비거나 깨지지 않는다.

### 3. Match Reason Inspection

- 검색 결과 상위 5개를 확인한다.
- 기대 결과:
  - 각 결과의 `매칭 근거`가 빈 문자열이 아니거나, 최소한 snippet fallback이 보인다.
  - 의미 검색과 키워드 검색이 함께 잡힌 항목은 둘 다 표시된다.
  - snippet은 매칭 이유 아래 보조 정보로 남는다.

### 4. Open Original Source

- Drive 결과 1개와 Gmail 결과 1개에서 원문 열기 버튼을 확인한다.
- 기대 결과:
  - Drive는 `webViewLink` 또는 원문 URL이 유지된다.
  - Gmail은 message/thread/source location 정보가 evidence metadata에 남는다.
  - 원문 URL이 없는 항목은 위치 라벨과 provider item id가 대신 보인다.

### 5. Evidence Set Save And Reload

- 검색 결과에서 관련 항목 3개 이상을 선택한다.
- `정보 묶음` 제목과 메모를 입력하고 저장한다.
- 저장된 묶음을 다시 연다.
- 기대 결과:
  - 선택 항목 수, 제목, 메모, 태그가 유지된다.
  - 각 evidence item의 `source_location`, `metadata.match_reason`, 원문 링크가 유지된다.
  - 저장된 묶음에서 요약 생성 단계로 넘어갈 수 있다.

### 6. External LLM Warning

- LLM endpoint를 외부 원격 주소로 설정한다.
- Gmail/Drive 검색 결과를 `정보 묶음`으로 저장한 뒤 요약 생성을 누른다.
- 기대 결과:
  - 외부 LLM 전송 전 확인 모달이 표시된다.
  - 취소하면 생성 요청이 나가지 않는다.
  - 계속을 누른 경우에만 정보 묶음 내용이 생성 요청으로 넘어간다.

### 7. Low-Data And Empty-State

- 인덱스가 비어 있거나 특정 출처에 결과가 없는 상태에서 검색한다.
- 기대 결과:
  - 오류처럼 보이지 않고 검색 결과 없음 상태가 표시된다.
  - 정보 묶음 저장 버튼은 선택 항목이 없을 때 비활성화된다.
  - 로그가 원인 파악에 충분한 수준으로 남는다.

## Quality Review Questions

수동 smoke 후 아래 질문에 `예/아니오/보류`로 답한다.

- 사용자가 정확한 파일명이나 메일 제목을 몰라도 관련 자료 후보를 찾을 수 있었는가?
- 결과를 보고 "왜 이게 잡혔는지" 설명 가능한가?
- 결과를 보고 "어디에서 원문을 열어야 하는지" 찾을 수 있는가?
- 관련 없는 결과를 사용자가 UI 필터로 빠르게 줄일 수 있는가?
- 정보 묶음으로 저장한 뒤 Wiki 생성의 근거로 쓰기에 충분한 출처 정보가 남는가?

## Run Log

### 2026-06-18

- Automated checks: passed.
  - `npm run build`: passed.
  - `cd python-backend && python -m unittest tests.test_gmail_jit`: passed, 22 tests.
  - `cd python-backend && python -m unittest discover -s tests`: passed, 25 tests.
  - `git diff --check`: passed, with LF/CRLF working-copy warnings only.
- Local search smoke: passed with current working tree through `python-backend/.venv/Scripts/python.exe`.
  - Index counts: Gmail 3801 chunks, Drive 162 chunks.
  - Query `지난번 계약 일정`: 12 results, 12 with match reason, 12 with source location.
  - Query `지원자 면접 자료`: 12 results, Gmail + Drive sources, 12 with match reason, 12 with source location.
  - Query `견적 비용 정리`: 12 results, 12 with match reason, 12 with source location.
- Strict local smoke: passed.
  - Duplicated query terms: 12 results, no duplicate evidence ids, no duplicate chunk ids.
  - Mixed noisy query: 12 results, no duplicate evidence ids, no duplicate chunk ids.
  - English hint query: 12 results, no duplicate evidence ids, no duplicate chunk ids.
  - Empty whitespace query: 0 results, success response.
  - All non-empty strict queries stayed within `top_k`, kept titles, `metadata.match_reason`, and `source_location`.
- Source toggle smoke: passed.
  - Gmail-only, Drive-only, and Gmail+Drive searches returned no outside-requested-source items.
  - `계약 일정` Gmail+Drive strict source case returned top 12 from Gmail in the current index, with no outside-source or duplicate chunks.
- Evidence set smoke: passed against a temporary store file.
  - Created, loaded, updated, and deleted a 3-item evidence set.
  - All 3 saved items kept `metadata.match_reason` and `source_location`.
- Manual UI smoke: not run. Requires interactive app session for visual confirmation of result cards, original-source buttons, and external LLM warning modal.
- Notes: First checklist created after initial query expansion, wider candidate pool, RRF metadata merge, and match reason UI changes. Search output contents were not copied into this log; only counts and metadata-presence checks were recorded.
