import { useEffect, useState } from "react";
import { AppProvider } from "./context/AppContext";
import { isTauri } from "./utils/env";
import DesktopLayout from "./layouts/DesktopLayout";

export default function App() {
  return (
    <AppProvider>
      <AppContent />
    </AppProvider>
  );
}

function AppContent() {
  const [appReady, setAppReady] = useState(false);

  useEffect(() => {
    // 앱이 활성화되자마자 즉시 숨겨져 있던 창을 띄워 로딩 화면이 노출되게 합니다.
    if (isTauri()) {
      import("@tauri-apps/api/window")
        .then(async ({ getCurrentWindow }) => {
          const win = getCurrentWindow();
          await win.show();
          await win.setFocus();
        })
        .catch((e) => console.error("Tauri window show failed", e));
    }

    // 1초 동안 어두운 톤의 웰컴 로더 화면을 스무스하게 보여준 뒤 대시보드로 진입합니다.
    const timer = setTimeout(() => {
      setAppReady(true);
    }, 1000);

    return () => clearTimeout(timer);
  }, []);

  if (!appReady) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-slate-950 text-slate-100 font-sans select-none">
        <div className="flex flex-col items-center space-y-5 animate-pulse">
          {/* 프리미엄 로더 애니메이션 */}
          <div className="relative w-14 h-14">
            <div className="absolute inset-0 rounded-full border-4 border-slate-800"></div>
            <div className="absolute inset-0 rounded-full border-4 border-primary border-t-transparent animate-spin"></div>
          </div>
          <div className="text-center">
            <h1 className="text-base font-bold tracking-tight text-white mb-1.5">Local LLM GWS Integrator</h1>
            <p className="text-[11px] text-slate-400">시스템 환경을 안전하게 불러오고 있습니다...</p>
          </div>
        </div>
      </div>
    );
  }

  return <DesktopLayout />;
}
