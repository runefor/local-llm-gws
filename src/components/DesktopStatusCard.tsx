import { useApp } from "../context/AppContext";

export function DesktopStatusCard() {
  const { backendStatus, backendStartupError, checkBackend, authChecking, isGwsAuthenticated, triggerGoogleLogin, checkGwsAuth, syncLog } = useApp();
  const backendStatusLabel = backendStatus === "online" ? "실행 중" : backendStatus === "connecting" ? "확인 중" : "중지됨";
  const backendStatusClass = backendStatus === "online" ? "bg-emerald-500" : backendStatus === "connecting" ? "bg-amber-500" : "bg-rose-500";
  const googleStatusLabel = authChecking ? "확인 중" : isGwsAuthenticated ? "연결됨" : "로그인 필요";
  const googleStatusClass = authChecking ? "bg-amber-500" : isGwsAuthenticated ? "bg-emerald-500" : "bg-rose-500";

  const saveDiagnosticLog = () => {
    const content = [
      `GWS 로컬 지식함 진단 로그`,
      `저장 시각: ${new Date().toLocaleString()}`,
      `백엔드: ${backendStatusLabel}`,
      `Google: ${googleStatusLabel}`,
      `최근 앱 로그 수: ${syncLog.length}`,
      "",
      "개인정보 보호를 위해 Gmail/Drive 원문, 검색어, 최근 앱 로그 본문은 이 파일에 포함하지 않습니다.",
      "오류 제보 시 문제가 발생한 메뉴 단계와 재현 순서를 함께 알려주세요.",
    ].join("\n");
    const url = URL.createObjectURL(new Blob([content], { type: "text/plain;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = `gws-diagnostic-${new Date().toISOString().replace(/[:.]/g, "-")}.txt`;
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="mt-3 flex-shrink-0 rounded-2xl bg-background border border-surface-variant/70 p-2 lg:p-3 space-y-3 shadow-sm">
      <div className="flex items-center justify-between">
        <div className="hidden lg:block">
          <p className="text-xs font-semibold text-text-primary">앱 상태</p>
          <p className="text-[10px] text-text-secondary">문제가 있으면 다시 확인하세요</p>
        </div>
        <button
          type="button"
          onClick={() => {
            void checkBackend();
            void checkGwsAuth();
          }}
          className="mx-auto h-8 w-8 rounded-full text-primary hover:bg-primary-container/50 transition-colors flex items-center justify-center cursor-pointer focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary lg:mx-0"
          title="전체 상태 다시 확인"
        >
          <span className="material-symbols-rounded text-base">refresh</span>
        </button>
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-center lg:justify-between text-[11px]">
          <span className="hidden font-medium text-text-secondary lg:inline">백엔드</span>
          <span className="font-semibold text-text-primary flex items-center">
            <span className={`w-2 h-2 rounded-full ${backendStatusClass} mr-1.5`}></span>
            <span className="hidden lg:inline">{backendStatusLabel}</span>
          </span>
        </div>
        <div className="flex items-center justify-center lg:justify-between text-[11px]">
          <span className="hidden font-medium text-text-secondary lg:inline">Google</span>
          <span className="font-semibold text-text-primary flex items-center">
            <span className={`w-2 h-2 rounded-full ${googleStatusClass} mr-1.5`}></span>
            <span className="hidden lg:inline">{googleStatusLabel}</span>
          </span>
        </div>
      </div>

      {!isGwsAuthenticated && !authChecking && (
        <button
          type="button"
          onClick={triggerGoogleLogin}
          className="hidden w-full rounded-full bg-primary px-3 py-2 text-xs font-semibold text-white hover:bg-primary/95 active:scale-[0.98] transition-all cursor-pointer focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary lg:block"
        >
          Google Workspace 연결하기
        </button>
      )}

      <button
        type="button"
        onClick={saveDiagnosticLog}
        className="hidden w-full rounded-full border border-surface-variant bg-white px-3 py-2 text-xs font-semibold text-primary hover:bg-primary-container/35 active:scale-[0.98] transition-all cursor-pointer focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary lg:block"
      >
        진단 로그 저장
      </button>

      {backendStatus === "offline" && (
        <div className="hidden rounded-2xl bg-primary-container/30 px-3 py-2 text-[10px] leading-4 text-text-secondary lg:block">
          {backendStartupError ?? "백엔드가 꺼져 있으면 원본 조회와 벡터 검색이 제한됩니다."}
          <button
            type="button"
            onClick={checkBackend}
            className="ml-1 font-semibold text-primary hover:text-primary/80 transition-colors cursor-pointer focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary rounded-full"
          >
            다시 확인
          </button>
        </div>
      )}
    </div>
  );
}
