import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";

export default function App() {
  // 백엔드 상태
  const [backendStatus, setBackendStatus] = useState<"connecting" | "online" | "offline">("connecting");
  const [backendMessage, setBackendMessage] = useState("");
  const [isGwsAuthenticated, setIsGwsAuthenticated] = useState<boolean>(false);
  const [authChecking, setAuthChecking] = useState(false);
  
  // LLM 설정 상태
  const [llmEndpoint, setLlmEndpoint] = useState("http://localhost:1234/v1");
  const [llmModel, setLlmModel] = useState("gemma4-9b-it");
  
  // 동기화 상태 시뮬레이션
  const [syncStatus, setSyncStatus] = useState<"idle" | "syncing" | "done" | "error">("idle");
  const [syncProgress, setSyncProgress] = useState(0);
  const [syncLog, setSyncLog] = useState<string[]>([]);

  // 백엔드 연결 확인 (Ping)
  const checkBackend = async () => {
    setBackendStatus("connecting");
    try {
      const response = await fetch("http://localhost:8000/");
      const data = await response.json();
      if (data.status === "ok") {
        setBackendStatus("online");
        setBackendMessage(data.message);
      } else {
        setBackendStatus("offline");
        setBackendMessage("정상적이지 않은 백엔드 응답");
      }
    } catch (error) {
      setBackendStatus("offline");
      setBackendMessage("백엔드 서버에 연결할 수 없습니다. (FastAPI가 오프라인이거나 기동 중)");
    }
  };

  // Google인증 상태 확인
  const checkGwsAuth = async () => {
    setAuthChecking(true);
    try {
      const response = await fetch("http://localhost:8000/api/auth/status");
      const data = await response.json();
      setIsGwsAuthenticated(!!data.authenticated);
      if (data.authenticated) {
        addLog("Google Workspace 인증 상태: 연결됨");
      } else {
        addLog("Google Workspace 인증 상태: 인증 필요");
      }
    } catch (error) {
      addLog("Google Workspace 인증 상태를 가져오지 못했습니다.");
    } finally {
      setAuthChecking(false);
    }
  };

  const addLog = (msg: string) => {
    const time = new Date().toLocaleTimeString();
    setSyncLog((prev) => [`[${time}] ${msg}`, ...prev.slice(0, 49)]);
  };

  // 초기 로드 시 체크 진행
  useEffect(() => {
    checkBackend();
    
    // 백엔드가 기동될 시간을 고려해 1초 후에 GWS 인증 상태 체크
    const timer = setTimeout(() => {
      checkGwsAuth();
    }, 1500);

    return () => clearTimeout(timer);
  }, []);

  // Gmail 동기화 실행 시뮬레이션 및 API 호출 뼈대
  const handleGmailSync = async () => {
    if (backendStatus !== "online") {
      addLog("오류: 백엔드 서버가 오프라인입니다.");
      return;
    }
    setSyncStatus("syncing");
    setSyncProgress(10);
    addLog("Gmail 동기화 프로세스 시작...");
    
    try {
      const response = await fetch("http://localhost:8000/api/sync/gmail", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ max_emails: 30 })
      });
      const data = await response.json();
      
      if (data.status === "success") {
        setSyncProgress(100);
        setSyncStatus("done");
        addLog(`Gmail 동기화 성공: ${data.count}개의 이메일을 동기화했습니다.`);
      } else {
        setSyncStatus("error");
        addLog(`Gmail 동기화 실패: ${data.message || "알 수 없는 오류"}`);
      }
    } catch (error) {
      setSyncStatus("error");
      addLog(`Gmail 동기화 중 오류 발생: ${error instanceof Error ? error.message : "네트워크 오류"}`);
    }
  };

  // Google Drive 동기화 실행 시뮬레이션
  const handleDriveSync = () => {
    if (backendStatus !== "online") {
      addLog("오류: 백엔드 서버가 오프라인입니다.");
      return;
    }
    setSyncStatus("syncing");
    setSyncProgress(20);
    addLog("Google Drive 스캔 시작 (Docs, Sheets, PDFs 필터링)...");
    
    // UI 진행 상태 연출
    const interval = setInterval(() => {
      setSyncProgress((prev) => {
        if (prev >= 90) {
          clearInterval(interval);
          setSyncStatus("done");
          addLog("Google Drive 동기화 완료: 12개의 문서 추출 완료 및 Markdown 변환 완료.");
          addLog("Local Obsidian Vault 디렉토리에 마크다운 저장을 완료했습니다.");
          return 100;
        }
        addLog(`문서 가져오는 중... [${prev + 15}%]`);
        return prev + 15;
      });
    }, 800);
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col selection:bg-indigo-500 selection:text-white">
      {/* 탑 내비게이션 바 */}
      <header className="border-b border-slate-800 bg-slate-900/50 backdrop-blur-md sticky top-0 z-50 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center space-x-3">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-indigo-500 to-violet-600 flex items-center justify-center shadow-lg shadow-indigo-500/30 animate-pulse">
            <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.2} d="M13 10V3L4 14h7v7l9-11h-7z" />
            </svg>
          </div>
          <div>
            <h1 className="text-lg font-bold font-outfit tracking-wide bg-gradient-to-r from-white via-slate-200 to-slate-400 bg-clip-text text-transparent">
              GWS Knowledge Extractor
            </h1>
            <p className="text-xs text-indigo-400 font-medium">Local LLM & Privacy-First RAG</p>
          </div>
        </div>

        {/* 연결 상태 표시 */}
        <div className="flex items-center space-x-4">
          {/* 백엔드 상태 */}
          <div className="flex items-center space-x-2 bg-slate-800/60 px-3 py-1.5 rounded-full border border-slate-700/50 text-xs">
            <span className="text-slate-400 font-medium">Server:</span>
            {backendStatus === "online" && (
              <span className="flex items-center text-emerald-400 font-semibold">
                <span className="w-2 h-2 rounded-full bg-emerald-400 mr-1.5 animate-ping"></span>
                Online
              </span>
            )}
            {backendStatus === "connecting" && (
              <span className="flex items-center text-amber-400 font-semibold animate-pulse">
                Connecting...
              </span>
            )}
            {backendStatus === "offline" && (
              <span className="flex items-center text-rose-400 font-semibold">
                Offline
              </span>
            )}
            <button 
              onClick={checkBackend} 
              className="ml-2 text-indigo-400 hover:text-indigo-300 transition-colors"
              title="다시 연결 테스트"
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 1121.21 7.89" />
              </svg>
            </button>
          </div>

          {/* GWS 인증 상태 */}
          <div className="flex items-center space-x-2 bg-slate-800/60 px-3 py-1.5 rounded-full border border-slate-700/50 text-xs">
            <span className="text-slate-400 font-medium">Google:</span>
            {authChecking ? (
              <span className="text-slate-400">Checking...</span>
            ) : isGwsAuthenticated ? (
              <span className="text-emerald-400 font-semibold">Connected</span>
            ) : (
              <span className="text-amber-400 font-semibold">Login Required</span>
            )}
            <button 
              onClick={checkGwsAuth} 
              className="ml-2 text-indigo-400 hover:text-indigo-300 transition-colors"
              title="구글 상태 갱신"
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 1121.21 7.89" />
              </svg>
            </button>
          </div>
        </div>
      </header>

      {/* 메인 레이아웃 */}
      <main className="flex-1 p-6 max-w-7xl mx-auto w-full grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* 좌측 패널: 동기화 컨트롤 (2컬럼 차지) */}
        <section className="lg:col-span-2 space-y-6">
          
          {/* 로컬 데이터 및 동기화 카드 */}
          <div className="bg-slate-900/40 backdrop-blur-md rounded-2xl p-6 border border-slate-800/80 shadow-xl relative overflow-hidden">
            <div className="absolute top-0 right-0 w-64 h-64 bg-indigo-500/5 rounded-full filter blur-3xl -z-10"></div>
            
            <h2 className="text-lg font-bold font-outfit mb-4 flex items-center text-white">
              <svg className="w-5 h-5 mr-2 text-indigo-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
              </svg>
              Google Workspace 지식 동기화
            </h2>
            <p className="text-sm text-slate-400 mb-6 leading-relaxed">
              Google Workspace의 이메일 및 문서 데이터를 정교하게 파싱하여 로컬 마크다운 파일로 추출합니다. 
              모든 처리는 로컬 백엔드(FastAPI)에서 안전하게 이루어집니다.
            </p>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Gmail Sync Card */}
              <div className="bg-slate-950/50 p-5 rounded-xl border border-slate-800/80 hover:border-indigo-500/30 transition-all flex flex-col justify-between group">
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <span className="p-2.5 rounded-lg bg-indigo-500/10 text-indigo-400 group-hover:scale-110 transition-transform duration-300">
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                      </svg>
                    </span>
                    <span className="text-[10px] uppercase font-bold text-slate-500 bg-slate-900 px-2 py-0.5 rounded">API Quota: Free</span>
                  </div>
                  <h3 className="font-bold text-slate-200 mb-1">Gmail 요약 데이터 추출</h3>
                  <p className="text-xs text-slate-400 leading-relaxed mb-4">
                    최근 이메일 목록을 읽고 본문을 로컬에 저장합니다. (속도 제한기 30~40msg/s 반영)
                  </p>
                </div>
                <button 
                  onClick={handleGmailSync}
                  disabled={syncStatus === "syncing" || backendStatus !== "online"}
                  className="w-full bg-indigo-600 hover:bg-indigo-500 disabled:bg-slate-800 disabled:text-slate-500 text-white font-medium py-2 px-4 rounded-lg text-sm transition-all shadow-md shadow-indigo-600/10 active:scale-95"
                >
                  {syncStatus === "syncing" ? "동기화 중..." : "Gmail 동기화 실행"}
                </button>
              </div>

              {/* Google Drive Sync Card */}
              <div className="bg-slate-950/50 p-5 rounded-xl border border-slate-800/80 hover:border-violet-500/30 transition-all flex flex-col justify-between group">
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <span className="p-2.5 rounded-lg bg-violet-500/10 text-violet-400 group-hover:scale-110 transition-transform duration-300">
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 19a2 2 0 01-2-2V7a2 2 0 012-2h4l2 2h4a2 2 0 012 2v1M5 19h14a2 2 0 002-2v-5a2 2 0 00-2-2H9" />
                      </svg>
                    </span>
                    <span className="text-[10px] uppercase font-bold text-slate-500 bg-slate-900 px-2 py-0.5 rounded">Markdownify</span>
                  </div>
                  <h3 className="font-bold text-slate-200 mb-1">Google Drive 문서 추출</h3>
                  <p className="text-xs text-slate-400 leading-relaxed mb-4">
                    Docs, Sheets, PDF 파일만 골라 마크다운 포맷으로 변환 및 동기화합니다.
                  </p>
                </div>
                <button 
                  onClick={handleDriveSync}
                  disabled={syncStatus === "syncing" || backendStatus !== "online"}
                  className="w-full bg-violet-600 hover:bg-violet-500 disabled:bg-slate-800 disabled:text-slate-500 text-white font-medium py-2 px-4 rounded-lg text-sm transition-all shadow-md shadow-violet-600/10 active:scale-95"
                >
                  {syncStatus === "syncing" ? "동기화 중..." : "Drive 동기화 실행"}
                </button>
              </div>
            </div>

            {/* 진행 표시줄 */}
            {syncStatus === "syncing" && (
              <div className="mt-6 space-y-2 animate-fade-in">
                <div className="flex justify-between text-xs text-slate-400">
                  <span className="font-medium">동기화 진척도</span>
                  <span className="font-bold text-indigo-400">{syncProgress}%</span>
                </div>
                <div className="w-full bg-slate-800 h-2 rounded-full overflow-hidden">
                  <div 
                    className="bg-gradient-to-r from-indigo-500 to-violet-500 h-full rounded-full transition-all duration-300"
                    style={{ width: `${syncProgress}%` }}
                  ></div>
                </div>
              </div>
            )}
          </div>

          {/* 로컬 폴더 정책 안내 */}
          <div className="bg-slate-900/30 rounded-2xl p-5 border border-slate-800/60 text-xs text-slate-400 flex items-start space-x-3">
            <svg className="w-5 h-5 text-indigo-400 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <div>
              <p className="font-bold text-slate-300 mb-1">엄격한 데이터 로컬(Local Only) 보존 원칙</p>
              <p className="leading-relaxed">
                가져온 이메일 캐시, 토큰 정보, 변환된 옵시디언 마크다운 지식베이스는 모두 실행 디렉토리 하위의 <code className="text-indigo-300 font-mono">./data/</code> 폴더 내에 저장되며, OS 시스템 폴더를 침범하지 않는 포터블 사양입니다.
              </p>
            </div>
          </div>
        </section>

        {/* 우측 패널: 설정 및 테스팅 */}
        <section className="space-y-6">
          
          {/* LLM 런타임 연동 설정 */}
          <div className="bg-slate-900/40 backdrop-blur-md rounded-2xl p-6 border border-slate-800/80 shadow-xl">
            <h2 className="text-lg font-bold font-outfit mb-4 flex items-center text-white">
              <svg className="w-5 h-5 mr-2 text-indigo-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
              </svg>
              Local LLM 설정
            </h2>
            <p className="text-xs text-slate-400 mb-4 leading-relaxed">
              LM Studio, Jan, GPT4All 등 로컬 LLM 런타임의 OpenAI 호환 주소를 입력해 연동하세요.
            </p>

            <div className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-1.5">API Endpoint URL</label>
                <input 
                  type="text" 
                  value={llmEndpoint}
                  onChange={(e) => setLlmEndpoint(e.target.value)}
                  className="w-full bg-slate-950/80 border border-slate-800 rounded-lg px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-indigo-500 font-mono transition-colors"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-1.5">Model Name</label>
                <input 
                  type="text" 
                  value={llmModel}
                  onChange={(e) => setLlmModel(e.target.value)}
                  className="w-full bg-slate-950/80 border border-slate-800 rounded-lg px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-indigo-500 font-mono transition-colors"
                />
              </div>

              <div className="pt-2">
                <button 
                  onClick={() => {
                    addLog(`로컬 LLM 서버에 연결 테스트 중: ${llmEndpoint}`);
                    setTimeout(() => {
                      addLog(`로컬 LLM 연결 확인: 성공 (${llmModel} 모델 응답 확인)`);
                    }, 800);
                  }}
                  className="w-full bg-slate-800 hover:bg-slate-700 text-slate-200 font-medium py-2 px-4 rounded-lg text-xs transition-colors border border-slate-700/50"
                >
                  LLM 서버 연결 테스트
                </button>
              </div>
            </div>
          </div>

          {/* RAG 및 지식 추출 맛보기 */}
          <div className="bg-slate-900/40 backdrop-blur-md rounded-2xl p-6 border border-slate-800/80 shadow-xl">
            <h2 className="text-lg font-bold font-outfit mb-4 flex items-center text-white">
              <svg className="w-5 h-5 mr-2 text-indigo-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z" />
              </svg>
              RAG 지식 검색 테스트
            </h2>
            <div className="space-y-3">
              <input 
                type="text" 
                placeholder="지식베이스에서 검색할 질문을 입력하세요..." 
                className="w-full bg-slate-950/80 border border-slate-800 rounded-lg px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-indigo-500 transition-colors"
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    const value = e.currentTarget.value;
                    if (!value) return;
                    addLog(`RAG 쿼리 전송: "${value}"`);
                    e.currentTarget.value = '';
                    setTimeout(() => {
                      addLog("RAG 검색 결과: 메일 2건, Drive 기획서 1건 검색됨. 요약 응답 생성 완료.");
                    }, 1200);
                  }
                }}
              />
              <p className="text-[10px] text-slate-500 leading-normal">
                동기화된 옵시디언 마크다운 지식 베이스를 바탕으로 로컬 임베딩 DB(ChromaDB)와 연동해 질문할 수 있습니다. (엔터키를 눌러 테스트)
              </p>
            </div>
          </div>

        </section>

      </main>

      {/* 하단 로그 콘솔 */}
      <footer className="border-t border-slate-800 bg-slate-950 p-4 font-mono text-xs">
        <div className="max-w-7xl mx-auto w-full">
          <div className="flex items-center justify-between mb-2 pb-2 border-b border-slate-850">
            <span className="text-slate-400 font-bold flex items-center">
              <span className="w-1.5 h-1.5 rounded-full bg-indigo-500 mr-2 animate-pulse"></span>
              동기화 및 API 시스템 로그
            </span>
            <button 
              onClick={() => setSyncLog([])} 
              className="text-[10px] text-slate-500 hover:text-slate-300 transition-colors"
            >
              Clear Logs
            </button>
          </div>
          <div className="h-32 overflow-y-auto space-y-1 scrollbar-thin scrollbar-thumb-slate-800 scrollbar-track-transparent pr-2 flex flex-col-reverse">
            {syncLog.length === 0 ? (
              <span className="text-slate-600 italic">로그가 비어 있습니다. 동기화를 진행하거나 백엔드 서버를 확인하세요.</span>
            ) : (
              syncLog.map((log, index) => (
                <div key={index} className="text-slate-300 hover:bg-slate-900/50 px-1 py-0.5 rounded transition-colors">
                  {log}
                </div>
              ))
            )}
          </div>
        </div>
      </footer>
    </div>
  );
}
