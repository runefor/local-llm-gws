import { useState } from "react";
import { API_BASE } from "../../api/client";

export interface DetectedServer {
  name: string;
  url: string;
  api_base: string;
  models: string[];
  status?: string;
}

export interface LlmDomain {
  llmEndpoint: string;
  setLlmEndpoint: (endpoint: string) => void;
  llmModel: string;
  setLlmModel: (model: string) => void;
  llmMode: "internal" | "external";
  setLlmMode: (mode: "internal" | "external") => void;
  saveLlmConfig: (endpoint: string, model: string, mode: "llamacpp" | "ollama" | "external") => Promise<void>;
  handleLlmDisconnect: () => Promise<void>;
  handleLlmTest: (overrideEndpoint?: string, overrideModel?: string) => Promise<void>;
  detectedServers: DetectedServer[];
  isDetecting: boolean;
  scanLocalServers: () => Promise<void>;
  fetchLlmConfig: () => Promise<void>;
}

// 로컬 LLM 설정/감지/테스트 도메인. 외부 의존은 addLog 하나뿐(AppProvider가 주입).
export function useLlmDomain(addLog: (msg: string) => void): LlmDomain {
  // LLM 설정 상태
  const [llmEndpoint, setLlmEndpoint] = useState("http://localhost:1234/v1");
  const [llmModel, setLlmModel] = useState("gemma4-9b-it");
  const [llmMode, setLlmMode] = useState<"internal" | "external">("internal");

  // 로컬 LLM 자동 감지 상태
  const [detectedServers, setDetectedServers] = useState<DetectedServer[]>([]);
  const [isDetecting, setIsDetecting] = useState<boolean>(false);

  const getStringProperty = (value: object, key: string): string => {
    const property = Reflect.get(value, key);
    return typeof property === "string" ? property : "";
  };

  const parseDetectedServers = (value: unknown): DetectedServer[] => {
    if (!Array.isArray(value)) return [];
    return value.flatMap((item) => {
      if (!item || typeof item !== "object") return [];
      const modelsValue = Reflect.get(item, "models");
      const models = Array.isArray(modelsValue)
        ? modelsValue.filter((model): model is string => typeof model === "string")
        : [];
      const server: DetectedServer = {
        name: getStringProperty(item, "name"),
        url: getStringProperty(item, "url"),
        api_base: getStringProperty(item, "api_base"),
        models,
        status: getStringProperty(item, "status") || undefined,
      };
      return server.name && server.url && server.api_base ? [server] : [];
    });
  };

  // 백엔드로부터 LLM 설정 로드
  const fetchLlmConfig = async () => {
    try {
      const response = await fetch(`${API_BASE}/api/llm/config`);
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
      const response = await fetch(`${API_BASE}/api/llm/config`, {
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
      const response = await fetch(`${API_BASE}/api/llm/test`, {
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
      }
    } catch (error) {
      addLog(`로컬 LLM 연결 오류 발생: ${error instanceof Error ? error.message : "네트워크 오류"}`);
    }
  };

  // 실행 중인 로컬 LLM 서버 자동 감지 API 호출
  const scanLocalServers = async () => {
    setIsDetecting(true);
    try {
      const response = await fetch(`${API_BASE}/api/llm/detect`);
      const data = await response.json();
      if (data.status === "success") {
        setDetectedServers(parseDetectedServers(data.servers));
      }
    } catch (error) {
      console.error("로컬 LLM 서버 감지 실패:", error);
    } finally {
      setIsDetecting(false);
    }
  };

  return {
    llmEndpoint,
    setLlmEndpoint,
    llmModel,
    setLlmModel,
    llmMode,
    setLlmMode,
    saveLlmConfig,
    handleLlmDisconnect,
    handleLlmTest,
    detectedServers,
    isDetecting,
    scanLocalServers,
    fetchLlmConfig,
  };
}
