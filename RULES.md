# Anti-Gravity Global Agent Rules

이 파일은 Antigravity 에이전트(CLI, IDE 등)가 작업을 시작할 때 우선적으로 참조해야 하는 프로젝트 레벨의 전역 규칙(Rules)입니다.

## 1. UI 및 프론트엔드 작업 지침 (UI/UX Engineering)
- **DESIGN.md 필독**: React 컴포넌트, HTML/CSS 레이아웃 등 화면에 렌더링되는 시각적 코드를 작성하거나 수정하기 전에는 **반드시 프로젝트 루트에 있는 [DESIGN.md](file:///c:/Users/fkjy1/dev/local-llm-gws/DESIGN.md) 파일을 우선적으로 읽어야 합니다.**
- **디자인 토큰 준수**: 임의의 컬러 헥사(Hex) 코드나 둥글기(border-radius), 여백 간격 등을 스스로 정의하지 마십시오. [DESIGN.md](file:///c:/Users/fkjy1/dev/local-llm-gws/DESIGN.md)에 명시된 규칙(Google Material 3.0 테마 등)을 100% 준수해야 합니다.
  - 특히, 모든 상호작용용 버튼(`button`)은 **완전한 알약 형태(border-radius: 9999px / Tailwind의 `rounded-full`)**를 예외 없이 적용해야 합니다.
- **AI-Aesthetic 배제**: AI가 기본적으로 출력하는 보라색/네온 계열 그라데이션, 과도한 블러 섀도우 등을 프로젝트에 주입해서는 안 됩니다. 구글 워크스페이스 순정 앱과 같은 차분한 파스텔 블루 테마(`#0b57d0`)를 유지하십시오.

## 2. 작업 철학 및 프로세스 (Development Philosophy)
- **모호한 요구사항의 능동적 해결**: 모호한 요구사항이 있다면 멋대로 추측하여 구현하지 않고, 사용자에게 질문하여 의도를 명확히 합니다 (Manage Confusion Actively).
- **점진적 구현 (Incremental Implementation)**: 코드 구현 시 검증 가능한 가장 작은 단위로 나누어 구현하며, 매 단계 변경사항을 테스트 및 검증하십시오.
- **환경 차별화 대응**: 이 앱은 Tauri 데스크톱 환경과 웹 브라우저 환경을 동시에 지원할 수 있습니다. 각 환경에서 UI 및 기능이 깨지지 않고 각각에 최적화된 UX를 제공하도록 코드를 작성하십시오. (예: Tauri 전용 API 호출 시 guard 구문 추가)

## 3. 영속성 및 연동성 보장 (Data & Integration)
- **ChromaDB 데이터 보존**: 로컬 DB 설정(ChromaDB 등)을 수정할 때는 데이터가 영구적으로 보존(Persistence)되는 설정이 해제되거나 경로가 초기화되지 않도록 철저히 검증하십시오.
- **연동 상태 실시간 반영**: Ollama/LLM Studio 등의 로컬 모델 연결 여부 및 Google 로그인/Google Workspace API(Gmail, Google Drive) 연동 성공 여부가 UI에 지연이나 왜곡 없이 즉각적이고 정확하게 반영되도록 상태 처리를 보장해야 합니다.
