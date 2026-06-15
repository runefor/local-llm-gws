# Design System Specification (Google Material 3.0)

이 문서는 `local-llm-gws` 프로젝트의 일관된 UI/UX 구축을 위한 기계 가독형 디자인 시스템 명세서(Design Brief)입니다. AI 에이전트나 개발자는 프론트엔드 UI(HTML, CSS, React 컴포넌트 등)를 생성하거나 수정할 때 **반드시 이 문서를 먼저 읽고 지침을 100% 준수**해야 합니다.

## 1. 디자인 철학 (Design Principles)
이 앱은 Google Workspace(Gmail, Google Drive)와 연동되는 생산성 도구입니다. 따라서 사용자가 구글 순정 앱을 사용하는 것과 같은 **친숙함, 편안함, 명확성**을 느끼는 것이 최우선 목표입니다.

*   **Google Material Design 3 (M3) 기반**: 크고 둥근 모서리, 파스텔 톤의 부드러운 색상, 입체감을 나타내는 얕은 그림자(Elevation)를 활용합니다.
*   **Aesthetic Quality (프리미엄 퀄리티)**: AI가 무작위로 생성한 듯한 어색한 둥글기나 무분별한 그라데이션, 인디고/보라색 남용을 철저히 배제합니다.
*   **Accessibility First**: 글자 색상과 배경 색상의 대비를 명확히 하고, 키보드 접근성(focus states)을 모든 상호작용 요소에 적용합니다.

---

## 2. 디자인 토큰 (Design Tokens)

### 🎨 색상 팔레트 (Color Palette)
무거운 다크톤이나 쨍한 네온 컬러를 피하고, Google 특유의 차분하고 신뢰감을 주는 색상을 사용합니다.

*   **Primary (주요 강조 색상)**
    *   `Primary`: `#0b57d0` (Google Blue - 주요 버튼, 활성 상태 탭)
    *   `On Primary`: `#ffffff` (Primary 버튼 안의 텍스트 색상)
    *   `Primary Container`: `#d3e3fd` (선택된 항목 배경, 연한 파스텔 블루)
*   **Secondary / Surface (배경 및 패널)**
    *   `Background`: `#ffffff` (전체 앱의 기본 배경)
    *   `Surface`: `#f8fafd` (약간의 블루 틴트가 들어간 카드/패널 배경)
    *   `Surface Variant`: `#e1e3e1` (구분선, 비활성 버튼 배경 등)
*   **Text (타이포그래피 색상)**
    *   `Text Primary`: `#1f1f1f` (거의 검은색 - 제목 및 주요 텍스트)
    *   `Text Secondary`: `#444746` (회색 - 본문 및 보조 텍스트)

### 📐 타이포그래피 (Typography)
폰트는 기본적으로 구글 웹 폰트인 `Google Sans`, `Roboto`, 혹은 `Inter`를 사용합니다. 계층 구조를 명확히 해야 합니다.

*   **Font Family**: `'Google Sans', 'Roboto', 'Inter', sans-serif`
*   **Display / Headline (페이지 제목)**: `font-size: 1.75rem (28px); font-weight: 400; line-height: 1.2;`
*   **Title (카드/모달 제목)**: `font-size: 1.125rem (18px); font-weight: 500; line-height: 1.4;`
*   **Body (일반 본문)**: `font-size: 0.875rem (14px); font-weight: 400; line-height: 1.5; color: #444746;`
*   **Label (버튼, 네비게이션 텍스트)**: `font-size: 0.875rem (14px); font-weight: 500; letter-spacing: 0.1px;`

### 📏 간격 및 레이아웃 (Spacing & Layout)
임의의 여백(예: 11px, 19px) 사용을 엄격히 금지합니다. 4px의 배수인 Material Spacing Scale을 따릅니다.

*   `4px (0.25rem)`: 아이콘과 텍스트 사이 등 매우 좁은 간격
*   `8px (0.5rem)`: 버튼 그룹, 리스트 아이템 간격
*   `16px (1.0rem)`: 컴포넌트 내부 기본 패딩 (카드 내 여백 등)
*   `24px (1.5rem)`: 섹션 간 간격, 다이얼로그 모달의 기본 패딩

### 📦 컴포넌트 형태 (Components & Shape)
*   **버튼 (Button)**: 완전한 알약 형태(Pill shape). `border-radius: 9999px` 적용.
*   **카드 (Card)**: 부드러운 둥근 모서리. `border-radius: 12px` 또는 `16px` 적용. 배경색은 `Surface` 혹은 테두리(`1px solid #e1e3e1`) 사용.
*   **그림자 (Elevation)**: 짙고 큰 그림자는 금지합니다. 매우 얕은 그림자(예: `box-shadow: 0 1px 2px 0 rgba(0, 0, 0, 0.05)`)를 사용하거나, 외곽선을 활용한 Flat 구성을 선호합니다.

---

## 3. 금지 및 권장 조항 (Do's & Don'ts)

### ⭕ Do (반드시 지킬 것)
*   아이콘이 필요할 경우 [Google Material Symbols (Rounded)](https://fonts.google.com/icons)를 최우선으로 사용할 것.
*   사용자 입력창(Input)은 둥근 모서리와 명확한 포커스 링(`outline`)을 제공할 것.
*   상호작용이 가능한 요소에는 `:hover`, `:active` 상태 시 미세한 배경색 변화를 줄 것.

### ❌ Don't (절대 하지 말 것)
*   AI가 흔히 생성하는 "Vibrant Purple/Indigo" 테마 사용 금지. 이 앱은 철저히 파스텔 블루 기반입니다.
*   거대한 블러(blur) 효과나 네온 글로우(neon glow) 같은 지나친 장식 효과 금지. 구글 워크스페이스처럼 차분해야 합니다.
*   버튼이나 카드의 모서리를 각지게(`border-radius: 0`) 만들지 말 것.
*   내용이 없다고 해서 'Lorem Ipsum' 더미 텍스트를 넣지 말 것. 실제 앱에서 보일법한 문맥에 맞는 텍스트나 데이터를 생성하여 채울 것.

---
**[AI 처리 지침]**
이후 작성되는 모든 프론트엔드 코드(React, HTML/CSS)는 본 문서의 `Design Tokens` 수치와 컬러 코드를 100% 매핑하여 작성하십시오. 알 수 없는 CSS 클래스나 테마를 창조해내지 마십시오.
