import { useApp } from "../context/AppContext";

export default function LlmConfigPanel() {
  const { 
    llmEndpoint, 
    setLlmEndpoint, 
    llmModel, 
    setLlmModel, 
    handleLlmTest 
  } = useApp();

  return (
    <div className="bg-surface rounded-2xl p-6 border border-surface-variant shadow-[0_1px_2px_0_rgba(0,0,0,0.05)]">
      <h2 className="text-base font-semibold mb-3 flex items-center text-text-primary">
        <span className="material-symbols-rounded mr-2 text-primary">dns</span>
        Local LLM 설정
      </h2>
      <p className="text-xs text-text-secondary mb-4 leading-relaxed">
        LM Studio, Jan, GPT4All 등 로컬 LLM 런타임의 OpenAI 호환 주소를 입력해 연동하세요.
      </p>

      <div className="space-y-4">
        <div>
          <label className="block text-xs font-semibold text-text-secondary uppercase tracking-wider mb-1.5">API Endpoint URL</label>
          <input 
            type="text" 
            value={llmEndpoint}
            onChange={(e) => setLlmEndpoint(e.target.value)}
            className="w-full bg-white border border-surface-variant rounded-lg px-3 py-2 text-xs text-text-primary focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary font-mono transition-colors"
          />
        </div>

        <div>
          <label className="block text-xs font-semibold text-text-secondary uppercase tracking-wider mb-1.5">Model Name</label>
          <input 
            type="text" 
            value={llmModel}
            onChange={(e) => setLlmModel(e.target.value)}
            className="w-full bg-white border border-surface-variant rounded-lg px-3 py-2 text-xs text-text-primary focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary font-mono transition-colors"
          />
        </div>

        <div className="pt-2">
          <button 
            onClick={handleLlmTest}
            className="w-full bg-white hover:bg-surface-variant/30 text-primary font-semibold py-2.5 px-4 rounded-full text-xs transition-colors border border-surface-variant cursor-pointer"
          >
            LLM 서버 연결 테스트
          </button>
        </div>
      </div>
    </div>
  );
}
