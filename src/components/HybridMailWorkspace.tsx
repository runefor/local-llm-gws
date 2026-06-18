import { useEffect, useMemo, useState } from "react";
import type { FormEvent } from "react";
import { useApp } from "../context/AppContext";
import { HybridMailResultsPanel } from "./HybridMailResultsPanel";
import { HybridMailSearchPanel } from "./HybridMailSearchPanel";
import { buildMetadataQuery, getMessageId } from "./hybridMailHelpers";
import type { MetadataPeriod } from "./hybridMailHelpers";

interface HybridMailWorkspaceProps {
  isDesktop?: boolean;
}

type Notice = {
  type: "success" | "error" | "info";
  text: string;
};

export default function HybridMailWorkspace({ isDesktop = false }: HybridMailWorkspaceProps) {
  const {
    backendStatus,
    isGwsAuthenticated,
    gmailLabels,
    gmailLabelsLoading,
    loadGmailLabels,
    gmailItems,
    syncStatus,
    searchGmailMetadata,
    vectorizeGmailMessages,
  } = useApp();

  const [metadataKeyword, setMetadataKeyword] = useState("");
  const [metadataSender, setMetadataSender] = useState("");
  const [metadataPeriod, setMetadataPeriod] = useState<MetadataPeriod>("30d");
  const [metadataHasAttachment, setMetadataHasAttachment] = useState(false);
  const [selectedLabelIds, setSelectedLabelIds] = useState<string[]>([]);
  const [labelSearch, setLabelSearch] = useState("");
  const [maxEmails, setMaxEmails] = useState("25");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [vectorizedIds, setVectorizedIds] = useState<string[]>([]);
  const [searching, setSearching] = useState(false);
  const [vectorizing, setVectorizing] = useState(false);
  const [notice, setNotice] = useState<Notice | null>(null);

  const messageIdSet = useMemo(() => new Set(gmailItems.map(getMessageId)), [gmailItems]);
  const vectorizedSelectedCount = selectedIds.filter((id) => vectorizedIds.includes(id)).length;
  const isBusy = searching || vectorizing || syncStatus === "syncing";
  const canUseGmail = backendStatus === "online" && isGwsAuthenticated;
  const generatedMetadataQuery = buildMetadataQuery({
    keyword: metadataKeyword,
    sender: metadataSender,
    period: metadataPeriod,
    hasAttachment: metadataHasAttachment,
  });
  const filteredLabels = useMemo(() => {
    const searchTerm = labelSearch.trim().toLowerCase();
    if (!searchTerm) return gmailLabels;
    return gmailLabels.filter((label) => label.name.toLowerCase().includes(searchTerm));
  }, [gmailLabels, labelSearch]);
  const labelNameById = useMemo(() => {
    return new Map(gmailLabels.map((label) => [label.id, label.name]));
  }, [gmailLabels]);

  useEffect(() => {
    setSelectedIds((prev) => prev.filter((id) => messageIdSet.has(id)));
    setVectorizedIds((prev) => prev.filter((id) => messageIdSet.has(id)));
  }, [messageIdSet]);

  const showNotice = (type: Notice["type"], text: string) => {
    setNotice({ type, text });
  };

  const toggleSelection = (messageId: string) => {
    setSelectedIds((prev) => {
      if (prev.includes(messageId)) {
        return prev.filter((id) => id !== messageId);
      }
      return [...prev, messageId];
    });
  };

  const toggleAll = () => {
    if (selectedIds.length === gmailItems.length) {
      setSelectedIds([]);
      return;
    }
    setSelectedIds(gmailItems.map(getMessageId));
  };

  const toggleLabel = (labelId: string) => {
    setSelectedLabelIds((prev) => (
      prev.includes(labelId)
        ? prev.filter((id) => id !== labelId)
        : [...prev, labelId]
    ));
  };

  const handleSearch = async (event: FormEvent) => {
    event.preventDefault();
    if (!canUseGmail) return;

    setSearching(true);
    setNotice(null);
    setSelectedIds([]);
    setVectorizedIds([]);
    try {
      const parsedMaxEmails = Number.parseInt(maxEmails, 10);
      await searchGmailMetadata(generatedMetadataQuery || undefined, Number.isNaN(parsedMaxEmails) ? 25 : parsedMaxEmails, selectedLabelIds);
      showNotice("success", "Gmail 메타데이터 검색이 완료되었습니다. 필요한 메일만 선택해 벡터화하세요.");
    } catch (error) {
      showNotice("error", error instanceof Error ? error.message : "Gmail 검색 중 오류가 발생했습니다.");
    } finally {
      setSearching(false);
    }
  };

  const handleVectorize = async () => {
    if (!canUseGmail || selectedIds.length === 0) return;

    setVectorizing(true);
    setNotice(null);
    const result = await vectorizeGmailMessages(selectedIds);
    setVectorizing(false);

    if (result.status === "success") {
      setVectorizedIds((prev) => Array.from(new Set([...prev, ...selectedIds])));
      showNotice("success", result.message || `${result.indexed ?? selectedIds.length}개의 선택 메일이 벡터화되었습니다.`);
      return;
    }

    showNotice("error", result.message || "선택 메일 벡터화에 실패했습니다.");
  };

  const disabledReason = !canUseGmail
    ? backendStatus !== "online"
      ? "백엔드 서버가 온라인이어야 합니다."
      : "Google Workspace 인증이 필요합니다."
    : "";

  const noticeClassName = notice?.type === "success"
    ? "bg-emerald-50 border-emerald-200 text-emerald-700"
    : notice?.type === "error"
      ? "bg-rose-50 border-rose-200 text-rose-700"
      : "bg-primary-container/40 border-primary/20 text-primary";

  return (
    <div className={`bg-white rounded-2xl border border-surface-variant shadow-[0_1px_2px_rgba(0,0,0,0.05)] flex flex-col ${isDesktop ? "h-full min-h-0 overflow-hidden" : "min-h-[680px]"}`}>
      <div className="p-6 border-b border-surface-variant flex items-start justify-between gap-4 flex-wrap">
        <div className="flex flex-col gap-1">
          <h2 className="text-text-primary text-base font-semibold flex items-center">
            <span className="material-symbols-rounded mr-2 text-primary">view_sidebar</span>
            GWS Gmail 원본 검색
          </h2>
          <p className="text-xs text-text-secondary leading-relaxed">
            GWS에서 본문 없이 메일 메타데이터를 먼저 검색하고, 필요한 메일만 선택해 벡터화합니다.
          </p>
        </div>
        <div className="flex flex-wrap gap-2 text-[10px] font-bold">
          <span className={`px-3 py-1 rounded-full border ${backendStatus === "online" ? "bg-emerald-50 border-emerald-100 text-emerald-700" : "bg-rose-50 border-rose-100 text-rose-700"}`}>Backend {backendStatus}</span>
          <span className={`px-3 py-1 rounded-full border ${isGwsAuthenticated ? "bg-primary-container/60 border-primary-container text-primary" : "bg-surface border-surface-variant text-text-secondary"}`}>Google {isGwsAuthenticated ? "connected" : "login needed"}</span>
          <span className="px-3 py-1 rounded-full bg-surface border border-surface-variant text-text-secondary">선택 {selectedIds.length}개</span>
        </div>
      </div>

      {notice && (
        <div className={`mx-6 mt-5 flex items-start gap-2 rounded-xl border p-3 text-xs font-medium ${noticeClassName}`}>
          <span className="material-symbols-rounded text-base mt-0.5">{notice.type === "success" ? "check_circle" : notice.type === "error" ? "error" : "info"}</span>
          <span className="flex-1 leading-relaxed">{notice.text}</span>
          <button type="button" onClick={() => setNotice(null)} className="opacity-70 hover:opacity-100 transition-opacity">
            <span className="material-symbols-rounded text-sm">close</span>
          </button>
        </div>
      )}

      {!canUseGmail && (
        <div className="mx-6 mt-5 bg-surface border border-surface-variant rounded-xl p-3 text-xs text-text-secondary flex items-start gap-2">
          <span className="material-symbols-rounded text-primary text-base mt-0.5">lock</span>
          <span className="leading-relaxed">{disabledReason}</span>
        </div>
      )}

      <div className={`grid grid-cols-1 min-[1140px]:grid-cols-[minmax(320px,0.78fr)_minmax(560px,1.22fr)] gap-5 p-6 ${isDesktop ? "flex-1 min-h-0 overflow-hidden" : ""}`}>
        <HybridMailSearchPanel
          canUseGmail={canUseGmail}
          searching={searching}
          vectorizing={vectorizing}
          gmailLabelsLoading={gmailLabelsLoading}
          gmailLabels={gmailLabels}
          filteredLabels={filteredLabels}
          selectedLabelIds={selectedLabelIds}
          gmailItems={gmailItems}
          selectedIds={selectedIds}
          vectorizedSelectedCount={vectorizedSelectedCount}
          metadataKeyword={metadataKeyword}
          metadataSender={metadataSender}
          metadataPeriod={metadataPeriod}
          metadataHasAttachment={metadataHasAttachment}
          labelSearch={labelSearch}
          maxEmails={maxEmails}
          isGwsAuthenticated={isGwsAuthenticated}
          onSubmit={handleSearch}
          onToggleAll={toggleAll}
          onKeywordChange={setMetadataKeyword}
          onSenderChange={setMetadataSender}
          onPeriodChange={setMetadataPeriod}
          onHasAttachmentChange={setMetadataHasAttachment}
          onLabelSearchChange={setLabelSearch}
          onMaxEmailsChange={setMaxEmails}
          onToggleLabel={toggleLabel}
          onLoadGmailLabels={loadGmailLabels}
          onVectorize={handleVectorize}
        />
        <HybridMailResultsPanel
          isDesktop={isDesktop}
          searching={searching}
          gmailItems={gmailItems}
          selectedIds={selectedIds}
          vectorizedIds={vectorizedIds}
          vectorizedSelectedCount={vectorizedSelectedCount}
          labelNameById={labelNameById}
          isBusy={isBusy}
          onToggleSelection={toggleSelection}
        />
      </div>
    </div>
  );
}
