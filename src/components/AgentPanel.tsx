import { useState } from "react";
import { useApp, AgentTurnLog } from "../context/AppContext";

export default function AgentPanel() {
  const {
    agentStatus,
    agentResult,
    agentLogs,
    agentActiveTurns,
    runAgentHarness,
    cancelAgentHarness,
    backendStatus,
  } = useApp();

  const [query, setQuery] = useState("");
  const [maxTurns, setMaxTurns] = useState(15);
  const [expandedTurns, setExpandedTurns] = useState<number[]>([]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!query.trim() || agentStatus === "running") return;
    runAgentHarness(query, maxTurns);
  };

  const toggleTurnExpand = (turnNum: number) => {
    setExpandedTurns((prev) =>
      prev.includes(turnNum)
        ? prev.filter((t) => t !== turnNum)
        : [...prev, turnNum]
    );
  };

  const getImportanceColor = (tag: string) => {
    switch (tag) {
      case "very_high":
        return "bg-red-50 text-red-600 border-red-200/50";
      case "high":
        return "bg-orange-50 text-orange-600 border-orange-200/50";
      case "fair":
        return "bg-blue-50 text-blue-600 border-blue-200/50";
      default:
        return "bg-slate-50 text-slate-500 border-slate-200/50";
    }
  };

  const getStatusColor = (status: string) => {
    switch (status.toLowerCase()) {
      case "verified":
        return "bg-emerald-50 text-emerald-600 border-emerald-200/50";
      case "contradicted":
        return "bg-rose-50 text-rose-600 border-rose-200/50";
      default:
        return "bg-amber-50 text-amber-600 border-amber-200/50";
    }
  };

  // 현재 진행 중인 마지막 턴 정보 획득
  const latestTurn: AgentTurnLog | undefined = agentLogs[agentLogs.length - 1];

  return (
    <div className="bg-surface rounded-2xl p-6 border border-surface-variant/80 shadow-[0_1px_3px_0_rgba(0,0,0,0.02)] relative overflow-hidden flex flex-col gap-6">
      {/* 타이틀 및 설명 */}
      <div>
        <h2 className="text-base font-semibold mb-1.5 flex items-center text-text-primary">
          <span className="material-symbols-rounded mr-2 text-primary">psychology</span>
          상태 외재화 RAG 자율 에이전트 (Harness-1)
        </h2>
        <p className="text-xs text-text-secondary leading-relaxed">
          Google Workspace 데이터를 안전하게 분석하여 사용자의 질문에 답하기 위해 에이전트가 스스로 지식 검색, 중요 문서 큐레이션, 가설 설정 및 주장 검증 루프를 자율적으로 돕니다.
        </p>
      </div>

      {/* 입력 폼 */}
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <div className="relative">
          <textarea
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            disabled={agentStatus === "running" || backendStatus !== "online"}
            placeholder="예: '최근 회의 일정이 잡힌 지메일과 구글 드라이브 문서를 찾아 요약해줘'"
            className="w-full min-h-[90px] bg-white border border-surface-variant/80 rounded-2xl p-4 pr-12 text-sm text-text-primary focus:outline-none focus:border-primary/50 transition-all placeholder:text-text-secondary/50 resize-none leading-relaxed shadow-[0_1px_2px_0_rgba(0,0,0,0.01)]"
          />
          <button
            type="submit"
            disabled={!query.trim() || agentStatus === "running" || backendStatus !== "online"}
            className="absolute bottom-4 right-4 p-2 bg-primary hover:bg-[#094cb3] disabled:bg-slate-100 disabled:text-slate-400 text-white rounded-full transition-all active:scale-95 cursor-pointer disabled:cursor-default"
          >
            <span className="material-symbols-rounded text-sm block">send</span>
          </button>
        </div>

        {/* 턴수 제한 및 제어 */}
        <div className="flex flex-wrap items-center justify-between gap-4 bg-slate-50/50 border border-slate-100/80 p-3.5 rounded-2xl">
          <div className="flex items-center gap-3">
            <span className="text-xs font-medium text-text-secondary">최대 에이전트 턴 수 제한:</span>
            <input
              type="range"
              min={5}
              max={30}
              value={maxTurns}
              onChange={(e) => setMaxTurns(Number(e.target.value))}
              disabled={agentStatus === "running"}
              className="w-24 accent-primary"
            />
            <span className="text-xs font-semibold text-primary">{maxTurns}턴</span>
          </div>

          {agentStatus === "running" && (
            <button
              type="button"
              onClick={cancelAgentHarness}
              className="flex items-center gap-1.5 bg-rose-50 hover:bg-rose-100 text-rose-600 border border-rose-200/50 font-medium py-1.5 px-4 rounded-full text-xs transition-all active:scale-95 cursor-pointer"
            >
              <span className="material-symbols-rounded text-xs">stop</span>
              실행 중단
            </button>
          )}
        </div>
      </form>

      {/* 에이전트 구동 정보 보드 */}
      {agentStatus !== "idle" && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 mt-2">
          
          {/* 왼쪽 컬럼: 상태판 정보 (큐레이팅 증거 + 가설 대장) */}
          <div className="lg:col-span-7 flex flex-col gap-5">
            {/* 턴 프로그레스 바 */}
            {agentStatus === "running" && (
              <div className="bg-white p-5 rounded-2xl border border-surface-variant flex flex-col gap-2.5">
                <div className="flex justify-between items-center text-xs">
                  <span className="font-semibold text-text-primary flex items-center gap-1">
                    <span className="animate-spin text-primary material-symbols-rounded text-xs">sync</span>
                    에이전트 자율 분석 진행 중...
                  </span>
                  <span className="text-text-secondary">{agentActiveTurns} / {maxTurns} 턴</span>
                </div>
                <div className="w-full bg-slate-100 h-1.5 rounded-full overflow-hidden">
                  <div
                    className="bg-primary h-full transition-all duration-300"
                    style={{ width: `${(agentActiveTurns / maxTurns) * 100}%` }}
                  />
                </div>
              </div>
            )}

            {/* 큐레이션된 증거 대장 */}
            <div className="bg-white p-5 rounded-2xl border border-surface-variant flex flex-col gap-4 min-h-[120px]">
              <h3 className="text-xs font-bold text-text-primary flex items-center">
                <span className="material-symbols-rounded text-xs text-primary mr-1.5">folder_open</span>
                큐레이션 증거 대장 (Curated Evidence)
              </h3>
              
              {(!latestTurn || !latestTurn.state || latestTurn.state.curated_evidence.length === 0) ? (
                <div className="text-xs text-text-secondary/50 text-center py-6">
                  수집된 핵심 증거가 아직 없습니다.
                </div>
              ) : (
                <div className="flex flex-col gap-3">
                  {latestTurn.state.curated_evidence.map((ev: any, idx: number) => (
                    <div key={idx} className="p-3 border border-slate-100/80 rounded-xl flex flex-col gap-2 bg-slate-50/30">
                      <div className="flex justify-between items-start">
                        <span className="font-medium text-xs text-text-primary truncate max-w-[70%]">{ev.title}</span>
                        <span className={`text-[10px] px-2 py-0.5 rounded-full border ${getImportanceColor(ev.importance)}`}>
                          {ev.importance.toUpperCase()}
                        </span>
                      </div>
                      {ev.chunks && ev.chunks.length > 0 && (
                        <div className="text-[11px] text-text-secondary/80 leading-relaxed bg-white border border-slate-100 p-2 rounded-lg">
                          {ev.chunks.map((c: string, cIdx: number) => (
                            <div key={cIdx} className="mb-1 last:mb-0">• {c}</div>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* 가설 및 검증 대장 */}
            <div className="bg-white p-5 rounded-2xl border border-surface-variant flex flex-col gap-4">
              <h3 className="text-xs font-bold text-text-primary flex items-center">
                <span className="material-symbols-rounded text-xs text-primary mr-1.5">task_alt</span>
                가설 및 검증 대장 (Verification Registry)
              </h3>
              
              {(!latestTurn || !latestTurn.state || latestTurn.state.verification.length === 0) ? (
                <div className="text-xs text-text-secondary/50 text-center py-6">
                  설정된 가설 주장이 아직 없습니다.
                </div>
              ) : (
                <div className="flex flex-col gap-2.5">
                  {latestTurn.state.verification.map((v: any, idx: number) => (
                    <div key={idx} className="p-3 border border-slate-100/80 rounded-xl flex justify-between items-center gap-3 bg-slate-50/30 text-xs">
                      <div className="flex flex-col gap-1">
                        <span className="font-semibold text-primary">{v.claim_id.toUpperCase()}</span>
                        <span className="text-text-primary leading-relaxed">{v.statement}</span>
                      </div>
                      <span className={`text-[10px] px-2.5 py-0.5 rounded-full border font-medium whitespace-nowrap ${getStatusColor(v.status)}`}>
                        {v.status.toUpperCase()}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* 오른쪽 컬럼: 생각 과정 타임라인 (Thoughts accordion) */}
          <div className="lg:col-span-5 bg-white p-5 rounded-2xl border border-surface-variant flex flex-col gap-4">
            <h3 className="text-xs font-bold text-text-primary flex items-center">
              <span className="material-symbols-rounded text-xs text-primary mr-1.5">timeline</span>
              사고 과정 타임라인 (Agent Thoughts)
            </h3>

            <div className="flex flex-col gap-3 max-h-[420px] overflow-y-auto pr-1">
              {agentLogs.map((log) => {
                const isExpanded = expandedTurns.includes(log.turn);
                return (
                  <div key={log.turn} className="border border-slate-100/80 rounded-xl overflow-hidden transition-all">
                    {/* 아코디언 헤더 */}
                    <div
                      onClick={() => toggleTurnExpand(log.turn)}
                      className="bg-slate-50/50 hover:bg-slate-50 p-3 flex justify-between items-center cursor-pointer text-xs font-medium text-text-primary"
                    >
                      <div className="flex items-center gap-2">
                        <span className="bg-primary/10 text-primary w-5 h-5 flex items-center justify-center rounded-full text-[10px] font-bold">
                          {log.turn}
                        </span>
                        <span className="font-semibold text-primary">{log.action.toUpperCase()}</span>
                      </div>
                      <span className="material-symbols-rounded text-slate-400 text-xs">
                        {isExpanded ? "expand_less" : "expand_more"}
                      </span>
                    </div>
                    {/* 아코디언 본문 */}
                    {isExpanded && (
                      <div className="p-3.5 border-t border-slate-100 flex flex-col gap-2.5 text-xs text-text-secondary leading-relaxed bg-white">
                        <div>
                          <span className="font-semibold text-text-primary block mb-1">에이전트 생각:</span>
                          <p className="bg-amber-50/30 border border-amber-100/50 p-2.5 rounded-lg text-amber-800">
                            {log.thought}
                          </p>
                        </div>
                        {log.arguments && Object.keys(log.arguments).length > 0 && (
                          <div>
                            <span className="font-semibold text-text-primary block mb-0.5">매개변수:</span>
                            <pre className="text-[10px] bg-slate-50 p-2 rounded-lg border border-slate-100 overflow-x-auto">
                              {JSON.stringify(log.arguments, null, 2)}
                            </pre>
                          </div>
                        )}
                        <div>
                          <span className="font-semibold text-text-primary block mb-0.5">실행 결과:</span>
                          <p className="text-[11px] bg-slate-50/50 border border-slate-100 p-2 rounded-lg text-slate-600">
                            {log.result}
                          </p>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* 최종 답변 완료 카드 */}
      {agentStatus === "done" && agentResult && (
        <div className="bg-gradient-to-r from-primary/10 to-indigo-500/10 p-5 rounded-2xl border border-primary/20 shadow-[0_4px_12px_rgba(11,87,208,0.03)] flex flex-col gap-3">
          <h3 className="text-xs font-bold text-primary flex items-center">
            <span className="material-symbols-rounded text-xs text-primary mr-1.5">star</span>
            최종 분석 답변
          </h3>
          <p className="text-sm text-text-primary leading-relaxed whitespace-pre-wrap bg-white/70 p-4 border border-white/90 rounded-xl shadow-[0_1px_3px_rgba(0,0,0,0.01)] font-medium">
            {agentResult}
          </p>
        </div>
      )}
    </div>
  );
}
