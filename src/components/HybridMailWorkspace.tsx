import { useEffect, useMemo, useState } from "react";
import type { FormEvent } from "react";
import { useApp } from "../context/AppContext";
import type { GmailItem } from "../context/AppContext";

interface HybridMailWorkspaceProps {
  isDesktop?: boolean;
}

type Notice = {
  type: "success" | "error" | "info";
  text: string;
};

const DEFAULT_INSTRUCTION = "선택한 이메일을 근거로 핵심 결정사항, 해야 할 일, 참고 링크를 포함한 Obsidian용 Markdown 노트로 정리해 주세요.";

function getMessageId(item: GmailItem) {
  return item.messageId || item.id;
}

function formatMailDate(date?: string) {
  if (!date) return "날짜 없음";
  const parsedDate = new Date(date);
  if (Number.isNaN(parsedDate.getTime())) return date;
  return parsedDate.toLocaleString("ko-KR", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function parseTags(value: string) {
  return value
    .split(",")
    .map((tag) => tag.trim())
    .filter(Boolean);
}

export default function HybridMailWorkspace({ isDesktop = false }: HybridMailWorkspaceProps) {
  const {
    backendStatus,
    isGwsAuthenticated,
    gmailItems,
    syncStatus,
    searchGmailMetadata,
    vectorizeGmailMessages,
    processGmailMessages,
    obsidianVaultPath,
    exportToObsidian,
  } = useApp();

  const [query, setQuery] = useState("newer_than:30d");
  const [maxEmails, setMaxEmails] = useState("25");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [vectorizedIds, setVectorizedIds] = useState<string[]>([]);
  const [instruction, setInstruction] = useState(DEFAULT_INSTRUCTION);
  const [markdown, setMarkdown] = useState("");
  const [exportTitle, setExportTitle] = useState("Gmail Hybrid Brief");
  const [tags, setTags] = useState("gmail, hybrid-workspace");
  const [searching, setSearching] = useState(false);
  const [vectorizing, setVectorizing] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [notice, setNotice] = useState<Notice | null>(null);

  const messageIdSet = useMemo(() => new Set(gmailItems.map(getMessageId)), [gmailItems]);
  const selectedItems = useMemo(
    () => gmailItems.filter((item) => selectedIds.includes(getMessageId(item))),
    [gmailItems, selectedIds],
  );
  const vectorizedSelectedCount = selectedIds.filter((id) => vectorizedIds.includes(id)).length;
  const allSelectedVectorized = selectedIds.length > 0 && vectorizedSelectedCount === selectedIds.length;
  const isBusy = searching || vectorizing || generating || exporting || syncStatus === "syncing";
  const canUseGmail = backendStatus === "online" && isGwsAuthenticated;
  const hasMarkdown = markdown.trim().length > 0;
  const selectedPreview = selectedItems.slice(0, 4);

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
    setMarkdown("");
  };

  const toggleAll = () => {
    if (selectedIds.length === gmailItems.length) {
      setSelectedIds([]);
      setMarkdown("");
      return;
    }
    setSelectedIds(gmailItems.map(getMessageId));
    setMarkdown("");
  };

  const handleSearch = async (event: FormEvent) => {
    event.preventDefault();
    if (!canUseGmail) return;

    setSearching(true);
    setNotice(null);
    setSelectedIds([]);
    setVectorizedIds([]);
    setMarkdown("");
    try {
      const parsedMaxEmails = Number.parseInt(maxEmails, 10);
      await searchGmailMetadata(query.trim() || undefined, Number.isNaN(parsedMaxEmails) ? 25 : parsedMaxEmails);
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
    setMarkdown("");
    const result = await vectorizeGmailMessages(selectedIds);
    setVectorizing(false);

    if (result.status === "success") {
      setVectorizedIds((prev) => Array.from(new Set([...prev, ...selectedIds])));
      showNotice("success", result.message || `${result.indexed ?? selectedIds.length}개의 선택 메일이 벡터화되었습니다.`);
      return;
    }

    showNotice("error", result.message || "선택 메일 벡터화에 실패했습니다.");
  };

  const handleGenerate = async () => {
    if (!canUseGmail || !allSelectedVectorized || !instruction.trim()) return;

    setGenerating(true);
    setNotice(null);
    const result = await processGmailMessages(selectedIds, instruction.trim());
    setGenerating(false);

    if (result.status === "success") {
      const generatedMarkdown = result.markdown || result.answer || "";
      setMarkdown(generatedMarkdown);
      if (!exportTitle.trim() && selectedItems[0]?.subject) {
        setExportTitle(selectedItems[0].subject);
      }
      showNotice("success", "선택한 벡터 근거에서 Markdown 초안이 생성되었습니다.");
      return;
    }

    showNotice("error", result.message || "Markdown 생성에 실패했습니다.");
  };

  const handleExport = async () => {
    if (!hasMarkdown || !exportTitle.trim() || !obsidianVaultPath) return;

    setExporting(true);
    setNotice(null);
    const result = await exportToObsidian(exportTitle.trim(), markdown, parseTags(tags));
    setExporting(false);

    if (result.status === "success") {
      showNotice("success", result.filename ? `Obsidian에 저장되었습니다: ${result.filename}` : "Obsidian 내보내기가 완료되었습니다.");
      return;
    }

    showNotice("error", result.message || "Obsidian 내보내기에 실패했습니다.");
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
            Gmail Hybrid Workspace
          </h2>
          <p className="text-xs text-text-secondary leading-relaxed">
            메타데이터로 빠르게 찾고, 선택한 메일만 벡터화한 뒤 Markdown 노트로 내보냅니다.
          </p>
        </div>
        <div className="flex flex-wrap gap-2 text-[10px] font-bold">
          <span className={`px-3 py-1 rounded-full border ${backendStatus === "online" ? "bg-emerald-50 border-emerald-100 text-emerald-700" : "bg-rose-50 border-rose-100 text-rose-700"}`}>
            Backend {backendStatus}
          </span>
          <span className={`px-3 py-1 rounded-full border ${isGwsAuthenticated ? "bg-primary-container/60 border-primary-container text-primary" : "bg-surface border-surface-variant text-text-secondary"}`}>
            Google {isGwsAuthenticated ? "connected" : "login needed"}
          </span>
          <span className="px-3 py-1 rounded-full bg-surface border border-surface-variant text-text-secondary">
            선택 {selectedIds.length}개
          </span>
        </div>
      </div>

      {notice && (
        <div className={`mx-6 mt-5 flex items-start gap-2 rounded-xl border p-3 text-xs font-medium ${noticeClassName}`}>
          <span className="material-symbols-rounded text-base mt-0.5">
            {notice.type === "success" ? "check_circle" : notice.type === "error" ? "error" : "info"}
          </span>
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

      <div className={`grid grid-cols-1 min-[1140px]:grid-cols-[minmax(340px,0.92fr)_minmax(420px,1.08fr)] gap-5 p-6 ${isDesktop ? "flex-1 min-h-0 overflow-hidden" : ""}`}>
        <section className={`bg-surface rounded-2xl border border-surface-variant p-4 flex flex-col gap-4 ${isDesktop ? "min-h-0 overflow-hidden" : ""}`}>
          <form onSubmit={handleSearch} className="flex flex-col gap-3">
            <div className="flex items-center justify-between gap-3">
              <h3 className="text-xs font-bold text-text-primary flex items-center gap-1.5">
                <span className="material-symbols-rounded text-primary text-sm">mail</span>
                Gmail 메타데이터 검색
              </h3>
              {gmailItems.length > 0 && (
                <button
                  type="button"
                  onClick={toggleAll}
                  className="text-[10px] bg-white hover:bg-primary-container/35 border border-surface-variant text-primary px-3 py-1.5 rounded-full font-bold transition-all"
                >
                  {selectedIds.length === gmailItems.length ? "전체 해제" : "전체 선택"}
                </button>
              )}
            </div>

            <div className="relative">
              <span className="material-symbols-rounded absolute left-3.5 top-1/2 -translate-y-1/2 text-text-secondary text-lg">search</span>
              <input
                type="text"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                disabled={!canUseGmail || searching}
                placeholder="예: newer_than:14d from:partner has:attachment"
                className="w-full bg-white border border-surface-variant rounded-full pl-10 pr-4 py-2.5 text-xs text-text-primary focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary disabled:opacity-50 transition-all placeholder:text-text-secondary/55"
              />
            </div>

            <div className="grid grid-cols-[110px_1fr] gap-2">
              <input
                type="number"
                min="1"
                max="200"
                value={maxEmails}
                onChange={(event) => setMaxEmails(event.target.value)}
                disabled={!canUseGmail || searching}
                aria-label="최대 검색 메일 수"
                className="bg-white border border-surface-variant rounded-full px-3 py-2 text-xs text-text-primary focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary disabled:opacity-50"
              />
              <button
                type="submit"
                disabled={!canUseGmail || searching}
                className="bg-primary hover:bg-primary/90 disabled:bg-white disabled:text-text-secondary/40 text-white text-xs font-semibold px-5 py-2 rounded-full transition-all cursor-pointer disabled:cursor-default flex items-center justify-center gap-1.5"
              >
                <span className={`material-symbols-rounded text-sm ${searching ? "animate-spin" : ""}`}>{searching ? "sync" : "travel_explore"}</span>
                <span>{searching ? "검색 중..." : "메타데이터 검색"}</span>
              </button>
            </div>
          </form>

          <div className="flex items-center justify-between bg-white border border-surface-variant rounded-xl px-3 py-2 text-[11px] text-text-secondary">
            <span>검색 결과 <strong className="text-text-primary">{gmailItems.length}</strong>개</span>
            <span>벡터화됨 <strong className="text-primary">{vectorizedSelectedCount}</strong>/{selectedIds.length}</span>
          </div>

          <div className={`flex-1 pr-1 -mr-1 ${isDesktop ? "min-h-0 overflow-y-auto" : "max-h-[520px] overflow-y-auto"}`}>
            {searching ? (
              <div className="h-full min-h-[240px] flex flex-col items-center justify-center text-center gap-2 text-text-secondary">
                <span className="material-symbols-rounded text-4xl text-primary animate-spin">sync</span>
                <p className="text-xs font-semibold">Gmail 메타데이터를 가져오는 중입니다.</p>
              </div>
            ) : gmailItems.length === 0 ? (
              <div className="h-full min-h-[240px] flex flex-col items-center justify-center text-center gap-2 text-text-secondary">
                <span className="material-symbols-rounded text-4xl text-text-secondary/35">inbox</span>
                <p className="text-xs font-semibold">아직 검색된 Gmail 메타데이터가 없습니다.</p>
                <p className="text-[11px] leading-relaxed max-w-[300px]">검색어 없이 실행하면 최근 메일을 가져오고, Gmail 검색 연산자로 범위를 좁힐 수 있습니다.</p>
              </div>
            ) : (
              <div className="space-y-3 pb-2">
                {gmailItems.map((item) => {
                  const messageId = getMessageId(item);
                  const selected = selectedIds.includes(messageId);
                  const vectorized = vectorizedIds.includes(messageId);
                  return (
                    <article
                      key={messageId}
                      className={`bg-white border rounded-2xl p-3.5 transition-all ${selected ? "border-primary/40 shadow-[0_8px_24px_rgba(11,87,208,0.08)]" : "border-surface-variant hover:border-primary/25"}`}
                    >
                      <div className="flex gap-3">
                        <label className="pt-0.5 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={selected}
                            onChange={() => toggleSelection(messageId)}
                            disabled={isBusy && !selected}
                            className="h-4 w-4 rounded border-surface-variant accent-primary cursor-pointer disabled:cursor-default disabled:opacity-50"
                            aria-label={`${item.subject || "제목 없는 메일"} 선택`}
                          />
                        </label>
                        <div className="flex-1 min-w-0 flex flex-col gap-2">
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <h4 className="text-xs font-bold text-text-primary leading-relaxed truncate">{item.subject || "(제목 없음)"}</h4>
                              <p className="text-[11px] text-text-secondary truncate mt-0.5">{item.from || "발신자 없음"}</p>
                            </div>
                            <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold border flex-shrink-0 ${vectorized ? "bg-primary-container/60 border-primary-container text-primary" : "bg-surface border-surface-variant text-text-secondary"}`}>
                              {vectorized ? "vector" : formatMailDate(item.date)}
                            </span>
                          </div>
                          <p className="text-[11px] text-text-secondary leading-relaxed line-clamp-2">{item.snippet || "미리보기 본문이 없습니다."}</p>
                          {(item.threadId || item.labelIds?.length) && (
                            <div className="flex flex-wrap gap-1.5 text-[10px] text-text-secondary">
                              {item.threadId && <span className="bg-surface border border-surface-variant px-2 py-0.5 rounded-full">thread {item.threadId}</span>}
                              {item.labelIds?.slice(0, 3).map((labelId) => (
                                <span key={labelId} className="bg-surface border border-surface-variant px-2 py-0.5 rounded-full">{labelId}</span>
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

          <button
            type="button"
            onClick={handleVectorize}
            disabled={!canUseGmail || selectedIds.length === 0 || vectorizing}
            className="bg-primary hover:bg-primary/90 disabled:bg-white disabled:text-text-secondary/40 text-white font-semibold py-2.5 px-5 rounded-full text-xs transition-all cursor-pointer disabled:cursor-default flex items-center justify-center gap-1.5"
          >
            <span className={`material-symbols-rounded text-sm ${vectorizing ? "animate-spin" : ""}`}>{vectorizing ? "sync" : "conversion_path"}</span>
            <span>{vectorizing ? "벡터화 중..." : `선택 ${selectedIds.length}개 벡터화`}</span>
          </button>
        </section>

        <section className={`bg-surface rounded-2xl border border-surface-variant p-4 flex flex-col gap-4 ${isDesktop ? "min-h-0 overflow-hidden" : ""}`}>
          <div className="grid grid-cols-1 lg:grid-cols-[1fr_220px] gap-3">
            <div className="bg-white border border-surface-variant rounded-2xl p-4 flex flex-col gap-2">
              <h3 className="text-xs font-bold text-text-primary flex items-center gap-1.5">
                <span className="material-symbols-rounded text-primary text-sm">summarize</span>
                선택 컨텍스트
              </h3>
              {selectedPreview.length === 0 ? (
                <p className="text-[11px] text-text-secondary leading-relaxed">왼쪽에서 Markdown으로 정리할 Gmail 메타데이터를 선택하세요.</p>
              ) : (
                <div className="space-y-2">
                  {selectedPreview.map((item) => (
                    <div key={getMessageId(item)} className="text-[11px] text-text-secondary border-b border-surface-variant/60 pb-2 last:border-b-0 last:pb-0">
                      <p className="font-bold text-text-primary truncate">{item.subject || "(제목 없음)"}</p>
                      <p className="truncate">{item.from || "발신자 없음"}</p>
                    </div>
                  ))}
                  {selectedItems.length > selectedPreview.length && (
                    <p className="text-[10px] text-primary font-bold">+{selectedItems.length - selectedPreview.length}개 더 선택됨</p>
                  )}
                </div>
              )}
            </div>

            <div className="bg-white border border-surface-variant rounded-2xl p-4 flex flex-col justify-between gap-3">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-wide text-text-secondary">워크플로우 게이트</p>
                <p className="text-xs text-text-primary font-semibold mt-1">{allSelectedVectorized ? "Markdown 생성 가능" : "벡터화가 먼저 필요"}</p>
              </div>
              <div className="h-2 rounded-full bg-surface overflow-hidden">
                <div
                  className="h-full bg-primary transition-all"
                  style={{ width: selectedIds.length === 0 ? "0%" : `${Math.round((vectorizedSelectedCount / selectedIds.length) * 100)}%` }}
                />
              </div>
              <p className="text-[10px] text-text-secondary leading-relaxed">선택 메일을 바꾸면 새 선택 집합도 명시적으로 벡터화해야 합니다.</p>
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <label htmlFor="gmail-hybrid-instruction" className="text-[11px] font-bold text-text-secondary flex items-center gap-1.5">
              <span className="material-symbols-rounded text-sm text-primary">edit_note</span>
              Markdown 생성 지시문
            </label>
            <textarea
              id="gmail-hybrid-instruction"
              value={instruction}
              onChange={(event) => {
                setInstruction(event.target.value);
                setMarkdown("");
              }}
              rows={4}
              className="w-full bg-white border border-surface-variant rounded-xl p-3 text-xs text-text-primary leading-relaxed focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-all resize-y"
              placeholder="선택한 이메일을 어떤 형식으로 정리할지 입력하세요."
            />
          </div>

          <button
            type="button"
            onClick={handleGenerate}
            disabled={!canUseGmail || !allSelectedVectorized || !instruction.trim() || generating}
            className="bg-primary hover:bg-primary/90 disabled:bg-white disabled:text-text-secondary/40 text-white font-semibold py-2.5 px-5 rounded-full text-xs transition-all cursor-pointer disabled:cursor-default flex items-center justify-center gap-1.5"
          >
            <span className={`material-symbols-rounded text-sm ${generating ? "animate-spin" : ""}`}>{generating ? "sync" : "auto_awesome"}</span>
            <span>{generating ? "생성 중..." : "Markdown 생성"}</span>
          </button>

          <div className={`grid grid-cols-1 lg:grid-cols-2 gap-3 ${isDesktop ? "flex-1 min-h-0" : ""}`}>
            <div className="flex flex-col gap-1.5 min-h-0">
              <label htmlFor="gmail-hybrid-markdown" className="text-[11px] font-bold text-text-secondary flex items-center gap-1.5">
                <span className="material-symbols-rounded text-sm text-primary">subject</span>
                Markdown 편집
              </label>
              <textarea
                id="gmail-hybrid-markdown"
                value={markdown}
                onChange={(event) => setMarkdown(event.target.value)}
                rows={isDesktop ? 14 : 10}
                className={`w-full bg-white border border-surface-variant rounded-xl p-4 text-xs text-text-primary leading-relaxed focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-all font-mono resize-y ${isDesktop ? "flex-1 min-h-0" : ""}`}
                placeholder="생성된 Markdown이 여기에 표시됩니다. 필요한 경우 바로 수정할 수 있습니다."
              />
            </div>

            <div className="flex flex-col gap-1.5 min-h-0">
              <span className="text-[11px] font-bold text-text-secondary flex items-center gap-1.5">
                <span className="material-symbols-rounded text-sm text-primary">preview</span>
                Markdown 미리보기
              </span>
              <div className={`bg-white border border-surface-variant rounded-xl p-4 text-xs text-text-primary leading-relaxed whitespace-pre-wrap overflow-y-auto ${isDesktop ? "flex-1 min-h-0" : "min-h-[240px]"}`}>
                {markdown.trim() ? markdown : (
                  <span className="text-text-secondary">벡터화된 메일에서 생성한 Markdown 미리보기가 표시됩니다.</span>
                )}
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-[1fr_240px] gap-3 pt-1">
            <div className="flex flex-col gap-1.5">
              <label htmlFor="gmail-hybrid-export-title" className="text-[11px] font-bold text-text-secondary flex items-center gap-1.5">
                <span className="material-symbols-rounded text-sm text-primary">title</span>
                Obsidian 제목
              </label>
              <input
                id="gmail-hybrid-export-title"
                type="text"
                value={exportTitle}
                onChange={(event) => setExportTitle(event.target.value)}
                className="w-full bg-white border border-surface-variant rounded-xl px-4 py-2.5 text-xs text-text-primary font-semibold focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-all"
                placeholder="내보낼 노트 제목"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <label htmlFor="gmail-hybrid-tags" className="text-[11px] font-bold text-text-secondary flex items-center gap-1.5">
                <span className="material-symbols-rounded text-sm text-primary">local_offer</span>
                태그
              </label>
              <input
                id="gmail-hybrid-tags"
                type="text"
                value={tags}
                onChange={(event) => setTags(event.target.value)}
                className="w-full bg-white border border-surface-variant rounded-xl px-4 py-2.5 text-xs text-text-secondary focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-all"
                placeholder="gmail, follow-up"
              />
            </div>
          </div>

          {!obsidianVaultPath && (
            <div className="bg-white border border-surface-variant rounded-xl p-3 text-[11px] text-text-secondary flex items-start gap-2">
              <span className="material-symbols-rounded text-primary text-sm mt-0.5">folder_off</span>
              <span>Obsidian Vault 경로가 설정되어야 내보내기를 사용할 수 있습니다. 기존 설정 패널에서 Vault 경로를 저장하세요.</span>
            </div>
          )}

          <button
            type="button"
            onClick={handleExport}
            disabled={!hasMarkdown || !exportTitle.trim() || !obsidianVaultPath || exporting}
            className="bg-emerald-600 hover:bg-emerald-700 disabled:bg-white disabled:text-text-secondary/40 text-white font-semibold py-2.5 px-5 rounded-full text-xs transition-all cursor-pointer disabled:cursor-default flex items-center justify-center gap-1.5"
          >
            <span className={`material-symbols-rounded text-sm ${exporting ? "animate-spin" : ""}`}>{exporting ? "sync" : "send_and_archive"}</span>
            <span>{exporting ? "내보내는 중..." : "Obsidian으로 내보내기"}</span>
          </button>
        </section>
      </div>
    </div>
  );
}
