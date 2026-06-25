import { useApp } from "../context/AppContext";

interface LogConsoleProps {
  isDesktop?: boolean;
}

export default function LogConsole({ isDesktop = false }: LogConsoleProps) {
  const { syncLog, setSyncLog } = useApp();

  return (
    <div className={`bg-[#f0f4f9] p-4 font-mono text-xs text-text-secondary ${isDesktop ? "h-full flex flex-col overflow-hidden rounded-2xl border border-surface-variant/80 shadow-[0_1px_2px_0_rgba(0,0,0,0.05)]" : "border-t border-surface-variant"}`}>
      <div className="flex items-center justify-between mb-2 pb-2 border-b border-surface-variant/80 flex-shrink-0">
        <span className="text-text-primary font-semibold flex items-center">
          <span className="w-1.5 h-1.5 rounded-full bg-primary mr-2"></span>
          동기화 및 API 시스템 로그
        </span>
        <button 
          type="button"
          onClick={() => setSyncLog([])} 
          className="text-[10px] text-text-secondary hover:text-primary transition-colors cursor-pointer"
        >
          로그 비우기
        </button>
      </div>
      <div className={`space-y-1 scrollbar-none hover:scrollbar-thin scrollbar-thumb-surface-variant scrollbar-track-transparent pr-2 flex flex-col-reverse ${isDesktop ? "flex-1 overflow-y-auto" : "h-32 overflow-y-auto"}`}>
        {syncLog.length === 0 ? (
          <span className="text-text-secondary italic">로그가 비어 있습니다. 동기화를 진행하거나 백엔드 서버를 확인하세요.</span>
        ) : (
          syncLog.map((log) => (
            <div key={log} className="text-text-secondary hover:bg-primary-container/20 px-1 py-0.5 rounded transition-colors break-all">
              {log}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
