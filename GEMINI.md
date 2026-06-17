# Gemini Agent Project Rules (local-llm-gws)

이 파일은 Gemini 기반의 Antigravity 에이전트가 이 프로젝트 디렉토리에서 구동될 때 항상 자동으로 로드하여 준수해야 하는 로컬 규칙(Project Rules)입니다.

---

## 1. 기술 스택 및 실행 명령어 (Tech Stack & Commands)

### 🛠️ 기술 스택 (Tech Stack)
- **Frontend**: React 19.x, TypeScript, Vite 7.x, Tailwind CSS 4.x, Tauri v2 (Rust 기반 데스크톱 래퍼)
- **Backend**: Python 3.x, FastAPI, Uvicorn, ChromaDB 0.5.23 (로컬 벡터 DB), PostHog 5.4.0 (텔레메트리), Google API Client (Workspace 연동)

### 💻 실행 및 빌드 명령어 (Commands)
- **데스크톱 앱 개발 모드 실행**: `npm run tauri dev` 또는 프로젝트 루트의 [run.bat](file:///c:/Users/fkjy1/dev/local-llm-gws/run.bat) 실행
- **프론트엔드 단독 개발 서버 실행**: `npm run dev`
- **프론트엔드 빌드 및 타입 체크**: `npm run build` (내부적으로 `tsc && vite build` 수행)
- **프론트엔드 빌드 결과물 미리보기**: `npm run preview`

---

## 2. UI/UX 디자인 시스템 철저 준수 (DESIGN.md 연동)
- **DESIGN.md 필독**: React 컴포넌트, HTML/CSS 레이아웃 등 화면에 렌더링되는 시각적 코드를 작성하거나 수정하기 전에는 **반드시 프로젝트 루트에 있는 [DESIGN.md](file:///c:/Users/fkjy1/dev/local-llm-gws/DESIGN.md) 파일을 우선적으로 읽어야 합니다.**
- **버튼 디자인 준수**: 버튼 컴포넌트(`button`)를 디자인할 때는 예외 없이 **완전한 알약 형태(Pill shape, border-radius: 9999px 즉 Tailwind의 `rounded-full`)**를 적용해야 합니다. 임의로 `rounded-xl`이나 `rounded-lg` 등을 할당하지 마십시오.
- **색상 테마 준수**: 구글의 신뢰성과 친숙함을 나타내는 **파스텔 블루 계열(`bg-primary` / Hex `#0b57d0`)**을 주 테마로 활용하고, AI 특유의 인디고/보라색 계열이나 강한 그라데이션, 지나친 글로우 효과 등은 철저히 배제합니다.
- **여백 배수 준수**: 간격과 마진, 패딩은 Material Spacing Scale에 맞춰 **4px의 배수(4px, 8px, 16px, 24px)**를 엄격히 준수하십시오.

---

## 3. 핵심 아키텍처 제약 사항 및 과거 디버깅 사례

### 🖥️ Desktop (Tauri) vs Web UI 환경 분기
- 데스크톱 앱 실행 환경(Tauri 내부)과 웹 브라우저 환경에서 공통 코드가 실행될 때 에러가 발생하지 않도록 조치해야 합니다.
- Tauri 전용 API(윈도우 제어, 알림 등)를 호출할 때는 반드시 Tauri 런타임 환경(`window.__TAURI__` 또는 `@tauri-apps/api` 임포트 안전 가드)인지 판별한 뒤 실행하십시오.

### 🔌 로컬 LLM (Ollama/LLM Studio) 연동 및 감지
- 로컬에서 구동 중인 Ollama 또는 LLM Studio API 엔드포인트를 백엔드가 자동으로 탐지하고 연결할 수 있어야 합니다.
- UI 상의 Ollama 연결 상태를 나타내는 토글 버튼 등은 실제 백엔드의 활성 연결 상태를 정확하게 미러링해야 하며, 연결 상태가 끊어지거나 실패할 때의 예외 UI 처리가 매끄러워야 합니다.

### 📧 Google Workspace & RAG 연동 인증 상태
- 사용자가 OAuth 2.0 구글 로그인을 마친 뒤, Gmail 및 구글 드라이브 연동 상태가 UI에 지연 없이 실시간으로 '연동 완료'로 전환되어야 합니다.
- 백엔드에서 인증 완료 후 프론트엔드로 상태 변화를 전달할 때 끊김이나 누락이 없는지 검토하십시오.

### 💾 ChromaDB 데이터 영속성 (Persistence)
- 애플리케이션 종료 및 재시작 시에도 ChromaDB 데이터가 보존될 수 있도록, 백엔드의 DB 클라이언트 생성부에서 디스크 영구 저장 옵션(ChromaDB Settings)이 정확히 설정되어 있는지 점검해야 합니다. 로컬 DB 디렉토리 경로가 초기화되지 않도록 하십시오.

### 📊 PostHog 텔레메트리 호출 규격
- 과거 `posthog.capture()` 호출 시 인자 전달 방식의 정합성 오류(`TypeError: capture() takes 1 positional argument but 3 were given`)가 발생한 적이 있습니다.
- 텔레메트리 전송 시 반드시 PostHog API 사양을 준수하십시오. positional 인자 대신 키워드 인자(`event`, `properties={...}`) 형태로 호출하여 인자 개수 불일치 에러를 방지하십시오.

---

## 4. 작업 철학 및 소통 방식 (Rules of Engagement)
- **모호함 적극적 해결**: 사용자 요구사항이나 인터페이스 정의에 모호한 점이 존재할 경우, 독자적으로 판단하여 기능이나 디자인을 구현하지 말고 **즉시 사용자에게 질문하여 명확하게 조율**하십시오.
- **점진적 구현 (Incremental Implementation)**: 기능 개발 및 리팩토링 수행 시 여러 파일을 한꺼번에 수정하지 않고, 검증 가능한 작은 단위의 변경으로 나누어 구현하고 매 단계 테스트 및 E2E 동작을 검증하십시오.
- **한국어 커뮤니케이션**: 사용자에게 진행 상황을 보고하거나 질문할 때, 보고서(Implementation Plan, Walkthrough 등) 아티팩트를 작성할 때는 모든 콘텐츠를 **한국어(Korean)**로 일관되게 작성하십시오.
