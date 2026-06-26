import { useState } from "react";
import ChatPanel from "./ChatPanel";
import { RagWorkflowPanel } from "./RagWorkflowPanel";

type CreateMode = "chat" | "wiki";

export function CreateWorkspacePanel() {
  const [mode, setMode] = useState<CreateMode>("wiki");

  return (
    <div className="flex h-full min-h-0 flex-col gap-3">
      <section className="flex flex-col gap-3 rounded-2xl border border-surface-variant bg-surface px-4 py-3 shadow-sm lg:flex-row lg:items-center lg:justify-between">
        <div className="min-w-0">
          <p className="text-xs font-semibold text-primary">답변/Wiki 만들기</p>
          <h2 className="mt-1 break-keep text-sm font-semibold text-text-primary">필요한 출력 형태를 고르고 바로 작업합니다</h2>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setMode("wiki")}
            className={`rounded-full px-4 py-2 text-xs font-semibold transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary ${mode === "wiki" ? "bg-primary text-white" : "bg-background text-primary hover:bg-primary-container/50"}`}
          >
            Wiki 후보 만들기
          </button>
          <button
            type="button"
            onClick={() => setMode("chat")}
            className={`rounded-full px-4 py-2 text-xs font-semibold transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary ${mode === "chat" ? "bg-primary text-white" : "bg-background text-primary hover:bg-primary-container/50"}`}
          >
            LLM 채팅 열기
          </button>
        </div>
      </section>
      <div className="min-h-0 flex-1 overflow-hidden">
        {mode === "chat" ? <ChatPanel /> : <RagWorkflowPanel intent="create" />}
      </div>
    </div>
  );
}
