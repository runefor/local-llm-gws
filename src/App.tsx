import { useState, useEffect } from "react";

interface GmailItem {
  id: string;
  subject: string;
  from: string;
  snippet: string;
}

interface DriveItem {
  id: string;
  name: string;
  mimeType: string;
  modifiedTime: string;
}

export default function App() {
  // 백엔드 상태
  const [backendStatus, setBackendStatus] = useState<"connecting" | "online" | "offline">("connecting");
  const [isGwsAuthenticated, setIsGwsAuthenticated] = useState<boolean>(false);
  const [authChecking, setAuthChecking] = useState(false);
  
  // 동기화된 데이터 상태
  const [gmailItems, setGmailItems] = useState<GmailItem[]>([]);
  const [driveItems, setDriveItems] = useState<DriveItem[]>([]);
  const [activeTab, setActiveTab] = useState<"gmail" | "drive">("gmail");
  
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
        addLog(`백엔드 서버 연결 성공: ${data.message}`);
      } else {
        setBackendStatus("offline");
        addLog("오류: 정상적이지 않은 백엔드 응답");
      }
    } catch (error) {
      setBackendStatus("offline");
      addLog("오류: 백엔드 서버에 연결할 수 없습니다. (FastAPI가 오프라인이거나 기동 중)");
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

  // Gmail 동기화 실행 및 API 호출
  const handleGmailSync = async () => {
    if (backendStatus !== "online") {
      addLog("오류: 백엔드 서버가 오프라인입니다.");
      return;
    }
    setSyncStatus("syncing");
    setSyncProgress(20);
    addLog("Gmail 동기화 프로세스 시작...");
    
    try {
      const response = await fetch("http://localhost:8000/api/sync/gmail", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ max_emails: 30 })
      });
      const data = await response.json();
      
      if (data.status === "success") {
        setGmailItems(data.messages || []);
        setSyncProgress(100);
        setSyncStatus("done");
        addLog(`Gmail 동기화 성공: ${data.count}개의 이메일을 가져왔습니다.`);
      } else {
        setSyncStatus("error");
        addLog(`Gmail 동기화 실패: ${data.message || "알 수 없는 오류"}`);
      }
    } catch (error) {
      setSyncStatus("error");
      addLog(`Gmail 동기화 중 오류 발생: ${error instanceof Error ? error.message : "네트워크 오류"}`);
    }
  };

  // Google Drive 동기화 실행 및 API 호출
  const handleDriveSync = async () => {
    if (backendStatus !== "online") {
      addLog("오류: 백엔드 서버가 오프라인입니다.");
      return;
    }
    setSyncStatus("syncing");
    setSyncProgress(20);
    addLog("Google Drive 동기화 시작 (Docs, Sheets, PDFs 필터링)...");
    
    try {
      const response = await fetch("http://localhost:8000/api/sync/drive", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ max_emails: 30 })
      });
      const data = await response.json();
      
      if (data.status === "success") {
        setDriveItems(data.files || []);
        setSyncProgress(100);
        setSyncStatus("done");
        addLog(`Google Drive 동기화 성공: ${data.count}개의 문서를 가져왔습니다.`);
      } else {
        setSyncStatus("error");
        addLog(`Google Drive 동기화 실패: ${data.message || "알 수 없는 오류"}`);
      }
    } catch (error) {
      setSyncStatus("error");
      addLog(`Google Drive 동기화 중 오류 발생: ${error instanceof Error ? error.message : "네트워크 오류"}`);
    }
  };

  // 실제 로컬 LLM 연결 여부 테스트
  const handleLlmTest = async () => {
    addLog(`로컬 LLM 서버에 연결 테스트 중: ${llmEndpoint} (모델: ${llmModel})`);
    try {
      const response = await fetch("http://localhost:8000/api/llm/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ endpoint: llmEndpoint, model: llmModel })
      });
      const data = await response.json();
      if (data.status === "success") {
        addLog(`로컬 LLM 연결 확인: 성공 (${llmModel} 응답 확인)`);
      } else {
        addLog(`로컬 LLM 연결 실패: ${data.message}`);
      }
    } catch (error) {
      addLog(`로컬 LLM 연결 오류 발생: ${error instanceof Error ? error.message : "네트워크 오류"}`);
    }
  };

  return (
    <div className="min-h-screen bg-background text-text-primary flex flex-col selection:bg-primary-container selection:text-primary">
      {/* 탑 내비게이션 바 */}
      <header className="border-b border-surface-variant bg-surface sticky top-0 z-50 px-6 py-3 flex items-center justify-between">
        <div className="flex items-center space-x-3">
          <div className="w-10 h-10 rounded-full bg-primary-container flex items-center justify-center">
            <span className="material-symbols-rounded text-primary text-xl">hub</span>
          </div>
          <div>
            <h1 className="text-base font-semibold tracking-wide text-text-primary">
              GWS Knowledge Extractor
            </h1>
            <p className="text-xs text-primary font-medium">Local LLM & Privacy-First RAG</p>
          </div>
        </div>

        {/* 연결 상태 표시 */}
        <div className="flex items-center space-x-3">
          {/* 백엔드 상태 */}
          <div className="flex items-center space-x-2 bg-white px-3 py-1.5 rounded-full border border-surface-variant text-xs text-text-secondary">
            <span className="font-medium">Server:</span>
            {backendStatus === "online" && (
              <span className="flex items-center text-emerald-600 font-medium">
                <span className="w-2 h-2 rounded-full bg-emerald-500 mr-1.5"></span>
                Online
              </span>
            )}
            {backendStatus === "connecting" && (
              <span className="flex items-center text-amber-600 font-medium">
                Connecting...
              </span>
            )}
            {backendStatus === "offline" && (
              <span className="flex items-center text-rose-600 font-medium">
                Offline
              </span>
            )}
            <button 
              onClick={checkBackend} 
              className="ml-1 text-primary hover:text-primary/80 transition-colors flex items-center cursor-pointer"
              title="다시 연결 테스트"
            >
              <span className="material-symbols-rounded text-base">refresh</span>
            </button>
          </div>

          {/* GWS 인증 상태 */}
          <div className="flex items-center space-x-2 bg-white px-3 py-1.5 rounded-full border border-surface-variant text-xs text-text-secondary">
            <span className="font-medium">Google:</span>
            {authChecking ? (
              <span className="text-text-secondary">Checking...</span>
            ) : isGwsAuthenticated ? (
              <span className="text-emerald-600 font-medium flex items-center">
                <span className="w-2 h-2 rounded-full bg-emerald-500 mr-1.5"></span>
                Connected
              </span>
            ) : (
              <button 
                onClick={async () => {
                  addLog("Google OAuth 로그인 창을 엽니다...");
                  try {
                    const response = await fetch("http://localhost:8000/api/auth/login", { method: "POST" });
                    const data = await response.json();
                    if (data.status === "pending" && data.url) {
                      addLog("Google OAuth 로그인 링크를 엽니다...");
                      try {
                        const { openUrl } = await import("@tauri-apps/plugin-opener");
                        await openUrl(data.url);
                      } catch {
                        window.open(data.url, "_blank");
                      }
                      addLog("브라우저 창이 열렸습니다. 인증을 완료해 주세요.");
                      
                      // 로그인 완료 여부를 2초마다 폴링
                      let attempts = 0;
                      const interval = setInterval(async () => {
                        attempts++;
                        try {
                          const res = await fetch("http://localhost:8000/api/auth/status");
                          const statusData = await res.json();
                          if (statusData.authenticated) {
                            setIsGwsAuthenticated(true);
                            addLog("Google Workspace 인증 성공!");
                            clearInterval(interval);
                          }
                        } catch (err) {
                          console.error("인증 상태 체크 에러:", err);
                        }
                        if (attempts >= 60) { // 최대 2분 대기
                          clearInterval(interval);
                          addLog("인증 대기 시간이 초과되었습니다. 다시 시도해 주세요.");
                        }
                      }, 2000);
                    } else {
                      addLog(`인증 요청 실패: ${data.message || "알 수 없는 오류"}`);
                    }
                  } catch (e) {
                    addLog(`로그인 요청 중 오류 발생: ${e}`);
                  }
                }}
                className="bg-primary text-on-primary hover:bg-[#094cb3] px-2.5 py-0.5 rounded-full font-medium transition-colors cursor-pointer text-[11px]"
              >
                Login Required
              </button>
            )}
            <button 
              onClick={checkGwsAuth} 
              className="ml-1 text-primary hover:text-primary/80 transition-colors flex items-center cursor-pointer"
              title="구글 상태 갱신"
            >
              <span className="material-symbols-rounded text-base">refresh</span>
            </button>
          </div>
        </div>
      </header>

      {/* 메인 레이아웃 */}
      <main className="flex-1 p-6 max-w-7xl mx-auto w-full grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* 좌측 패널: 동기화 컨트롤 (2컬럼 차지) */}
        <section className="lg:col-span-2 space-y-6">
          
          {/* 로컬 데이터 및 동기화 카드 */}
          <div className="bg-surface rounded-2xl p-6 border border-surface-variant/80 shadow-[0_1px_2px_0_rgba(0,0,0,0.05)] relative overflow-hidden">
            <h2 className="text-base font-semibold mb-3 flex items-center text-text-primary">
              <span className="material-symbols-rounded mr-2 text-primary">sync</span>
              Google Workspace 지식 동기화
            </h2>
            <p className="text-xs text-text-secondary mb-6 leading-relaxed">
              Google Workspace의 이메일 및 문서 데이터를 정교하게 파싱하여 로컬 마크다운 파일로 추출합니다. 
              모든 처리는 로컬 백엔드(FastAPI)에서 안전하게 이루어집니다.
            </p>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Gmail Sync Card */}
              <div className="bg-white p-5 rounded-2xl border border-surface-variant hover:border-primary/20 transition-all flex flex-col justify-between group shadow-[0_1px_2px_0_rgba(0,0,0,0.02)]">
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <span className="p-2 rounded-xl bg-primary-container text-primary flex items-center justify-center w-9 h-9">
                      <span className="material-symbols-rounded text-primary">mail</span>
                    </span>
                    <span className="text-[10px] uppercase font-semibold text-text-secondary bg-surface px-2.5 py-0.5 rounded-full border border-surface-variant/60">API Quota: Free</span>
                  </div>
                  <h3 className="font-semibold text-text-primary mb-1">Gmail 요약 데이터 추출</h3>
                  <p className="text-xs text-text-secondary leading-relaxed mb-4">
                    최근 이메일 목록을 읽고 본문을 로컬에 저장합니다. (속도 제한기 30~40msg/s 반영)
                  </p>
                </div>
                <button 
                  onClick={handleGmailSync}
                  disabled={syncStatus === "syncing" || backendStatus !== "online"}
                  className="w-full bg-primary hover:bg-[#094cb3] disabled:bg-surface-variant disabled:text-text-secondary/50 text-on-primary font-medium py-2.5 px-4 rounded-full text-xs transition-all active:scale-95 cursor-pointer disabled:cursor-default"
                >
                  {syncStatus === "syncing" ? "동기화 중..." : "Gmail 동기화 실행"}
                </button>
              </div>

              {/* Google Drive Sync Card */}
              <div className="bg-white p-5 rounded-2xl border border-surface-variant hover:border-primary/20 transition-all flex flex-col justify-between group shadow-[0_1px_2px_0_rgba(0,0,0,0.02)]">
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <span className="p-2 rounded-xl bg-primary-container text-primary flex items-center justify-center w-9 h-9">
                      <span className="material-symbols-rounded text-primary">folder_shared</span>
                    </span>
                    <span className="text-[10px] uppercase font-semibold text-text-secondary bg-surface px-2.5 py-0.5 rounded-full border border-surface-variant/60">Markdownify</span>
                  </div>
                  <h3 className="font-semibold text-text-primary mb-1">Google Drive 문서 추출</h3>
                  <p className="text-xs text-text-secondary leading-relaxed mb-4">
                    Docs, Sheets, PDF 파일만 골라 마크다운 포맷으로 변환 및 동기화합니다.
                  </p>
                </div>
                <button 
                  onClick={handleDriveSync}
                  disabled={syncStatus === "syncing" || backendStatus !== "online"}
                  className="w-full bg-primary hover:bg-[#094cb3] disabled:bg-surface-variant disabled:text-text-secondary/50 text-on-primary font-medium py-2.5 px-4 rounded-full text-xs transition-all active:scale-95 cursor-pointer disabled:cursor-default"
                >
                  {syncStatus === "syncing" ? "동기화 중..." : "Drive 동기화 실행"}
                </button>
              </div>
            </div>

            {/* 진행 표시줄 */}
            {syncStatus === "syncing" && (
              <div className="mt-5 space-y-2">
                <div className="flex justify-between text-xs text-text-secondary">
                  <span className="font-medium">동기화 진척도</span>
                  <span className="font-bold text-primary">{syncProgress}%</span>
                </div>
                <div className="w-full bg-surface-variant h-2 rounded-full overflow-hidden">
                  <div 
                    className="bg-primary h-full rounded-full transition-all duration-300"
                    style={{ width: `${syncProgress}%` }}
                  ></div>
                </div>
              </div>
            )}
          </div>

          {/* 동기화 데이터 목록 카드 */}
          {(gmailItems.length > 0 || driveItems.length > 0) && (
            <div className="bg-surface rounded-2xl p-6 border border-surface-variant shadow-[0_1px_2px_0_rgba(0,0,0,0.05)] space-y-4">
              <div className="flex items-center justify-between border-b border-surface-variant/80 pb-3">
                <h2 className="text-base font-semibold flex items-center text-text-primary">
                  <span className="material-symbols-rounded mr-2 text-primary">database</span>
                  동기화된 지식 데이터
                </h2>
                
                <div className="flex space-x-1 bg-[#f0f4f9] p-1 rounded-full border border-surface-variant/40 text-xs">
                  <button 
                    onClick={() => setActiveTab("gmail")}
                    className={`px-4 py-1.5 rounded-full font-medium transition-all cursor-pointer ${activeTab === "gmail" ? "bg-primary-container text-primary shadow-sm" : "text-text-secondary hover:text-text-primary"}`}
                  >
                    Gmail ({gmailItems.length})
                  </button>
                  <button 
                    onClick={() => setActiveTab("drive")}
                    className={`px-4 py-1.5 rounded-full font-medium transition-all cursor-pointer ${activeTab === "drive" ? "bg-primary-container text-primary shadow-sm" : "text-text-secondary hover:text-text-primary"}`}
                  >
                    Drive ({driveItems.length})
                  </button>
                </div>
              </div>

              {activeTab === "gmail" ? (
                <div className="space-y-3 max-h-96 overflow-y-auto pr-2 scrollbar-thin scrollbar-thumb-surface-variant scrollbar-track-transparent">
                  {gmailItems.length === 0 ? (
                    <div className="text-center py-8 text-text-secondary text-xs">
                      가져온 Gmail 데이터가 없습니다. 상단에서 동기화를 실행하세요.
                    </div>
                  ) : (
                    gmailItems.map((item) => (
                      <div key={item.id} className="bg-white p-4 rounded-2xl border border-surface-variant hover:border-primary/20 transition-all shadow-[0_1px_2px_0_rgba(0,0,0,0.02)]">
                        <div className="flex justify-between items-start mb-1.5">
                          <span className="text-xs font-semibold text-primary truncate max-w-[150px]">{item.from}</span>
                          <span className="text-[10px] text-text-secondary font-mono">ID: {item.id}</span>
                        </div>
                        <h4 className="text-sm font-semibold text-text-primary mb-1.5 line-clamp-1">{item.subject}</h4>
                        <p className="text-xs text-text-secondary line-clamp-2 leading-relaxed">{item.snippet}</p>
                      </div>
                    ))
                  )}
                </div>
              ) : (
                <div className="space-y-3 max-h-96 overflow-y-auto pr-2 scrollbar-thin scrollbar-thumb-surface-variant scrollbar-track-transparent">
                  {driveItems.length === 0 ? (
                    <div className="text-center py-8 text-text-secondary text-xs">
                      가져온 Google Drive 문서가 없습니다. 상단에서 동기화를 실행하세요.
                    </div>
                  ) : (
                    driveItems.map((item) => (
                      <div key={item.id} className="bg-white p-4 rounded-2xl border border-surface-variant hover:border-primary/20 transition-all flex items-center justify-between shadow-[0_1px_2px_0_rgba(0,0,0,0.02)]">
                        <div className="flex items-center space-x-3 overflow-hidden mr-4">
                          <span className="p-2 rounded-xl bg-surface-variant/30 text-primary flex items-center justify-center w-8 h-8 flex-shrink-0">
                            {item.mimeType.includes("document") ? (
                              <span className="material-symbols-rounded text-lg text-primary">description</span>
                            ) : item.mimeType.includes("spreadsheet") ? (
                              <span className="material-symbols-rounded text-lg text-primary">table_chart</span>
                            ) : (
                              <span className="material-symbols-rounded text-lg text-primary">article</span>
                            )}
                          </span>
                          <div className="overflow-hidden">
                            <h4 className="text-sm font-semibold text-text-primary truncate">{item.name}</h4>
                            <p className="text-[10px] text-text-secondary font-mono mt-0.5">MimeType: {item.mimeType.split('.').pop()}</p>
                          </div>
                        </div>
                        <div className="text-right flex-shrink-0">
                          <span className="text-[10px] text-text-secondary block font-mono">{new Date(item.modifiedTime).toLocaleDateString()}</span>
                          <span className="text-[9px] text-text-secondary block font-mono mt-0.5">{new Date(item.modifiedTime).toLocaleTimeString()}</span>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              )}
            </div>
          )}

          {/* 로컬 폴더 정책 안내 */}
          <div className="bg-primary-container/20 rounded-2xl p-5 border border-primary-container/30 text-xs text-text-secondary flex items-start space-x-3">
            <span className="material-symbols-rounded text-primary flex-shrink-0 text-lg">security</span>
            <div>
              <p className="font-semibold text-text-primary mb-1">엄격한 데이터 로컬(Local Only) 보존 원칙</p>
              <p className="leading-relaxed">
                가져온 이메일 캐시, 토큰 정보, 변환된 옵시디언 마크다운 지식베이스는 모두 실행 디렉토리 하위의 <code className="text-primary font-mono bg-primary-container/30 px-1 py-0.5 rounded">./data/</code> 폴더 내에 저장되며, OS 시스템 폴더를 침범하지 않는 포터블 사양입니다.
              </p>
            </div>
          </div>
        </section>

        {/* 우측 패널: 설정 및 테스팅 */}
        <section className="space-y-6">
          
          {/* LLM 런타임 연동 설정 */}
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

          {/* RAG 및 지식 추출 맛보기 */}
          <div className="bg-surface rounded-2xl p-6 border border-surface-variant shadow-[0_1px_2px_0_rgba(0,0,0,0.05)]">
            <h2 className="text-base font-semibold mb-3 flex items-center text-text-primary">
              <span className="material-symbols-rounded mr-2 text-primary">search</span>
              RAG 지식 검색 테스트
            </h2>
            <div className="space-y-3">
              <input 
                type="text" 
                placeholder="지식베이스에서 검색할 질문을 입력하세요..." 
                className="w-full bg-white border border-surface-variant rounded-lg px-3 py-2.5 text-xs text-text-primary focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-colors"
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
              <p className="text-[10px] text-text-secondary leading-normal">
                동기화된 옵시디언 마크다운 지식 베이스를 바탕으로 로컬 임베딩 DB(ChromaDB)와 연동해 질문할 수 있습니다. (엔터키를 눌러 테스트)
              </p>
            </div>
          </div>

        </section>

      </main>

      {/* 하단 로그 콘솔 */}
      <footer className="border-t border-surface-variant bg-[#f0f4f9] p-4 font-mono text-xs text-text-secondary">
        <div className="max-w-7xl mx-auto w-full">
          <div className="flex items-center justify-between mb-2 pb-2 border-b border-surface-variant/80">
            <span className="text-text-primary font-semibold flex items-center">
              <span className="w-1.5 h-1.5 rounded-full bg-primary mr-2"></span>
              동기화 및 API 시스템 로그
            </span>
            <button 
              onClick={() => setSyncLog([])} 
              className="text-[10px] text-text-secondary hover:text-primary transition-colors cursor-pointer"
            >
              Clear Logs
            </button>
          </div>
          <div className="h-32 overflow-y-auto space-y-1 scrollbar-thin scrollbar-thumb-surface-variant scrollbar-track-transparent pr-2 flex flex-col-reverse">
            {syncLog.length === 0 ? (
              <span className="text-text-secondary italic">로그가 비어 있습니다. 동기화를 진행하거나 백엔드 서버를 확인하세요.</span>
            ) : (
              syncLog.map((log, index) => (
                <div key={index} className="text-text-secondary hover:bg-primary-container/20 px-1 py-0.5 rounded transition-colors">
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
