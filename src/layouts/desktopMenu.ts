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
        label: "Gmail 작업함",
        description: "메일을 고르고 필요한 내용만 확인",
      },
      {
        id: "workspace",
        icon: "account_tree",
        label: "전체 자료 탐색",
        description: "Gmail · Drive 자료를 한 화면에서 보기",
      },
    ],
  },
  {
    title: "찾기 · 묶기",
    items: [
      {
        id: "rag",
        icon: "search",
        label: "통합 자료 찾기",
        description: "원문 위치를 찾고 정보 묶음 저장",
      },
    ],
  },
  {
    title: "답하기 · Wiki",
    items: [
      {
        id: "sync",
        icon: "auto_stories",
        label: "LLM Wiki 조건",
        description: "조건별 자료 준비와 Wiki 초안",
      },
      {
        id: "pipeline",
        icon: "insights",
        label: "요약 · 내보내기",
        description: "확인한 자료로 답변과 노트 생성",
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
