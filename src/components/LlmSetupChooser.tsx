type LlmMode = "internal" | "external";

type LlmSetupChooserProps = {
  readonly llmEndpoint: string;
  readonly llmModel: string;
  readonly llmMode: LlmMode;
  readonly setLlmEndpoint: (endpoint: string) => void;
  readonly setLlmMode: (mode: LlmMode) => void;
  readonly saveLlmConfig: (endpoint: string, model: string, mode: "llamacpp" | "ollama" | "external") => Promise<void>;
  readonly openManualConfig: () => void;
  readonly closeManualConfig: () => void;
};

export function LlmSetupChooser({ llmEndpoint, llmModel, llmMode, setLlmEndpoint, setLlmMode, saveLlmConfig, openManualConfig, closeManualConfig }: LlmSetupChooserProps) {
  const chooseInternal = () => {
    setLlmMode("internal");
    closeManualConfig();
    void saveLlmConfig("http://localhost:8080/v1", llmModel, "llamacpp");
  };
  const chooseLocalServer = () => {
    const endpoint = llmEndpoint.includes("localhost") || llmEndpoint.includes("127.0.0.1") ? llmEndpoint : "http://localhost:11434/v1";
    setLlmMode("external");
    setLlmEndpoint(endpoint);
    closeManualConfig();
    void saveLlmConfig(endpoint, llmModel, endpoint.includes("11434") ? "ollama" : "external");
  };
  const chooseExternalApi = () => {
    setLlmMode("external");
    openManualConfig();
  };

  const cards = [
    { id: "internal", icon: "download", title: "추천: 로컬 모델 자동 설치", text: "모델을 내려받아 이 PC 안에서만 처리합니다.", action: chooseInternal, selected: llmMode === "internal" },
    { id: "local", icon: "dns", title: "이미 Ollama/LM Studio 사용 중", text: "실행 중인 로컬 서버를 자동 감지해 연결합니다.", action: chooseLocalServer, selected: llmMode === "external" && (llmEndpoint.includes("localhost") || llmEndpoint.includes("127.0.0.1")) },
    { id: "remote", icon: "key", title: "외부 API 직접 입력", text: "원격 API를 직접 쓰되 자료 전송 경고를 표시합니다.", action: chooseExternalApi, selected: llmMode === "external" && !llmEndpoint.includes("localhost") && !llmEndpoint.includes("127.0.0.1") },
  ] as const;

  return (
    <div className="mb-4 grid gap-3 lg:grid-cols-3">
      {cards.map((card) => (
        <button
          key={card.id}
          type="button"
          onClick={card.action}
          className={`rounded-2xl border p-4 text-left transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary ${card.selected ? "border-primary bg-primary-container/65" : "border-surface-variant bg-background hover:bg-primary-container/25"}`}
        >
          <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-primary-container text-primary">
            <span className="material-symbols-rounded text-lg">{card.icon}</span>
          </span>
          <span className="mt-3 block text-sm font-semibold text-text-primary">{card.title}</span>
          <span className="mt-1 block text-xs leading-5 text-text-secondary">{card.text}</span>
        </button>
      ))}
    </div>
  );
}
