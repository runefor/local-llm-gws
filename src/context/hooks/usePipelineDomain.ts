import { useEffect, useRef, useState } from "react";
import type { Dispatch, SetStateAction } from "react";
import { API_BASE } from "../../api/client";

export type OriginalExportDocument = {
  readonly evidence_id: string;
  readonly title: string;
  readonly content: string;
  readonly source_line?: string;
  readonly open_url?: string;
};

export interface PipelineDomain {
  obsidianVaultPath: string;
  setObsidianVaultPath: Dispatch<SetStateAction<string>>;
  notionApiKey: string;
  setNotionApiKey: Dispatch<SetStateAction<string>>;
  notionPageId: string;
  setNotionPageId: Dispatch<SetStateAction<string>>;
  suppressExternalLlmSensitiveWarning: boolean;
  setSuppressExternalLlmSensitiveWarning: Dispatch<SetStateAction<boolean>>;
  loadPipelineSettings: () => Promise<void>;
  savePipelineSettings: (vaultPath: string, apiKey: string, pageId: string) => Promise<boolean>;
  saveExternalLlmWarningPreference: (suppress: boolean) => Promise<boolean>;
  exportToObsidian: (title: string, content: string, tags?: string[], originals?: OriginalExportDocument[]) => Promise<{ status: string; message: string; filename?: string; filepath?: string }>;
  exportToNotion: (title: string, content: string, originals?: OriginalExportDocument[]) => Promise<{ status: string; message: string }>;
  triggerNotionLogin: () => Promise<void>;
  fetchNotionPages: () => Promise<{ id: string; title: string; url: string }[]>;
}

// 지식 파이프라인(Obsidian/Notion export·설정·Notion OAuth) 도메인. 외부 의존은 addLog 하나뿐.
export function usePipelineDomain(addLog: (msg: string) => void): PipelineDomain {
  // 지식 파이프라인 연동 설정 상태
  const [obsidianVaultPath, setObsidianVaultPath] = useState("");
  const [notionApiKey, setNotionApiKey] = useState("");
  const [notionPageId, setNotionPageId] = useState("");
  const [suppressExternalLlmSensitiveWarning, setSuppressExternalLlmSensitiveWarning] = useState(false);

  const notionAuthPollingTimerRef = useRef<number | null>(null);
  const notionAuthPollingAttemptsRef = useRef(0);

  const stopNotionAuthPolling = () => {
    if (notionAuthPollingTimerRef.current !== null) {
      window.clearInterval(notionAuthPollingTimerRef.current);
      notionAuthPollingTimerRef.current = null;
    }
    notionAuthPollingAttemptsRef.current = 0;
  };

  // 언마운트 시 활성 Notion 폴링 타이머 정리
  useEffect(() => {
    return () => {
      stopNotionAuthPolling();
    };
  }, []);

  // 지식 파이프라인 연동 설정 불러오기
  const loadPipelineSettings = async () => {
    try {
      const response = await fetch(`${API_BASE}/api/settings`);
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
      const response = await fetch(`${API_BASE}/api/settings`, {
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
      const response = await fetch(`${API_BASE}/api/settings`, {
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
  const exportToObsidian = async (title: string, content: string, tags?: string[], originals: OriginalExportDocument[] = []) => {
    try {
      addLog(`Obsidian으로 내보내는 중... 제목: "${title}"`);
      const response = await fetch(`${API_BASE}/api/export/obsidian`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, content, tags: tags || ["workspace"], originals })
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
  const exportToNotion = async (title: string, content: string, originals: OriginalExportDocument[] = []) => {
    try {
      addLog(`Notion으로 내보내는 중... 제목: "${title}"`);
      const response = await fetch(`${API_BASE}/api/export/notion`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, content, originals })
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
    stopNotionAuthPolling();
    addLog("Notion OAuth 로그인 창을 엽니다...");
    try {
      const response = await fetch(`${API_BASE}/api/auth/notion/url`);
      const data = await response.json();
      if (data.status === "success" && data.url) {
        addLog("Notion 로그인 링크를 브라우저에 엽니다...");
        try {
          const { openUrl } = await import("@tauri-apps/plugin-opener");
          await openUrl(data.url);
        } catch {
          window.open(data.url, "_blank");
        }

        notionAuthPollingTimerRef.current = window.setInterval(async () => {
          notionAuthPollingAttemptsRef.current += 1;
          try {
            const res = await fetch(`${API_BASE}/api/settings`);
            const settingsData = await res.json();
            if (res.ok && settingsData.notion_api_key) {
              setNotionApiKey(settingsData.notion_api_key);
              setNotionPageId(settingsData.notion_page_id || "");
              addLog("Notion OAuth 연동 성공!");
              stopNotionAuthPolling();
            }
          } catch (err) {
            console.error("Notion 로그인 상태 체크 에러:", err);
          }
          if (notionAuthPollingAttemptsRef.current >= 60) {
            stopNotionAuthPolling();
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
      const response = await fetch(`${API_BASE}/api/notion/pages`);
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

  return {
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
  };
}
