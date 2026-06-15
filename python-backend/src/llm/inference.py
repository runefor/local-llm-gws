import os
from typing import Dict, List, Any
from pathlib import Path

try:
    from llama_cpp import Llama
    _llama_available = True
except ImportError:
    _llama_available = False
    Llama = None

from config import config
from src.llm.manager import get_local_models

# 싱글톤 인스턴스 보관
_llm_instance = None
_current_model_path = None

def load_model(model_filename: str) -> bool:
    """지정한 모델 파일을 메모리에 로드합니다."""
    global _llm_instance, _current_model_path
    
    if not _llama_available:
        raise RuntimeError("llama-cpp-python 패키지가 설치되지 않았습니다.")
        
    model_path = Path(config.MODELS_DIR) / model_filename
    if not model_path.exists():
        raise FileNotFoundError(f"모델 파일을 찾을 수 없습니다: {model_path}")
        
    # 이미 같은 모델이 로드되어 있으면 재사용
    if _llm_instance is not None and _current_model_path == str(model_path):
        return True
        
    # 기존 인스턴스 해제
    if _llm_instance is not None:
        del _llm_instance
        _llm_instance = None
        
    try:
        # n_ctx(컨텍스트 윈도우)와 n_gpu_layers 등은 필요에 따라 튜닝 가능
        _llm_instance = Llama(
            model_path=str(model_path),
            n_ctx=4096,
            n_threads=max(1, os.cpu_count() - 1),
            verbose=False
        )
        _current_model_path = str(model_path)
        return True
    except Exception as e:
        print(f"Error loading model: {e}")
        return False

def chat_completion(model_filename: str, messages: List[Dict[str, str]], max_tokens: int = 512, temperature: float = 0.7) -> Dict[str, Any]:
    """OpenAI API 호환 형식으로 채팅 응답을 생성합니다."""
    global _llm_instance
    
    if not _llama_available:
        return {"error": "llama-cpp-python이 설치되어 있지 않습니다. pip로 설치해 주세요."}
        
    # 모델 로드 확인 및 로드
    try:
        load_model(model_filename)
    except Exception as e:
        return {"error": str(e)}
        
    if _llm_instance is None:
        return {"error": "모델 로드 실패"}
        
    try:
        # llama_cpp의 기본 chat 포맷 사용 (최신 버전은 create_chat_completion 지원)
        response = _llm_instance.create_chat_completion(
            messages=messages,
            max_tokens=max_tokens,
            temperature=temperature
        )
        return response
    except Exception as e:
        return {"error": f"추론 에러: {str(e)}"}
