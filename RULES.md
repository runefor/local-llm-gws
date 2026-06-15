# Anti-Gravity Global Agent Rules

이 파일은 Antigravity 에이전트(CLI, IDE 등)가 작업을 시작할 때 우선적으로 참조해야 하는 프로젝트 레벨의 전역 규칙(Rules)입니다.

## 1. UI 및 프론트엔드 작업 지침 (UI/UX Engineering)
- **DESIGN.md 필독**: React 컴포넌트, HTML/CSS 레이아웃 등 화면에 렌더링되는 시각적 코드를 작성하거나 수정하기 전에는 **반드시 프로젝트 루트에 있는 `DESIGN.md` 파일을 우선적으로 읽어야 합니다.**
- **디자인 토큰 준수**: 임의의 컬러 헥사(Hex) 코드나 둥글기(border-radius), 여백 간격 등을 스스로 발명하지 마십시오. `DESIGN.md`에 명시된 규칙(Google Material 3.0 테마 등)을 100% 준수해야 합니다.
- **AI-Aesthetic 배제**: AI가 기본적으로 출력하는 보라색/네온 계열 그라데이션, 과도한 블러 섀도우 등을 프로젝트에 주입해서는 안 됩니다.

## 2. 작업 철학 (Development Philosophy)
- 모호한 요구사항이 있다면 멋대로 추측하여 구현하지 않고 사용자에게 질문하여 의도를 명확히 합니다 (Manage Confusion Actively).
- 코드 구현 시 점진적 개발(Incremental Implementation)을 지향하며, 최소 단위로 나누어 검증을 거친 후 진행합니다.
