import { useEffect, useRef, useState } from "react";
import { API_BASE } from "../../api/client";

export interface GoogleAuthDomain {
  isGwsAuthenticated: boolean;
  authChecking: boolean;
  checkGwsAuth: () => Promise<void>;
  triggerGoogleLogin: () => Promise<void>;
}

// Google Workspace 인증(상태 확인 + OAuth 로그인 폴링) 도메인. 외부 의존은 addLog 하나뿐.
export function useGoogleAuth(addLog: (msg: string) => void): GoogleAuthDomain {
  const [isGwsAuthenticated, setIsGwsAuthenticated] = useState<boolean>(false);
  const [authChecking, setAuthChecking] = useState(false);

  const googleAuthPollingTimerRef = useRef<number | null>(null);
  const googleAuthPollingAttemptsRef = useRef(0);

  const stopGoogleAuthPolling = () => {
    if (googleAuthPollingTimerRef.current !== null) {
      window.clearInterval(googleAuthPollingTimerRef.current);
      googleAuthPollingTimerRef.current = null;
    }
    googleAuthPollingAttemptsRef.current = 0;
  };

  // 언마운트 시 활성 Google 인증 폴링 타이머 정리
  useEffect(() => {
    return () => {
      stopGoogleAuthPolling();
    };
  }, []);

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

  return { isGwsAuthenticated, authChecking, checkGwsAuth, triggerGoogleLogin };
}
