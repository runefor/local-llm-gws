import { useEffect, useState } from "react";
import { isTauri } from "../utils/env";

export default function Titlebar() {
  const [appWindow, setAppWindow] = useState<any>(null);

  useEffect(() => {
    if (isTauri()) {
      // 웹 컴파일 오류 및 런타임 방지를 위해 Tauri window API 동적 로드
      import("@tauri-apps/api/window").then((mod) => {
        setAppWindow(mod.getCurrentWindow());
      });
    }
  }, []);

  const handleMinimize = async () => {
    if (appWindow) {
      await appWindow.minimize();
    }
  };

  const handleMaximize = async () => {
    if (appWindow) {
      const isMax = await appWindow.isMaximized();
      if (isMax) {
        await appWindow.unmaximize();
      } else {
        await appWindow.maximize();
      }
    }
  };

  const handleClose = async () => {
    if (appWindow) {
      await appWindow.close();
    }
  };

  if (!isTauri()) return null;

  return (
    <div 
      data-tauri-drag-region 
      className="h-[38px] bg-surface border-b border-surface-variant/70 flex items-center justify-between px-4 select-none relative"
      style={{ userSelect: "none" }}
    >
      {/* 맥 스타일 신호등 버튼 */}
      <div className="flex items-center space-x-2">
        <button
          onClick={handleClose}
          className="w-3 h-3 rounded-full bg-[#ff5f56] border border-[#e0443e] flex items-center justify-center group cursor-pointer transition-colors hover:bg-[#ff4b40]"
          title="닫기"
        >
          <span className="text-[6px] font-bold text-[#4c0002] opacity-0 group-hover:opacity-100 transition-opacity">✕</span>
        </button>
        <button
          onClick={handleMinimize}
          className="w-3 h-3 rounded-full bg-[#ffbd2e] border border-[#dea123] flex items-center justify-center group cursor-pointer transition-colors hover:bg-[#ffad1f]"
          title="최소화"
        >
          <span className="text-[6px] font-bold text-[#5c3e00] opacity-0 group-hover:opacity-100 transition-opacity">─</span>
        </button>
        <button
          onClick={handleMaximize}
          className="w-3 h-3 rounded-full bg-[#27c93f] border border-[#1aab29] flex items-center justify-center group cursor-pointer transition-colors hover:bg-[#1fbc37]"
          title="최대화"
        >
          <span className="text-[5px] font-bold text-[#024d08] opacity-0 group-hover:opacity-100 transition-opacity">▲</span>
        </button>
      </div>

      {/* 중앙 타이틀 (드래그 지원 영역) */}
      <div data-tauri-drag-region className="absolute left-1/2 transform -translate-x-1/2 text-xs font-semibold text-text-secondary pointer-events-none select-none">
        GWS Knowledge Extractor
      </div>

      {/* 우측 공백 (대칭 유지) */}
      <div className="w-14"></div>
    </div>
  );
}
