export type DesktopMenu = "hybrid" | "sync" | "workspace" | "rag" | "pipeline" | "settings" | "logs";

type MenuItem = {
  readonly id: DesktopMenu;
  readonly icon: string;
  readonly label: string;
  readonly description: string;
};

type MenuSection = {
  readonly title: string;
  readonly items: readonly MenuItem[];
};

export const menuSections = [
  {
    title: "자료 준비",
    items: [
      {
        id: "hybrid",
        icon: "mail",
        label: "Gmail 원본 검색",
        description: "GWS 메일을 찾고 선택 벡터화",
      },
      {
        id: "workspace",
        icon: "account_tree",
        label: "Gmail · Drive 원본 검색",
        description: "GWS 원본 목록만 확인",
      },
    ],
  },
  {
    title: "찾기",
    items: [
      {
        id: "rag",
        icon: "search",
        label: "벡터 자료 찾기",
        description: "벡터화된 자료만 검색",
      },
    ],
  },
  {
    title: "답하기",
    items: [
      {
        id: "sync",
        icon: "auto_stories",
        label: "Wiki 조건 준비",
        description: "조건별 원본 수집과 Wiki 초안",
      },
      {
        id: "pipeline",
        icon: "insights",
        label: "요약 · 저장",
        description: "원본과 함께 노션/옵시디언 저장",
      },
    ],
  },
  {
    title: "관리",
    items: [
      {
        id: "settings",
        icon: "settings",
        label: "로컬 LLM 설정",
        description: "모델과 서비스 연결 관리",
      },
      {
        id: "logs",
        icon: "terminal",
        label: "실행 로그",
        description: "오류와 백엔드 기록 확인",
      },
    ],
  },
] as const satisfies readonly MenuSection[];
