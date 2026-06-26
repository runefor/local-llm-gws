import type { DesktopMenu } from "../layouts/desktopMenu";

type StartPanelProps = {
  readonly onNavigate: (menu: DesktopMenu) => void;
};

const startSteps = [
  { menu: "sources", icon: "folder_open", title: "자료 가져오기", text: "Gmail과 Drive에서 원본을 찾습니다." },
  { menu: "indexing", icon: "sync_alt", title: "벡터화/인덱싱", text: "선택 자료를 검색 가능한 근거로 만듭니다." },
  { menu: "search", icon: "search", title: "검색하기", text: "근거를 찾고 정보 묶음으로 저장합니다." },
  { menu: "create", icon: "auto_stories", title: "답변/Wiki 만들기", text: "저장한 근거로 답변이나 Wiki 후보를 만듭니다." },
] as const satisfies readonly { readonly menu: DesktopMenu; readonly icon: string; readonly title: string; readonly text: string }[];

export function StartPanel({ onNavigate }: StartPanelProps) {
  return (
    <section className="h-full overflow-y-auto rounded-2xl border border-surface-variant bg-surface p-6 shadow-sm">
      <div className="max-w-3xl">
        <p className="text-xs font-semibold text-primary">작업 흐름</p>
        <h2 className="mt-2 text-[28px] font-normal leading-tight text-text-primary">자료를 찾고, 근거로 만들고, 답변까지 이어갑니다</h2>
        <p className="mt-3 text-sm leading-6 text-text-secondary">
          왼쪽 메뉴는 실제 사용 순서대로 정리했습니다. 처음에는 아래 카드 순서대로만 진행하면 됩니다.
        </p>
      </div>
      <div className="mt-6 grid gap-4 xl:grid-cols-4">
        {startSteps.map((step, index) => (
          <article key={step.menu} className="rounded-2xl border border-surface-variant bg-background p-4">
            <div className="flex items-center justify-between">
              <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-primary-container text-primary">
                <span className="material-symbols-rounded text-lg" aria-hidden="true">{step.icon}</span>
              </span>
              <span className="text-[11px] font-semibold text-text-secondary">{index + 1}단계</span>
            </div>
            <h3 className="mt-4 text-sm font-semibold text-text-primary">{step.title}</h3>
            <p className="mt-2 min-h-10 text-xs leading-5 text-text-secondary">{step.text}</p>
            <button
              type="button"
              onClick={() => onNavigate(step.menu)}
              className="mt-4 w-full rounded-full bg-primary px-3 py-2 text-xs font-semibold text-white transition-colors hover:bg-primary/95 active:scale-[0.98] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
            >
              열기
            </button>
          </article>
        ))}
      </div>
    </section>
  );
}
