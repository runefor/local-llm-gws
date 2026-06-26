import RagSearchPanel from "./RagSearchPanel";

type RagWorkflowIntent = "search" | "create";

type RagWorkflowPanelProps = {
  readonly intent: RagWorkflowIntent;
};

const workflowSteps = ["검색", "근거 검토", "Wiki 생성", "내보내기"] as const;

export function RagWorkflowPanel({ intent }: RagWorkflowPanelProps) {
  const focusIndex = intent === "search" ? 0 : 2;

  return (
    <div className="flex h-full min-h-0 flex-col gap-3 overflow-hidden">
      <section className="flex flex-col gap-3 rounded-2xl border border-primary-container/40 bg-primary-container/20 px-4 py-3 shadow-sm lg:flex-row lg:items-center lg:justify-between" aria-label={intent === "search" ? "검색하기 작업 흐름" : "답변과 Wiki 만들기 작업 흐름"}>
        <div className="min-w-0">
          <p className="text-xs font-semibold text-primary">{intent === "search" ? "검색하기" : "답변/Wiki 만들기"}</p>
          <h2 className="mt-1 break-keep text-sm font-semibold text-text-primary">
            {intent === "search" ? "근거를 찾고 필요한 자료만 정보 묶음으로 저장합니다" : "저장한 근거로 답변하거나 Wiki 후보를 만듭니다"}
          </h2>
        </div>
        <ol className="flex flex-wrap gap-2" aria-label="작업 단계">
          {workflowSteps.map((step, index) => {
            const active = index === focusIndex;
            return (
              <li key={step} className={`inline-flex items-center gap-1 rounded-full border px-3 py-1 text-[11px] font-semibold ${active ? "border-primary bg-background text-primary" : "border-surface-variant bg-surface text-text-secondary"}`}>
                <span className="material-symbols-rounded text-sm" aria-hidden="true">{active ? "radio_button_checked" : "radio_button_unchecked"}</span>
                {step}
              </li>
            );
          })}
        </ol>
      </section>
      <div className="min-h-0 flex-1 overflow-y-auto pr-1">
        <RagSearchPanel />
      </div>
    </div>
  );
}
