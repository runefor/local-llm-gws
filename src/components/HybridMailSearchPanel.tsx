import { useState } from "react";
import type { FormEvent } from "react";
import type { GmailItem, GmailLabel } from "../context/AppContext";
import { metadataExampleChips, metadataPeriodOptions } from "./hybridMailHelpers";
import type { MetadataPeriod } from "./hybridMailHelpers";
import type { SavedSearchCondition } from "./savedSearchConditions";

type HybridMailSearchPanelProps = {
  readonly isDesktop: boolean;
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
  readonly vectorizationProgress: number;
  readonly metadataKeyword: string;
  readonly metadataSender: string;
  readonly metadataPeriod: MetadataPeriod;
  readonly metadataHasAttachment: boolean;
  readonly labelSearch: string;
  readonly maxEmails: string;
  readonly conditionName: string;
  readonly selectedConditionId: string;
  readonly savedConditions: readonly SavedSearchCondition<unknown>[];
  readonly isGwsAuthenticated: boolean;
  readonly onSubmit: (event: FormEvent) => void;
  readonly onToggleAll: () => void;
  readonly onKeywordChange: (value: string) => void;
  readonly onSenderChange: (value: string) => void;
  readonly onPeriodChange: (value: MetadataPeriod) => void;
  readonly onHasAttachmentChange: (value: boolean) => void;
  readonly onLabelSearchChange: (value: string) => void;
  readonly onMaxEmailsChange: (value: string) => void;
  readonly onConditionNameChange: (value: string) => void;
  readonly onSelectedConditionChange: (value: string) => void;
  readonly onSaveCondition: () => void;
  readonly onApplyCondition: () => void;
  readonly onToggleLabel: (labelId: string) => void;
  readonly onLoadGmailLabels: () => void;
  readonly onVectorize: () => void;
};

export function HybridMailSearchPanel({
  isDesktop,
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
  vectorizationProgress,
  metadataKeyword,
  metadataSender,
  metadataPeriod,
  metadataHasAttachment,
  labelSearch,
  maxEmails,
  conditionName,
  selectedConditionId,
  savedConditions,
  isGwsAuthenticated,
  onSubmit,
  onToggleAll,
  onKeywordChange,
  onSenderChange,
  onPeriodChange,
  onHasAttachmentChange,
  onLabelSearchChange,
  onMaxEmailsChange,
  onConditionNameChange,
  onSelectedConditionChange,
  onSaveCondition,
  onApplyCondition,
  onToggleLabel,
  onLoadGmailLabels,
  onVectorize,
}: HybridMailSearchPanelProps) {
  const [quickExamplesExpanded, setQuickExamplesExpanded] = useState(false);
  const [labelPickerOpen, setLabelPickerOpen] = useState(false);
  const selectedLabelNames = gmailLabels
    .filter((label) => selectedLabelIds.includes(label.id))
    .map((label) => label.name);
  const progressValue = vectorizing
    ? vectorizationProgress
    : selectedIds.length === 0
      ? 0
      : Math.round((vectorizedSelectedCount / selectedIds.length) * 100);

  return (
    <>
		    <section className={`bg-surface rounded-2xl border border-surface-variant min-h-0 overflow-hidden ${isDesktop ? "grid grid-cols-1 gap-3 p-3 min-[1140px]:grid-cols-[0.95fr_1.05fr_1fr_0.9fr] min-[1140px]:items-start" : "flex flex-col gap-4 p-4"}`}>
		      <form onSubmit={onSubmit} className="flex shrink-0 flex-col gap-3 min-[1140px]:contents">
		        <div className="flex items-start justify-between gap-3 min-[1140px]:col-span-4">
	          <div className="min-w-0">
	            <h3 className="flex items-center gap-2 text-sm font-semibold text-text-primary">
	              <span className="material-symbols-rounded text-primary text-base">mail</span>
	              Gmail 메타데이터 검색 조건
	            </h3>
		            <p className="mt-1 break-keep text-[11px] leading-5 text-text-secondary [overflow-wrap:normal] [word-break:keep-all] min-[1140px]:hidden">
	              본문 전에 제목, 발신자, 라벨, 기간으로 좁혀 찾습니다.
	            </p>
	          </div>
	          {gmailItems.length > 0 && (
	            <button type="button" onClick={onToggleAll} className="shrink-0 rounded-full border border-surface-variant bg-background px-3 py-1.5 text-[11px] font-semibold text-primary transition-colors hover:bg-primary-container/40 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary">
	              {selectedIds.length === gmailItems.length ? "전체 해제" : "전체 선택"}
	            </button>
	          )}
	        </div>

		        <div className="rounded-2xl border border-surface-variant bg-background p-3 shadow-sm">
	          <div className="flex items-start justify-between gap-3">
	            <div className="min-w-0">
	              <div className="flex items-center gap-2 text-xs font-semibold text-text-primary">
	                <span className="material-symbols-rounded text-base text-primary">search</span>
	                검색어
	              </div>
		              <p className="mt-1 break-keep text-[11px] leading-5 text-text-secondary [overflow-wrap:normal] [word-break:keep-all] min-[1140px]:hidden">키워드, 발신자, 빠른 예시로 조건을 채웁니다.</p>
	            </div>
	            <button
	              type="button"
	              onClick={() => setQuickExamplesExpanded((current) => !current)}
	              className="inline-flex shrink-0 items-center gap-1 rounded-full border border-surface-variant bg-surface px-3 py-1.5 text-[11px] font-semibold text-primary transition-colors hover:bg-primary-container/40 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
	              aria-expanded={quickExamplesExpanded}
	            >
	              예시 {metadataExampleChips.length}개
	              <span className="material-symbols-rounded text-sm">{quickExamplesExpanded ? "expand_less" : "expand_more"}</span>
	            </button>
	          </div>

	          {quickExamplesExpanded && (
	            <div className="mt-3 flex flex-wrap gap-2 rounded-2xl border border-surface-variant bg-surface p-3">
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
	                  className="rounded-full border border-surface-variant bg-background px-3 py-1.5 text-[11px] font-semibold text-text-secondary transition-colors hover:border-primary/30 hover:bg-primary-container/30 hover:text-text-primary disabled:opacity-50"
	                >
	                  {chip.label}
	                </button>
	              ))}
	            </div>
	          )}

		          <div className="mt-3 grid grid-cols-1 gap-2">
	            <label className="space-y-1.5">
	              <span className="text-[11px] font-semibold text-text-secondary">키워드</span>
	              <div className="relative">
	                <span className="material-symbols-rounded absolute left-3.5 top-1/2 -translate-y-1/2 text-text-secondary text-lg">search</span>
		                <input type="text" value={metadataKeyword} onChange={(event) => onKeywordChange(event.target.value)} disabled={!canUseGmail || searching} placeholder="예: 계약서, paper, 지원" className="w-full rounded-full border border-surface-variant bg-surface py-2 pl-10 pr-4 text-xs text-text-primary transition-all placeholder:text-text-secondary/55 focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary disabled:opacity-50" />
	              </div>
	            </label>
	            <label className="space-y-1.5">
	              <span className="text-[11px] font-semibold text-text-secondary">보낸 사람</span>
	              <div className="relative">
	                <span className="material-symbols-rounded absolute left-3.5 top-1/2 -translate-y-1/2 text-text-secondary text-lg">alternate_email</span>
		                <input type="text" value={metadataSender} onChange={(event) => onSenderChange(event.target.value)} disabled={!canUseGmail || searching} placeholder="예: name@company.com" className="w-full rounded-full border border-surface-variant bg-surface py-2 pl-10 pr-4 text-xs text-text-primary transition-all placeholder:text-text-secondary/55 focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary disabled:opacity-50" />
	              </div>
	            </label>
	          </div>
	        </div>

		        <div className="rounded-2xl border border-surface-variant bg-background p-3 shadow-sm">
	          <div className="flex items-start gap-2">
	            <span className="material-symbols-rounded mt-0.5 text-base text-primary">filter_alt</span>
	            <div className="min-w-0">
	              <div className="text-xs font-semibold text-text-primary">필터</div>
		              <p className="mt-1 break-keep text-[11px] leading-5 text-text-secondary [overflow-wrap:normal] [word-break:keep-all] min-[1140px]:hidden">라벨, 기간, 첨부 여부와 검색량을 조정합니다.</p>
	            </div>
	          </div>

		          <div className="mt-3 flex flex-col gap-2 min-[1140px]:mt-2 min-[1140px]:gap-1.5">
		            <div className="rounded-2xl border border-surface-variant bg-surface px-3 py-2 min-[1140px]:py-1.5">
	              <div className="flex items-center justify-between gap-3">
	                <div className="min-w-0">
	                  <span className="text-[11px] font-semibold text-text-secondary">태그/라벨</span>
		                  <p className="mt-0.5 truncate text-[11px] text-text-primary min-[1140px]:hidden">
	                    {selectedLabelNames.length > 0 ? selectedLabelNames.join(", ") : "선택된 라벨 없음"}
	                  </p>
	                </div>
		                <button type="button" onClick={() => setLabelPickerOpen(true)} disabled={!canUseGmail || searching} className="shrink-0 rounded-full border border-surface-variant bg-background px-3 py-1.5 text-[11px] font-semibold text-text-primary transition-colors hover:border-primary/30 hover:bg-primary-container/25 disabled:opacity-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary min-[1140px]:py-1">
	                  라벨 선택
	                </button>
	              </div>
	            </div>

		            <div className="space-y-2 min-[1140px]:space-y-1">
	              <span className="text-[11px] font-semibold text-text-secondary">기간</span>
		              <div className="flex flex-wrap gap-1.5">
	                {metadataPeriodOptions.map((option) => (
		                  <button key={option.value} type="button" onClick={() => onPeriodChange(option.value)} disabled={!canUseGmail || searching} className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold transition-colors min-[1140px]:px-2 min-[1140px]:py-0.5 ${metadataPeriod === option.value ? "border-primary/20 bg-primary-container text-primary" : "border-surface-variant bg-background text-text-secondary hover:border-primary/30 hover:bg-primary-container/25"} disabled:opacity-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary`}>
	                    {option.label}
	                  </button>
	                ))}
	              </div>
	            </div>

		            <label className="flex items-center gap-2 rounded-2xl border border-surface-variant bg-surface px-3 py-2 text-[11px] font-semibold text-text-primary min-[1140px]:py-1.5">
	              <input type="checkbox" checked={metadataHasAttachment} onChange={(event) => onHasAttachmentChange(event.target.checked)} disabled={!canUseGmail || searching} className="h-4 w-4 accent-primary" />
	              첨부파일 있는 메일만
	            </label>

	            <div className="grid grid-cols-[minmax(88px,112px)_minmax(0,1fr)] gap-2">
		              <input type="number" min="1" max="200" value={maxEmails} onChange={(event) => onMaxEmailsChange(event.target.value)} disabled={!canUseGmail || searching} aria-label="최대 검색 메일 수" className="min-w-0 rounded-full border border-surface-variant bg-surface px-3 py-2 text-xs text-text-primary focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary disabled:opacity-50 min-[1140px]:py-1.5" />
		              <button type="submit" disabled={!canUseGmail || searching} className="flex cursor-pointer items-center justify-center gap-1.5 rounded-full bg-primary px-4 py-2 text-xs font-semibold text-white transition-colors hover:bg-primary/90 disabled:cursor-default disabled:bg-background disabled:text-text-secondary/40 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary min-[1140px]:py-1.5">
	                <span className={`material-symbols-rounded text-sm ${searching ? "animate-spin" : ""}`}>{searching ? "sync" : "travel_explore"}</span>
	                <span>{searching ? "검색 중..." : "메타데이터 검색"}</span>
	              </button>
	            </div>
	          </div>
	        </div>

		        <div className="rounded-2xl border border-surface-variant bg-background p-3 shadow-sm">
	          <div className="flex items-start gap-2">
	            <span className="material-symbols-rounded mt-0.5 text-base text-primary">bookmark</span>
	            <div className="min-w-0">
	              <div className="text-xs font-semibold text-text-primary">저장 조건</div>
		              <p className="mt-1 break-keep text-[11px] leading-5 text-text-secondary [overflow-wrap:normal] [word-break:keep-all] min-[1140px]:hidden">자주 쓰는 조건을 저장하고 다시 불러옵니다.</p>
	            </div>
	          </div>

		          <div className="mt-3 grid grid-cols-1 gap-2">
		            <input type="text" value={conditionName} onChange={(event) => onConditionNameChange(event.target.value)} disabled={!canUseGmail || searching} placeholder="조건 이름" className="w-full rounded-full border border-surface-variant bg-surface px-3 py-2 text-xs text-text-primary transition-all placeholder:text-text-secondary/55 focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary disabled:opacity-50" />
	            <div className="grid grid-cols-[minmax(0,1fr)_auto_auto] gap-2">
		              <select value={selectedConditionId} onChange={(event) => onSelectedConditionChange(event.target.value)} disabled={!canUseGmail || searching || savedConditions.length === 0} className="min-w-0 rounded-full border border-surface-variant bg-surface px-3 py-2 text-xs text-text-primary focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary disabled:opacity-50">
	                <option value="">불러올 조건 선택</option>
	                {savedConditions.map((condition) => (
	                  <option key={condition.id} value={condition.id}>{condition.name}</option>
	                ))}
	              </select>
		              <button type="button" onClick={onSaveCondition} disabled={!canUseGmail || searching} className="rounded-full border border-surface-variant bg-surface px-3 py-2 text-[11px] font-semibold text-text-primary transition-colors hover:border-primary/30 hover:bg-primary-container/25 disabled:opacity-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary">
	                저장
	              </button>
		              <button type="button" onClick={onApplyCondition} disabled={!canUseGmail || searching || savedConditions.length === 0} className="rounded-full bg-primary px-3 py-2 text-[11px] font-semibold text-white transition-colors hover:bg-primary/90 disabled:bg-background disabled:text-text-secondary/40 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary">
	                적용
	              </button>
	            </div>
		            <p className="text-[11px] leading-5 text-text-secondary min-[1140px]:hidden">적용은 입력값만 채우고 검색은 실행하지 않습니다.</p>
	          </div>
	        </div>
	      </form>

		      <div className="shrink-0 rounded-2xl border border-surface-variant bg-background p-3 text-[11px] text-text-secondary shadow-sm min-[1140px]:p-2.5">
	        <div className="flex items-start justify-between gap-3">
	          <div className="min-w-0 flex-1">
	            <div className="flex items-center gap-2 text-xs font-semibold text-text-primary">
	              <span className="material-symbols-rounded text-base text-primary">fact_check</span>
	              결과 및 벡터화
	            </div>
		            <div className="mt-3 flex flex-wrap items-center gap-1.5 min-[1140px]:mt-2">
	              <span className="rounded-full border border-surface-variant bg-surface px-3 py-1">검색 결과 <strong className="text-text-primary">{gmailItems.length}</strong>개</span>
	              <span className="rounded-full border border-surface-variant bg-surface px-3 py-1">선택 <strong className="text-primary">{selectedIds.length}</strong>개</span>
	            </div>
		            <div className="mt-3 h-2 rounded-full bg-surface overflow-hidden min-[1140px]:mt-2">
	              <div className="h-full bg-primary transition-all" style={{ width: `${progressValue}%` }} />
	            </div>
	            {vectorizing ? (
	              <p className="mt-2 text-[11px] font-semibold text-primary">백그라운드 벡터화 {progressValue}%</p>
	            ) : (
		            <p className="mt-2 break-keep leading-5 [overflow-wrap:normal] [word-break:keep-all] min-[1140px]:hidden">필요한 메일만 골라 벡터화합니다.</p>
	            )}
	          </div>
	          {isDesktop && (
	            <button type="button" onClick={onVectorize} disabled={!canUseGmail || selectedIds.length === 0 || vectorizing} className="flex shrink-0 cursor-pointer items-center justify-center gap-1 rounded-full bg-primary px-4 py-2 text-[11px] font-semibold text-white transition-colors hover:bg-primary/90 disabled:cursor-default disabled:bg-background disabled:text-text-secondary/40 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary">
	              <span className={`material-symbols-rounded text-sm ${vectorizing ? "animate-spin" : ""}`}>{vectorizing ? "sync" : "conversion_path"}</span>
	              <span>{vectorizing ? "벡터화 중" : `선택 ${selectedIds.length}개`}</span>
	            </button>
	          )}
	        </div>
	        {!isDesktop && <p className="mt-2 leading-relaxed">오른쪽 목록에서 필요한 원본 메일만 선택해 벡터 검색 대상으로 만드세요.</p>}
	      </div>

	      {!isDesktop && (
	        <button type="button" onClick={onVectorize} disabled={!canUseGmail || selectedIds.length === 0 || vectorizing} className="flex cursor-pointer items-center justify-center gap-1.5 rounded-full bg-primary px-5 py-2.5 text-xs font-semibold text-white transition-colors hover:bg-primary/90 disabled:cursor-default disabled:bg-background disabled:text-text-secondary/40 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary">
	          <span className={`material-symbols-rounded text-sm ${vectorizing ? "animate-spin" : ""}`}>{vectorizing ? "sync" : "conversion_path"}</span>
	          <span>{vectorizing ? "벡터화 중..." : `선택 ${selectedIds.length}개 벡터화`}</span>
	        </button>
	      )}
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
