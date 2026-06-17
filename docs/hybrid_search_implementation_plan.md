# Gmail 하이브리드 검색 및 Split-pane UI 구현 계획

사용자님의 피드백을 반영하여 수정한 "지메일 하이브리드 검색 및 옵시디언 지식화" 파이프라인의 최종 구현 계획입니다.

## 설계 방향 요약

백그라운드 동기화를 배제한 **'수동/검색 시 JIT 동기화'**와 외부 웹 연동(Notion)을 보류한 **'로컬 옵시디언 Vault 직접 내보내기'** 방향으로 확정되었습니다.

---

## Proposed Changes

### 1. Hybrid Search Architecture (Backend)

전체 메일 동기화 및 무거운 백그라운드 작업을 배제하고, 사용자 요청 시에만 작동하는 **JIT(Just-In-Time) 인덱싱 방식**을 적용합니다.

1. **1단계 (필터 및 1차 검색)**: 사용자가 검색어를 입력하면, 백엔드에서 `Gmail API`의 강력한 쿼리(예: `q="from:boss@company.com"`)를 사용해 메일의 메타데이터(제목, 보낸사람, 요약 스니펫)만 매우 빠르게 가져옵니다.
2. **2단계 (수동/온디맨드 벡터화)**: 사용자가 특정 메일들을 선택하거나 "의미론적 검색(Sync)" 버튼을 누를 때만 해당 메일들의 본문 전체를 가져옵니다. 이를 청킹(Chunking)하여 로컬 ChromaDB에 임시(또는 캐시)로 저장합니다.
3. **3단계 (옵시디언 내보내기 파이프라인)**: 로컬 모델이 캐싱된 벡터 데이터를 바탕으로 사용자의 지시(요약, 회의록 작성 등)를 수행합니다. 결과물은 프론트엔드 또는 백엔드를 통해 **사용자가 지정한 로컬의 Obsidian Vault 폴더 내부에 `.md` 파일로 직접 저장**됩니다.

#### [MODIFY] `python-backend/src/gws/gmail.py`
- Gmail API를 활용해 메타데이터만 가볍게 가져오는 함수와 본문을 가져오는 함수를 명확히 분리.

#### [MODIFY] `python-backend/src/rag/indexer.py` & `retriever.py`
- 백그라운드 인덱싱 스케줄러가 있다면 비활성화.
- JIT(Just-in-Time) 방식의 임시 컬렉션 관리를 지원하도록 수정.
- (선택) Obsidian 폴더 경로를 읽고 `.md` 파일을 파일 시스템에 안전하게 기록하는 Sink 모듈 추가 (기존 `python-backend/src/sink/` 영역 활용 혹은 신규 작성).

---

### 2. Split-pane 통합 UI (Frontend)

작업 흐름이 끊기지 않도록 화면을 좌/우로 분할한 **작업 공간(Workspace)** 개념을 도입합니다.

#### [NEW] `src/components/HybridMailWorkspace.tsx`
새로운 최상위 통합 작업 공간 컴포넌트.
- **Left Pane (검색 및 리스트 뷰)**:
  - 상단: Gmail 쿼리를 지원하는 검색창 및 수동 동기화(Sync/Vectorize) 버튼.
  - 본문: Gmail 메타데이터와 스니펫이 표시되는 메일 리스트. 일괄 처리를 위한 체크박스 지원.
- **Right Pane (AI 프로세싱 및 Obsidian Export 뷰)**:
  - 상단: 선택된 메일의 내용 혹은 여러 메일이 합쳐진 컨텍스트 공간.
  - 중단: 로컬 LLM에게 명령을 내리는 프롬프트 입력창.
  - 하단: AI 결과물 마크다운 뷰어 및 핵심 버튼인 `[옵시디언으로 내보내기(Export to Obsidian)]`.

#### [MODIFY] `src/components/ServiceConfigPanel.tsx` (또는 환경설정 컴포넌트)
- 옵시디언 연동을 위한 **'Obsidian Vault 로컬 폴더 경로 설정'** 입력칸 추가.

#### [MODIFY] `src/App.tsx`
- 기존 패널들을 감싸던 구조에서, 메인 화면을 이 새로운 `HybridMailWorkspace` 중심 뷰로 교체/연결.

---

## Verification Plan

### Manual Verification
- 백엔드에 검색어를 입력했을 때, 백그라운드 동기화 없이 실시간 API 호출만으로 결과 목록이 뜨는지 확인.
- 메일을 선택하고 로컬 모델로 요약/질의를 보냈을 때 RAG가 올바르게 작동하는지 확인.
- **가장 중요한 검증**: 옵시디언 Vault 경로를 설정하고 "옵시디언으로 내보내기"를 눌렀을 때, 지정된 로컬 폴더에 `.md` 파일이 정상적으로 생성되며 본문 내용이 깨지지 않는지 E2E 확인.
