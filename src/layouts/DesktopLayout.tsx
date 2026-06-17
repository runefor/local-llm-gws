import { useState } from "react";
import { useApp } from "../context/AppContext";
import Titlebar from "../components/Titlebar";
import SyncPanel from "../components/SyncPanel";
import HybridMailWorkspace from "../components/HybridMailWorkspace";
import MultiViewWorkspace from "../components/MultiViewWorkspace";
import LlmConfigPanel from "../components/LlmConfigPanel";
import ServiceConfigPanel from "../components/ServiceConfigPanel";
import RagSearchPanel from "../components/RagSearchPanel";
import KnowledgePipelinePanel from "../components/KnowledgePipelinePanel";
import LogConsole from "../components/LogConsole";

export default function DesktopLayout() {
  const {
    backendStatus,
    checkBackend,
    authChecking,
    isGwsAuthenticated,
    triggerGoogleLogin,
    checkGwsAuth
  } = useApp();

  const [activeMenu, setActiveMenu] = useState<"hybrid" | "sync" | "workspace" | "rag" | "pipeline" | "settings" | "logs">("hybrid");

  return (
    <div className="h-screen w-screen bg-background text-text-primary flex flex-col overflow-hidden select-none selection:bg-primary-container selection:text-primary">
      {/* 커스텀 타이틀바 (드래그 가능 영역) */}
      <Titlebar />

      {/* 메인 윈도우 레이아웃 */}
      <div className="flex-1 flex overflow-hidden">
        
        {/* 데스크탑 사이드바 (맥 스타일) */}
        <aside className="w-64 bg-[#f6f8fc]/85 backdrop-blur-md border-r border-surface-variant/60 flex flex-col justify-between p-4 select-none">
          <div className="space-y-6">
            {/* 앱 로고/제목 */}
            <div className="flex items-center space-x-3 px-2 py-1">
              <div className="w-9 h-9 rounded-xl bg-primary flex items-center justify-center text-white shadow-md shadow-primary/20">
                <span className="material-symbols-rounded text-lg">hub</span>
              </div>
              <div>
                <h1 className="text-sm font-semibold tracking-wide text-text-primary">
                  GWS Extractor
                </h1>
                <p className="text-[10px] text-text-secondary font-medium">Privacy-First RAG</p>
              </div>
            </div>

            {/* 네비게이션 메뉴 */}
            <nav className="space-y-1">
              <button
                type="button"
                onClick={() => setActiveMenu("hybrid")}
                className={`w-full flex items-center space-x-3 px-3 py-2.5 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
                  activeMenu === "hybrid"
                    ? "bg-primary/10 text-primary"
                    : "text-text-secondary hover:bg-[#e9eef6]/50 hover:text-text-primary"
                }`}
              >
                <span className="material-symbols-rounded text-lg">view_sidebar</span>
                <span>Gmail Hybrid</span>
              </button>
              <button
                type="button"
                onClick={() => setActiveMenu("sync")}
                className={`w-full flex items-center space-x-3 px-3 py-2.5 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
                  activeMenu === "sync"
                    ? "bg-primary/10 text-primary"
                    : "text-text-secondary hover:bg-[#e9eef6]/50 hover:text-text-primary"
                }`}
              >
                <span className="material-symbols-rounded text-lg">sync</span>
                <span>지식 동기화</span>
              </button>

              <button
                type="button"
                onClick={() => setActiveMenu("workspace")}
                className={`w-full flex items-center space-x-3 px-3 py-2.5 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
                  activeMenu === "workspace"
                    ? "bg-primary/10 text-primary"
                    : "text-text-secondary hover:bg-[#e9eef6]/50 hover:text-text-primary"
                }`}
              >
                <span className="material-symbols-rounded text-lg">hub</span>
                <span>통합 데이터 탐색</span>
              </button>

              <button
                type="button"
                onClick={() => setActiveMenu("rag")}
                className={`w-full flex items-center space-x-3 px-3 py-2.5 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
                  activeMenu === "rag"
                    ? "bg-primary/10 text-primary"
                    : "text-text-secondary hover:bg-[#e9eef6]/50 hover:text-text-primary"
                }`}
              >
                <span className="material-symbols-rounded text-lg">search</span>
                <span>RAG 지식 검색</span>
              </button>

              <button
                type="button"
                onClick={() => setActiveMenu("pipeline")}
                className={`w-full flex items-center space-x-3 px-3 py-2.5 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
                  activeMenu === "pipeline"
                    ? "bg-primary/10 text-primary"
                    : "text-text-secondary hover:bg-[#e9eef6]/50 hover:text-text-primary"
                }`}
              >
                <span className="material-symbols-rounded text-lg">insights</span>
                <span>지식 파이프라인</span>
              </button>

              <button
                type="button"
                onClick={() => setActiveMenu("settings")}
                className={`w-full flex items-center space-x-3 px-3 py-2.5 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
                  activeMenu === "settings"
                    ? "bg-primary/10 text-primary"
                    : "text-text-secondary hover:bg-[#e9eef6]/50 hover:text-text-primary"
                }`}
              >
                <span className="material-symbols-rounded text-lg">settings</span>
                <span>로컬 LLM 설정</span>
              </button>

              <button
                type="button"
                onClick={() => setActiveMenu("logs")}
                className={`w-full flex items-center space-x-3 px-3 py-2.5 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
                  activeMenu === "logs"
                    ? "bg-primary/10 text-primary"
                    : "text-text-secondary hover:bg-[#e9eef6]/50 hover:text-text-primary"
                }`}
              >
                <span className="material-symbols-rounded text-lg">terminal</span>
                <span>시스템 로그</span>
              </button>
            </nav>
          </div>

          {/* 하단 연결 상태 인디케이터 (초소형 디자인) */}
          <div className="border-t border-surface-variant/40 pt-4 space-y-2.5">
            {/* 백엔드 상태 */}
            <div className="flex items-center justify-between px-2 text-[10px] text-text-secondary">
              <span className="font-semibold">Backend Server:</span>
              <div className="flex items-center space-x-1">
                {backendStatus === "online" && (
                  <span className="text-emerald-600 font-bold flex items-center">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 mr-1"></span>
                    Online
                  </span>
                )}
                {backendStatus === "connecting" && (
                  <span className="text-amber-600 font-bold">Connecting...</span>
                )}
                {backendStatus === "offline" && (
                  <span className="text-rose-600 font-bold flex items-center">
                    <span className="w-1.5 h-1.5 rounded-full bg-rose-500 mr-1"></span>
                    Offline
                  </span>
                )}
                <button 
                  type="button"
                  onClick={checkBackend} 
                  className="text-primary hover:text-primary/80 transition-colors flex items-center cursor-pointer"
                  title="새로고침"
                >
                  <span className="material-symbols-rounded text-xs">refresh</span>
                </button>
              </div>
            </div>

            {/* 구글 로그인 상태 */}
            <div className="flex items-center justify-between px-2 text-[10px] text-text-secondary">
              <span className="font-semibold">Google Workspace:</span>
              <div className="flex items-center space-x-1">
                {authChecking ? (
                  <span className="font-medium text-text-secondary">Checking...</span>
                ) : isGwsAuthenticated ? (
                  <span className="text-emerald-600 font-bold flex items-center">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 mr-1"></span>
                    Connected
                  </span>
                ) : (
                  <button 
                    type="button"
                    onClick={triggerGoogleLogin}
                    className="bg-primary text-white hover:bg-primary/95 px-2 py-0.5 rounded-full font-bold text-[9px] transition-colors cursor-pointer"
                  >
                    Login
                  </button>
                )}
                <button 
                  type="button"
                  onClick={checkGwsAuth} 
                  className="text-primary hover:text-primary/80 transition-colors flex items-center cursor-pointer"
                  title="구글 상태 갱신"
                >
                  <span className="material-symbols-rounded text-xs">refresh</span>
                </button>
              </div>
            </div>
          </div>
        </aside>

        {/* 데스크탑 메인 콘텐츠 패널 (스크롤 제어) */}
        <main className="flex-1 bg-background flex flex-col overflow-hidden p-6 relative">
          
          {activeMenu === "hybrid" && (
            <div className="h-full min-h-0 overflow-hidden">
              <HybridMailWorkspace isDesktop={true} />
            </div>
          )}

          {activeMenu === "sync" && (
            <div className="h-full min-h-0 space-y-6 overflow-y-auto pr-1">
              <SyncPanel />
            </div>
          )}

          {activeMenu === "workspace" && (
            <div className="h-full min-h-0 overflow-hidden">
              <MultiViewWorkspace isDesktop={true} />
            </div>
          )}

          {activeMenu === "rag" && (
            <div className="h-full min-h-0 space-y-6 overflow-y-auto pr-1">
              <RagSearchPanel />
              <div className="bg-primary-container/20 rounded-2xl p-6 border border-primary-container/30 text-xs text-text-secondary">
                <h3 className="font-semibold text-text-primary mb-2 flex items-center">
                  <span className="material-symbols-rounded text-primary mr-1 text-sm">info</span>
                  데스크탑 RAG 안내
                </h3>
                <p className="leading-relaxed">
                  옵시디언 마크다운 지식 저장소와 ChromaDB 임베딩 엔진은 로컬 백엔드 서버에서 실행됩니다. 
                  데스크탑 앱 상에서 RAG 질문을 던지면, 백엔드가 로컬 LLM을 호출하여 완전 오프라인 프라이버시가 보장되는 고성능 지식 답변을 반환합니다.
                </p>
              </div>
            </div>
          )}

          {activeMenu === "pipeline" && (
            <div className="h-full min-h-0 space-y-6 overflow-y-auto pr-1">
              <KnowledgePipelinePanel />
            </div>
          )}

          {activeMenu === "settings" && (
            <div className="h-full min-h-0 space-y-6 overflow-y-auto pr-1">
              <LlmConfigPanel />
              <ServiceConfigPanel />
            </div>
          )}

          {activeMenu === "logs" && (
            <div className="h-full min-h-0 overflow-hidden">
              <LogConsole isDesktop={true} />
            </div>
          )}

        </main>
      </div>
    </div>
  );
}
