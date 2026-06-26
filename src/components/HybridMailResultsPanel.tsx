import type { GmailItem } from "../context/AppContext";
import { formatMailDate, getMessageId } from "./hybridMailHelpers";

type HybridMailResultsPanelProps = {
  readonly isDesktop: boolean;
  readonly searching: boolean;
  readonly gmailItems: readonly GmailItem[];
  readonly selectedIds: readonly string[];
  readonly vectorizedIds: readonly string[];
  readonly vectorizedSelectedCount: number;
  readonly labelNameById: ReadonlyMap<string, string>;
  readonly isBusy: boolean;
  readonly onToggleSelection: (messageId: string) => void;
};

export function HybridMailResultsPanel({
  isDesktop,
  searching,
  gmailItems,
  selectedIds,
  vectorizedIds,
  vectorizedSelectedCount,
  labelNameById,
  isBusy,
  onToggleSelection,
}: HybridMailResultsPanelProps) {
  return (
    <section className={`bg-surface rounded-2xl border border-surface-variant p-4 flex flex-col gap-4 ${isDesktop ? "min-h-0 overflow-hidden" : ""}`}>
      <div className="flex items-center justify-between gap-3 bg-white border border-surface-variant rounded-xl px-4 py-3 text-[11px] text-text-secondary">
        <div>
          <h3 className="text-xs font-bold text-text-primary flex items-center gap-1.5">
            <span className="material-symbols-rounded text-primary text-sm">inbox</span>
            검색된 원본 메일
          </h3>
          <p className="mt-1 break-keep leading-relaxed [overflow-wrap:normal] [word-break:keep-all]">제목, 발신자, 라벨을 넓게 봅니다.</p>
        </div>
        <div className="flex flex-wrap justify-end gap-2 font-bold">
          <span className="rounded-full border border-surface-variant bg-surface px-3 py-1">결과 {gmailItems.length}개</span>
          <span className="rounded-full border border-primary/20 bg-primary-container/50 px-3 py-1 text-primary">벡터화 {vectorizedSelectedCount}/{selectedIds.length}</span>
        </div>
      </div>

      <div className={`flex-1 pr-1 -mr-1 ${isDesktop ? "min-h-0 overflow-y-auto" : "max-h-[680px] overflow-y-auto"}`}>
        {searching ? (
          <div className="h-full min-h-[320px] flex flex-col items-center justify-center text-center gap-2 text-text-secondary">
            <span className="material-symbols-rounded text-4xl text-primary animate-spin">sync</span>
            <p className="text-xs font-semibold">Gmail 메타데이터를 가져오는 중입니다.</p>
          </div>
        ) : gmailItems.length === 0 ? (
          <div className="h-full min-h-[320px] flex flex-col items-center justify-center text-center gap-2 text-text-secondary">
            <span className="material-symbols-rounded text-4xl text-text-secondary/35">inbox</span>
            <p className="text-xs font-semibold">아직 GWS에서 검색한 Gmail 원본 메타데이터가 없습니다.</p>
            <p className="max-w-[260px] break-keep text-[11px] leading-relaxed [overflow-wrap:normal] [word-break:keep-all]">왼쪽 조건으로 메일을 찾고 필요한 항목만 벡터화하세요.</p>
          </div>
        ) : (
          <div className="space-y-3 pb-2">
            {gmailItems.map((item) => {
              const messageId = getMessageId(item);
              const selected = selectedIds.includes(messageId);
              const vectorized = vectorizedIds.includes(messageId);
              return (
                <article key={messageId} className={`bg-white border rounded-2xl p-4 transition-all ${selected ? "border-primary/40 shadow-[0_8px_24px_rgba(11,87,208,0.08)]" : "border-surface-variant hover:border-primary/25"}`}>
                  <div className="flex gap-3">
                    <label className="pt-0.5 cursor-pointer">
                      <input type="checkbox" checked={selected} onChange={() => onToggleSelection(messageId)} disabled={isBusy && !selected} className="h-4 w-4 rounded border-surface-variant accent-primary cursor-pointer disabled:cursor-default disabled:opacity-50" aria-label={`${item.subject || "제목 없는 메일"} 선택`} />
                    </label>
                    <div className="flex-1 min-w-0 flex flex-col gap-2">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <h4 className="text-sm font-bold text-text-primary leading-relaxed truncate">{item.subject || "(제목 없음)"}</h4>
                          <p className="text-[11px] text-text-secondary truncate mt-0.5">{item.from || "발신자 없음"}</p>
                        </div>
                        <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold border flex-shrink-0 ${vectorized ? "bg-primary-container/60 border-primary-container text-primary" : "bg-surface border-surface-variant text-text-secondary"}`}>
                          {vectorized ? "벡터화됨" : formatMailDate(item.date)}
                        </span>
                      </div>
                      <p className="text-xs text-text-secondary leading-relaxed line-clamp-3">{item.snippet || "미리보기 본문이 없습니다."}</p>
                      {(item.threadId || item.labelIds?.length) && (
                        <div className="flex flex-wrap gap-1.5 text-[10px] text-text-secondary">
                          {item.threadId && <span className="bg-surface border border-surface-variant px-2 py-0.5 rounded-full">thread {item.threadId}</span>}
                          {item.labelIds?.slice(0, 5).map((labelId) => (
                            <span key={labelId} className="bg-surface border border-surface-variant px-2 py-0.5 rounded-full">{labelNameById.get(labelId) ?? labelId}</span>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </div>
    </section>
  );
}
