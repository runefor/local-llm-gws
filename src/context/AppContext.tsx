import React, { createContext, useContext, useState, useEffect } from "react";

export interface GmailItem {
  id: string;
  subject: string;
  from: string;
  snippet: string;
  date?: string;
  labelIds?: string[];
  threadId?: string;
  messageId?: string;
}

export interface GmailVectorizeResult {
  status: string;
  message?: string;
  indexed?: number;
}

interface GmailSearchResponse {
  status: string;
  count?: number;
  messages?: GmailItem[];
  has_more?: boolean;
  message?: string;
}

interface OriginalSearchResponse {
  status: string;
  count?: number;
  gmail_count?: number;
  drive_count?: number;
  messages?: GmailItem[];
  files?: DriveItem[];
  has_more?: boolean;
  message?: string;
}

export interface GmailLabel {
  id: string;
  name: string;
  type: "system" | "user";
  messagesTotal?: number;
  messagesUnread?: number;
}

export interface DriveItem {
  id: string;
  name: string;
  mimeType: string;
  modifiedTime: string;
  resourceKey?: string;
}

export interface WorkspaceItem {
  id: string;
  type: "gmail" | "drive";
  title: string;
  subtitle: string;
  snippet?: string;
  resourceKey?: string;
  timestamp: string;
}

interface AppContextType {
  backendStatus: "connecting" | "online" | "offline";
  isGwsAuthenticated: boolean;
  authChecking: boolean;
  gmailItems: GmailItem[];
  gmailLabels: GmailLabel[];
  gmailLabelsLoading: boolean;
  driveItems: DriveItem[];
  workspaceItems: WorkspaceItem[];
  llmEndpoint: string;
  setLlmEndpoint: (endpoint: string) => void;
  llmModel: string;
  setLlmModel: (model: string) => void;
  llmMode: "internal" | "external";
  setLlmMode: (mode: "internal" | "external") => void;
  saveLlmConfig: (endpoint: string, model: string, mode: "llamacpp" | "ollama" | "external") => Promise<void>;
  handleLlmDisconnect: () => Promise<void>;
  detectedServers: any[];
  isDetecting: boolean;
  scanLocalServers: () => Promise<void>;
  syncStatus: "idle" | "syncing" | "done" | "error";
  syncProgress: number;
  syncLog: string[];
  setSyncLog: React.Dispatch<React.SetStateAction<string[]>>;
  checkBackend: () => Promise<void>;
  checkGwsAuth: () => Promise<void>;
  loadGmailLabels: () => Promise<void>;
  searchGmailMetadata: (query?: string, maxEmails?: number | null, labelIds?: string[]) => Promise<void>;
  searchDriveMetadata: (query?: string, maxItems?: number | null) => Promise<boolean>;
  vectorizeGmailMessages: (messageIds: string[]) => Promise<GmailVectorizeResult>;
  searchWorkspaceOriginals: (query?: string, maxItems?: number | null) => Promise<void>;
  handleLlmTest: (overrideEndpoint?: string, overrideModel?: string) => Promise<void>;
  addLog: (msg: string) => void;
  triggerGoogleLogin: () => Promise<void>;

  // 지식 파이프라인 연동 상태 및 함수 추가
  obsidianVaultPath: string;
  setObsidianVaultPath: React.Dispatch<React.SetStateAction<string>>;
  notionApiKey: string;
  setNotionApiKey: React.Dispatch<React.SetStateAction<string>>;
  notionPageId: string;
  setNotionPageId: React.Dispatch<React.SetStateAction<string>>;
  suppressExternalLlmSensitiveWarning: boolean;
  setSuppressExternalLlmSensitiveWarning: React.Dispatch<React.SetStateAction<boolean>>;
  loadPipelineSettings: () => Promise<void>;
  savePipelineSettings: (vaultPath: string, apiKey: string, pageId: string) => Promise<boolean>;
  saveExternalLlmWarningPreference: (suppress: boolean) => Promise<boolean>;
  exportToObsidian: (title: string, content: string, tags?: string[]) => Promise<{ status: string; message: string; filename?: string; filepath?: string }>;
  exportToNotion: (title: string, content: string) => Promise<{ status: string; message: string }>;
  triggerNotionLogin: () => Promise<void>;
  fetchNotionPages: () => Promise<{ id: string; title: string; url: string }[]>;
}

const AppContext = createContext<AppContextType | undefined>(undefined);

export function AppProvider({ children }: { children: React.ReactNode }) {
  // 백엔드 상태
  const [backendStatus, setBackendStatus] = useState<"connecting" | "online" | "offline">("connecting");
  const [isGwsAuthenticated, setIsGwsAuthenticated] = useState<boolean>(false);
  const [authChecking, setAuthChecking] = useState(false);
  
  // 동기화된 데이터 상태
  const [gmailItems, setGmailItems] = useState<GmailItem[]>([]);
  const [gmailLabels, setGmailLabels] = useState<GmailLabel[]>([]);
  const [gmailLabelsLoading, setGmailLabelsLoading] = useState(false);
  const [driveItems, setDriveItems] = useState<DriveItem[]>([]);
  
  // LLM 설정 상태
  const [llmEndpoint, setLlmEndpoint] = useState("http://localhost:1234/v1");
  const [llmModel, setLlmModel] = useState("gemma4-9b-it");
  const [llmMode, setLlmMode] = useState<"internal" | "external">("internal");
  
  // 로컬 LLM 자동 감지 상태
  const [detectedServers, setDetectedServers] = useState<any[]>([]);
  const [isDetecting, setIsDetecting] = useState<boolean>(false);
  
  // 동기화 상태
  const [syncStatus, setSyncStatus] = useState<"idle" | "syncing" | "done" | "error">("idle");
  const [syncProgress, setSyncProgress] = useState(0);
  const [syncLog, setSyncLog] = useState<string[]>([]);

  // 지식 파이프라인 연동 설정 상태
  const [obsidianVaultPath, setObsidianVaultPath] = useState("");
  const [notionApiKey, setNotionApiKey] = useState("");
  const [notionPageId, setNotionPageId] = useState("");
  const [suppressExternalLlmSensitiveWarning, setSuppressExternalLlmSensitiveWarning] = useState(false);

  const addLog = (msg: string) => {
    const time = new Date().toLocaleTimeString();
    setSyncLog((prev) => [`[${time}] ${msg}`, ...prev.slice(0, 49)]);
  };

  // 백엔드 연결 확인 (Ping)
  const checkBackend = async () => {
    setBackendStatus("connecting");
    try {
      const response = await fetch("http://localhost:18731/");
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
      const response = await fetch("http://localhost:18731/api/auth/status");
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

  const loadGmailLabels = async () => {
    if (backendStatus !== "online" || !isGwsAuthenticated) return;
    setGmailLabelsLoading(true);
    try {
      const response = await fetch("http://localhost:18731/api/gmail/labels");
      const data = await response.json();
      if (data.status === "success" && Array.isArray(data.labels)) {
        setGmailLabels(data.labels);
      } else {
        addLog(`Gmail 라벨 목록 로드 실패: ${data.message || "알 수 없는 오류"}`);
      }
    } catch (error) {
      addLog(`Gmail 라벨 목록 로드 중 오류 발생: ${error instanceof Error ? error.message : "네트워크 오류"}`);
    } finally {
      setGmailLabelsLoading(false);
    }
  };

  // Google 로그인 트리거
  const triggerGoogleLogin = async () => {
    addLog("Google OAuth 로그인 창을 엽니다...");
    try {
      const response = await fetch("http://localhost:18731/api/auth/login", { method: "POST" });
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
            const res = await fetch("http://localhost:18731/api/auth/status");
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

  const searchGmailMetadata = async (query?: string, maxEmails?: number | null, labelIds: string[] = []) => {
    if (backendStatus !== "online") {
      addLog("오류: 백엔드 서버가 오프라인입니다.");
      return;
    }

    setSyncStatus("syncing");
    setSyncProgress(0);
    const labelLog = labelIds.length ? `, 라벨 ${labelIds.length}개` : "";
    addLog(query ? `Gmail 메타데이터 검색 시작 (검색어: "${query}"${labelLog})...` : `Gmail 메타데이터 검색 시작${labelLog}...`);

    try {
      const response = await fetch("http://localhost:18731/api/gmail/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          max_emails: maxEmails === null ? undefined : maxEmails ?? 50,
          query: query || undefined,
          label_ids: labelIds.length ? labelIds : undefined,
        })
      });
      const data: GmailSearchResponse = await response.json();

      if (data.status === "success") {
        setGmailItems(data.messages || []);
        setSyncProgress(100);
        setSyncStatus("done");
        addLog(`Gmail 메타데이터 검색 완료: ${data.count ?? data.messages?.length ?? 0}개의 이메일을 가져왔습니다.`);
      } else {
        setSyncStatus("error");
        const message = data.message || "알 수 없는 오류";
        addLog(`Gmail 메타데이터 검색 실패: ${message}`);
        throw new Error(message);
      }
    } catch (error) {
      setSyncStatus("error");
      const message = error instanceof Error ? error.message : "네트워크 오류";
      addLog(`Gmail 메타데이터 검색 중 오류 발생: ${message}`);
      throw error instanceof Error ? error : new Error(message);
    }
  };

  const vectorizeGmailMessages = async (messageIds: string[]): Promise<GmailVectorizeResult> => {
    if (backendStatus !== "online") {
      const message = "백엔드 서버가 오프라인입니다.";
      addLog(`Gmail 선택 메일 벡터화 실패: ${message}`);
      return { status: "error", message };
    }

    addLog(`Gmail 선택 메일 벡터화 시작: ${messageIds.length}개`);
    try {
      const response = await fetch("http://localhost:18731/api/gmail/vectorize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message_ids: messageIds })
      });
      const data: GmailVectorizeResult = await response.json();
      if (data.status === "success") {
        addLog(`Gmail 선택 메일 벡터화 완료: ${data.indexed ?? messageIds.length}개 인덱싱`);
      } else {
        addLog(`Gmail 선택 메일 벡터화 실패: ${data.message || "알 수 없는 오류"}`);
      }
      return data;
    } catch (error) {
      const message = error instanceof Error ? error.message : "네트워크 오류";
      addLog(`Gmail 선택 메일 벡터화 오류: ${message}`);
      return { status: "error", message };
    }
  };

  const searchDriveMetadata = async (query?: string, maxItems?: number | null) => {
    if (backendStatus !== "online") {
      addLog("오류: 백엔드 서버가 오프라인입니다.");
      return false;
    }

    setSyncStatus("syncing");
    setSyncProgress(0);
    addLog(query ? `Drive 원본 검색 시작 (검색어: "${query}")...` : "Drive 원본 검색 시작...");

    try {
      const response = await fetch("http://localhost:18731/api/sync/drive", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          max_emails: maxItems === null ? undefined : maxItems ?? 30,
          query: query || undefined,
        })
      });
      const data: OriginalSearchResponse = await response.json();

      if (data.status === "success") {
        setDriveItems(data.files || []);
        setSyncProgress(100);
        setSyncStatus("done");
        addLog(`Drive 원본 검색 완료: ${data.count ?? data.files?.length ?? 0}개`);
        return true;
      } else {
        setSyncStatus("error");
        addLog(`Drive 원본 검색 실패: ${data.message || "알 수 없는 오류"}`);
        return false;
      }
    } catch (error) {
      setSyncStatus("error");
      addLog(`Drive 원본 검색 중 오류 발생: ${error instanceof Error ? error.message : "네트워크 오류"}`);
      return false;
    }
  };

  const searchWorkspaceOriginals = async (query?: string, maxItems?: number | null) => {
    if (backendStatus !== "online") {
      addLog("오류: 백엔드 서버가 오프라인입니다.");
      return;
    }

    setSyncStatus("syncing");
    setSyncProgress(0);
    addLog(query ? `Gmail/Drive 원본 검색 시작 (검색어: "${query}")...` : "Gmail/Drive 원본 검색 시작...");

    try {
      const response = await fetch("http://localhost:18731/api/gws/originals/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          max_emails: maxItems === null ? undefined : maxItems ?? 30,
          query: query || undefined,
        })
      });
      const data: OriginalSearchResponse = await response.json();

      if (data.status === "success") {
        setGmailItems(data.messages || []);
        setDriveItems(data.files || []);
        setSyncProgress(100);
        setSyncStatus("done");
        addLog(`Gmail/Drive 원본 검색 완료: Gmail ${data.gmail_count ?? 0}개, Drive ${data.drive_count ?? 0}개`);
      } else {
        setSyncStatus("error");
        addLog(`Gmail/Drive 원본 검색 실패: ${data.message || "알 수 없는 오류"}`);
      }
    } catch (error) {
      setSyncStatus("error");
      addLog(`Gmail/Drive 원본 검색 중 오류 발생: ${error instanceof Error ? error.message : "네트워크 오류"}`);
    }
  };

  // 백엔드로부터 LLM 설정 로드
  const fetchLlmConfig = async () => {
    try {
      const response = await fetch("http://localhost:18731/api/llm/config");
      if (response.ok) {
        const data = await response.json();
        setLlmEndpoint(data.endpoint);
        setLlmModel(data.model);
        if (data.mode === "llamacpp") {
          setLlmMode("internal");
        } else {
          setLlmMode("external");
        }
        addLog(`로컬 LLM 설정 로드 완료: ${data.mode} 모드 - ${data.model}`);
      }
    } catch (error) {
      console.error("LLM 설정 조회 실패:", error);
    }
  };

  // 백엔드에 LLM 설정 저장 및 동기화
  const saveLlmConfig = async (endpoint: string, model: string, mode: "llamacpp" | "ollama" | "external") => {
    try {
      addLog(`백엔드 LLM 설정 동기화 시도... (${mode} 모드)`);
      const response = await fetch("http://localhost:18731/api/llm/config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ endpoint, model, mode })
      });
      const data = await response.json();
      if (data.status === "success") {
        addLog("백엔드 LLM 설정 동기화 완료.");
        setLlmEndpoint(endpoint);
        setLlmModel(model);
        setLlmMode(mode === "llamacpp" ? "internal" : "external");
      } else {
        addLog(`백엔드 설정 동기화 실패: ${data.message}`);
      }
    } catch (error) {
      addLog(`백엔드 설정 동기화 오류: ${error instanceof Error ? error.message : "네트워크 오류"}`);
    }
  };

  // 연결 해제 처리
  const handleLlmDisconnect = async () => {
    addLog("로컬 LLM 연결 해제 요청");
    await saveLlmConfig("http://localhost:8080/v1", "", "llamacpp");
  };

  // 실제 로컬 LLM 연결 여부 테스트
  const handleLlmTest = async (overrideEndpoint?: string, overrideModel?: string) => {
    const targetEndpoint = overrideEndpoint || llmEndpoint;
    const targetModel = overrideModel || llmModel;
    addLog(`로컬 LLM 서버에 연결 테스트 중: ${targetEndpoint} (모델: ${targetModel})`);
    try {
      const response = await fetch("http://localhost:18731/api/llm/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ endpoint: targetEndpoint, model: targetModel })
      });
      const data = await response.json();
      if (data.status === "success") {
        addLog(`로컬 LLM 연결 확인: 성공 (${targetModel} 응답 확인)`);
        const mode = targetEndpoint.includes("11434") ? "ollama" : "external";
        await saveLlmConfig(targetEndpoint, targetModel, mode);
      } else {
        addLog(`로컬 LLM 연결 실패: ${data.message}`);
        alert(`연결 테스트 실패: ${data.message}`);
      }
    } catch (error) {
      addLog(`로컬 LLM 연결 오류 발생: ${error instanceof Error ? error.message : "네트워크 오류"}`);
    }
  };

  // 실행 중인 로컬 LLM 서버 자동 감지 API 호출
  const scanLocalServers = async () => {
    setIsDetecting(true);
    try {
      const response = await fetch("http://localhost:18731/api/llm/detect");
      const data = await response.json();
      if (data.status === "success") {
        setDetectedServers(data.servers || []);
      }
    } catch (error) {
      console.error("로컬 LLM 서버 감지 실패:", error);
    } finally {
      setIsDetecting(false);
    }
  };

  // 지식 파이프라인 연동 설정 불러오기
  const loadPipelineSettings = async () => {
    try {
      const response = await fetch("http://localhost:18731/api/settings");
      if (response.ok) {
        const data = await response.json();
        setObsidianVaultPath(data.obsidian_vault_path || "");
        setNotionApiKey(data.notion_api_key || "");
        setNotionPageId(data.notion_page_id || "");
        setSuppressExternalLlmSensitiveWarning(!!data.suppress_external_llm_sensitive_warning);
      }
    } catch (error) {
      console.error("지식 파이프라인 설정 로드 실패:", error);
    }
  };

  // 지식 파이프라인 연동 설정 저장하기
  const savePipelineSettings = async (vaultPath: string, apiKey: string, pageId: string) => {
    try {
      addLog("지식 파이프라인 설정 저장 중...");
      const response = await fetch("http://localhost:18731/api/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          obsidian_vault_path: vaultPath,
          notion_api_key: apiKey,
          notion_page_id: pageId,
          suppress_external_llm_sensitive_warning: suppressExternalLlmSensitiveWarning,
        })
      });
      const data = await response.json();
      if (data.status === "success") {
        addLog("설정이 저장되었습니다.");
        setObsidianVaultPath(vaultPath);
        setNotionApiKey(apiKey);
        setNotionPageId(pageId);
        return true;
      } else {
        addLog(`설정 저장 실패: ${data.message}`);
        return false;
      }
    } catch (error) {
      addLog(`설정 저장 중 오류: ${error instanceof Error ? error.message : "네트워크 오류"}`);
      return false;
    }
  };

  const saveExternalLlmWarningPreference = async (suppress: boolean) => {
    try {
      addLog("외부 LLM 민감정보 경고 설정 저장 중...");
      const response = await fetch("http://localhost:18731/api/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          obsidian_vault_path: obsidianVaultPath,
          notion_api_key: notionApiKey,
          notion_page_id: notionPageId,
          suppress_external_llm_sensitive_warning: suppress,
        }),
      });
      const data = await response.json();
      if (data.status === "success") {
        setSuppressExternalLlmSensitiveWarning(suppress);
        addLog("외부 LLM 민감정보 경고 설정이 저장되었습니다.");
        return true;
      }
      addLog(`외부 LLM 민감정보 경고 설정 저장 실패: ${data.message}`);
      return false;
    } catch (error) {
      addLog(`외부 LLM 민감정보 경고 설정 저장 중 오류: ${error instanceof Error ? error.message : "네트워크 오류"}`);
      return false;
    }
  };

  // Obsidian 내보내기
  const exportToObsidian = async (title: string, content: string, tags?: string[]) => {
    try {
      addLog(`Obsidian으로 내보내는 중... 제목: "${title}"`);
      const response = await fetch("http://localhost:18731/api/export/obsidian", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, content, tags: tags || ["workspace"] })
      });
      const data = await response.json();
      if (data.status === "success") {
        addLog(`Obsidian 내보내기 완료: ${data.filename}`);
      } else {
        addLog(`Obsidian 내보내기 실패: ${data.message}`);
      }
      return data;
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : "네트워크 오류";
      addLog(`Obsidian 내보내기 오류: ${errMsg}`);
      return { status: "error", message: errMsg };
    }
  };

  // Notion 내보내기
  const exportToNotion = async (title: string, content: string) => {
    try {
      addLog(`Notion으로 내보내는 중... 제목: "${title}"`);
      const response = await fetch("http://localhost:18731/api/export/notion", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, content })
      });
      const data = await response.json();
      if (data.status === "success") {
        addLog("Notion 내보내기 성공!");
      } else {
        addLog(`Notion 내보내기 실패: ${data.message}`);
      }
      return data;
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : "네트워크 오류";
      addLog(`Notion 내보내기 오류: ${errMsg}`);
      return { status: "error", message: errMsg };
    }
  };

  // Notion OAuth 로그인 트리거 및 폴링
  const triggerNotionLogin = async () => {
    addLog("Notion OAuth 로그인 창을 엽니다...");
    try {
      const response = await fetch("http://localhost:18731/api/auth/notion/url");
      const data = await response.json();
      if (data.status === "success" && data.url) {
        addLog("Notion 로그인 링크를 브라우저에 엽니다...");
        try {
          const { openUrl } = await import("@tauri-apps/plugin-opener");
          await openUrl(data.url);
        } catch {
          window.open(data.url, "_blank");
        }
        
        let attempts = 0;
        const interval = setInterval(async () => {
          attempts++;
          try {
            const res = await fetch("http://localhost:18731/api/settings");
            const settingsData = await res.json();
            if (settingsData.notion_api_key) {
              setNotionApiKey(settingsData.notion_api_key);
              setNotionPageId(settingsData.notion_page_id || "");
              addLog("Notion OAuth 연동 성공!");
              clearInterval(interval);
            }
          } catch (err) {
            console.error("Notion 로그인 상태 체크 에러:", err);
          }
          if (attempts >= 60) {
            clearInterval(interval);
            addLog("Notion 로그인 인증 대기 시간이 초과되었습니다.");
          }
        }, 2000);
      } else {
        addLog(`Notion 인증 실패: ${data.message}`);
      }
    } catch (e) {
      addLog(`Notion 로그인 요청 중 오류: ${e}`);
    }
  };

  // Notion 페이지 목록 가져오기
  const fetchNotionPages = async () => {
    try {
      const response = await fetch("http://localhost:18731/api/notion/pages");
      const data = await response.json();
      if (data.status === "success") {
        return data.pages || [];
      }
      return [];
    } catch (e) {
      console.error("Notion 페이지 로드 실패:", e);
      return [];
    }
  };

  // Gmail과 Drive 아이템 혼합 및 시간순 정렬 파생 상태
  const workspaceItems = React.useMemo(() => {
    const items: WorkspaceItem[] = [];
    
    gmailItems.forEach((item) => {
      items.push({
        id: item.id,
        type: "gmail",
        title: item.subject || "(제목 없음)",
        subtitle: item.from || "알 수 없음",
        snippet: item.snippet,
        timestamp: item.date || new Date().toISOString(),
      });
    });
    
    driveItems.forEach((item) => {
      items.push({
        id: item.id,
        type: "drive",
        title: item.name || "이름 없는 파일",
        subtitle: item.mimeType || "알 수 없는 유형",
        resourceKey: item.resourceKey,
        timestamp: item.modifiedTime || new Date().toISOString(),
      });
    });
    
    // 내림차순 정렬 (최신순)
    return items.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
  }, [gmailItems, driveItems]);

  // 초기 로드 시 백엔드 체크
  // biome-ignore lint/correctness/useExhaustiveDependencies: 앱 시작 시 한 번만 실행하는 초기화 효과입니다.
  useEffect(() => {
    checkBackend();
  }, []);

  // 백엔드 온라인 연결 시 설정 로드
  // biome-ignore lint/correctness/useExhaustiveDependencies: backendStatus 전환에만 반응해야 합니다.
  useEffect(() => {
    if (backendStatus === "online") {
      checkGwsAuth();
      fetchLlmConfig();
      loadPipelineSettings();
    }
  }, [backendStatus]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: 인증 상태 전환에만 반응해야 합니다.
  useEffect(() => {
    if (backendStatus === "online" && isGwsAuthenticated) {
      loadGmailLabels();
    }
  }, [backendStatus, isGwsAuthenticated]);

  return (
    <AppContext.Provider
      value={{
        backendStatus,
        isGwsAuthenticated,
        authChecking,
        gmailItems,
        gmailLabels,
        gmailLabelsLoading,
        driveItems,
        workspaceItems,
        llmEndpoint,
        setLlmEndpoint,
        llmModel,
        setLlmModel,
        llmMode,
        setLlmMode,
        saveLlmConfig,
        handleLlmDisconnect,
        detectedServers,
        isDetecting,
        scanLocalServers,
        syncStatus,
        syncProgress,
        syncLog,
        setSyncLog,
        checkBackend,
        checkGwsAuth,
        loadGmailLabels,
        searchGmailMetadata,
        searchDriveMetadata,
        vectorizeGmailMessages,
        searchWorkspaceOriginals,
        handleLlmTest,
        addLog,
        triggerGoogleLogin,

        // 지식 파이프라인 상태 및 함수 주입
        obsidianVaultPath,
        setObsidianVaultPath,
        notionApiKey,
        setNotionApiKey,
        notionPageId,
        setNotionPageId,
        suppressExternalLlmSensitiveWarning,
        setSuppressExternalLlmSensitiveWarning,
        loadPipelineSettings,
        savePipelineSettings,
        saveExternalLlmWarningPreference,
        exportToObsidian,
        exportToNotion,
        triggerNotionLogin,
        fetchNotionPages,
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
