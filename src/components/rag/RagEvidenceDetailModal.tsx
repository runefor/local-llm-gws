import { OriginalOpenButton } from "../OriginalOpenButton";

type RagEvidenceDetail = {
  readonly id: string;
  readonly title: string;
  readonly source: string;
  readonly snippet: string;
  readonly content_snapshot: string;
  readonly location_label?: string;
  readonly date?: string;
};

type RagEvidenceDetailModalProps = {
  readonly item: RagEvidenceDetail;
  readonly matchReason: string;
  readonly relevanceLabel: string;
  readonly isOriginalLoading: boolean;
  readonly onOpenOriginal: () => void;
  readonly onClose: () => void;
};

export function RagEvidenceDetailModal({
  item,
  matchReason,
  relevanceLabel,
  isOriginalLoading,
  onOpenOriginal,
  onClose,
}: RagEvidenceDetailModalProps) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#1f1f1f]/35 p-6">
      <section className="flex max-h-[90vh] w-full max-w-5xl flex-col overflow-hidden rounded-2xl border border-[#e1e3e1] bg-white shadow-[0_8px_24px_rgba(0,0,0,0.12)]">
        <header className="flex items-start justify-between gap-4 border-b border-[#e1e3e1] bg-[#f8fafd] p-5">
          <div className="min-w-0 space-y-2">
            <div className="flex flex-wrap items-center gap-2 text-[11px] font-bold">
              <span className="rounded-full bg-[#d3e3fd] px-3 py-1 text-[#0b57d0]">{item.source}</span>
              <span className="rounded-full border border-[#e1e3e1] bg-white px-3 py-1 text-[#444746]">{relevanceLabel}</span>
              <span className="rounded-full border border-[#e1e3e1] bg-white px-3 py-1 text-[#444746]">{item.date || "날짜 없음"}</span>
            </div>
            <h3 className="truncate text-lg font-semibold text-[#1f1f1f]">{item.title}</h3>
            <p className="truncate text-xs text-[#444746]">{item.location_label || "원문 위치 정보 없음"}</p>
          </div>
          <div className="flex flex-shrink-0 items-center gap-2">
            <OriginalOpenButton isLoading={isOriginalLoading} onClick={onOpenOriginal} />
            <button
              type="button"
              onClick={onClose}
              className="rounded-full border border-[#e1e3e1] bg-white p-2 text-[#444746] hover:bg-[#d3e3fd]/40 transition-all"
              aria-label="자료 보기 닫기"
            >
              <span className="material-symbols-rounded text-lg">close</span>
            </button>
          </div>
        </header>
        <div className="flex-1 overflow-y-auto bg-white p-5">
          <div className="mx-auto flex max-w-3xl flex-col gap-4">
            <div className="rounded-2xl border border-[#d3e3fd] bg-[#d3e3fd]/25 p-4">
              <div className="mb-2 text-xs font-bold text-[#1f1f1f]">매칭 근거</div>
              <p className="whitespace-pre-wrap text-sm leading-7 text-[#444746]">{matchReason || item.snippet}</p>
            </div>
            <div className="rounded-2xl border border-[#e1e3e1] bg-[#f8fafd] p-4">
              <div className="mb-2 text-xs font-bold text-[#1f1f1f]">찾은 자료 내용</div>
              <pre className="whitespace-pre-wrap break-words font-sans text-sm leading-7 text-[#444746]">
                {item.content_snapshot || item.snippet || "표시할 자료 내용이 없습니다."}
              </pre>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
