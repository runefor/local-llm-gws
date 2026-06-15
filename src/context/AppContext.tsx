import React, { createContext, useContext, useState, useEffect } from "react";

export interface GmailItem {
  id: string;
  subject: string;
  from: string;
  snippet: string;
}

export interface DriveItem {
  id: string;
  name: string;
  mimeType: string;
  modifiedTime: string;
}

export interface AgentTurnLog {
  turn: number;
  thought: string;
  action: string;
  arguments: any;
  result: string;
  state?: {
    curated_evidence: any[];
    verification: any[];
    search_history: string[];
  };
}

interface AppContextType {
  backendStatus: "connecting" | "online" | "offline";
  isGwsAuthenticated: boolean;
  authChecking: boolean;
  gmailItems: GmailItem[];
  driveItems: DriveItem[];
  activeTab: "gmail" | "drive";
  setActiveTab: (tab: "gmail" | "drive") => void;
  llmEndpoint: string;
  setLlmEndpoint: (endpoint: string) => void;
  llmModel: string;
  setLlmModel: (model: string) => void;
  syncStatus: "idle" | "syncing" | "done" | "error";
  syncProgress: number;
  syncLog: string[];
  setSyncLog: React.Dispatch<React.SetStateAction<string[]>>;
  checkBackend: () => Promise<void>;
  checkGwsAuth: () => Promise<void>;
  handleGmailSync: () => Promise<void>;
  handleDriveSync: () => Promise<void>;
  handleLlmTest: () => Promise<void>;
  addLog: (msg: string) => void;
  triggerGoogleLogin: () => Promise<void>;
  
  // 에이전트 상태 및 함수 추가
  agentStatus: "idle" | "running" | "done" | "error";
  agentResult: string;
  agentLogs: AgentTurnLog[];
  agentActiveTurns: number;
  runAgentHarness: (query: string, maxTurns?: number) => Promise<void>;
  cancelAgentHarness: () => void;
}

const AppContext = createContext<AppContextType | undefined>(undefined);

export function AppProvider({ children }: { children: React.ReactNode }) {
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

  // 에이전트 하네스 상태
  const [agentStatus, setAgentStatus] = useState<"idle" | "running" | "done" | "error">("idle");
  const [agentResult, setAgentResult] = useState("");
  const [agentLogs, setAgentLogs] = useState<AgentTurnLog[]>([]);
  const [agentActiveTurns, setAgentActiveTurns] = useState(0);
  const [abortController, setAbortController] = useState<AbortController | null>(null);

  const addLog = (msg: string) => {
    const time = new Date().toLocaleTimeString();
    setSyncLog((prev) => [`[${time}] ${msg}`, ...prev.slice(0, 49)]);
  };

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

  // Google 로그인 트리거
  const triggerGoogleLogin = async () => {
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
  };

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

  // 에이전트 SSE 스트리밍 구동 함수
  const runAgentHarness = async (query: str, maxTurns: number = 15) => {
    if (backendStatus !== "online") {
      addLog("오류: 백엔드 서버가 오프라인입니다.");
      return;
    }
    
    // 이전 실행 정리 및 초기화
    if (abortController) {
      abortController.abort();
    }
    const controller = new AbortController();
    setAbortController(controller);

    setAgentStatus("running");
    setAgentResult("");
    setAgentLogs([]);
    setAgentActiveTurns(0);
    addLog(`하네스 에이전트 루프 실행 시작: "${query}"`);

    try {
      const url = `http://localhost:8000/api/agent/run/stream?query=${encodeURIComponent(query)}&max_turns=${maxTurns}`;
      const response = await fetch(url, {
        signal: controller.signal
      });

      if (!response.body) {
        throw new Error("응답 바디를 읽을 수 없습니다.");
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          if (line.startsWith("data: ")) {
            const jsonStr = line.slice(6).trim();
            if (!jsonStr) continue;

            try {
              const parsed = JSON.parse(jsonStr);
              if (parsed.event === "turn") {
                const turnData: AgentTurnLog = parsed.data;
                setAgentActiveTurns(turnData.turn);
                setAgentLogs((prev) => [...prev, turnData]);
                addLog(`에이전트 턴 ${turnData.turn}: ${turnData.action} 실행`);
              } else if (parsed.event === "final") {
                const finalResult = parsed.data;
                setAgentResult(finalResult.answer);
                setAgentStatus("done");
                addLog("하네스 에이전트 실행 완료.");
              }
            } catch (err) {
              console.error("SSE 파싱 에러:", err);
            }
          }
        }
      }
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") {
        addLog("사용자가 에이전트 실행을 중단시켰습니다.");
        setAgentStatus("idle");
      } else {
        setAgentStatus("error");
        setAgentResult(error instanceof Error ? error.message : "네트워크 오류 발생");
        addLog(`에이전트 실행 중 오류: ${error instanceof Error ? error.message : "알 수 없음"}`);
      }
    } finally {
      setAbortController(null);
    }
  };

  // 에이전트 취소 함수
  const cancelAgentHarness = () => {
    if (abortController) {
      abortController.abort();
      setAbortController(null);
      setAgentStatus("idle");
    }
  };

  // 초기 로드 시 체크 진행
  useEffect(() => {
    checkBackend();
    
    const timer = setTimeout(() => {
      checkGwsAuth();
    }, 1500);

    return () => clearTimeout(timer);
  }, []);

  return (
    <AppContext.Provider
      value={{
        backendStatus,
        isGwsAuthenticated,
        authChecking,
        gmailItems,
        driveItems,
        activeTab,
        setActiveTab,
        llmEndpoint,
        setLlmEndpoint,
        llmModel,
        setLlmModel,
        syncStatus,
        syncProgress,
        syncLog,
        setSyncLog,
        checkBackend,
        checkGwsAuth,
        handleGmailSync,
        handleDriveSync,
        handleLlmTest,
        addLog,
        triggerGoogleLogin,
        
        // 에이전트 상태 및 함수 주입
        agentStatus,
        agentResult,
        agentLogs,
        agentActiveTurns,
        runAgentHarness,
        cancelAgentHarness,
      }}
    >
      {children}
    </AppContext.Provider>
  );
}

export function useApp() {
  const context = useContext(AppContext);
  if (!context) {
    throw new Error("useApp must be used within an AppProvider");
  }
  return context;
}
