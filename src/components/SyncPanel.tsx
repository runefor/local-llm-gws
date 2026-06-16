import { useState } from "react";
import { useApp } from "../context/AppContext";

export default function SyncPanel() {
  const { 
    syncStatus, 
    syncProgress, 
    backendStatus, 
    handleGmailSync, 
    handleDriveSync 
  } = useApp();

  const [keyword, setKeyword] = useState("");
  const [period, setPeriod] = useState<"1w" | "1m" | "3m" | "all">("1w");

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
    handleGmailSync(query, period === "all" ? 500 : null);
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
              설정 조건의 Docs, Sheets, PDF 파일을 마크다운 포맷으로 저장합니다.
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

      {/* 3. 진행 표시줄 */}
      {syncStatus === "syncing" && (
        <div className="space-y-2">
          <div className="flex justify-between text-xs text-text-secondary">
            <span className="font-medium">동기화 진척도</span>
            <span className="font-bold text-primary">{syncProgress}%</span>
          </div>
          <div className="w-full bg-surface-variant h-2 rounded-full overflow-hidden">
            <div 
              className="bg-primary h-full rounded-full transition-all duration-300"
              style={{ width: `${syncProgress}%` }}
            ></div>
          </div>
        </div>
      )}


    </div>
  );
}
