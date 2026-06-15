import React from "react";
import { useApp } from "../context/AppContext";
import LogConsole from "../components/LogConsole";

export default function WebLayout({ children }: { children: React.ReactNode }) {
  const {
    backendStatus,
    checkBackend,
    authChecking,
    isGwsAuthenticated,
    triggerGoogleLogin,
    checkGwsAuth
  } = useApp();

  return (
    <div className="min-h-screen bg-background text-text-primary flex flex-col selection:bg-primary-container selection:text-primary">
      {/* 웹 탑 내비게이션 바 */}
      <header className="border-b border-surface-variant bg-surface sticky top-0 z-50 px-6 py-3 flex items-center justify-between">
        <div className="flex items-center space-x-3">
          <div className="w-10 h-10 rounded-full bg-primary-container flex items-center justify-center">
            <span className="material-symbols-rounded text-primary text-xl">hub</span>
          </div>
          <div>
            <h1 className="text-base font-semibold tracking-wide text-text-primary">
              GWS Knowledge Extractor
            </h1>
            <p className="text-xs text-text-secondary font-medium">Local LLM & Privacy-First RAG (Web Mode)</p>
          </div>
        </div>

        {/* 연결 상태 표시 */}
        <div className="flex items-center space-x-3">
          {/* 백엔드 상태 */}
          <div className="flex items-center space-x-2 bg-white px-3 py-1.5 rounded-full border border-surface-variant text-xs text-text-secondary">
            <span className="font-medium">Server:</span>
            {backendStatus === "online" && (
              <span className="flex items-center text-emerald-600 font-medium">
                <span className="w-2 h-2 rounded-full bg-emerald-500 mr-1.5"></span>
                Online
              </span>
            )}
            {backendStatus === "connecting" && (
              <span className="flex items-center text-amber-600 font-medium">
                Connecting...
              </span>
            )}
            {backendStatus === "offline" && (
              <span className="flex items-center text-rose-600 font-medium">
                Offline
              </span>
            )}
            <button 
              onClick={checkBackend} 
              className="ml-1 text-primary hover:text-primary/80 transition-colors flex items-center cursor-pointer"
              title="다시 연결 테스트"
            >
              <span className="material-symbols-rounded text-base">refresh</span>
            </button>
          </div>

          {/* GWS 인증 상태 */}
          <div className="flex items-center space-x-2 bg-white px-3 py-1.5 rounded-full border border-surface-variant text-xs text-text-secondary">
            <span className="font-medium">Google:</span>
            {authChecking ? (
              <span className="text-text-secondary">Checking...</span>
            ) : isGwsAuthenticated ? (
              <span className="text-emerald-600 font-medium flex items-center">
                <span className="w-2 h-2 rounded-full bg-emerald-500 mr-1.5"></span>
                Connected
              </span>
            ) : (
              <button 
                onClick={triggerGoogleLogin}
                className="bg-primary text-on-primary hover:bg-[#094cb3] px-2.5 py-0.5 rounded-full font-medium transition-colors cursor-pointer text-[11px]"
              >
                Login Required
              </button>
            )}
            <button 
              onClick={checkGwsAuth} 
              className="ml-1 text-primary hover:text-primary/80 transition-colors flex items-center cursor-pointer"
              title="구글 상태 갱신"
            >
              <span className="material-symbols-rounded text-base">refresh</span>
            </button>
          </div>
        </div>
      </header>

      {/* 메인 레이아웃 */}
      <main className="flex-1 p-6 max-w-7xl mx-auto w-full">
        {children}
      </main>

      {/* 하단 로그 콘솔 */}
      <LogConsole />
    </div>
  );
}
