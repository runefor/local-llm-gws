import React, { useState, useMemo } from "react";
import { useApp, WorkspaceItem } from "../context/AppContext";

interface MultiViewWorkspaceProps {
  isDesktop?: boolean;
}

export default function MultiViewWorkspace({ isDesktop = false }: MultiViewWorkspaceProps) {
  const {
    workspaceItems,
    syncStatus,
    handleGmailSync,
    handleDriveSync,
    backendStatus,
    isGwsAuthenticated
  } = useApp();

  const [query, setQuery] = useState("");
  const [viewMode, setViewMode] = useState<"list" | "timeline">("list");
  const [expandedItemId, setExpandedItemId] = useState<string | null>(null);

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (backendStatus !== "online" || !isGwsAuthenticated) return;
    
    // Gmail과 Drive 동시 동기화 실행
    await Promise.all([
      handleGmailSync(query),
      handleDriveSync(query)
    ]);
  };

  // 날짜별로 아이템 그룹화 (Timeline 뷰용)
  const groupedItems = useMemo(() => {
    const groups: { [key: string]: WorkspaceItem[] } = {};
    
    workspaceItems.forEach(item => {
      const date = new Date(item.timestamp);
      // 로컬 날짜 형식으로 그룹화 키 생성 (예: "2026년 6월 16일")
      const dateStr = date.toLocaleDateString("ko-KR", {
        year: "numeric",
        month: "long",
        day: "numeric",
        weekday: "short"
      });
      
      if (!groups[dateStr]) {
        groups[dateStr] = [];
      }
      groups[dateStr].push(item);
    });
    
    return Object.entries(groups).sort((a, b) => {
      // 그룹 날짜 기준 내림차순 정렬 (최신 날짜가 위로)
      const dateA = new Date(a[1][0].timestamp).getTime();
      const dateB = new Date(b[1][0].timestamp).getTime();
      return dateB - dateA;
    });
  }, [workspaceItems]);

  const toggleExpand = (id: string) => {
    setExpandedItemId(prev => (prev === id ? null : id));
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

  return (
    <div className={`bg-white rounded-2xl p-6 border border-[#e1e3e1] shadow-[0_1px_2px_0_rgba(0,0,0,0.05)] space-y-5 flex flex-col ${isDesktop ? "h-full min-h-0 overflow-hidden" : "h-[550px] overflow-hidden"}`}>
      
      {/* 1. 스마트 필터 바 & 제어 영역 */}
      <div className="flex flex-col space-y-3 flex-shrink-0">
        <div className="flex items-center justify-between">
          <h2 className="text-[#1f1f1f] text-base font-semibold flex items-center">
            <span className="material-symbols-rounded mr-2 text-[#0b57d0]">hub</span>
            통합 Workspace 데이터 검색
          </h2>
          
          {/* 뷰 모드 토글 (완전한 알약 형태) */}
          {workspaceItems.length > 0 && (
            <div className="flex bg-[#f8fafd] p-1 rounded-full border border-[#e1e3e1] text-xs">
              <button
                onClick={() => setViewMode("list")}
                className={`px-4 py-1.5 rounded-full font-medium transition-all cursor-pointer flex items-center space-x-1 ${viewMode === "list" ? "bg-[#d3e3fd] text-[#0b57d0] shadow-sm" : "text-[#444746] hover:text-[#1f1f1f]"}`}
              >
                <span className="material-symbols-rounded text-sm">list</span>
                <span>리스트 뷰</span>
              </button>
              <button
                onClick={() => setViewMode("timeline")}
                className={`px-4 py-1.5 rounded-full font-medium transition-all cursor-pointer flex items-center space-x-1 ${viewMode === "timeline" ? "bg-[#d3e3fd] text-[#0b57d0] shadow-sm" : "text-[#444746] hover:text-[#1f1f1f]"}`}
              >
                <span className="material-symbols-rounded text-sm">timeline</span>
                <span>타임라인 뷰</span>
              </button>
            </div>
          )}
        </div>

        <form onSubmit={handleSearch} className="flex flex-col space-y-2">
          <div className="flex space-x-2">
            <div className="relative flex-1">
              <span className="material-symbols-rounded absolute left-3.5 top-1/2 -translate-y-1/2 text-[#444746] text-lg">search</span>
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Gmail 및 Drive 동시 검색 (예: 보고서, from:sender)"
                disabled={backendStatus !== "online" || !isGwsAuthenticated || isSyncing}
                className="w-full bg-[#f8fafd] pl-10 pr-4 py-2.5 rounded-full border border-[#e1e3e1] text-sm text-[#1f1f1f] focus:outline-none focus:border-[#0b57d0] focus:ring-1 focus:ring-[#0b57d0] disabled:opacity-50 transition-all placeholder:text-[#444746]/60"
              />
            </div>
            
            {/* 검색 및 동기화 버튼 (완전한 알약 형태) */}
            <button
              type="submit"
              disabled={backendStatus !== "online" || !isGwsAuthenticated || isSyncing}
              className="px-6 py-2.5 bg-[#0b57d0] hover:bg-[#0b57d0]/90 text-white rounded-full text-sm font-medium transition-all disabled:opacity-50 flex items-center space-x-1 cursor-pointer flex-shrink-0"
            >
              {isSyncing ? (
                <>
                  <svg className="animate-spin h-4 w-4 text-white" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                  </svg>
                  <span>동기화 중...</span>
                </>
              ) : (
                <>
                  <span className="material-symbols-rounded text-sm">sync</span>
                  <span>동기화 및 검색</span>
                </>
              )}
            </button>
          </div>
          
          {/* 검색 팁 문구 */}
          <div className="flex items-center space-x-1.5 text-[11px] text-[#444746] px-3">
            <span className="material-symbols-rounded text-[14px] text-[#0b57d0]">info</span>
            <span>
              검색어가 없을 경우 <strong>기본 1주일</strong> 기간 필터가 적용됩니다. 
              (팁: Gmail은 <code className="bg-[#f8fafd] px-1 py-0.5 rounded border border-[#e1e3e1]">newer_than:30d</code>, Drive는 <code className="bg-[#f8fafd] px-1 py-0.5 rounded border border-[#e1e3e1]">modifiedTime &gt; '2026-06-01'</code> 등으로 기간을 직접 지정할 수 있습니다.)
            </span>
          </div>
        </form>
      </div>

      {/* 2. 데이터 컨텐츠 렌더링 영역 */}
      <div className="flex-1 pr-1 -mr-1 overflow-y-auto scrollbar-none hover:scrollbar-thin scrollbar-thumb-[#e1e3e1] scrollbar-track-transparent">
        
        {workspaceItems.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center space-y-2">
            <span className="material-symbols-rounded text-4xl text-[#444746]/40">folder_open</span>
            <p className="text-sm text-[#444746] font-medium">동기화된 지식 데이터가 없습니다.</p>
            <p className="text-xs text-[#444746]/70">위 검색 창을 통해 데이터를 동기화하고 조회해보세요.</p>
          </div>
        ) : viewMode === "list" ? (
          
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
                    <span className="material-symbols-rounded text-[#444746] text-lg select-none">
                      {isExpanded ? "expand_less" : "expand_more"}
                    </span>
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
        ) : (
          
          /* 타임라인 뷰 */
          <div className="relative pl-6 border-l-2 border-[#e1e3e1] ml-4 mr-2 py-2 space-y-6 pb-6">
            {groupedItems.map(([dateGroup, items]) => (
              <div key={dateGroup} className="space-y-4">
                {/* 날짜 그룹 헤더 */}
                <div className="relative -ml-6 flex items-center">
                  <div className="bg-[#0b57d0] w-3.5 h-3.5 rounded-full ring-4 ring-white" />
                  <div className="ml-4 bg-[#d3e3fd] text-[#0b57d0] px-3 py-1 rounded-full text-xs font-semibold shadow-sm">
                    {dateGroup}
                  </div>
                </div>

                {/* 해당 날짜의 아이템 목록 */}
                <div className="space-y-3 ml-2">
                  {items.map((item) => {
                    const isGmail = item.type === "gmail";
                    const isExpanded = expandedItemId === item.id;
                    
                    return (
                      <div
                        key={item.id}
                        onClick={() => toggleExpand(item.id)}
                        className="bg-[#f8fafd] hover:bg-[#d3e3fd]/20 p-4 rounded-2xl border border-[#e1e3e1] hover:border-[#0b57d0]/30 transition-all shadow-[0_1px_2px_0_rgba(0,0,0,0.02)] cursor-pointer relative"
                      >
                        {/* 타임라인 연결 작은 커넥터 점 */}
                        <div className="absolute top-1/2 -left-[27px] w-2.5 h-2.5 rounded-full bg-[#e1e3e1] border-2 border-white -translate-y-1/2" />
                        
                        <div className="flex flex-col space-y-1.5">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center space-x-1.5 text-xs text-[#444746]/80 font-mono">
                              <span className="material-symbols-rounded text-xs text-[#0b57d0]">schedule</span>
                              <span>{formatTime(item.timestamp)}</span>
                              <span>•</span>
                              <span className={`px-2 py-0.2 rounded-full text-[9px] font-bold ${isGmail ? "bg-[#fee2e2] text-[#ef4444]" : "bg-[#dcfce7] text-[#22c55e]"}`}>
                                {isGmail ? "Gmail" : "Drive"}
                              </span>
                            </div>
                            
                            <span className="material-symbols-rounded text-[#444746] text-lg select-none">
                              {isExpanded ? "expand_less" : "expand_more"}
                            </span>
                          </div>

                          <h4 className="text-sm font-semibold text-[#1f1f1f] line-clamp-1">
                            {item.title}
                          </h4>
                          
                          <p className="text-xs text-[#444746] line-clamp-1">
                            {isGmail ? `보낸사람: ${item.subtitle}` : `유형: ${getMimeTypeLabel(item.subtitle)}`}
                          </p>

                          {/* 메일 본문 요약 확장 */}
                          {isGmail && item.snippet && isExpanded && (
                            <p className="text-xs text-[#444746] leading-relaxed bg-white p-3 rounded-xl border border-[#e1e3e1] mt-2">
                              {item.snippet}
                            </p>
                          )}

                          {/* 파일 상세 정보 확장 */}
                          {!isGmail && isExpanded && (
                            <div className="text-xs text-[#444746] bg-white p-3 rounded-xl border border-[#e1e3e1] space-y-1 font-mono mt-2">
                              <div><span className="font-semibold">파일명:</span> {item.title}</div>
                              <div><span className="font-semibold">파일유형:</span> {getMimeTypeLabel(item.subtitle)}</div>
                              <div><span className="font-semibold">파일 ID:</span> {item.id}</div>
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
