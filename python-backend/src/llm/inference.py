"""
LLM 추론 클라이언트 모듈.

llama.cpp 서버(기본), Ollama, LM Studio 등
OpenAI 호환 /v1/chat/completions 엔드포인트에 httpx로 요청합니다.
DeepSeek R1 계열의 <think>...</think> 토큰 분리를 지원합니다.
"""

import re
import logging
from typing import Any, Dict, List, Optional

import httpx

from config import config

logger = logging.getLogger(__name__)

# <think>...</think> 블록 정규식
_THINK_RE = re.compile(r"<think>(.*?)</think>", re.DOTALL)


def _get_base_url() -> str:
    """현재 LLM_SERVE_MODE에 맞는 베이스 URL을 반환합니다."""
    mode = config.LLM_SERVE_MODE
    if mode == "llamacpp":
        return f"http://{config.LLAMACPP_HOST}:{config.LLAMACPP_PORT}/v1"
    elif mode == "ollama":
        return config.OLLAMA_BASE
    else:
        return config.LLM_API_BASE


def _parse_think(text: str) -> tuple[str, Optional[str]]:
    """
    텍스트에서 <think>...</think> 블록을 분리합니다.

    반환값:
        (answer_text, internal_thought | None)
    """
    match = _THINK_RE.search(text)
    if match:
        thought = match.group(1).strip()
        answer = _THINK_RE.sub("", text).strip()
        return answer, thought
    return text.strip(), None


def _message_text(message: Dict[str, Any]) -> tuple[str, Optional[str]]:
    raw_text = str(message.get("content") or "")
    content, thought = _parse_think(raw_text)
    reasoning = str(message.get("reasoning") or message.get("reasoning_content") or "").strip()
    return content, thought or reasoning or None


def chat_completion(
    messages: List[Dict[str, str]],
    model: Optional[str] = None,
    max_tokens: int = 512,
    temperature: float = 0.7,
    json_mode: bool = False,
    endpoint: Optional[str] = None,
    timeout: float = 120.0,
) -> Dict[str, Any]:
    """
    OpenAI 호환 /v1/chat/completions 엔드포인트에 동기 요청을 보냅니다.

    Args:
        messages:     [{"role": "...", "content": "..."}] 형식의 메시지 목록
        model:        모델명 (None이면 서버 기본값 사용)
        max_tokens:   최대 생성 토큰 수
        temperature:  샘플링 온도
        json_mode:    True이면 response_format={"type":"json_object"} 강제
        endpoint:     None이면 config의 LLM_SERVE_MODE 기반 URL 사용
        timeout:      HTTP 타임아웃(초)

    반환값:
        {
            "content": str,           # LLM 최종 응답 텍스트 (<think> 블록 제거 후)
            "thought": str | None,    # DeepSeek R1의 내부 추론 로그 (있을 경우)
            "usage": {...},           # 토큰 사용량
            "raw": {...},             # 원본 API 응답 전체
        }
        또는 오류 시: {"error": str}
    """
    base_url = endpoint or _get_base_url()
    url = f"{base_url.rstrip('/')}/chat/completions"

    payload: Dict[str, Any] = {
        "messages": messages,
        "max_tokens": max_tokens,
        "temperature": temperature,
    }
    target_model = model or config.LLM_MODEL
    if target_model:
        payload["model"] = target_model
    if json_mode:
        payload["response_format"] = {"type": "json_object"}
    if config.LLM_SERVE_MODE == "ollama":
        payload["reasoning"] = {"effort": "none"}

    headers = {
        "Content-Type": "application/json",
        "Authorization": f"Bearer {config.LLM_API_KEY}",
    }

    try:
        with httpx.Client(timeout=timeout) as client:
            resp = client.post(url, json=payload, headers=headers)
            resp.raise_for_status()
            data = resp.json()

        message = data["choices"][0]["message"]
        content, thought = _message_text(message)

        return {
            "content": content,
            "thought": thought,
            "usage": data.get("usage", {}),
            "raw": data,
        }

    except httpx.HTTPStatusError as e:
        logger.error(f"LLM API HTTP 오류: {e.response.status_code} — {e.response.text}")
        return {"error": f"HTTP {e.response.status_code}: {e.response.text[:200]}"}
    except httpx.RequestError as e:
        logger.error(f"LLM API 연결 오류: {e}")
        return {"error": f"연결 실패: {e}"}
    except Exception as e:
        logger.error(f"LLM API 알 수 없는 오류: {e}")
        return {"error": str(e)}


def test_connection(endpoint: Optional[str] = None, model: Optional[str] = None) -> Dict[str, Any]:
    """서버 연결 상태를 ping으로 검증합니다."""
    result = chat_completion(
        messages=[{"role": "user", "content": "ping"}],
        model=model,
        max_tokens=5,
        temperature=0.0,
        endpoint=endpoint,
        timeout=10.0,
    )
    if "error" in result:
        return {"status": "error", "message": result["error"]}
    return {"status": "success", "message": "연결 성공"}
