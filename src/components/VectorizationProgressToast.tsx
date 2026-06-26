import { useApp } from "../context/AppContext";

export function VectorizationProgressToast() {
  const { vectorizationProgress } = useApp();

  if (vectorizationProgress.status !== "running") {
    return null;
  }

  return (
    <aside className="absolute bottom-6 right-6 z-20 w-80 rounded-2xl border border-primary/15 bg-white p-4 shadow-[0_8px_24px_rgba(11,87,208,0.12)]">
      <div className="flex items-start gap-3">
        <span className="material-symbols-rounded mt-0.5 animate-spin text-primary">sync</span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-3">
            <p className="truncate text-xs font-bold text-text-primary">{vectorizationProgress.label}</p>
            <span className="text-[11px] font-bold text-primary">{Math.round(vectorizationProgress.progress)}%</span>
          </div>
          <div className="mt-2 h-2 overflow-hidden rounded-full bg-surface">
            <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${vectorizationProgress.progress}%` }} />
          </div>
          <p className="mt-2 text-[11px] leading-relaxed text-text-secondary">
            탭을 이동해도 이 작업은 백그라운드에서 계속 실행됩니다.
          </p>
        </div>
      </div>
    </aside>
  );
}
