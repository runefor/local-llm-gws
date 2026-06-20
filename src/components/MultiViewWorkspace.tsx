import React, { useState } from "react";
import { useApp, WorkspaceItem } from "../context/AppContext";
import { OriginalDetailModal, OriginalErrorToast } from "./OriginalDetailModal";
import { OriginalOpenButton } from "./OriginalOpenButton";
import { WorkspaceOriginalSearchHeader } from "./WorkspaceOriginalSearchHeader";
import { fetchOriginalDetail, type OriginalDetail } from "./originalDetail";

interface MultiViewWorkspaceProps {
  isDesktop?: boolean;
}

export default function MultiViewWorkspace({ isDesktop = false }: MultiViewWorkspaceProps) {
  const {
    workspaceItems,
    syncStatus,
    searchWorkspaceOriginals,
    backendStatus,
    isGwsAuthenticated
  } = useApp();

  const [query, setQuery] = useState("");
  const [expandedItemId, setExpandedItemId] = useState<string | null>(null);
  const [originalDetail, setOriginalDetail] = useState<OriginalDetail | null>(null);
  const [originalLoadingId, setOriginalLoadingId] = useState<string | null>(null);
  const [originalError, setOriginalError] = useState<string | null>(null);

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (backendStatus !== "online" || !isGwsAuthenticated) return;
    
    // Gmail/Drive 원본 목록을 단일 계약으로 함께 조회합니다.
    await searchWorkspaceOriginals(query);
  };

  const toggleExpand = (id: string) => {
    setExpandedItemId(prev => (prev === id ? null : id));
  };

  const handleOpenOriginal = async (item: WorkspaceItem) => {
    if (backendStatus !== "online" || !isGwsAuthenticated) return;

    setOriginalLoadingId(item.id);
    setOriginalError(null);
    try {
      setOriginalDetail(await fetchOriginalDetail(item));
      setExpandedItemId(item.id);
    } catch (error) {
      setOriginalError(error instanceof Error ? error.message : "네트워크 오류로 원문을 불러오지 못했습니다.");
    } finally {
      setOriginalLoadingId(null);
    }
  };

  const getMimeTypeLabel = (mimeType: string) => {
    if (mimeType.includes("document")) return "Google Docs";
    if (mimeType.includes("spreadsheet")) return "Google Sheets";
    if (mimeType.includes("pdf")) return "PDF";
    if (mimeType.includes("plain")) return "텍스트 파일";
    return mimeType.split("/").pop() || "파일";
  };

  // 날짜 표시 포맷
  const formatTime = (isoString: string) => {
    const date = new Date(isoString);
    return date.toLocaleTimeString("ko-KR", {
      hour: "2-digit",
      minute: "2-digit"
    });
  };

  const isSyncing = syncStatus === "syncing";
  const controlsDisabled = backendStatus !== "online" || !isGwsAuthenticated || isSyncing;

  return (
    <div className={`bg-white rounded-2xl p-6 border border-[#e1e3e1] shadow-[0_1px_2px_0_rgba(0,0,0,0.05)] space-y-5 flex flex-col ${isDesktop ? "h-full min-h-0 overflow-hidden" : "h-[550px] overflow-hidden"}`}>

      <WorkspaceOriginalSearchHeader
        query={query}
        disabled={controlsDisabled}
        isSyncing={isSyncing}
        onQueryChange={setQuery}
        onSubmit={handleSearch}
      />

      {/* 2. 데이터 컨텐츠 렌더링 영역 */}
      <div className="flex-1 pr-1 -mr-1 overflow-y-auto scrollbar-none hover:scrollbar-thin scrollbar-thumb-[#e1e3e1] scrollbar-track-transparent">
        
        {workspaceItems.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center space-y-2">
            <span className="material-symbols-rounded text-4xl text-[#444746]/40">folder_open</span>
            <p className="text-sm text-[#444746] font-medium">가져온 원본 자료가 없습니다.</p>
            <p className="text-xs text-[#444746]/70">위 검색창으로 GWS의 Gmail/Drive 원본 목록만 가져와 확인하세요. 벡터 검색 대상은 찾기 메뉴에서 따로 준비합니다.</p>
          </div>
        ) : (
          
          /* 리스트 뷰 */
          <div className="space-y-3 pb-4">
            {workspaceItems.map((item) => {
              const isGmail = item.type === "gmail";
              const isExpanded = expandedItemId === item.id;
              
              return (
                <div
                  key={item.id}
                  onClick={() => toggleExpand(item.id)}
                  className="bg-[#f8fafd] hover:bg-[#d3e3fd]/20 p-4 rounded-2xl border border-[#e1e3e1] hover:border-[#0b57d0]/30 transition-all shadow-[0_1px_2px_0_rgba(0,0,0,0.02)] cursor-pointer flex flex-col space-y-2"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-2 overflow-hidden">
                      {/* 타입 배지 */}
                      <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-semibold flex items-center space-x-1 ${isGmail ? "bg-[#fee2e2] text-[#ef4444]" : "bg-[#dcfce7] text-[#22c55e]"}`}>
                        <span className="material-symbols-rounded text-xs">{isGmail ? "mail" : "description"}</span>
                        <span>{isGmail ? "Gmail" : "Drive"}</span>
                      </span>
                      <span className="text-xs text-[#444746] truncate max-w-[200px] font-medium">
                        {item.subtitle}
                      </span>
                    </div>
                    
                    {/* 날짜 표시 */}
                    <div className="text-[11px] text-[#444746]/80 font-mono">
                      {new Date(item.timestamp).toLocaleDateString()} {formatTime(item.timestamp)}
                    </div>
                  </div>

                  <div className="flex justify-between items-start space-x-2">
                    <h4 className="text-sm font-semibold text-[#1f1f1f] line-clamp-1 flex-1">
                      {item.title}
                    </h4>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <OriginalOpenButton isLoading={originalLoadingId === item.id} onClick={() => void handleOpenOriginal(item)} />
                      <span className="material-symbols-rounded text-[#444746] text-lg select-none">
                        {isExpanded ? "expand_less" : "expand_more"}
                      </span>
                    </div>
                  </div>

                  {/* 이메일 본문 요약 (확장식) */}
                  {isGmail && item.snippet && (
                    <p className={`text-xs text-[#444746] leading-relaxed transition-all ${isExpanded ? "" : "line-clamp-2"}`}>
                      {item.snippet}
                    </p>
                  )}

                  {/* Google Drive 상세 (확장식) */}
                  {!isGmail && isExpanded && (
                    <div className="text-xs text-[#444746] bg-white p-3 rounded-xl border border-[#e1e3e1] space-y-1 font-mono">
                      <div><span className="font-semibold">유형:</span> {getMimeTypeLabel(item.subtitle)}</div>
                      <div><span className="font-semibold">ID:</span> {item.id}</div>
                      <div><span className="font-semibold">수정 시간:</span> {new Date(item.timestamp).toLocaleString()}</div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {originalError && (
        <OriginalErrorToast message={originalError} onClose={() => setOriginalError(null)} />
      )}

      {originalDetail && (
        <OriginalDetailModal detail={originalDetail} onClose={() => setOriginalDetail(null)} />
      )}
    </div>
  );
}
