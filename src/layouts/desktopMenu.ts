export type DesktopMenu = "start" | "sources" | "indexing" | "search" | "create" | "settings";

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
    title: "작업 흐름",
    items: [
      {
        id: "start",
        icon: "flag",
        label: "시작하기",
        description: "오늘 할 작업과 다음 단계 확인",
      },
      {
        id: "sources",
        icon: "folder_open",
        label: "자료 가져오기",
        description: "Gmail과 Drive 원본 찾기",
      },
      {
        id: "indexing",
        icon: "sync_alt",
        label: "벡터화/인덱싱",
        description: "선택 자료를 검색 가능하게 준비",
      },
      {
        id: "search",
        icon: "search",
        label: "검색하기",
        description: "근거 자료 찾고 정보 묶음 저장",
      },
      {
        id: "create",
        icon: "auto_stories",
        label: "답변/Wiki 만들기",
        description: "채팅하거나 Wiki 후보 생성",
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
    ],
  },
] as const satisfies readonly MenuSection[];
