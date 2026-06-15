# Gemini Agent Project Rules (local-llm-gws)

이 파일은 Gemini 기반의 Antigravity 에이전트가 이 프로젝트 디렉토리에서 구동될 때 항상 자동으로 로드하여 준수해야 하는 로컬 규칙(Project Rules)입니다.

## 1. UI/UX 디자인 시스템 철저 준수 (DESIGN.md 연동)
- **DESIGN.md 필독**: React 컴포넌트, HTML/CSS 레이아웃 등 화면에 렌더링되는 시각적 코드를 작성하거나 수정하기 전에는 **반드시 프로젝트 루트에 있는 [DESIGN.md](file:///c:/Users/fkjy1/dev/local-llm-gws/DESIGN.md) 파일을 우선적으로 읽어야 합니다.**
- **버튼 디자인 준수**: 버튼 컴포넌트(`button`)를 디자인할 때는 예외 없이 **완전한 알약 형태(Pill shape, border-radius: 9999px 즉 Tailwind의 `rounded-full`)**를 적용해야 합니다. 임의로 `rounded-xl`이나 `rounded-lg` 등을 할당하지 마십시오.
- **색상 테마 준수**: 구글의 신뢰성과 친숙함을 나타내는 **파스텔 블루 계열(`bg-primary` / Hex `#0b57d0`)**을 주 테마로 활용하고, AI 특유의 인디고/보라색 계열이나 강한 그라데이션, 지나친 글로우 효과 등은 철저히 배제합니다.
- **여백 배수 준수**: 간격과 마진, 패딩은 Material Spacing Scale에 맞춰 **4px의 배수(4px, 8px, 16px, 24px)**를 엄격히 준수하십시오.

## 2. 작업 절학 및 소통 방식 (Rules of Engagement)
- **모호함 적극적 해결**: 사용자 요구사항이나 인터페이스 정의에 모호한 점이 존재할 경우, 독자적으로 판단하여 기능이나 디자인을 구현하지 말고 **즉시 사용자에게 질문하여 명확하게 조율**하십시오.
- **점진적 구현 (Incremental Implementation)**: 기능 개발 및 리팩토링 수행 시 여러 파일을 한꺼번에 수정하지 않고, 검증 가능한 작은 단위의 변경으로 나누어 구현하고 매 단계 테스트 및 E2E 동작을 검증하십시오.
- **한국어 커뮤니케이션**: 사용자에게 진행 상황을 보고하거나 질문할 때, 보고서(Implementation Plan, Walkthrough 등) 아티팩트를 작성할 때는 모든 콘텐츠를 **한국어(Korean)**로 일관되게 작성하십시오.
