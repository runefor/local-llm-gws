# Product Direction: RAG + LLM Wiki

**Status:** accepted
**Date:** 2026-06-18
**Scope:** Gmail/Drive 자료 찾기, 정보 묶음, LLM Wiki 정리, 이후 검색 성능 강화

## Decision

이 앱은 RAG와 LLM Wiki를 경쟁 기능으로 보지 않는다.

- **RAG**는 Gmail/Drive 원문에서 관련 자료를 찾고 원문 위치를 확인하는 근거 수집 엔진이다.
- **정보 묶음**은 사용자가 RAG 결과 중 믿을 수 있는 근거만 고르는 검토 지점이다.
- **LLM Wiki**는 선택된 정보 묶음을 주제, 프로젝트, 사람, 결정사항, 할 일, 원문 링크 중심으로 재구성하는 정리층이다.
- 이후 검색은 원문 RAG와 정리된 Wiki를 함께 대상으로 삼되, Wiki만으로 원문 검색을 대체하지 않는다.

기본 제품 흐름은 다음 순서를 따른다.

```text
Gmail/Drive 원문
  -> RAG 검색: 관련 자료와 원문 위치 찾기
  -> 정보 묶음: 사용자가 근거 선택
  -> LLM Wiki: 선택 근거를 구조화
  -> Wiki + 원문 링크 재검색
```

## Why

사용자의 핵심 목표는 "어디에 어떤 자료가 있는지"를 먼저 찾고, 그 자료를 나중에 다시 쓸 수 있게 정리하는 것이다. RAG는 최신 원문과 아직 정리되지 않은 자료를 찾는 데 강하고, LLM Wiki는 이미 확인한 근거를 사람이 읽고 재사용하기 좋게 만드는 데 강하다.

둘 중 하나만 쓰면 문제가 생긴다.

- RAG만 있으면 검색 결과가 흩어져 있고 매번 다시 해석해야 한다.
- Wiki만 있으면 최신 원문, 누락 자료, 출처 확인, 아직 정리되지 않은 Gmail/Drive 자료를 놓치기 쉽다.

따라서 먼저 RAG 검색 성능과 결과 신뢰도를 강화하고, 그 위에 선택 근거 기반 LLM Wiki 생성 기능을 올린다.

## Product Principles

1. **Find first, organize second.** 답변 생성보다 자료 위치 발견과 관련 항목 목록이 먼저다.
2. **Wiki is grounded.** LLM Wiki는 전체 Gmail/Drive를 무작정 자동 요약하지 않고, 사용자가 선택한 정보 묶음을 근거로 초안을 만든다.
3. **Source links survive.** Wiki 페이지에는 원문 링크, 위치 라벨, 출처 메타데이터가 남아야 한다.
4. **RAG remains required.** Wiki가 생겨도 RAG는 최신 원문 검색, 출처 확인, Wiki 누락 보완, Wiki 생성용 근거 수집을 계속 담당한다.
5. **Search quality before new generation.** 새 요약 형식보다 검색 회수율, 랭킹, 매칭 이유, 결과 필터링, 재검색 루프를 먼저 강화한다.
6. **No direct summary bypass.** 검색 후보를 검토 없이 바로 LLM 요약/저장으로 보내는 경로는 제품 기본 흐름이 아니다.

## In Scope

### RAG Strengthening

- 더 넓은 후보 검색과 UI 필터링.
- 쿼리 확장, 유사어, 프로젝트명/사람명 힌트.
- 결과 카드의 매칭 이유, 출처, 날짜, 원문 열기 개선.
- 관련 있음/없음, 중요, 제외 같은 사용자 피드백 루프.
- 검색 품질을 측정할 수 있는 작은 평가 세트와 smoke scenario.

### LLM Wiki Layer

- `정보 묶음 -> Wiki 페이지 만들기`.
- Wiki 섹션 기본값: 요약, 핵심 사실, 관련 사람/프로젝트, 결정사항, 할 일, 원문 링크.
- 기존 Wiki 페이지가 있으면 새 페이지 생성, 추가, 병합 후보를 제안한다.
- Obsidian/Notion 내보내기는 Wiki 정리 결과의 저장 대상이 될 수 있다.

## Out of Scope

- Gmail/Drive 전체를 백그라운드에서 자동 Wiki화하는 기능.
- 원문 링크 없는 요약본만 저장하는 기능.
- RAG를 제거하고 Wiki 검색만 남기는 방향.
- 외부 LLM으로 Gmail/Drive 원문을 조용히 전송하는 자동 정리.
- 완전한 PII 익명화나 법적 컴플라이언스 보장.

## Research Application

Gemini Deep Research 결과는 [LLM Wiki Research Application Notes](./llm-wiki-research-application-notes.md)를 통해 적용한다.
이 companion 문서는 `docs/로컬 LLM 위키 설계 연구.md`에서 바로 구현 가능한 항목, 주의해서 걸러야 할 항목, 다음 구현 후보를 정리한 실행 기준이다.

## Next Work Order

1. 이 문서를 기준으로 제품 언어와 UI 흐름을 유지한다.
2. 검색 성능 강화는 [RAG Search Quality Test Checklist](../testing/rag-search-quality-checklist.md)를 기준으로 검증한다.
3. 다음 구현 단계는 **검색 성능 강화**로 잡는다.
4. 검색 성능 강화가 최소 기준을 통과하면 **정보 묶음 기반 LLM Wiki 생성**을 추가한다.

검색 성능 강화의 첫 기준은 사용자가 대충 말해도 관련 Gmail/Drive 자료를 충분히 넓게 찾고, 왜 잡혔는지와 어디서 열 수 있는지를 결과 카드에서 확인할 수 있는 것이다.
