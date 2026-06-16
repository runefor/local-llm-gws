import { useMemo, useState } from "react";
import { useApp } from "../context/AppContext";

export default function SyncPanel() {
  const { 
    syncStatus, 
    backendStatus,
    gmailLabels,
    gmailLabelsLoading,
    loadGmailLabels,
    isGwsAuthenticated,
    handleGmailSync, 
    handleDriveSync 
  } = useApp();

  const [keyword, setKeyword] = useState("");
  const [period, setPeriod] = useState<"1w" | "1m" | "3m" | "all">("1w");
  const [selectedLabelIds, setSelectedLabelIds] = useState<string[]>([]);
  const [labelSearch, setLabelSearch] = useState("");

  const controlsDisabled = syncStatus === "syncing" || backendStatus !== "online";
  const labelControlsDisabled = controlsDisabled || !isGwsAuthenticated;
  const filteredGmailLabels = useMemo(() => {
    const searchTerm = labelSearch.trim().toLowerCase();
    if (!searchTerm) return gmailLabels;
    return gmailLabels.filter((label) => label.name.toLowerCase().includes(searchTerm));
  }, [gmailLabels, labelSearch]);

  const toggleLabel = (labelId: string) => {
    setSelectedLabelIds((prev) => (
      prev.includes(labelId)
        ? prev.filter((id) => id !== labelId)
        : [...prev, labelId]
    ));
  };

  // 플랫폼별 쿼리 조립 로직
  const assembleQuery = (target: "gmail" | "drive") => {
    let q = keyword.trim();
    if (target === "gmail") {
      if (period !== "all") {
        let days = 7;
        if (period === "1m") days = 30;
        else if (period === "3m") days = 90;
        
        const targetDate = new Date();
        targetDate.setDate(targetDate.getDate() - days);
        const yyyy = targetDate.getFullYear();
        const mm = String(targetDate.getMonth() + 1).padStart(2, '0');
        const dd = String(targetDate.getDate()).padStart(2, '0');
        const dateQuery = `after:${yyyy}/${mm}/${dd}`;
        
        q += (q ? " " : "") + dateQuery;
      }
    } else { // drive
      if (period !== "all") {
        let days = 7;
        if (period === "1m") days = 30;
        else if (period === "3m") days = 90;
        const targetDate = new Date();
        targetDate.setDate(targetDate.getDate() - days);
        const isoDate = targetDate.toISOString();
        const dateQuery = `modifiedTime > '${isoDate}'`;
        
        if (q) {
          q = `${dateQuery} and (name contains '${q}' or fullText contains '${q}')`;
        } else {
          q = dateQuery;
        }
      } else {
        if (q) {
          q = `name contains '${q}' or fullText contains '${q}'`;
        }
      }
    }
    return q;
  };

  const onGmailSync = () => {
    const query = assembleQuery("gmail");
    handleGmailSync(query, period === "all" ? 500 : null, selectedLabelIds);
  };

  const onDriveSync = () => {
    const query = assembleQuery("drive");
    handleDriveSync(query);
  };

  // 1w, 1m, 3m, all 레이블 한글 매핑
  const periodLabels = {
    "1w": "최근 1주일",
    "1m": "최근 1개월",
    "3m": "최근 3개월",
    "all": "전체 기간"
  };

  return (
    <div className="bg-surface rounded-2xl p-6 border border-surface-variant/80 shadow-[0_1px_2px_0_rgba(0,0,0,0.05)] relative overflow-hidden space-y-6">
      <div>
        <h2 className="text-base font-semibold mb-1 flex items-center text-text-primary">
          <span className="material-symbols-rounded mr-2 text-primary">sync</span>
          Google Workspace 지식 동기화
        </h2>
        <p className="text-xs text-text-secondary leading-relaxed">
          필터(기간, 검색어)를 적용해 원하는 조건의 메일 및 문서를 로컬 마크다운 파일로 추출 및 동기화합니다.
        </p>
      </div>

      {/* 1. 동기화 세부 옵션 설정 */}
      <div className="bg-white p-5 rounded-2xl border border-surface-variant space-y-4 shadow-[0_1px_2px_0_rgba(0,0,0,0.02)]">
        <h3 className="text-xs font-bold text-text-primary flex items-center">
          <span className="material-symbols-rounded text-sm mr-1.5 text-primary font-bold">tune</span>
          동기화 조건 필터 설정
        </h3>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* 기간 필터 칩 버튼 */}
          <div className="space-y-2">
            <span className="text-[11px] font-semibold text-text-secondary block">동기화 기간</span>
            <div className="flex flex-wrap gap-2">
              {(["1w", "1m", "3m", "all"] as const).map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => setPeriod(p)}
                  disabled={syncStatus === "syncing"}
                  className={`px-3 py-1.5 rounded-full text-xs font-semibold cursor-pointer transition-all border ${
                    period === p
                      ? "bg-primary-container text-primary border-primary/20 shadow-sm"
                      : "bg-[#f8fafd] text-text-secondary border-surface-variant/80 hover:bg-[#e9eef6]/50 hover:text-text-primary"
                  } disabled:opacity-50`}
                >
                  {periodLabels[p]}
                </button>
              ))}
            </div>
          </div>

          {/* 검색어 필터 입력 */}
          <div className="space-y-2">
            <label htmlFor="sync-keyword" className="text-[11px] font-semibold text-text-secondary block">특정 검색어 필터 (선택)</label>
            <div className="relative">
              <span className="material-symbols-rounded absolute left-3 top-1/2 -translate-y-1/2 text-text-secondary text-base">filter_list</span>
              <input
                id="sync-keyword"
                type="text"
                value={keyword}
                onChange={(e) => setKeyword(e.target.value)}
                placeholder="예: 보고서, from:홍길동 (비워둘 시 전체 추출)"
                disabled={syncStatus === "syncing"}
                className="w-full bg-[#f8fafd] pl-9 pr-4 py-2 rounded-full border border-surface-variant/80 text-xs text-text-primary focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary disabled:opacity-50 transition-all placeholder:text-text-secondary/50"
              />
            </div>
          </div>
        </div>

        <div className="space-y-3 border-t border-surface-variant/70 pt-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <span className="text-[11px] font-semibold text-text-secondary block">Gmail 라벨 필터 (선택)</span>
              <p className="text-[10px] text-text-secondary/70 mt-0.5">
                선택하지 않으면 기존처럼 기간과 검색어만 적용합니다.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-semibold text-primary bg-primary-container/60 border border-primary/10 rounded-full px-2.5 py-1">
                {selectedLabelIds.length > 0 ? `${selectedLabelIds.length}개 선택` : "전체 라벨"}
              </span>
              <button
                type="button"
                onClick={loadGmailLabels}
                disabled={labelControlsDisabled || gmailLabelsLoading}
                className="flex items-center gap-1 rounded-full border border-surface-variant bg-white px-3 py-1.5 text-[11px] font-semibold text-text-primary transition-all hover:border-primary/30 hover:bg-primary-container/20 disabled:cursor-default disabled:opacity-50"
              >
                <span className={`material-symbols-rounded text-sm ${gmailLabelsLoading ? "animate-spin" : ""}`}>refresh</span>
                {gmailLabelsLoading ? "불러오는 중" : "라벨 새로고침"}
              </button>
            </div>
          </div>

          <div className="relative">
            <span className="material-symbols-rounded absolute left-3 top-1/2 -translate-y-1/2 text-text-secondary text-base">sell</span>
            <input
              type="text"
              value={labelSearch}
              onChange={(e) => setLabelSearch(e.target.value)}
              placeholder="라벨 이름 검색"
              disabled={labelControlsDisabled || gmailLabelsLoading || gmailLabels.length === 0}
              className="w-full bg-surface pl-9 pr-4 py-2 rounded-full border border-surface-variant/80 text-xs text-text-primary focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary disabled:opacity-50 transition-all placeholder:text-text-secondary/50"
            />
          </div>

          <div className="max-h-28 overflow-y-auto pr-1 scrollbar-none hover:scrollbar-thin scrollbar-thumb-surface-variant scrollbar-track-transparent">
            {!isGwsAuthenticated ? (
              <div className="rounded-2xl border border-surface-variant/80 bg-surface px-4 py-3 text-[11px] text-text-secondary">
                Google Workspace 인증 후 Gmail 라벨을 불러올 수 있습니다.
              </div>
            ) : gmailLabelsLoading ? (
              <div className="rounded-2xl border border-surface-variant/80 bg-surface px-4 py-3 text-[11px] text-text-secondary animate-pulse">
                Gmail 라벨 목록을 불러오는 중입니다.
              </div>
            ) : gmailLabels.length === 0 ? (
              <div className="rounded-2xl border border-surface-variant/80 bg-surface px-4 py-3 text-[11px] text-text-secondary">
                가져온 라벨이 없습니다. 라벨 새로고침을 눌러 다시 시도하세요.
              </div>
            ) : filteredGmailLabels.length === 0 ? (
              <div className="rounded-2xl border border-surface-variant/80 bg-surface px-4 py-3 text-[11px] text-text-secondary">
                검색어와 일치하는 라벨이 없습니다.
              </div>
            ) : (
              <div className="flex flex-wrap gap-2">
                {filteredGmailLabels.map((label) => {
                  const selected = selectedLabelIds.includes(label.id);
                  const totalCount = typeof label.messagesTotal === "number" ? label.messagesTotal : null;
                  const unreadCount = typeof label.messagesUnread === "number" ? label.messagesUnread : null;
                  return (
                    <label
                      key={label.id}
                      className={`flex cursor-pointer items-center gap-2 rounded-full border px-3 py-1.5 text-[11px] font-semibold transition-all ${selected ? "border-primary/30 bg-primary-container/70 text-primary shadow-sm" : "border-surface-variant/80 bg-surface text-text-secondary hover:border-primary/20 hover:text-text-primary"} ${labelControlsDisabled ? "cursor-default opacity-50" : ""}`}
                    >
                      <input
                        type="checkbox"
                        checked={selected}
                        onChange={() => toggleLabel(label.id)}
                        disabled={labelControlsDisabled}
                        className="sr-only"
                      />
                      <span className="material-symbols-rounded text-sm">
                        {selected ? "check_circle" : label.type === "system" ? "label_important" : "label"}
                      </span>
                      <span>{label.name}</span>
                      {(totalCount !== null || unreadCount !== null) && (
                        <span className="rounded-full bg-white/80 border border-surface-variant/70 px-1.5 py-0.5 text-[10px] text-text-secondary">
                          {totalCount !== null ? totalCount : 0}{unreadCount !== null ? ` / 안읽음 ${unreadCount}` : ""}
                        </span>
                      )}
                    </label>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* 2. 동기화 실행 영역 */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Gmail Sync Card */}
        <div className="bg-white p-5 rounded-2xl border border-surface-variant hover:border-primary/20 transition-all flex flex-col justify-between group shadow-[0_1px_2px_0_rgba(0,0,0,0.02)]">
          <div>
            <div className="flex items-center justify-between mb-3">
              <span className="p-2 rounded-xl bg-primary-container text-primary flex items-center justify-center w-9 h-9">
                <span className="material-symbols-rounded text-primary">mail</span>
              </span>
              <span className="text-[10px] uppercase font-semibold text-text-secondary bg-surface px-2.5 py-0.5 rounded-full border border-surface-variant/60">API Quota: Free</span>
            </div>
            <h4 className="font-semibold text-text-primary mb-1 text-xs">Gmail 요약 데이터 추출</h4>
            <p className="text-[11px] text-text-secondary leading-relaxed mb-4">
              설정 조건의 이메일을 읽고 본문을 로컬 지식베이스에 저장합니다.
            </p>
          </div>
          <button 
            type="button"
            onClick={onGmailSync}
            disabled={syncStatus === "syncing" || backendStatus !== "online"}
            className="w-full bg-primary hover:bg-[#094cb3] disabled:bg-surface-variant disabled:text-text-secondary/50 text-on-primary font-medium py-2.5 px-4 rounded-full text-xs transition-all active:scale-95 cursor-pointer disabled:cursor-default"
          >
            {syncStatus === "syncing" ? "동기화 중..." : "Gmail 동기화 실행"}
          </button>
        </div>

        {/* Google Drive Sync Card */}
        <div className="bg-white p-5 rounded-2xl border border-surface-variant hover:border-primary/20 transition-all flex flex-col justify-between group shadow-[0_1px_2px_0_rgba(0,0,0,0.02)]">
          <div>
            <div className="flex items-center justify-between mb-3">
              <span className="p-2 rounded-xl bg-primary-container text-primary flex items-center justify-center w-9 h-9">
                <span className="material-symbols-rounded text-primary">folder_shared</span>
              </span>
              <span className="text-[10px] uppercase font-semibold text-text-secondary bg-surface px-2.5 py-0.5 rounded-full border border-surface-variant/60">Markdownify</span>
            </div>
            <h4 className="font-semibold text-text-primary mb-1 text-xs">Google Drive 문서 추출</h4>
            <p className="text-[11px] text-text-secondary leading-relaxed mb-4">
              설정 조건의 Docs, Sheets, 텍스트 파일을 마크다운 포맷으로 저장합니다.
            </p>
          </div>
          <button 
            type="button"
            onClick={onDriveSync}
            disabled={syncStatus === "syncing" || backendStatus !== "online"}
            className="w-full bg-primary hover:bg-[#094cb3] disabled:bg-surface-variant disabled:text-text-secondary/50 text-on-primary font-medium py-2.5 px-4 rounded-full text-xs transition-all active:scale-95 cursor-pointer disabled:cursor-default"
          >
            {syncStatus === "syncing" ? "동기화 중..." : "Drive 동기화 실행"}
          </button>
        </div>
      </div>

      {/* 3. 진행 표시 */}
      {syncStatus === "syncing" && (
        <div className="space-y-2">
          <div className="flex justify-between text-xs text-text-secondary">
            <span className="font-medium">동기화 진행 상황</span>
            <span className="font-bold text-primary">처리 중</span>
          </div>
          <div className="w-full bg-surface-variant h-2 rounded-full overflow-hidden">
            <div 
              className="bg-primary h-full w-full rounded-full animate-pulse"
            ></div>
          </div>
          <p className="text-[11px] text-text-secondary leading-relaxed">
            Gmail/Drive API 호출과 로컬 RAG 인덱싱은 단계별 진행률을 아직 제공하지 않아 완료 전까지 처리 중 상태로 표시합니다.
          </p>
        </div>
      )}


    </div>
  );
}
