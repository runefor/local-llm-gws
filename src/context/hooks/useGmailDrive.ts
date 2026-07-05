import { useEffect, useMemo, useRef, useState } from "react";
import { API_BASE } from "../../api/client";

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

export interface GmailDriveDomain {
  gmailItems: GmailItem[];
  gmailLabels: GmailLabel[];
  gmailLabelsLoading: boolean;
  driveItems: DriveItem[];
  workspaceItems: WorkspaceItem[];
  syncStatus: "idle" | "syncing" | "done" | "error";
  syncProgress: number;
  vectorizationProgress: VectorizationProgress;
  recentVectorizedGmailIds: string[];
  loadGmailLabels: () => Promise<void>;
  searchGmailMetadata: (query?: string, maxEmails?: number | null, labelIds?: string[]) => Promise<void>;
  searchDriveMetadata: (query?: string, maxItems?: number | null) => Promise<boolean>;
  vectorizeGmailMessages: (messageIds: string[]) => Promise<GmailVectorizeResult>;
  indexRagSources: (sources: string[]) => Promise<Record<string, unknown>>;
  searchWorkspaceOriginals: (query?: string, maxItems?: number | null) => Promise<void>;
}

interface GmailDriveParams {
  addLog: (msg: string) => void;
  backendStatus: "connecting" | "online" | "offline";
  isGwsAuthenticated: boolean;
}

// Gmail/Drive 메타데이터 검색·선택 벡터화·인덱싱·워크스페이스 파생 상태 도메인.
// 외부 의존: addLog(로거), backendStatus(게이트), isGwsAuthenticated(라벨 로드 조건).
export function useGmailDrive({ addLog, backendStatus, isGwsAuthenticated }: GmailDriveParams): GmailDriveDomain {
  const [gmailItems, setGmailItems] = useState<GmailItem[]>([]);
  const [gmailLabels, setGmailLabels] = useState<GmailLabel[]>([]);
  const [gmailLabelsLoading, setGmailLabelsLoading] = useState(false);
  const [driveItems, setDriveItems] = useState<DriveItem[]>([]);

  const [syncStatus, setSyncStatus] = useState<"idle" | "syncing" | "done" | "error">("idle");
  const [syncProgress, setSyncProgress] = useState(0);
  const [vectorizationProgress, setVectorizationProgress] = useState<VectorizationProgress>({
    status: "idle",
    kind: "gmail",
    label: "",
    progress: 0,
  });
  const [recentVectorizedGmailIds, setRecentVectorizedGmailIds] = useState<string[]>([]);
  const vectorizationTimerRef = useRef<number | null>(null);

  const stopVectorizationTicker = () => {
    if (vectorizationTimerRef.current !== null) {
      window.clearInterval(vectorizationTimerRef.current);
      vectorizationTimerRef.current = null;
    }
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
  const workspaceItems = useMemo(() => {
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

  // 언마운트 시 활성 벡터화 타이머 정리
  useEffect(() => {
    return () => {
      stopVectorizationTicker();
    };
  }, []);

  // 백엔드 온라인 + 인증 완료 시 Gmail 라벨 로드
  // biome-ignore lint/correctness/useExhaustiveDependencies: 백엔드/인증 상태 전환에만 반응해야 합니다.
  useEffect(() => {
    if (backendStatus === "online" && isGwsAuthenticated) {
      loadGmailLabels();
    }
  }, [backendStatus, isGwsAuthenticated]);

  return {
    gmailItems,
    gmailLabels,
    gmailLabelsLoading,
    driveItems,
    workspaceItems,
    syncStatus,
    syncProgress,
    vectorizationProgress,
    recentVectorizedGmailIds,
    loadGmailLabels,
    searchGmailMetadata,
    searchDriveMetadata,
    vectorizeGmailMessages,
    indexRagSources,
    searchWorkspaceOriginals,
  };
}
