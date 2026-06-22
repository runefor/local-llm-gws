import { useState } from "react";
import { useApp } from "../context/AppContext";
import Titlebar from "../components/Titlebar";
import SyncPanel from "../components/SyncPanel";
import DriveSearchWorkspace from "../components/DriveSearchWorkspace";
import HybridMailWorkspace from "../components/HybridMailWorkspace";
import MultiViewWorkspace from "../components/MultiViewWorkspace";
import LlmConfigPanel from "../components/LlmConfigPanel";
import ServiceConfigPanel from "../components/ServiceConfigPanel";
import RagSearchPanel from "../components/RagSearchPanel";
import KnowledgePipelinePanel from "../components/KnowledgePipelinePanel";
import LogConsole from "../components/LogConsole";
import { menuSections, type DesktopMenu } from "./desktopMenu";

export default function DesktopLayout() {
  const {
    backendStatus,
    checkBackend,
    authChecking,
    isGwsAuthenticated,
    triggerGoogleLogin,
    checkGwsAuth,
    vectorizationProgress
  } = useApp();

  const [activeMenu, setActiveMenu] = useState<DesktopMenu>("hybrid");

  const backendStatusLabel =
    backendStatus === "online"
      ? "실행 중"
      : backendStatus === "connecting"
        ? "확인 중"
        : "중지됨";
  const backendStatusClass =
    backendStatus === "online"
      ? "bg-emerald-500"
      : backendStatus === "connecting"
        ? "bg-amber-500"
        : "bg-rose-500";
  const googleStatusLabel = authChecking
    ? "확인 중"
    : isGwsAuthenticated
      ? "연결됨"
      : "로그인 필요";
  const googleStatusClass = authChecking
    ? "bg-amber-500"
    : isGwsAuthenticated
      ? "bg-emerald-500"
      : "bg-rose-500";

  return (
    <div className="h-screen w-screen bg-background text-text-primary flex flex-col overflow-hidden select-none selection:bg-primary-container selection:text-primary">
      {/* 커스텀 타이틀바 (드래그 가능 영역) */}
      <Titlebar />

      {/* 메인 윈도우 레이아웃 */}
      <div className="flex-1 flex overflow-hidden">
        
        <aside className="w-72 bg-surface border-r border-surface-variant/60 flex flex-col justify-between p-4 select-none">
          <div className="space-y-5">
            {/* 앱 로고/제목 */}
            <div className="flex items-center space-x-3 rounded-2xl bg-background px-3 py-3 border border-surface-variant/60 shadow-sm">
              <div className="w-10 h-10 rounded-2xl bg-primary flex items-center justify-center text-white shadow-sm">
                <span className="material-symbols-rounded text-lg">hub</span>
              </div>
              <div className="min-w-0">
                <h1 className="text-sm font-semibold tracking-wide text-text-primary truncate">
                  GWS 로컬 지식함
                </h1>
                <p className="text-[11px] text-text-secondary font-medium truncate">
                  GWS 원본부터 벡터 검색까지
                </p>
              </div>
            </div>

            {/* 네비게이션 메뉴 */}
            <nav className="space-y-4" aria-label="주요 작업 메뉴">
              {menuSections.map((section) => (
                <div key={section.title} className="space-y-1.5">
                  <p className="px-3 text-[10px] font-semibold tracking-[0.08em] text-text-secondary">
                    {section.title}
                  </p>
                  <div className="space-y-1">
                    {section.items.map((item) => {
                      const isActive = activeMenu === item.id;

                      return (
                        <button
                          key={item.id}
                          type="button"
                          onClick={() => setActiveMenu(item.id)}
                          aria-current={isActive ? "page" : undefined}
                          className={`w-full flex items-center space-x-3 px-3 py-2 rounded-full text-left transition-all cursor-pointer focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary ${
                            isActive
                              ? "bg-primary-container text-primary shadow-sm"
                              : "text-text-secondary hover:bg-primary-container/40 hover:text-text-primary"
                          }`}
                        >
                          <span className={`material-symbols-rounded text-[20px] ${isActive ? "text-primary" : "text-text-secondary"}`}>
                            {item.icon}
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="block text-xs font-semibold truncate">{item.label}</span>
                            <span className="block text-[10px] font-medium leading-4 text-text-secondary truncate">
                              {item.description}
                            </span>
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </nav>
          </div>

          <div className="rounded-2xl bg-background border border-surface-variant/70 p-3 space-y-3 shadow-sm">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-semibold text-text-primary">앱 상태</p>
                <p className="text-[10px] text-text-secondary">문제가 있으면 다시 확인하세요</p>
              </div>
              <button
                type="button"
                onClick={() => {
                  checkBackend();
                  checkGwsAuth();
                }}
                className="h-8 w-8 rounded-full text-primary hover:bg-primary-container/50 transition-colors flex items-center justify-center cursor-pointer focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
                title="전체 상태 다시 확인"
              >
                <span className="material-symbols-rounded text-base">refresh</span>
              </button>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between text-[11px]">
                <span className="font-medium text-text-secondary">백엔드</span>
                <span className="font-semibold text-text-primary flex items-center">
                  <span className={`w-2 h-2 rounded-full ${backendStatusClass} mr-1.5`}></span>
                  {backendStatusLabel}
                </span>
              </div>
              <div className="flex items-center justify-between text-[11px]">
                <span className="font-medium text-text-secondary">Google</span>
                <span className="font-semibold text-text-primary flex items-center">
                  <span className={`w-2 h-2 rounded-full ${googleStatusClass} mr-1.5`}></span>
                  {googleStatusLabel}
                </span>
              </div>
            </div>

            {!isGwsAuthenticated && !authChecking && (
              <button
                type="button"
                onClick={triggerGoogleLogin}
                className="w-full rounded-full bg-primary px-3 py-2 text-xs font-semibold text-white hover:bg-primary/95 active:scale-[0.98] transition-all cursor-pointer focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
              >
                Google Workspace 연결하기
              </button>
            )}

            {backendStatus === "offline" && (
              <div className="rounded-2xl bg-primary-container/30 px-3 py-2 text-[10px] leading-4 text-text-secondary">
                백엔드가 꺼져 있으면 원본 조회와 벡터 검색이 제한됩니다.
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
        </aside>

        {/* 데스크탑 메인 콘텐츠 패널 (스크롤 제어) */}
        <main className="flex-1 bg-background flex flex-col overflow-hidden p-6 relative">
          
          {activeMenu === "hybrid" && (
            <div className="h-full min-h-0 overflow-hidden">
              <HybridMailWorkspace isDesktop={true} />
            </div>
          )}

          {activeMenu === "drive" && (
            <div className="h-full min-h-0 overflow-hidden">
              <DriveSearchWorkspace isDesktop={true} />
            </div>
          )}

          {activeMenu === "sync" && (
            <div className="h-full min-h-0 space-y-6 overflow-y-auto pr-1">
              <SyncPanel />
              <div className="bg-primary-container/20 rounded-2xl p-6 border border-primary-container/30 text-xs text-text-secondary">
                <h3 className="font-semibold text-text-primary mb-2 flex items-center">
                  <span className="material-symbols-rounded text-primary mr-1 text-sm">route</span>
                  LLM Wiki 흐름 안내
                </h3>
                <p className="leading-relaxed">
                  이 탭은 “어떤 원본 자료를 Wiki 초안으로 만들지” 조건을 관리하는 곳입니다.
                  Gmail/Drive 원본 목록은 자료 준비 탭에서만 확인하고, 선택 벡터화 또는 벡터 인덱스 갱신이 끝난 자료만 벡터 자료 찾기 탭에서 검색하세요.
                </p>
              </div>
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
                  벡터 자료 찾기 안내
                </h3>
                <p className="leading-relaxed">
                  Gmail에서 선택 벡터화했거나 Drive 벡터 인덱스 갱신까지 끝난 자료만 검색하고, 필요한 항목만 정보 묶음으로 저장합니다.
                  원본 목록 확인은 자료 준비의 Gmail · Drive 원본 검색에서 하고, Drive 원본은 벡터 인덱스 갱신 후 찾기에 나타납니다.
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

          {vectorizationProgress.status === "running" && (
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
          )}

        </main>
      </div>
    </div>
  );
}
