import { listen } from "@tauri-apps/api/event";
import React, { createContext, useContext, useState, useEffect, useRef } from "react";
import { isTauri } from "../utils/env";
import { API_BASE } from "../api/client";
import { useLlmDomain, type DetectedServer } from "./hooks/useLlmDomain";
import { usePipelineDomain, type OriginalExportDocument } from "./hooks/usePipelineDomain";

export type { DetectedServer, OriginalExportDocument };

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

export interface VectorizationProgress {
  status: "idle" | "running" | "done" | "error";
  kind: "gmail" | "drive";
  label: string;
  progress: number;
  message?: string;
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
  backendStartupError: string | null;
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
  detectedServers: DetectedServer[];
  isDetecting: boolean;
  scanLocalServers: () => Promise<void>;
  syncStatus: "idle" | "syncing" | "done" | "error";
  syncProgress: number;
  syncLog: string[];
  setSyncLog: React.Dispatch<React.SetStateAction<string[]>>;
  vectorizationProgress: VectorizationProgress;
  recentVectorizedGmailIds: string[];
  checkBackend: () => Promise<void>;
  checkGwsAuth: () => Promise<void>;
  loadGmailLabels: () => Promise<void>;
  searchGmailMetadata: (query?: string, maxEmails?: number | null, labelIds?: string[]) => Promise<void>;
  searchDriveMetadata: (query?: string, maxItems?: number | null) => Promise<boolean>;
  vectorizeGmailMessages: (messageIds: string[]) => Promise<GmailVectorizeResult>;
  indexRagSources: (sources: string[]) => Promise<Record<string, unknown>>;
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
  exportToObsidian: (title: string, content: string, tags?: string[], originals?: OriginalExportDocument[]) => Promise<{ status: string; message: string; filename?: string; filepath?: string }>;
  exportToNotion: (title: string, content: string, originals?: OriginalExportDocument[]) => Promise<{ status: string; message: string }>;
  triggerNotionLogin: () => Promise<void>;
  fetchNotionPages: () => Promise<{ id: string; title: string; url: string }[]>;
}

const AppContext = createContext<AppContextType | undefined>(undefined);

export function AppProvider({ children }: { children: React.ReactNode }) {
  // 백엔드 상태
  const [backendStatus, setBackendStatus] = useState<"connecting" | "online" | "offline">("connecting");
  const [backendStartupError, setBackendStartupError] = useState<string | null>(null);
  const [isGwsAuthenticated, setIsGwsAuthenticated] = useState<boolean>(false);
  const [authChecking, setAuthChecking] = useState(false);
  
  // 동기화된 데이터 상태
  const [gmailItems, setGmailItems] = useState<GmailItem[]>([]);
  const [gmailLabels, setGmailLabels] = useState<GmailLabel[]>([]);
  const [gmailLabelsLoading, setGmailLabelsLoading] = useState(false);
  const [driveItems, setDriveItems] = useState<DriveItem[]>([]);
  
  // 동기화 상태
  const [syncStatus, setSyncStatus] = useState<"idle" | "syncing" | "done" | "error">("idle");
  const [syncProgress, setSyncProgress] = useState(0);
  const [syncLog, setSyncLog] = useState<string[]>([]);
  const [vectorizationProgress, setVectorizationProgress] = useState<VectorizationProgress>({
    status: "idle",
    kind: "gmail",
    label: "",
    progress: 0,
  });
  const [recentVectorizedGmailIds, setRecentVectorizedGmailIds] = useState<string[]>([]);
  const vectorizationTimerRef = useRef<number | null>(null);
  const googleAuthPollingTimerRef = useRef<number | null>(null);
  const googleAuthPollingAttemptsRef = useRef(0);

  const addLog = (msg: string) => {
    const time = new Date().toLocaleTimeString();
    setSyncLog((prev) => [`[${time}] ${msg}`, ...prev.slice(0, 49)]);
  };

  // 도메인별 훅 (LLM 설정 / 지식 파이프라인). 외부 의존 addLog만 주입해 파사드로 재조합.
  const llm = useLlmDomain(addLog);
  const pipeline = usePipelineDomain(addLog);

  const stopVectorizationTicker = () => {
    if (vectorizationTimerRef.current !== null) {
      window.clearInterval(vectorizationTimerRef.current);
      vectorizationTimerRef.current = null;
    }
  };

  const stopGoogleAuthPolling = () => {
    if (googleAuthPollingTimerRef.current !== null) {
      window.clearInterval(googleAuthPollingTimerRef.current);
      googleAuthPollingTimerRef.current = null;
    }
    googleAuthPollingAttemptsRef.current = 0;
  };

  const startVectorizationTicker = () => {
    stopVectorizationTicker();
    vectorizationTimerRef.current = window.setInterval(() => {
      setVectorizationProgress((current) => {
        if (current.status !== "running") return current;
        return { ...current, progress: Math.min(92, current.progress + (current.progress < 60 ? 6 : 2)) };
      });
    }, 800);
  };

  const beginVectorization = (kind: VectorizationProgress["kind"], label: string) => {
    setVectorizationProgress({ status: "running", kind, label, progress: 3, message: "백그라운드에서 처리 중입니다." });
    startVectorizationTicker();
  };

  const finishVectorization = (status: "done" | "error", message: string) => {
    stopVectorizationTicker();
    setVectorizationProgress((current) => ({ ...current, status, progress: status === "done" ? 100 : current.progress, message }));
  };

  // 백엔드 연결 확인 (Ping)
  const checkBackend = async () => {
    setBackendStatus("connecting");
    try {
      const response = await fetch(`${API_BASE}/`);
      const data = await response.json();
      if (data.status === "ok") {
        setBackendStatus("online");
        setBackendStartupError(null);
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
      const response = await fetch(`${API_BASE}/api/auth/status`);
      const data = await response.json();
      const authenticated = response.ok && data.authenticated === true;
      setIsGwsAuthenticated(authenticated);
      if (authenticated) {
        addLog("Google Workspace 인증 상태: 연결됨");
      } else {
        addLog("Google Workspace 인증 상태: 인증 필요");
      }
    } catch (error) {
      setIsGwsAuthenticated(false);
      addLog("Google Workspace 인증 상태를 가져오지 못했습니다.");
    } finally {
      setAuthChecking(false);
    }
  };

  const loadGmailLabels = async () => {
    if (backendStatus !== "online" || !isGwsAuthenticated) return;
    setGmailLabelsLoading(true);
    try {
      const response = await fetch(`${API_BASE}/api/gmail/labels`);
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
    stopGoogleAuthPolling();
    addLog("Google OAuth 로그인 창을 엽니다...");
    try {
      const response = await fetch(`${API_BASE}/api/auth/login`, { method: "POST" });
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
        googleAuthPollingTimerRef.current = window.setInterval(async () => {
          googleAuthPollingAttemptsRef.current += 1;
          try {
            const res = await fetch(`${API_BASE}/api/auth/status`);
            const statusData = await res.json();
            if (res.ok && statusData.authenticated === true) {
              setIsGwsAuthenticated(true);
              addLog("Google Workspace 인증 성공!");
              stopGoogleAuthPolling();
            }
          } catch (err) {
            setIsGwsAuthenticated(false);
            console.error("인증 상태 체크 에러:", err);
          }
          if (googleAuthPollingAttemptsRef.current >= 60) { // 최대 2분 대기
            stopGoogleAuthPolling();
            setIsGwsAuthenticated(false);
            addLog("인증 대기 시간이 초과되었습니다. 다시 시도해 주세요.");
          }
        }, 2000);
      } else {
        setIsGwsAuthenticated(false);
        addLog(`인증 요청 실패: ${data.message || "알 수 없는 오류"}`);
      }
    } catch (e) {
      setIsGwsAuthenticated(false);
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
      const response = await fetch(`${API_BASE}/api/gmail/search`, {
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
    if (vectorizationProgress.status === "running") {
      const message = "이미 벡터화 작업이 실행 중입니다.";
      addLog(`Gmail 선택 메일 벡터화 보류: ${message}`);
      return { status: "error", message };
    }

    beginVectorization("gmail", `Gmail 선택 메일 ${messageIds.length}개 벡터화`);
    addLog(`Gmail 선택 메일 벡터화 시작: ${messageIds.length}개`);
    try {
      const response = await fetch(`${API_BASE}/api/gmail/vectorize`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message_ids: messageIds })
      });
      const data: GmailVectorizeResult = await response.json();
      if (data.status === "success") {
        addLog(`Gmail 선택 메일 벡터화 완료: ${data.indexed ?? messageIds.length}개 인덱싱`);
        setRecentVectorizedGmailIds((prev) => Array.from(new Set([...prev, ...messageIds])));
        finishVectorization("done", data.message || `${data.indexed ?? messageIds.length}개 메일 벡터화 완료`);
      } else {
        addLog(`Gmail 선택 메일 벡터화 실패: ${data.message || "알 수 없는 오류"}`);
        finishVectorization("error", data.message || "선택 메일 벡터화에 실패했습니다.");
      }
      return data;
    } catch (error) {
      const message = error instanceof Error ? error.message : "네트워크 오류";
      addLog(`Gmail 선택 메일 벡터화 오류: ${message}`);
      finishVectorization("error", message);
      return { status: "error", message };
    }
  };

  const indexRagSources = async (sources: string[]): Promise<Record<string, unknown>> => {
    if (backendStatus !== "online") {
      const message = "백엔드 서버가 오프라인입니다.";
      addLog(`벡터 인덱스 갱신 실패: ${message}`);
      return { status: "error", message };
    }
    if (sources.includes("drive") && driveItems.length === 0) {
      const message = "Drive 원본 검색 결과가 없습니다. 자료 가져오기에서 관련 Drive 원본을 먼저 검색하세요.";
      addLog(`Drive 벡터 인덱스 갱신 보류: ${message}`);
      return { status: "error", message };
    }
    if (vectorizationProgress.status === "running") {
      const message = "이미 벡터화 작업이 실행 중입니다.";
      addLog(`벡터 인덱스 갱신 보류: ${message}`);
      return { status: "error", message };
    }

    const label = sources.includes("drive") ? "Drive 벡터 인덱스 갱신" : "벡터 인덱스 갱신";
    beginVectorization("drive", label);
    addLog(`${label} 작업 실행 중...`);
    try {
      const response = await fetch(`${API_BASE}/api/rag/index`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sources, drive_files: sources.includes("drive") ? driveItems : [] }),
      });
      const data: Record<string, unknown> = await response.json();
      if (data.status === "success") {
        const driveIndexed = typeof data.drive_indexed === "number" ? data.drive_indexed : 0;
        addLog(`벡터 인덱스 갱신 완료: Drive ${driveIndexed}개 처리`);
        finishVectorization("done", `Drive ${driveIndexed}개 인덱스 갱신 완료`);
      } else {
        const message = typeof data.message === "string" ? data.message : "알 수 없는 오류";
        addLog(`벡터 인덱스 갱신 실패: ${message}`);
        finishVectorization("error", message);
      }
      return data;
    } catch (error) {
      const message = error instanceof Error ? error.message : "네트워크 오류";
      addLog(`벡터 인덱스 갱신 오류: ${message}`);
      finishVectorization("error", message);
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
      const response = await fetch(`${API_BASE}/api/sync/drive`, {
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
      const response = await fetch(`${API_BASE}/api/gws/originals/search`, {
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

  // biome-ignore lint/correctness/useExhaustiveDependencies: Tauri 이벤트는 데스크톱 앱 시작 시 한 번만 구독합니다.
  useEffect(() => {
    if (!isTauri()) return;

    let disposed = false;
    let unlisten: (() => void) | null = null;

    void listen<{ message: string }>("backend-startup-failed", (event) => {
      setBackendStatus("offline");
      setBackendStartupError(event.payload.message);
    }).then((cleanup) => {
      if (disposed) {
        cleanup();
      } else {
        unlisten = cleanup;
      }
    }).catch((error) => {
      console.error("백엔드 시작 실패 이벤트 구독 실패:", error);
    });

    return () => {
      disposed = true;
      if (unlisten) {
        unlisten();
      }
    };
  }, []);

  // 백엔드 온라인 연결 시 설정 로드
  // biome-ignore lint/correctness/useExhaustiveDependencies: backendStatus 전환에만 반응해야 합니다.
  useEffect(() => {
    if (backendStatus === "online") {
      checkGwsAuth();
      llm.fetchLlmConfig();
      pipeline.loadPipelineSettings();
    }
  }, [backendStatus]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: 인증 상태 전환에만 반응해야 합니다.
  useEffect(() => {
    if (backendStatus === "online" && isGwsAuthenticated) {
      loadGmailLabels();
    }
  }, [backendStatus, isGwsAuthenticated]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: 언마운트 시 활성 타이머만 정리합니다.
  useEffect(() => {
    return () => {
      stopVectorizationTicker();
      stopGoogleAuthPolling();
    };
  }, []);

  return (
    <AppContext.Provider
      value={{
        backendStatus,
        backendStartupError,
        isGwsAuthenticated,
        authChecking,
        gmailItems,
        gmailLabels,
        gmailLabelsLoading,
        driveItems,
        workspaceItems,
        ...llm,
        syncStatus,
        syncProgress,
        syncLog,
        setSyncLog,
        vectorizationProgress,
        recentVectorizedGmailIds,
        checkBackend,
        checkGwsAuth,
        loadGmailLabels,
        searchGmailMetadata,
        searchDriveMetadata,
        vectorizeGmailMessages,
        indexRagSources,
        searchWorkspaceOriginals,
        addLog,
        triggerGoogleLogin,

        // 지식 파이프라인 상태 및 함수 (usePipelineDomain)
        ...pipeline,
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
