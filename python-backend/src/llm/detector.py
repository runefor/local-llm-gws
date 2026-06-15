import logging
from concurrent.futures import ThreadPoolExecutor
from typing import List, Dict, Any, Optional
import httpx

logger = logging.getLogger(__name__)

SERVERS_TO_SCAN = [
    {
        "name": "Ollama",
        "url": "http://localhost:11434",
        "api_base": "http://localhost:11434/v1",
        "type": "ollama"
    },
    {
        "name": "LM Studio",
        "url": "http://localhost:1234",
        "api_base": "http://localhost:1234/v1",
        "type": "lm_studio"
    },
    {
        "name": "Jan",
        "url": "http://localhost:1337",
        "api_base": "http://localhost:1337/v1",
        "type": "jan"
    },
    {
        "name": "llama.cpp",
        "url": "http://localhost:8080",
        "api_base": "http://localhost:8080/v1",
        "type": "llamacpp"
    }
]

def check_server(server: Dict[str, str]) -> Optional[Dict[str, Any]]:
    name = server["name"]
    url = server["url"]
    api_base = server["api_base"]
    server_type = server["type"]
    
    try:
        # 성능을 위해 타임아웃을 짧게(0.4초) 잡습니다.
        with httpx.Client(timeout=0.4) as client:
            if server_type == "ollama":
                # Ollama 자체 api/tags API 시도
                try:
                    resp = client.get(f"{url}/api/tags")
                    if resp.status_code == 200:
                        data = resp.json()
                        models = [m["name"] for m in data.get("models", [])]
                        return {
                            "name": name,
                            "url": url,
                            "api_base": api_base,
                            "models": models,
                            "status": "online"
                        }
                except Exception:
                    pass
                
                # OpenAI 호환 models API 시도
                try:
                    resp = client.get(f"{api_base}/models")
                    if resp.status_code == 200:
                        data = resp.json()
                        models = [m["id"] for m in data.get("data", [])]
                        return {
                            "name": name,
                            "url": url,
                            "api_base": api_base,
                            "models": models,
                            "status": "online"
                        }
                except Exception:
                    pass
                    
            else:
                # 일반 OpenAI 호환 API 서버들
                resp = client.get(f"{api_base}/models")
                if resp.status_code == 200:
                    data = resp.json()
                    models = [m["id"] for m in data.get("data", [])]
                    return {
                        "name": name,
                        "url": url,
                        "api_base": api_base,
                        "models": models,
                        "status": "online"
                    }
                    
    except Exception as e:
        # 오프라인 상태일 경우 예외 무시
        pass
        
    return None

def detect_servers() -> List[Dict[str, Any]]:
    detected = []
    with ThreadPoolExecutor(max_workers=len(SERVERS_TO_SCAN)) as executor:
        results = executor.map(check_server, SERVERS_TO_SCAN)
        for res in results:
            if res:
                detected.append(res)
    return detected
