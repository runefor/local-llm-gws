import json
import logging
import re
from typing import Dict, Any, Optional

logger = logging.getLogger(__name__)

# JSON 마크다운 블록 매칭용 정규식
_JSON_BLOCK_RE = re.compile(r"```(?:json)?\s*(.*?)\s*```", re.DOTALL)

def parse_action(raw_output: Dict[str, Any]) -> Dict[str, Any]:
    """
    LLM 추론 응답에서 action JSON 객체를 파싱합니다.
    """
    content = raw_output.get("content", "").strip()
    
    # 1. 마크다운 ```json ... ``` 블록 추출 시도
    match = _JSON_BLOCK_RE.search(content)
    if match:
        json_str = match.group(1).strip()
    else:
        json_str = content
        
    # 2. JSON 형태에 해당하는 중괄호 범위만 잘라내어 강제 클리닝
    try:
        first_brace = json_str.find("{")
        last_brace = json_str.rfind("}")
        if first_brace != -1 and last_brace != -1:
            json_str = json_str[first_brace:last_brace+1]
    except Exception:
        pass
        
    # 3. JSON 역직렬화
    try:
        parsed = json.loads(json_str)
        
        # 필수 필드 누락 방지 기본값 세팅
        if "action" not in parsed:
            parsed["action"] = "search_knowledge"
        if "arguments" not in parsed:
            parsed["arguments"] = {}
        if "thought" not in parsed:
            parsed["thought"] = "상태 정보를 기반으로 계획을 수정합니다."
            
        return parsed
    except Exception as e:
        logger.error(f"JSON 파싱 실패: {e}. 원본 내용: {content}")
        # 실패 시 에러 내용을 담은 기본 액션 반환하여 루프 중단 방지
        return {
            "thought": f"이전 단계에서 JSON 응답 형식을 파싱하지 못했습니다: {e}. 다시 관련 정보를 탐색합니다.",
            "action": "search_knowledge",
            "arguments": {"query": "이메일 또는 드라이브 관련 정보"},
            "error": str(e)
        }
