import { useApp } from "../context/AppContext";

export default function SyncPanel() {
  const { 
    syncStatus, 
    syncProgress, 
    backendStatus, 
    handleGmailSync, 
    handleDriveSync 
  } = useApp();

  return (
    <div className="bg-surface rounded-2xl p-6 border border-surface-variant/80 shadow-[0_1px_2px_0_rgba(0,0,0,0.05)] relative overflow-hidden">
      <h2 className="text-base font-semibold mb-3 flex items-center text-text-primary">
        <span className="material-symbols-rounded mr-2 text-primary">sync</span>
        Google Workspace 지식 동기화
      </h2>
      <p className="text-xs text-text-secondary mb-6 leading-relaxed">
        Google Workspace의 이메일 및 문서 데이터를 정교하게 파싱하여 로컬 마크다운 파일로 추출합니다. 
        모든 처리는 로컬 백엔드(FastAPI)에서 안전하게 이루어집니다.
      </p>

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
            <h3 className="font-semibold text-text-primary mb-1">Gmail 요약 데이터 추출</h3>
            <p className="text-xs text-text-secondary leading-relaxed mb-4">
              최근 이메일 목록을 읽고 본문을 로컬에 저장합니다. (속도 제한기 30~40msg/s 반영)
            </p>
          </div>
          <button 
            onClick={handleGmailSync}
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
            <h3 className="font-semibold text-text-primary mb-1">Google Drive 문서 추출</h3>
            <p className="text-xs text-text-secondary leading-relaxed mb-4">
              Docs, Sheets, PDF 파일만 골라 마크다운 포맷으로 변환 및 동기화합니다.
            </p>
          </div>
          <button 
            onClick={handleDriveSync}
            disabled={syncStatus === "syncing" || backendStatus !== "online"}
            className="w-full bg-primary hover:bg-[#094cb3] disabled:bg-surface-variant disabled:text-text-secondary/50 text-on-primary font-medium py-2.5 px-4 rounded-full text-xs transition-all active:scale-95 cursor-pointer disabled:cursor-default"
          >
            {syncStatus === "syncing" ? "동기화 중..." : "Drive 동기화 실행"}
          </button>
        </div>
      </div>

      {/* 진행 표시줄 */}
      {syncStatus === "syncing" && (
        <div className="mt-5 space-y-2">
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
