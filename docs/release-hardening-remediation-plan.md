# 남은 릴리스/구조 리스크

작성일: 2026-06-19

## 목적

이 문서는 릴리스 백엔드 sidecar 실행과 Tauri CSP 하드닝을 적용한 뒤에도 남아 있는 리스크만 추적한다. 이미 해결된 구현 내역은 여기서 반복하지 않는다.

## 우선순위 요약

| 우선순위 | 리스크 | 영향 | 권장 다음 작업 |
| --- | --- | --- | --- |
| P1 | Python sidecar 산출물 비대화와 PyInstaller 숨은 의존성 | 릴리스 빌드가 느리고 설치 파일이 커지며, 특정 기능에서 런타임 import/data 누락이 뒤늦게 터질 수 있음 | 백엔드 의존성 슬림화, lazy import, sidecar 단독 smoke 확대 |
| P1 | 설치본 기준 end-to-end 검증 공백 | `target/release` 실행은 검증됐지만 실제 설치 후 경로/권한/잔존 프로세스 문제는 별도 검증 필요 | MSI/NSIS 설치 smoke 체크리스트 추가 및 실행 |
| P2 | FastAPI `main.py` 라우트 모놀리스 | 보안 경계, OAuth, LLM, RAG, export가 한 파일에 섞여 작은 변경도 회귀 범위가 큼 | router 분리 전 보안 미들웨어 테스트부터 고정 |
| P2 | 프론트 `AppContext.tsx` 전역 상태 과밀 | API 호출, 인증, Gmail/Drive, LLM, agent, pipeline 상태가 한 Provider에 묶여 UI 변경 회귀 위험 증가 | API client 중앙화 후 도메인별 context/hook 분리 |
| P2 | CSP 운영 smoke 범위 부족 | 기본 CSP는 켜졌지만 Google/Notion 인증, 파일/이미지 asset, SSE 등 실제 플로우별 위반 여부는 계속 확인 필요 | Tauri dev/release에서 기능별 CSP 체크리스트 운영 |

## P1. Python sidecar 산출물 비대화와 PyInstaller 숨은 의존성

### 현재 관찰

- PyInstaller onefile 빌드가 `torch`, `transformers`, `sklearn`, `scipy`, `langchain`, `chromadb` 계열까지 분석한다.
- Windows x64 기준 sidecar 바이너리가 약 290MB까지 커졌다.
- 빌드 중 optional hidden import 경고가 발생했다. 일부는 선택 의존성 경고일 수 있지만, 특정 기능 실행 시점에야 결함으로 드러날 수 있다.

### 위험

- 릴리스 빌드 시간이 길어지고 CI/로컬 배포 반복 속도가 크게 떨어진다.
- 설치 파일 크기가 커져 배포/다운로드/백신 검사 비용이 증가한다.
- RAG, embedding, ChromaDB, Google auth, LLM server 제어처럼 무거운 경로에서 런타임 누락이 뒤늦게 발생할 수 있다.

### 권장 대응

1. 백엔드 import 지연
   - 서버 시작에 꼭 필요하지 않은 `sentence-transformers`, `torch`, `chromadb`, `langchain` 계열 import를 기능 호출 시점으로 늦춘다.
   - `GET /`, auth status, settings 조회 같은 기본 API는 ML 스택 없이 떠야 한다.

2. 릴리스 의존성 계층 분리
   - 기본 데스크톱 API 실행에 필요한 패키지와 RAG/embedding 실행에 필요한 패키지를 구분한다.
   - 가능하면 embedding 모델/런타임은 앱 데이터 경로에서 별도 관리하고 sidecar 본체에는 서버 구동 최소 의존성만 둔다.

3. PyInstaller spec 고정
   - 자동 생성 spec에 의존하지 말고 repo에 검토된 spec 또는 빌드 설정을 둔다.
   - hidden import, data files, 제외 가능한 optional 모듈을 명시한다.

### 검증 게이트

- sidecar 단독 실행 후 `GET /` 200.
- sidecar 단독 실행 후 `GET /api/auth/status`, `GET /api/settings`, `GET /api/rag/status` smoke.
- RAG index/search 최소 fixture smoke.
- LLM server status/start/stop smoke. 단, 실제 모델 다운로드/대형 모델 구동은 별도 slow gate로 분리.
- 빌드 산출물 크기와 빌드 시간을 릴리스 노트에 기록.

## P1. 설치본 기준 end-to-end 검증 공백

### 현재 관찰

- release executable 실행과 API 기동은 확인됐다.
- 실제 MSI/NSIS 설치 후 시작 메뉴/설치 경로/AppData 경로/권한/종료 정리는 아직 별도 체크리스트로 고정되지 않았다.

### 위험

- 개발 산출물 경로에서는 통과하지만 설치 경로에서는 sidecar 위치, 권한, 작업 디렉터리, 데이터 경로가 다르게 동작할 수 있다.
- 앱 종료 후 sidecar 또는 llama.cpp/Ollama 관련 자식 프로세스가 남을 수 있다.
- Windows 보안 제품이 대형 onefile sidecar 초기 추출을 지연시키거나 차단할 수 있다.

### 권장 대응

1. 설치 smoke 체크리스트 추가
   - NSIS 설치.
   - 설치 앱 첫 실행.
   - backend online 전환.
   - `GET /` 또는 UI health indicator 확인.
   - 앱 종료 후 `gws-backend` 프로세스 미잔존 확인.
   - 제거 후 설치 디렉터리 정리 확인.

2. 데이터 경로 점검
   - 토큰, ChromaDB, settings, model 경로가 설치 디렉터리가 아니라 사용자 데이터 경로 또는 기존 `python-backend/data` 호환 경로로 안정적으로 잡히는지 확인한다.
   - 릴리스 모드에서 현재 작업 디렉터리에 의존하는 경로가 없는지 점검한다.

3. 실패 진단 UX
   - backend start 실패를 콘솔 로그에만 남기지 말고 UI에서 볼 수 있는 상태로 노출한다.
   - sidecar resolve 실패, spawn 실패, health check timeout을 구분한다.

### 검증 게이트

- `npm run build:desktop` 또는 동일한 릴리스 절차 통과.
- NSIS 설치본 실행 smoke 통과.
- MSI 설치본 실행 smoke 통과. MSI가 배포 대상이 아니라면 비대상으로 명시.
- 종료 후 `Get-NetTCPConnection -LocalPort 18731` 리스너 없음.
- 종료 후 `gws-backend` 프로세스 없음.

## P2. FastAPI `main.py` 라우트 모놀리스

### 현재 관찰

- `python-backend/main.py`가 앱 생성, local boundary middleware, Google auth, Gmail/Drive, LLM, RAG, evidence set, export, settings, pipeline, Notion OAuth까지 함께 가진다.
- local API boundary는 보안 민감부인데 기능 라우트와 같은 파일에서 계속 변경된다.

### 위험

- OAuth나 CORS/Host/Origin 경계를 기능 작업 중 실수로 넓힐 수 있다.
- 한 기능의 import 실패가 앱 전체 시작 실패로 이어지기 쉽다.
- 테스트 실패 시 원인 범위가 넓고, 병렬 작업 충돌 가능성이 크다.

### 권장 대응 순서

1. 보안 경계 테스트 먼저 추가
   - 허용 host/origin.
   - 차단 host/origin.
   - origin 없는 local 요청 처리.
   - OAuth callback 예외가 있다면 의도된 범위만 허용.

2. `python-backend/src/api/security.py`
   - `ALLOWED_ORIGINS`, `ALLOWED_HOSTS`, local boundary middleware 이동.

3. router 분리
   - `src/api/routes/auth.py`
   - `src/api/routes/gws.py`
   - `src/api/routes/llm.py`
   - `src/api/routes/rag.py`
   - `src/api/routes/settings.py`
   - `src/api/routes/export.py` 또는 pipeline/settings와 함께 둘지 결정.

4. `main.py` 역할 축소
   - FastAPI app 생성.
   - middleware 등록.
   - router include.
   - root health endpoint.

### 검증 게이트

- 기존 `python -m unittest discover -s tests` 통과.
- security middleware 신규 테스트 통과.
- route smoke: `GET /`, auth status, settings, llm config, rag status.
- 라우터 분리 전후 OpenAPI route path 목록 비교.

## P2. 프론트 `AppContext.tsx` 전역 상태 과밀

### 현재 관찰

- `AppContext.tsx`가 API base, backend status, Google auth, Gmail/Drive sync/search, LLM config, agent stream, settings/export/pipeline 상태를 함께 가진다.
- 여러 패널이 큰 Provider 하나에 의존한다.
- API URL이 여러 컴포넌트와 context에 흩어져 있다.

### 위험

- 작은 UI 변경이 전역 context 타입/렌더링/상태 갱신에 영향을 준다.
- API 에러 처리 방식이 기능별로 달라져 사용자 피드백이 일관되지 않다.
- CSP나 backend base URL 정책을 바꿀 때 수정 지점이 많다.

### 권장 대응 순서

1. API client 중앙화
   - `src/api/client.ts`에 `API_BASE`, JSON helper, 공통 에러 타입을 둔다.
   - fetch 호출을 먼저 이동하고 UI 상태 shape는 유지한다.

2. 도메인 API 모듈 분리
   - `src/api/auth.ts`
   - `src/api/gws.ts`
   - `src/api/llm.ts`
   - `src/api/rag.ts`
   - `src/api/settings.ts`
   - `src/api/pipeline.ts`

3. context 분리
   - `AuthProvider`
   - `WorkspaceProvider`
   - `LlmProvider`
   - `PipelineProvider`
   - 공통 backend health는 별도 hook 또는 작은 provider로 분리.

4. 컴포넌트 의존성 축소
   - 각 패널이 필요한 domain hook만 사용하도록 바꾼다.

### 검증 게이트

- `npm run build` 통과.
- `rg "http://localhost:18731" src` 결과가 API client와 사용자에게 보여주는 문구 정도로 축소.
- 주요 탭 smoke: service config, auth status, Gmail labels/search, RAG status/search, LLM status/config.

## P2. CSP 운영 smoke 범위 부족

### 현재 관찰

- 기본 CSP는 Tauri IPC와 로컬 백엔드 통신을 허용하도록 설정됐다.
- 그러나 Google/Notion 인증, SSE agent stream, asset/image 경로, directory picker 등 전체 사용자 플로우별 CSP 위반 여부는 지속 smoke가 필요하다.

### 위험

- 특정 패널에서만 필요한 `connect-src`, `img-src`, custom protocol이 누락될 수 있다.
- 개발 모드와 릴리스 모드의 origin/protocol 차이 때문에 한쪽에서만 깨질 수 있다.
- CSP를 너무 넓히면 하드닝 효과가 약해진다.

### 권장 대응

1. CSP 체크리스트를 smoke QA에 포함
   - backend health.
   - Google auth status/login start.
   - Notion auth URL 조회.
   - Gmail labels/search.
   - RAG status/search.
   - LLM server status.
   - agent SSE stream.

2. DevTools console 기준 수집
   - CSP violation 메시지가 있으면 directive별로 원인을 기록한다.
   - 해결 시 허용 범위를 기능 도메인 단위로 최소화한다.

3. release/dev 분리 검증
   - `npm run tauri dev`.
   - release executable.
   - 설치본.

### 검증 게이트

- 기능별 smoke 중 CSP violation 0건.
- CSP 변경 시 `connect-src`에 외부 도메인을 추가하지 않았는지 리뷰.
- OAuth callback HTML은 Tauri CSP와 별도이므로 백엔드 응답 헤더 하드닝은 별도 이슈로 관리.
