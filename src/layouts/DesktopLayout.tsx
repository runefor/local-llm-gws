import { useState } from "react";
import Titlebar from "../components/Titlebar";
import LlmConfigPanel from "../components/LlmConfigPanel";
import ServiceConfigPanel from "../components/ServiceConfigPanel";
import { FirstRunGuide } from "../components/FirstRunGuide";
import { VectorizationProgressToast } from "../components/VectorizationProgressToast";
import { DesktopStatusCard } from "../components/DesktopStatusCard";
import { StartPanel } from "../components/StartPanel";
import { SourceImportPanel } from "../components/SourceImportPanel";
import { IndexingWorkspacePanel } from "../components/IndexingWorkspacePanel";
import { RagWorkflowPanel } from "../components/RagWorkflowPanel";
import { CreateWorkspacePanel } from "../components/CreateWorkspacePanel";
import { menuSections, type DesktopMenu } from "./desktopMenu";

export default function DesktopLayout() {
  const [activeMenu, setActiveMenu] = useState<DesktopMenu>("start");

  return (
    <div className="h-screen w-screen bg-background text-text-primary flex flex-col overflow-hidden select-none selection:bg-primary-container selection:text-primary">
      {/* 커스텀 타이틀바 (드래그 가능 영역) */}
      <Titlebar />

      {/* 메인 윈도우 레이아웃 */}
      <div className="flex-1 flex overflow-hidden">
        
        <aside className="w-20 lg:w-72 bg-surface border-r border-surface-variant/60 flex flex-col p-2 lg:p-4 select-none">
          <div className="flex-shrink-0 space-y-5">
            {/* 앱 로고/제목 */}
            <div className="flex items-center justify-center lg:justify-start lg:space-x-3 rounded-2xl bg-background px-2 lg:px-3 py-3 border border-surface-variant/60 shadow-sm">
              <div className="w-10 h-10 rounded-2xl bg-primary flex shrink-0 items-center justify-center text-white shadow-sm">
                <span className="material-symbols-rounded text-lg">hub</span>
              </div>
              <div className="hidden min-w-0 lg:block">
                <h1 className="text-sm font-semibold tracking-wide text-text-primary truncate">
                  GWS 로컬 지식함
                </h1>
                <p className="text-[11px] text-text-secondary font-medium truncate">
                  GWS 원본부터 벡터 검색까지
                </p>
              </div>
            </div>

            {/* 네비게이션 메뉴 */}
          </div>

          <nav className="mt-5 min-h-0 flex-1 space-y-4 overflow-y-auto pr-0 lg:pr-1" aria-label="주요 작업 메뉴">
              {menuSections.map((section) => (
                <div key={section.title} className="space-y-1.5">
                  <p className="hidden px-3 text-[10px] font-semibold tracking-[0.08em] text-text-secondary lg:block">
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
                          title={item.label}
                          className={`w-full flex items-center justify-center lg:justify-start lg:space-x-3 px-3 py-2 rounded-full text-left transition-all cursor-pointer focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary ${
                            isActive
                              ? "bg-primary-container text-primary shadow-sm"
                              : "text-text-secondary hover:bg-primary-container/40 hover:text-text-primary"
                          }`}
                        >
                          <span className={`material-symbols-rounded text-[20px] ${isActive ? "text-primary" : "text-text-secondary"}`} aria-hidden="true">
                            {item.icon}
                          </span>
                          <span className="hidden min-w-0 flex-1 lg:block">
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

          <DesktopStatusCard />
        </aside>

        {/* 데스크탑 메인 콘텐츠 패널 (스크롤 제어) */}
        <main className="min-w-0 flex-1 bg-background flex flex-col gap-4 overflow-hidden p-3 md:p-4 lg:p-6">
          <FirstRunGuide activeMenu={activeMenu} onNavigate={setActiveMenu} />

          <div className="min-h-0 flex-1 overflow-hidden flex flex-col">
            {activeMenu === "start" && <StartPanel onNavigate={setActiveMenu} />}
            {activeMenu === "sources" && <SourceImportPanel />}
            {activeMenu === "indexing" && <IndexingWorkspacePanel />}
            {activeMenu === "search" && <RagWorkflowPanel intent="search" />}
            {activeMenu === "create" && <CreateWorkspacePanel />}

            {activeMenu === "settings" && (
              <div className="h-full min-h-0 space-y-6 overflow-y-auto pr-1">
                <LlmConfigPanel />
                <ServiceConfigPanel />
              </div>
            )}
          </div>

          <VectorizationProgressToast />

        </main>
      </div>
    </div>
  );
}
