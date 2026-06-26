import { useEffect, useMemo, useRef, useState } from "react";
import type { KeyboardEvent } from "react";
import { useApp } from "../context/AppContext";
import type { DesktopMenu } from "../layouts/desktopMenu";

const GUIDE_DISMISSED_KEY = "local-llm-gws:first-run-guide-dismissed";
const SETTINGS_VISITED_KEY = "local-llm-gws:first-run-settings-visited";

type FirstRunStepId = "backend" | "google" | "llm" | "originals" | "vectors";

type FirstRunStep = {
  readonly id: FirstRunStepId;
  readonly icon: string;
  readonly title: string;
  readonly description: string;
  readonly actionLabel: string;
  readonly completed: boolean;
  readonly menu: DesktopMenu;
};

type FirstRunGuideProps = {
  readonly activeMenu: DesktopMenu;
  readonly onNavigate: (menu: DesktopMenu) => void;
};

export function FirstRunGuide({ activeMenu, onNavigate }: FirstRunGuideProps) {
  const {
    backendStatus,
    checkBackend,
    isGwsAuthenticated,
    triggerGoogleLogin,
    gmailItems,
    driveItems,
    llmEndpoint,
    llmModel,
    vectorizationProgress,
    recentVectorizedGmailIds,
  } = useApp();
  const [guideDismissed, setGuideDismissed] = useState(() => localStorage.getItem(GUIDE_DISMISSED_KEY) === "true");
  const [compactOpen, setCompactOpen] = useState(true);
  const [settingsVisited, setSettingsVisited] = useState(() => localStorage.getItem(SETTINGS_VISITED_KEY) === "true");
  const dialogRef = useRef<HTMLElement | null>(null);
  const primaryActionRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    if (activeMenu === "settings") {
      localStorage.setItem(SETTINGS_VISITED_KEY, "true");
      setSettingsVisited(true);
    }
  }, [activeMenu]);

  useEffect(() => {
    if (guideDismissed) return;
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    primaryActionRef.current?.focus();
    return () => previousFocus?.focus();
  }, [guideDismissed]);

  const steps = useMemo<readonly FirstRunStep[]>(() => {
    const hasOriginals = gmailItems.length > 0 || driveItems.length > 0;
    const hasVectors = recentVectorizedGmailIds.length > 0 || vectorizationProgress.status === "done";
    const llmLooksConfigured = llmEndpoint.trim().length > 0 && llmModel.trim().length > 0 && settingsVisited;

    return [
      {
        id: "backend",
        icon: "dns",
        title: "로컬 백엔드 상태 확인",
        description: "원본 조회와 벡터 검색을 담당하는 로컬 서버가 실행 중인지 먼저 확인합니다.",
        actionLabel: backendStatus === "online" ? "설정 열기" : "다시 확인하기",
        completed: backendStatus === "online",
        menu: "settings",
      },
      {
        id: "google",
        icon: "account_circle",
        title: "Google Workspace 연결",
        description: "Gmail과 Drive 원본을 읽을 수 있도록 Google 인증을 완료합니다.",
        actionLabel: isGwsAuthenticated ? "Gmail 원본 보기" : "Google 연결하기",
        completed: isGwsAuthenticated,
        menu: "sources",
      },
      {
        id: "llm",
        icon: "smart_toy",
        title: "LLM 엔진 확인",
        description: "내장 모델을 받을지, Ollama 같은 외부 로컬 서버를 연결할지 한 번만 확인합니다.",
        actionLabel: "LLM 설정 열기",
        completed: llmLooksConfigured,
        menu: "settings",
      },
      {
        id: "originals",
        icon: "folder_open",
        title: "Gmail 또는 Drive 원본 검색",
        description: "답변에 쓸 자료를 먼저 찾고, 필요한 원본만 선택합니다.",
        actionLabel: hasOriginals ? "검색 결과 보기" : "원본 검색하기",
        completed: hasOriginals,
        menu: "sources",
      },
      {
        id: "vectors",
        icon: "travel_explore",
        title: "선택 자료 벡터화 후 검색",
        description: "선택한 메일이나 Drive 문서를 벡터화한 뒤 근거 기반 검색과 Wiki 생성을 시작합니다.",
        actionLabel: hasVectors ? "검색하기 열기" : "검색하기",
        completed: hasVectors,
        menu: "search",
      },
    ] as const;
  }, [backendStatus, driveItems.length, gmailItems.length, isGwsAuthenticated, llmEndpoint, llmModel, recentVectorizedGmailIds.length, settingsVisited, vectorizationProgress.status]);

  const completedCount = steps.filter((step) => step.completed).length;
  const nextStep = steps.find((step) => !step.completed) ?? steps[steps.length - 1];
  const allComplete = completedCount === steps.length;

  const dismissGuide = () => {
    localStorage.setItem(GUIDE_DISMISSED_KEY, "true");
    setGuideDismissed(true);
  };

  const keepFocusInDialog = (event: KeyboardEvent<HTMLElement>) => {
    if (event.key === "Escape") {
      dismissGuide();
      return;
    }
    if (event.key !== "Tab") return;
    const dialog = dialogRef.current;
    if (!dialog) return;
    const buttons = Array.from(dialog.querySelectorAll("button")).filter((button): button is HTMLButtonElement => !button.disabled);
    const firstButton = buttons[0];
    const lastButton = buttons[buttons.length - 1];
    if (!firstButton || !lastButton) return;
    if (event.shiftKey && document.activeElement === firstButton) {
      event.preventDefault();
      lastButton.focus();
    } else if (!event.shiftKey && document.activeElement === lastButton) {
      event.preventDefault();
      firstButton.focus();
    }
  };

  const handleStepAction = (step: FirstRunStep) => {
    if (step.id === "backend" && backendStatus !== "online") {
      void checkBackend();
    }
    if (step.id === "google" && !isGwsAuthenticated) {
      void triggerGoogleLogin();
      return;
    }
    onNavigate(step.menu);
  };

  return (
    <>
      {!guideDismissed && (
        <section ref={dialogRef} onKeyDown={keepFocusInDialog} className="fixed inset-0 z-30 flex items-center justify-center bg-text-primary/45 px-6 backdrop-blur-[2px]" aria-labelledby="first-run-guide-title" aria-modal="true" role="dialog">
          <div className="w-full max-w-4xl rounded-[24px] border border-surface-variant bg-background p-6 shadow-[0_8px_24px_rgba(11,87,208,0.12)]">
            <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
              <div className="max-w-2xl">
                <div className="mb-3 inline-flex items-center rounded-full bg-primary-container px-3 py-1 text-xs font-semibold text-primary">
                  <span className="material-symbols-rounded mr-1 text-sm">assistant_direction</span>
                  첫 실행 가이드
                </div>
                <h2 id="first-run-guide-title" className="text-[28px] font-normal leading-tight text-text-primary">
                  처음에는 이 순서대로만 누르면 됩니다
                </h2>
                <p className="mt-3 max-w-[680px] break-keep text-sm leading-6 text-text-secondary">
                  이 화면은 한 번만 크게 보여주고, 닫은 뒤에도 오른쪽 위에 다음 단계가 남습니다. 설명을 다 읽지 않아도 현재 상태에 맞춰 다음 버튼만 따라가면 자료 검색과 Wiki 생성까지 이어집니다.
                </p>
              </div>
              <button
                type="button"
                onClick={dismissGuide}
                className="inline-flex items-center justify-center rounded-full px-4 py-2 text-sm font-semibold text-text-secondary transition-colors hover:bg-surface active:scale-[0.98] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
              >
                나중에 보기
              </button>
            </div>

            <div className="mt-6 grid gap-3 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-5">
              {steps.map((step, index) => (
                <article key={step.id} className={`rounded-2xl border p-4 ${step.completed ? "border-primary-container bg-primary-container/35" : "border-surface-variant bg-surface"}`}>
                  <div className="flex items-center justify-between gap-3">
                    <span className={`flex h-9 w-9 items-center justify-center rounded-2xl ${step.completed ? "bg-primary text-white" : "bg-background text-primary"}`}>
                      <span className="material-symbols-rounded text-lg" aria-hidden="true">{step.completed ? "check" : step.icon}</span>
                    </span>
                    <span className="text-[11px] font-semibold text-text-secondary">{index + 1}단계</span>
                  </div>
                  <h3 className="mt-4 break-keep text-sm font-semibold leading-5 text-text-primary">{step.title}</h3>
                  <p className="mt-2 min-h-16 break-keep text-xs leading-5 text-text-secondary">{step.description}</p>
                  <button
                    type="button"
                    onClick={() => handleStepAction(step)}
                    className="mt-4 inline-flex w-full items-center justify-center rounded-full bg-background px-3 py-2 text-xs font-semibold text-primary transition-colors hover:bg-primary-container active:scale-[0.98] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
                  >
                    {step.actionLabel}
                  </button>
                </article>
              ))}
            </div>

            <div className="mt-6 flex flex-col gap-3 rounded-2xl bg-surface px-4 py-3 md:flex-row md:items-center md:justify-between">
              <p className="text-xs leading-5 text-text-secondary">
                진행률 <span className="font-semibold text-primary">{completedCount}/{steps.length}</span> · 다음 단계는 <span className="font-semibold text-text-primary">{nextStep.title}</span>입니다.
              </p>
              <button
                type="button"
                ref={primaryActionRef}
                onClick={() => {
                  dismissGuide();
                  handleStepAction(nextStep);
                }}
                className="inline-flex items-center justify-center rounded-full bg-primary px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-primary/95 active:scale-[0.98] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
              >
                다음 단계로 이동
              </button>
            </div>
          </div>
        </section>
      )}

      {guideDismissed && !allComplete && (
        <section className="rounded-2xl border border-primary/15 bg-surface px-4 py-3 shadow-sm" aria-label="첫 실행 다음 단계">
          {compactOpen ? (
            <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(260px,360px)] lg:items-center">
              <div className="min-w-0">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-[11px] font-semibold text-primary">시작 체크리스트 {completedCount}/{steps.length}</p>
                    <h2 className="mt-1 text-sm font-semibold text-text-primary">{nextStep.title}</h2>
                  </div>
                  <button
                    type="button"
                    onClick={() => setCompactOpen(false)}
                    aria-expanded="true"
                    className="rounded-full p-1 text-text-secondary transition-colors hover:bg-primary-container/40 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
                    title="체크리스트 접기"
                  >
                    <span className="material-symbols-rounded text-base" aria-hidden="true">expand_less</span>
                  </button>
                </div>
                <p className="mt-1 break-keep text-xs leading-5 text-text-secondary">{nextStep.description}</p>
              </div>
              <div className="min-w-0 space-y-2">
                <div className="h-2 overflow-hidden rounded-full bg-background" role="progressbar" aria-valuemin={0} aria-valuemax={steps.length} aria-valuenow={completedCount} aria-label="첫 실행 체크리스트 진행률">
                  <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${(completedCount / steps.length) * 100}%` }} />
                </div>
                <button
                  type="button"
                  onClick={() => handleStepAction(nextStep)}
                  className="inline-flex w-full items-center justify-center rounded-full bg-primary px-4 py-2 text-xs font-semibold text-white transition-colors hover:bg-primary/95 active:scale-[0.98] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
                >
                  {nextStep.actionLabel}
                </button>
              </div>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setCompactOpen(true)}
              aria-expanded="false"
              className="flex w-full items-center justify-between gap-3 rounded-full text-left text-xs font-semibold text-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
            >
              <span>시작 체크리스트 {completedCount}/{steps.length}</span>
              <span className="material-symbols-rounded text-base" aria-hidden="true">expand_more</span>
            </button>
          )}
        </section>
      )}
    </>
  );
}
