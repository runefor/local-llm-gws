import { useState } from "react";
import type { FormEvent } from "react";
import type { GmailItem, GmailLabel } from "../context/AppContext";
import { metadataExampleChips, metadataPeriodOptions } from "./hybridMailHelpers";
import type { MetadataPeriod } from "./hybridMailHelpers";

type HybridMailSearchPanelProps = {
  readonly canUseGmail: boolean;
  readonly searching: boolean;
  readonly vectorizing: boolean;
  readonly gmailLabelsLoading: boolean;
  readonly gmailLabels: readonly GmailLabel[];
  readonly filteredLabels: readonly GmailLabel[];
  readonly selectedLabelIds: readonly string[];
  readonly gmailItems: readonly GmailItem[];
  readonly selectedIds: readonly string[];
  readonly vectorizedSelectedCount: number;
  readonly metadataKeyword: string;
  readonly metadataSender: string;
  readonly metadataPeriod: MetadataPeriod;
  readonly metadataHasAttachment: boolean;
  readonly labelSearch: string;
  readonly maxEmails: string;
  readonly isGwsAuthenticated: boolean;
  readonly onSubmit: (event: FormEvent) => void;
  readonly onToggleAll: () => void;
  readonly onKeywordChange: (value: string) => void;
  readonly onSenderChange: (value: string) => void;
  readonly onPeriodChange: (value: MetadataPeriod) => void;
  readonly onHasAttachmentChange: (value: boolean) => void;
  readonly onLabelSearchChange: (value: string) => void;
  readonly onMaxEmailsChange: (value: string) => void;
  readonly onToggleLabel: (labelId: string) => void;
  readonly onLoadGmailLabels: () => void;
  readonly onVectorize: () => void;
};

export function HybridMailSearchPanel({
  canUseGmail,
  searching,
  vectorizing,
  gmailLabelsLoading,
  gmailLabels,
  filteredLabels,
  selectedLabelIds,
  gmailItems,
  selectedIds,
  vectorizedSelectedCount,
  metadataKeyword,
  metadataSender,
  metadataPeriod,
  metadataHasAttachment,
  labelSearch,
  maxEmails,
  isGwsAuthenticated,
  onSubmit,
  onToggleAll,
  onKeywordChange,
  onSenderChange,
  onPeriodChange,
  onHasAttachmentChange,
  onLabelSearchChange,
  onMaxEmailsChange,
  onToggleLabel,
  onLoadGmailLabels,
  onVectorize,
}: HybridMailSearchPanelProps) {
  const [quickExamplesExpanded, setQuickExamplesExpanded] = useState(false);
  const [labelPickerOpen, setLabelPickerOpen] = useState(false);
  const selectedLabelNames = gmailLabels
    .filter((label) => selectedLabelIds.includes(label.id))
    .map((label) => label.name);

  return (
    <>
    <section className="bg-surface rounded-2xl border border-surface-variant p-3 flex flex-col gap-3 min-h-0 overflow-visible">
      <form onSubmit={onSubmit} className="flex flex-col gap-2.5">
        <div className="flex items-center justify-between gap-3">
          <h3 className="text-xs font-bold text-text-primary flex items-center gap-1.5">
            <span className="material-symbols-rounded text-primary text-sm">mail</span>
            Gmail 메타데이터 검색
          </h3>
          {gmailItems.length > 0 && (
            <button type="button" onClick={onToggleAll} className="text-[10px] bg-white hover:bg-primary-container/35 border border-surface-variant text-primary px-3 py-1.5 rounded-full font-bold transition-all">
              {selectedIds.length === gmailItems.length ? "전체 해제" : "전체 선택"}
            </button>
          )}
        </div>

        <div className="relative rounded-2xl border border-surface-variant bg-white px-3 py-2">
          <button
            type="button"
            onClick={() => setQuickExamplesExpanded((current) => !current)}
            className="flex w-full items-center justify-between gap-2 text-left text-[11px] font-semibold text-text-primary"
            aria-expanded={quickExamplesExpanded}
          >
            <span className="flex items-center gap-1.5">
              <span className="material-symbols-rounded text-sm text-primary">tune</span>
              빠른 조건 예시
            </span>
            <span className="flex items-center gap-1 text-text-secondary">
              {metadataExampleChips.length}개
              <span className="material-symbols-rounded text-sm">{quickExamplesExpanded ? "expand_less" : "expand_more"}</span>
            </span>
          </button>
          {quickExamplesExpanded && (
            <div className="absolute left-0 right-0 top-full z-20 mt-2 flex flex-wrap gap-2 rounded-2xl border border-surface-variant bg-white p-3 shadow-[0_1px_2px_0_rgba(0,0,0,0.05)]">
              {metadataExampleChips.map((chip) => (
                <button
                  key={chip.label}
                  type="button"
                  onClick={() => {
                    onPeriodChange(chip.values.period);
                    onKeywordChange(chip.values.keyword);
                    onHasAttachmentChange(chip.values.hasAttachment ?? false);
                    setQuickExamplesExpanded(false);
                  }}
                  disabled={!canUseGmail || searching}
                  className="rounded-full border border-surface-variant bg-surface px-3 py-1.5 text-[11px] font-semibold text-text-secondary transition-all hover:border-primary/30 hover:bg-primary-container/30 hover:text-text-primary disabled:opacity-50"
                >
                  {chip.label}
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
          <label className="space-y-1.5">
            <span className="text-[11px] font-semibold text-text-secondary">키워드</span>
            <div className="relative">
              <span className="material-symbols-rounded absolute left-3.5 top-1/2 -translate-y-1/2 text-text-secondary text-lg">search</span>
              <input type="text" value={metadataKeyword} onChange={(event) => onKeywordChange(event.target.value)} disabled={!canUseGmail || searching} placeholder="예: 계약서, paper, 지원" className="w-full bg-white border border-surface-variant rounded-full pl-10 pr-4 py-2.5 text-xs text-text-primary focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary disabled:opacity-50 transition-all placeholder:text-text-secondary/55" />
            </div>
          </label>
          <label className="space-y-1.5">
            <span className="text-[11px] font-semibold text-text-secondary">보낸 사람</span>
            <div className="relative">
              <span className="material-symbols-rounded absolute left-3.5 top-1/2 -translate-y-1/2 text-text-secondary text-lg">alternate_email</span>
              <input type="text" value={metadataSender} onChange={(event) => onSenderChange(event.target.value)} disabled={!canUseGmail || searching} placeholder="예: name@company.com" className="w-full bg-white border border-surface-variant rounded-full pl-10 pr-4 py-2.5 text-xs text-text-primary focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary disabled:opacity-50 transition-all placeholder:text-text-secondary/55" />
            </div>
          </label>
        </div>

        <div className="rounded-2xl border border-surface-variant bg-white px-3 py-2">
          <div className="flex items-center justify-between gap-2">
            <div className="min-w-0">
              <span className="text-[11px] font-semibold text-text-secondary">태그/라벨</span>
              <p className="mt-0.5 truncate text-[11px] text-text-primary">
                {selectedLabelNames.length > 0 ? selectedLabelNames.join(", ") : "선택된 라벨 없음"}
              </p>
            </div>
            <button type="button" onClick={() => setLabelPickerOpen(true)} disabled={!canUseGmail || searching} className="shrink-0 rounded-full border border-surface-variant bg-surface px-3 py-1.5 text-[11px] font-semibold text-text-primary hover:border-primary/30 hover:bg-primary-container/25 disabled:opacity-50">
              라벨 선택
            </button>
          </div>
        </div>

        <div className="space-y-2">
          <span className="text-[11px] font-semibold text-text-secondary">기간</span>
          <div className="flex flex-wrap gap-2">
            {metadataPeriodOptions.map((option) => (
              <button key={option.value} type="button" onClick={() => onPeriodChange(option.value)} disabled={!canUseGmail || searching} className={`rounded-full border px-3 py-1.5 text-[11px] font-semibold transition-all ${metadataPeriod === option.value ? "border-primary/20 bg-primary-container text-primary" : "border-surface-variant bg-white text-text-secondary hover:border-primary/30 hover:bg-primary-container/25"} disabled:opacity-50`}>
                {option.label}
              </button>
            ))}
          </div>
        </div>

        <label className="flex items-center gap-2 rounded-2xl border border-surface-variant bg-white px-3 py-2 text-[11px] font-semibold text-text-primary">
          <input type="checkbox" checked={metadataHasAttachment} onChange={(event) => onHasAttachmentChange(event.target.checked)} disabled={!canUseGmail || searching} className="h-4 w-4 accent-primary" />
          첨부파일 있는 메일만
        </label>

        <div className="grid grid-cols-[110px_1fr] gap-2">
          <input type="number" min="1" max="200" value={maxEmails} onChange={(event) => onMaxEmailsChange(event.target.value)} disabled={!canUseGmail || searching} aria-label="최대 검색 메일 수" className="bg-white border border-surface-variant rounded-full px-3 py-2 text-xs text-text-primary focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary disabled:opacity-50" />
          <button type="submit" disabled={!canUseGmail || searching} className="bg-primary hover:bg-primary/90 disabled:bg-white disabled:text-text-secondary/40 text-white text-xs font-semibold px-5 py-2 rounded-full transition-all cursor-pointer disabled:cursor-default flex items-center justify-center gap-1.5">
            <span className={`material-symbols-rounded text-sm ${searching ? "animate-spin" : ""}`}>{searching ? "sync" : "travel_explore"}</span>
            <span>{searching ? "검색 중..." : "메타데이터 검색"}</span>
          </button>
        </div>
      </form>

      <div className="rounded-2xl border border-surface-variant bg-white p-2.5 text-[11px] text-text-secondary">
        <div className="flex items-center justify-between gap-3">
          <span>검색 결과 <strong className="text-text-primary">{gmailItems.length}</strong>개</span>
          <span>선택 <strong className="text-primary">{selectedIds.length}</strong>개</span>
        </div>
        <div className="mt-1.5 h-2 rounded-full bg-surface overflow-hidden">
          <div className="h-full bg-primary transition-all" style={{ width: selectedIds.length === 0 ? "0%" : `${Math.round((vectorizedSelectedCount / selectedIds.length) * 100)}%` }} />
        </div>
        <p className="mt-1.5 leading-relaxed">오른쪽 목록에서 필요한 메일만 선택해 벡터화하세요.</p>
      </div>

      <button type="button" onClick={onVectorize} disabled={!canUseGmail || selectedIds.length === 0 || vectorizing} className="bg-primary hover:bg-primary/90 disabled:bg-white disabled:text-text-secondary/40 text-white font-semibold py-2.5 px-5 rounded-full text-xs transition-all cursor-pointer disabled:cursor-default flex items-center justify-center gap-1.5">
        <span className={`material-symbols-rounded text-sm ${vectorizing ? "animate-spin" : ""}`}>{vectorizing ? "sync" : "conversion_path"}</span>
        <span>{vectorizing ? "벡터화 중..." : `선택 ${selectedIds.length}개 벡터화`}</span>
      </button>
    </section>
    {labelPickerOpen && (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/30 p-6">
        <div className="flex max-h-[80vh] w-full max-w-2xl flex-col rounded-2xl border border-surface-variant bg-white p-5 shadow-xl">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h3 className="flex items-center gap-2 text-sm font-semibold text-text-primary">
                <span className="material-symbols-rounded text-primary text-base">label</span>
                Gmail 라벨 선택
              </h3>
              <p className="mt-1 text-xs leading-relaxed text-text-secondary">
                많은 라벨은 이 선택 화면에서만 펼쳐 보고, 기본 검색 화면은 조밀하게 유지합니다.
              </p>
            </div>
            <button type="button" onClick={() => setLabelPickerOpen(false)} className="rounded-full p-1 text-text-secondary hover:bg-surface hover:text-text-primary">
              <span className="material-symbols-rounded text-lg">close</span>
            </button>
          </div>

          <div className="mt-4 flex gap-2">
            <input type="text" value={labelSearch} onChange={(event) => onLabelSearchChange(event.target.value)} disabled={!canUseGmail || searching || gmailLabels.length === 0} placeholder="라벨 이름 검색" className="min-w-0 flex-1 rounded-full border border-surface-variant bg-surface px-4 py-2 text-xs text-text-primary transition-all placeholder:text-text-secondary/55 focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary disabled:opacity-50" />
            <button type="button" onClick={onLoadGmailLabels} disabled={!canUseGmail || searching || gmailLabelsLoading} className="rounded-full border border-surface-variant bg-white px-4 py-2 text-xs font-semibold text-text-primary hover:border-primary/30 hover:bg-primary-container/25 disabled:opacity-50">
              {gmailLabelsLoading ? "불러오는 중" : "라벨 불러오기"}
            </button>
          </div>

          <div className="mt-4 min-h-0 overflow-y-auto rounded-2xl border border-surface-variant bg-surface p-3">
            <div className="flex flex-wrap gap-2">
              {!isGwsAuthenticated ? (
                <p className="text-xs text-text-secondary">Google Workspace 인증이 필요합니다.</p>
              ) : gmailLabelsLoading ? (
                <p className="text-xs text-text-secondary">라벨을 불러오는 중입니다.</p>
              ) : gmailLabels.length === 0 ? (
                <p className="text-xs text-text-secondary">라벨 불러오기를 눌러 선택할 태그를 가져오세요.</p>
              ) : filteredLabels.length === 0 ? (
                <p className="text-xs text-text-secondary">일치하는 라벨이 없습니다.</p>
              ) : (
                filteredLabels.map((label) => {
                  const selected = selectedLabelIds.includes(label.id);
                  return (
                    <button key={label.id} type="button" onClick={() => onToggleLabel(label.id)} disabled={!canUseGmail || searching} className={`rounded-full border px-3 py-1.5 text-[11px] font-semibold transition-all ${selected ? "border-primary/25 bg-primary-container text-primary" : "border-surface-variant bg-white text-text-secondary hover:border-primary/30 hover:bg-primary-container/25 hover:text-text-primary"} disabled:opacity-50`}>
                      {selected ? "✓ " : ""}{label.name}
                    </button>
                  );
                })
              )}
            </div>
          </div>

          <div className="mt-4 flex items-center justify-between gap-3">
            <p className="text-xs text-text-secondary">선택 {selectedLabelIds.length}개</p>
            <button type="button" onClick={() => setLabelPickerOpen(false)} className="rounded-full bg-primary px-5 py-2 text-xs font-semibold text-white hover:bg-primary/90">
              적용하고 닫기
            </button>
          </div>
        </div>
      </div>
    )}
    </>
  );
}
