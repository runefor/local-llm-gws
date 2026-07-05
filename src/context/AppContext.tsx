import React, { createContext, useContext, useState, useEffect } from "react";
import { useLlmDomain, type DetectedServer } from "./hooks/useLlmDomain";
import { usePipelineDomain, type OriginalExportDocument } from "./hooks/usePipelineDomain";
import { useGoogleAuth } from "./hooks/useGoogleAuth";
import { useBackendHealth } from "./hooks/useBackendHealth";
import {
  useGmailDrive,
  type GmailItem,
  type GmailLabel,
  type GmailVectorizeResult,
  type DriveItem,
  type WorkspaceItem,
  type VectorizationProgress,
} from "./hooks/useGmailDrive";

export type { DetectedServer, OriginalExportDocument };
export type { GmailItem, GmailLabel, GmailVectorizeResult, DriveItem, WorkspaceItem, VectorizationProgress };

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
  // 로그는 여러 도메인이 공유하므로 코어에 남긴다.
  const [syncLog, setSyncLog] = useState<string[]>([]);

  const addLog = (msg: string) => {
    const time = new Date().toLocaleTimeString();
    setSyncLog((prev) => [`[${time}] ${msg}`, ...prev.slice(0, 49)]);
  };

  // 도메인별 훅 조합 (facade). 외부 의존은 addLog + 상태 주입만이라 useApp() 형태는 불변.
  const backend = useBackendHealth(addLog);
  const googleAuth = useGoogleAuth(addLog);
  const gmailDrive = useGmailDrive({
    addLog,
    backendStatus: backend.backendStatus,
    isGwsAuthenticated: googleAuth.isGwsAuthenticated,
  });
  const llm = useLlmDomain(addLog);
  const pipeline = usePipelineDomain(addLog);

  // 백엔드 온라인 연결 시 인증 확인 + LLM/파이프라인 설정 로드 (도메인 간 오케스트레이션)
  // biome-ignore lint/correctness/useExhaustiveDependencies: backendStatus 전환에만 반응해야 합니다.
  useEffect(() => {
    if (backend.backendStatus === "online") {
      googleAuth.checkGwsAuth();
      llm.fetchLlmConfig();
      pipeline.loadPipelineSettings();
    }
  }, [backend.backendStatus]);

  return (
    <AppContext.Provider
      value={{
        ...backend,
        ...googleAuth,
        ...gmailDrive,
        ...llm,
        ...pipeline,
        syncLog,
        setSyncLog,
        addLog,
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
