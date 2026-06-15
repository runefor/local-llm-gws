import { useState, useEffect } from "react";
import { useApp } from "../context/AppContext";

interface Preset {
  id: string;
  name: string;
  description: string;
  ram_gb_required: number;
}

interface LocalModel {
  filename: string;
  name: string;
  preset_id: string | null;
  size_mb: number;
}

export default function LlmConfigPanel() {
  const { 
    llmEndpoint, setLlmEndpoint, 
    llmModel, setLlmModel, 
    handleLlmTest, addLog, backendStatus,
    detectedServers, isDetecting, scanLocalServers
  } = useApp();
  
  const [llmMode, setLlmMode] = useState<"internal" | "external">("internal");
  
  const [presets, setPresets] = useState<Preset[]>([]);
  const [localModels, setLocalModels] = useState<LocalModel[]>([]);
  const [recommendedId, setRecommendedId] = useState<string>("");
  
  // 자동 감지용 로컬 상태
  const [selectedModels, setSelectedModels] = useState<Record<string, string>>({});
  const [showManualConfig, setShowManualConfig] = useState<boolean>(false);
  
  const [downloading, setDownloading] = useState<string | null>(null);
  const [progress, setProgress] = useState<number>(0);
  const [backendOffline, setBackendOffline] = useState<boolean>(false);
  const [isLoading, setIsLoading] = useState<boolean>(true);

  // 내장 서버 프로세스 관리 상태 추가
  const [serverStatus, setServerStatus] = useState<{ running: boolean; model: string | null; endpoint: string | null }>({
    running: false,
    model: null,
    endpoint: null
  });
  const [serverActionLoading, setServerActionLoading] = useState(false);

  // 내장 서버 실행 상태 조회
  const fetchServerStatus = async () => {
    try {
      const res = await fetch("http://localhost:8000/api/llm/server/status");
      if (res.ok) {
        const data = await res.json();
        setServerStatus(data);
      }
    } catch (e) {
      console.error("서버 상태 조회 실패", e);
    }
  };

  const fetchModels = async () => {
    setIsLoading(true);
    try {
      const pRes = await fetch("http://localhost:8000/api/llm/presets");
      if (!pRes.ok) throw new Error("presets API 응답 불량");
      const pData = await pRes.json();
      setPresets(pData.presets || []);
      setRecommendedId(pData.recommended || "");
      
      const mRes = await fetch("http://localhost:8000/api/llm/local_models");
      if (!mRes.ok) throw new Error("local_models API 응답 불량");
      const mData = await mRes.json();
      setLocalModels(mData.models || []);
      
      setBackendOffline(false);
      
      if (mData.models && mData.models.length > 0) {
        // 내장 모델이 있고 llmModel이 외장값이면 내장으로 하나 선택해줌
        if (!mData.models.find((m: any) => m.filename === llmModel)) {
          setLlmModel(mData.models[0].filename);
        }
      }
    } catch (e) {
      console.error("LLM 데이터 로드 실패", e);
      setBackendOffline(true);
    } finally {
      setIsLoading(false);
    }
  };

  // 내장 서버 시작 요청
  const handleStartServer = async () => {
    if (!llmModel) return;
    setServerActionLoading(true);
    addLog(`내장 서버 기동 요청: ${llmModel}`);
    try {
      const res = await fetch("http://localhost:8000/api/llm/server/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ model_filename: llmModel })
      });
      const data = await res.json();
      if (data.status === "started" || data.status === "running") {
        addLog(`내장 서버 기동 완료: ${data.message}`);
        fetchServerStatus();
      } else {
        addLog(`내장 서버 기동 실패: ${data.message}`);
        alert(`서버 기동에 실패했습니다: ${data.message}`);
      }
    } catch (err) {
      addLog("서버 기동 요청 중 에러 발생");
    } finally {
      setServerActionLoading(false);
    }
  };

  // 내장 서버 종료 요청
  const handleStopServer = async () => {
    setServerActionLoading(true);
    addLog("내장 서버 종료 요청");
    try {
      const res = await fetch("http://localhost:8000/api/llm/server/stop", { method: "POST" });
      const data = await res.json();
      if (data.status === "stopped") {
        addLog("내장 서버가 종료되었습니다.");
        fetchServerStatus();
      } else {
        addLog(`내장 서버 종료 실패: ${data.message}`);
      }
    } catch (err) {
      addLog("서버 종료 요청 중 에러 발생");
    } finally {
      setServerActionLoading(false);
    }
  };

  useEffect(() => {
    fetchModels();
    if (backendStatus === "online") {
      fetchServerStatus();
    }
  }, [backendStatus]);

  // 내장 서버 실행 여부 실시간 모니터링 폴링 (3초 간격)
  useEffect(() => {
    let timer: any;
    if (backendStatus === "online") {
      timer = setInterval(() => {
        fetchServerStatus();
      }, 3000);
    }
    return () => clearInterval(timer);
  }, [backendStatus]);

  // 외장 API 선택 시 로컬 LLM 서버 백그라운드 자동 감지 폴링 (2.5초 간격)
  useEffect(() => {
    let timer: any;
    if (llmMode === "external" && backendStatus === "online") {
      scanLocalServers(); // 즉시 실행
      timer = setInterval(() => {
        scanLocalServers();
      }, 2500);
    }
    return () => {
      if (timer) clearInterval(timer);
    };
  }, [llmMode, backendStatus]);

  // 감지된 로컬 서버의 모델 리스트 기본 선택값 매핑
  useEffect(() => {
    if (detectedServers && detectedServers.length > 0) {
      setSelectedModels(prev => {
        const next = { ...prev };
        let updated = false;
        detectedServers.forEach(server => {
          if (server.models && server.models.length > 0 && !next[server.name]) {
            next[server.name] = server.models[0];
            updated = true;
          }
        });
        return updated ? next : prev;
      });
    }
  }, [detectedServers]);

  // 자동 감지된 서버 연결 핸들러
  const handleConnectServer = (server: any) => {
    const modelName = selectedModels[server.name] || (server.models && server.models[0]) || "";
    setLlmEndpoint(server.api_base);
    setLlmModel(modelName);
    addLog(`자동 감지 연결 시도: ${server.name} (${server.api_base}) - 모델: ${modelName}`);
    
    // State 업데이트 레이턴시 우회를 위해 즉시 값 전달하여 검증
    handleLlmTest(server.api_base, modelName);
  };


  // 다운로드 진행상황 폴링
  useEffect(() => {
    let interval: any;
    if (downloading) {
      interval = setInterval(async () => {
        try {
          const res = await fetch(`http://localhost:8000/api/llm/download/progress/${downloading}`);
          if (!res.ok) throw new Error("Progress API 응답 불량");
          const data = await res.json();
          
          if (data.status === "completed") {
            setProgress(100);
            setDownloading(null);
            addLog("로컬 모델 다운로드 완료!");
            fetchModels(); // 새로고침
          } else if (data.status === "error") {
            setDownloading(null);
            addLog(`다운로드 오류: ${data.error}`);
            alert(`다운로드 중 오류가 발생했습니다: ${data.error}`);
          } else {
            setProgress(data.progress || 0);
          }
        } catch (e) {
          console.error("progress polling error", e);
        }
      }, 1000);
    }
    return () => clearInterval(interval);
  }, [downloading]);

  const handleDownload = async (presetId: string) => {
    try {
      setDownloading(presetId);
      setProgress(0);
      addLog(`모델 다운로드 시작: ${presetId}`);
      await fetch("http://localhost:8000/api/llm/download", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ preset_id: presetId })
      });
    } catch (e) {
      addLog("다운로드 요청 실패");
      setDownloading(null);
    }
  };

  const handleDelete = async (filename: string) => {
    if (!window.confirm("이 모델을 삭제하시겠습니까?")) return;
    try {
      await fetch("http://localhost:8000/api/llm/delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ filename })
      });
      addLog(`${filename} 모델이 삭제되었습니다.`);
      fetchModels();
    } catch (e) {
      addLog("삭제 오류 발생");
    }
  };

  if (backendOffline) {
    return (
      <div className="bg-surface rounded-2xl p-6 border border-red-500/20 shadow-sm bg-red-500/5">
        <h2 className="text-base font-semibold mb-3 flex items-center text-red-600 dark:text-red-400">
          <span className="material-symbols-rounded mr-2">wifi_off</span>
          LLM 백엔드 오프라인
        </h2>
        <div className="text-sm text-text-secondary leading-relaxed space-y-3">
          <p>파이썬 백엔드 서버에 연결할 수 없습니다. 백엔드 프로그램이 구동 중인지 확인해 주세요.</p>
          <div className="bg-gray-100 dark:bg-black/30 p-3 rounded border border-surface-variant text-xs font-mono text-text-primary">
            대상 API: http://localhost:8000/api/llm/presets
          </div>
          <button 
            onClick={fetchModels}
            className="mt-2 bg-primary hover:bg-primary/95 text-white px-4 py-2 rounded-full text-xs font-semibold transition cursor-pointer"
          >
            백엔드 다시 연결 시도
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-surface rounded-2xl p-6 border border-surface-variant shadow-sm">
      <h2 className="text-base font-semibold mb-3 flex items-center text-text-primary">
        <span className="material-symbols-rounded mr-2 text-primary">smart_toy</span>
        LLM 엔진 설정
      </h2>
      
      <div className="flex space-x-4 mb-4">
        <label className="flex items-center space-x-2 text-sm cursor-pointer">
          <input 
            type="radio" 
            checked={llmMode === "internal"} 
            onChange={() => setLlmMode("internal")}
            className="text-primary focus:ring-primary"
          />
          <span>내장 로컬 모델 (추천)</span>
        </label>
        <label className="flex items-center space-x-2 text-sm cursor-pointer">
          <input 
            type="radio" 
            checked={llmMode === "external"} 
            onChange={() => setLlmMode("external")}
            className="text-primary focus:ring-primary"
          />
          <span>외부 API (Ollama 등)</span>
        </label>
      </div>

      {isLoading ? (
        <div className="py-8 text-center text-xs text-text-secondary">로딩 중...</div>
      ) : llmMode === "internal" ? (
        <div className="space-y-4">
          <p className="text-xs text-text-secondary leading-relaxed">
            비개발자도 쉽게 사용할 수 있는 인앱 내장 LLM입니다. 오프라인 보안 및 100% 로컬 구동을 보장합니다.
          </p>
          
          <div className="bg-surface-variant/30 p-4 rounded-lg border border-surface-variant/50">
            <h3 className="text-xs font-semibold uppercase mb-2 text-text-secondary">선택된 활성 모델</h3>
            {localModels.length === 0 ? (
              <div className="space-y-1 py-1">
                <p className="text-xs text-amber-600 dark:text-amber-500 font-semibold flex items-center">
                  <span className="material-symbols-rounded mr-1 text-sm">warning</span>
                  다운로드된 로컬 모델이 없습니다.
                </p>
                <p className="text-[11px] text-text-secondary">
                  아래에서 내 PC 사양에 맞는 추천 모델을 다운로드해주세요.
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                <select 
                  value={localModels.find(m => m.filename === llmModel) ? llmModel : (localModels[0]?.filename || "")}
                  onChange={(e) => setLlmModel(e.target.value)}
                  disabled={serverStatus.running}
                  className="w-full bg-white dark:bg-zinc-800 border border-surface-variant rounded px-2.5 py-2 text-sm text-text-primary focus:outline-none focus:border-primary disabled:opacity-60"
                >
                  {localModels.map(m => (
                    <option key={m.filename} value={m.filename}>{m.name} ({m.size_mb} MB)</option>
                  ))}
                </select>

                <div className="pt-2 border-t border-slate-100/60 flex items-center justify-between">
                  <div className="flex items-center gap-1.5">
                    <span className={`w-2.5 h-2.5 rounded-full ${serverStatus.running ? "bg-emerald-500 animate-pulse" : "bg-slate-300"}`} />
                    <span className="text-xs text-text-secondary">
                      {serverStatus.running ? `서버 구동 중` : "서버 꺼짐"}
                    </span>
                  </div>
                  
                  {serverStatus.running ? (
                    <button
                      onClick={handleStopServer}
                      disabled={serverActionLoading}
                      className="text-xs bg-red-50 hover:bg-red-100 text-red-600 border border-red-200/50 font-semibold px-3 py-1.5 rounded-full cursor-pointer disabled:cursor-default transition-all"
                    >
                      {serverActionLoading ? "중지 중..." : "서버 종료"}
                    </button>
                  ) : (
                    <button
                      onClick={handleStartServer}
                      disabled={serverActionLoading || localModels.length === 0}
                      className="text-xs bg-primary hover:bg-[#094cb3] text-white font-semibold px-3 py-1.5 rounded-full cursor-pointer disabled:cursor-default transition-all"
                    >
                      {serverActionLoading ? "구동 중..." : "서버 시작"}
                    </button>
                  )}
                </div>
              </div>
            )}

          </div>

          <div className="mt-4">
            <h3 className="text-xs font-semibold uppercase mb-2 text-text-secondary">다운로드 가능한 모델 목록</h3>
            <div className="space-y-2">
              {presets.map(p => {
                const isDownloaded = localModels.some(m => m.preset_id === p.id);
                const isDownloading = downloading === p.id;
                const isRecommended = recommendedId === p.id;
                
                return (
                  <div key={p.id} className={`p-3 border rounded-lg flex items-center justify-between transition ${isRecommended ? 'border-primary/40 bg-primary/5' : 'border-surface-variant'}`}>
                    <div className="flex-1 pr-4">
                      <div className="font-semibold text-sm flex items-center text-text-primary">
                        {p.name}
                        {isRecommended && <span className="ml-2 text-[10px] bg-primary text-white px-1.5 py-0.5 rounded-full font-bold">내 PC 추천</span>}
                      </div>
                      <div className="text-xs text-text-secondary mt-1">{p.description}</div>
                    </div>
                    <div className="min-w-[120px] text-right flex flex-col items-end">
                      {isDownloading ? (
                        <div className="w-full flex flex-col items-end">
                          <span className="text-xs font-bold text-primary mb-1">{progress}%</span>
                          <div className="w-full bg-gray-200 dark:bg-zinc-700 rounded-full h-2 overflow-hidden">
                            <div className="bg-primary h-full rounded-full transition-all duration-300" style={{ width: `${progress}%` }}></div>
                          </div>
                        </div>
                      ) : isDownloaded ? (
                        <div className="flex items-center space-x-2">
                          <span className="text-xs text-emerald-600 dark:text-emerald-500 font-semibold flex items-center mr-1">
                            <span className="material-symbols-rounded text-sm mr-0.5">check_circle</span>
                            준비 완료
                          </span>
                          <button 
                            onClick={() => handleDelete(localModels.find(m => m.preset_id === p.id)!.filename)}
                            className="text-xs text-red-500 hover:text-red-600 hover:underline px-2 py-1 cursor-pointer"
                          >
                            삭제
                          </button>
                        </div>
                      ) : (
                        <button 
                          onClick={() => handleDownload(p.id)}
                          disabled={downloading !== null}
                          className="text-xs bg-primary hover:bg-primary/90 text-white font-semibold px-4 py-2 rounded-full transition-colors disabled:opacity-50 cursor-pointer"
                        >
                          다운로드
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          <p className="text-xs text-text-secondary leading-relaxed mb-3">
            Ollama, LM Studio 등 실행 중인 외부 로컬 LLM 런타임을 자동으로 감지하여 연결해 줍니다. 
          </p>

          {/* 자동 감지 서버 리스트 */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-semibold uppercase text-text-secondary flex items-center">
                <span className="material-symbols-rounded text-sm mr-1.5 text-primary">explore</span>
                자동 감지된 로컬 서버
              </h3>
              {isDetecting && (
                <span className="text-[10px] text-primary flex items-center font-semibold animate-pulse">
                  <span className="w-1.5 h-1.5 rounded-full bg-primary mr-1 animate-ping" />
                  감지 중...
                </span>
              )}
            </div>

            {detectedServers.length === 0 ? (
              <div className="bg-surface-variant/20 border border-dashed border-surface-variant/80 p-5 rounded-xl text-center">
                <span className="material-symbols-rounded text-2xl text-text-secondary/60 animate-pulse mb-1.5 block">
                  search
                </span>
                <p className="text-xs font-semibold text-text-primary">실행 중인 로컬 LLM 서버를 찾을 수 없습니다.</p>
                <p className="text-[10px] text-text-secondary mt-1 max-w-sm mx-auto">
                  Ollama (기본: 11434), LM Studio (기본: 1234), Jan (기본: 1337) 등이 컴퓨터에 기동되어 있는지 확인해주세요.
                </p>
              </div>
            ) : (
              <div className="space-y-2">
                {detectedServers.map((server) => {
                  const hasModels = server.models && server.models.length > 0;
                  const isCurrentServer = llmEndpoint.startsWith(server.api_base);

                  return (
                    <div 
                      key={server.name} 
                      className={`p-3.5 border rounded-xl flex flex-col md:flex-row md:items-center justify-between gap-3 transition-all duration-200 ${
                        isCurrentServer ? 'border-primary/45 bg-primary/5 shadow-sm' : 'border-surface-variant hover:border-text-secondary/20'
                      }`}
                    >
                      <div className="flex items-start gap-2.5">
                        <div className="bg-primary/10 text-primary p-2 rounded-lg">
                          <span className="material-symbols-rounded text-base block">dns</span>
                        </div>
                        <div>
                          <div className="font-semibold text-sm flex items-center gap-1.5 text-text-primary">
                            {server.name}
                            <span className="text-[9px] bg-emerald-100 text-emerald-700 font-bold px-1.5 py-0.5 rounded-full">
                              ON
                            </span>
                          </div>
                          <div className="text-[11px] text-text-secondary font-mono mt-0.5">{server.url}</div>
                        </div>
                      </div>

                      <div className="flex items-center gap-3.5 ml-0 md:ml-auto">
                        {hasModels ? (
                          <div className="flex flex-col gap-0.5 min-w-[150px]">
                            <label className="text-[9px] uppercase font-bold text-text-secondary tracking-wider">사용 가능한 모델</label>
                            <select
                              value={selectedModels[server.name] || server.models[0]}
                              onChange={(e) => setSelectedModels(prev => ({ ...prev, [server.name]: e.target.value }))}
                              className="bg-white border border-surface-variant rounded-lg px-2.5 py-1.5 text-xs text-text-primary focus:outline-none focus:border-primary font-sans cursor-pointer"
                            >
                              {server.models.map((m: string) => (
                                <option key={m} value={m}>{m}</option>
                              ))}
                            </select>
                          </div>
                        ) : (
                          <div className="text-[11px] text-amber-700 font-semibold bg-amber-50 px-2.5 py-1.5 rounded-lg border border-amber-200/50">
                            로드된 모델이 없습니다.
                          </div>
                        )}

                        <button 
                          onClick={() => handleConnectServer(server)}
                          disabled={!hasModels}
                          className="bg-primary hover:bg-[#094cb3] text-white text-xs font-semibold px-4 py-2 rounded-full transition-colors disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer shadow-sm"
                        >
                          연결
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* 수동 설정 아코디언 */}
          <div className="pt-2 border-t border-slate-100/50 dark:border-zinc-800">
            <button
              onClick={() => setShowManualConfig(!showManualConfig)}
              className="text-xs text-text-secondary hover:text-text-primary font-semibold flex items-center transition cursor-pointer"
            >
              <span className="material-symbols-rounded mr-1 text-sm transition-transform duration-200" style={{ transform: showManualConfig ? 'rotate(90deg)' : 'none' }}>
                chevron_right
              </span>
              수동으로 직접 연결 정보 입력하기
            </button>

            {showManualConfig && (
              <div className="mt-4 space-y-3 p-4 bg-surface-variant/20 rounded-xl border border-surface-variant/40 animate-fadeIn">
                <div>
                  <label className="block text-xs font-semibold text-text-secondary uppercase tracking-wider mb-1.5">API Endpoint URL</label>
                  <input 
                    type="text" 
                    value={llmEndpoint}
                    onChange={(e) => setLlmEndpoint(e.target.value)}
                    className="w-full bg-white dark:bg-zinc-800 border border-surface-variant rounded-lg px-3 py-2 text-xs text-text-primary focus:outline-none focus:border-primary font-mono"
                    placeholder="http://localhost:1234/v1"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-text-secondary uppercase tracking-wider mb-1.5">Model Name</label>
                  <input 
                    type="text" 
                    value={llmModel}
                    onChange={(e) => setLlmModel(e.target.value)}
                    className="w-full bg-white dark:bg-zinc-800 border border-surface-variant rounded-lg px-3 py-2 text-xs text-text-primary focus:outline-none focus:border-primary font-mono"
                    placeholder="gemma-2-9b-it"
                  />
                </div>
                <div className="pt-1">
                  <button 
                    onClick={() => handleLlmTest()}
                    className="w-full bg-white hover:bg-surface-variant/30 text-primary font-semibold py-2 px-4 rounded-lg text-xs transition-colors border border-surface-variant cursor-pointer"
                  >
                    LLM 서버 연결 테스트
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
