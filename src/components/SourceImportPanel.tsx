import { useState } from "react";
import DriveSearchWorkspace from "./DriveSearchWorkspace";
import HybridMailWorkspace from "./HybridMailWorkspace";
import MultiViewWorkspace from "./MultiViewWorkspace";

type SourceTab = "gmail" | "drive" | "all";

type SourceCard = {
  readonly id: SourceTab;
  readonly icon: string;
  readonly title: string;
  readonly description: string;
  readonly detail: string;
};

const sourceCards = [
  { id: "gmail", icon: "mail", title: "Gmail", description: "메일을 찾고 선택 벡터화", detail: "메일 원본을 검색하고 필요한 항목만 골라 다음 단계로 넘깁니다." },
  { id: "drive", icon: "folder_open", title: "Drive", description: "문서를 찾고 인덱싱 준비", detail: "Drive 문서와 파일을 검색해 근거 후보를 준비합니다." },
  { id: "all", icon: "hub", title: "전체 원본", description: "Gmail과 Drive를 한 번에 확인", detail: "두 원본을 같은 화면에서 비교하며 필요한 자료를 찾습니다." },
] as const satisfies readonly SourceCard[];

export function SourceImportPanel() {
  const [selectedSource, setSelectedSource] = useState<SourceCard | null>(null);

  if (selectedSource === null) {
    return (
      <section className="flex h-full min-h-0 flex-col overflow-y-auto rounded-2xl border border-surface-variant bg-surface p-6 shadow-sm">
        <div className="max-w-3xl">
          <p className="text-xs font-semibold text-primary">자료 가져오기</p>
          <h2 className="mt-2 text-[28px] font-normal leading-tight text-text-primary">어떤 원본에서 자료를 찾을까요?</h2>
          <p className="mt-3 break-keep text-sm leading-6 text-text-secondary">
            Gmail, Drive, 전체 원본 중 하나를 선택하면 해당 자료만 넓은 작업 화면에서 다룰 수 있습니다.
          </p>
        </div>

        <div className="mt-6 grid flex-1 gap-4 lg:grid-cols-3">
          {sourceCards.map((source) => (
            <button
              key={source.id}
              type="button"
              onClick={() => setSelectedSource(source)}
              className="group flex min-h-56 flex-col rounded-2xl border border-surface-variant bg-background p-6 text-left shadow-sm transition-colors hover:border-primary hover:bg-primary-container/40 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
            >
              <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary-container text-primary transition-colors group-hover:bg-primary group-hover:text-white">
                <span className="material-symbols-rounded text-2xl" aria-hidden="true">{source.icon}</span>
              </span>
              <span className="mt-6 text-lg font-semibold text-text-primary">{source.title}</span>
              <span className="mt-2 text-sm font-medium text-primary">{source.description}</span>
              <span className="mt-4 break-keep text-sm leading-6 text-text-secondary">{source.detail}</span>
              <span className="mt-auto flex items-center gap-1 pt-6 text-xs font-semibold text-primary">
                작업 화면 열기
                <span className="material-symbols-rounded text-base" aria-hidden="true">arrow_forward</span>
              </span>
            </button>
          ))}
        </div>
      </section>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col gap-3">
      <section className="flex flex-col gap-3 rounded-2xl border border-surface-variant bg-surface px-4 py-3 shadow-sm lg:flex-row lg:items-center lg:justify-between">
        <div className="flex min-w-0 items-start gap-3">
          <span className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-2xl bg-primary-container text-primary">
            <span className="material-symbols-rounded text-xl" aria-hidden="true">{selectedSource.icon}</span>
          </span>
          <div className="min-w-0">
            <p className="text-xs font-semibold text-primary">자료 가져오기</p>
            <h2 className="mt-1 break-keep text-sm font-semibold text-text-primary">{selectedSource.title}</h2>
            <p className="mt-1 break-keep text-xs leading-5 text-text-secondary">{selectedSource.description}</p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => setSelectedSource(null)}
          className="inline-flex items-center justify-center gap-1 rounded-full border border-surface-variant bg-background px-4 py-2 text-xs font-semibold text-primary transition-colors hover:bg-primary-container/50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
        >
          <span className="material-symbols-rounded text-base" aria-hidden="true">arrow_back</span>
          자료 선택으로 돌아가기
        </button>
      </section>
      <div className="min-h-0 flex-1 overflow-hidden">
        {selectedSource.id === "gmail" && <HybridMailWorkspace isDesktop={true} />}
        {selectedSource.id === "drive" && <DriveSearchWorkspace isDesktop={true} />}
        {selectedSource.id === "all" && <MultiViewWorkspace isDesktop={true} />}
      </div>
    </div>
  );
}
