import { useEffect, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import { isTauri } from "../../utils/env";
import { API_BASE } from "../../api/client";

export interface BackendHealthDomain {
  backendStatus: "connecting" | "online" | "offline";
  backendStartupError: string | null;
  checkBackend: () => Promise<void>;
}

// 백엔드 연결 상태(핑 + Tauri 사이드카 기동 실패 이벤트) 도메인. 외부 의존은 addLog 하나뿐.
export function useBackendHealth(addLog: (msg: string) => void): BackendHealthDomain {
  const [backendStatus, setBackendStatus] = useState<"connecting" | "online" | "offline">("connecting");
  const [backendStartupError, setBackendStartupError] = useState<string | null>(null);

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

  return { backendStatus, backendStartupError, checkBackend };
}
