import os
import psutil
import threading
from typing import List, Dict, Optional
from pathlib import Path
from huggingface_hub import hf_hub_download
from config import config

# 검증된 추천 모델 프리셋 리스트
PRESET_MODELS = [
    {
        "id": "qwen2.5-3b-instruct",
        "name": "Qwen 2.5 3B Instruct (초경량/8GB 추천)",
        "repo_id": "Qwen/Qwen2.5-3B-Instruct-GGUF",
        "filename": "qwen2.5-3b-instruct-q4_k_m.gguf",
        "ram_gb_required": 8,
        "description": "8GB 환경에서 매우 원활하게 구동되는 강력한 3B 크기의 최신 모델입니다."
    },
    {
        "id": "llama-3.2-3b-instruct",
        "name": "Llama 3.2 3B Instruct (초경량)",
        "repo_id": "bartowski/Llama-3.2-3B-Instruct-GGUF",
        "filename": "Llama-3.2-3B-Instruct-Q4_K_M.gguf",
        "ram_gb_required": 8,
        "description": "Meta의 최신 3B 경량 모델입니다."
    },
    {
        "id": "gemma-2-9b-it",
        "name": "Gemma 2 9B IT (표준/16GB 추천)",
        "repo_id": "bartowski/gemma-2-9b-it-GGUF",
        "filename": "gemma-2-9b-it-Q4_K_M.gguf",
        "ram_gb_required": 16,
        "description": "16GB 환경에 적합한 구글의 강력한 9B 모델입니다. 한국어 처리가 우수합니다."
    }
]

# 메모리 기반 다운로드 상태 추적용 변수
_download_tasks = {}

def get_system_ram_gb() -> int:
    """시스템의 총 RAM 용량을 GB 단위로 반환합니다."""
    return round(psutil.virtual_memory().total / (1024**3))

def get_recommended_model_id() -> str:
    """현재 시스템 사양에 맞는 추천 모델 ID를 반환합니다."""
    ram = get_system_ram_gb()
    if ram < 12:
        return "qwen2.5-3b-instruct"
    else:
        return "gemma-2-9b-it"

def get_preset_models() -> List[Dict]:
    return PRESET_MODELS

def get_local_models() -> List[Dict]:
    """로컬 models 디렉토리에 존재하는 GGUF 파일 목록을 반환합니다."""
    models_dir = Path(config.MODELS_DIR)
    local_files = []
    
    if models_dir.exists():
        for file in models_dir.glob("*.gguf"):
            matched_preset = next((p for p in PRESET_MODELS if p["filename"] == file.name), None)
            local_files.append({
                "filename": file.name,
                "path": str(file),
                "size_mb": round(file.stat().st_size / (1024**2), 2),
                "preset_id": matched_preset["id"] if matched_preset else None,
                "name": matched_preset["name"] if matched_preset else file.name
            })
    return local_files

def is_model_downloaded(filename: str) -> bool:
    models_dir = Path(config.MODELS_DIR)
    return (models_dir / filename).exists()

def download_model_background(preset_id: str):
    """백그라운드에서 모델을 다운로드합니다."""
    preset = next((p for p in PRESET_MODELS if p["id"] == preset_id), None)
    if not preset:
        raise ValueError("Invalid preset_id")
        
    filename = preset["filename"]
    if is_model_downloaded(filename):
        return
        
    if preset_id in _download_tasks and _download_tasks[preset_id]["status"] == "downloading":
        return
        
    _download_tasks[preset_id] = {
        "status": "downloading",
        "progress": 0.0,
        "error": None
    }
    
    def _download_thread():
        try:
            url = f"https://huggingface.co/{preset['repo_id']}/resolve/main/{preset['filename']}"
            models_dir = Path(config.MODELS_DIR)
            models_dir.mkdir(parents=True, exist_ok=True)
            
            dest_path = models_dir / preset["filename"]
            temp_path = models_dir / f"{preset['filename']}.downloading"
            
            import httpx
            # 리다이렉션을 추적하며 청크 단위 스트리밍을 수행합니다.
            with httpx.stream("GET", url, follow_redirects=True, timeout=60.0) as response:
                if response.status_code != 200:
                    raise Exception(f"HTTP 에러 {response.status_code}: 다운로드 주소에 접근할 수 없습니다.")
                
                total_bytes = int(response.headers.get("content-length", 0))
                downloaded_bytes = 0
                
                with open(temp_path, "wb") as f:
                    for chunk in response.iter_bytes(chunk_size=1024 * 1024):  # 1MB 청크
                        f.write(chunk)
                        downloaded_bytes += len(chunk)
                        if total_bytes > 0:
                            progress_val = round((downloaded_bytes / total_bytes) * 100, 1)
                            _download_tasks[preset_id]["progress"] = progress_val
            
            # 다운로드 완료 후 임시 파일을 정식 모델 경로로 교체
            if temp_path.exists():
                if dest_path.exists():
                    dest_path.unlink()
                temp_path.rename(dest_path)
                
            _download_tasks[preset_id]["status"] = "completed"
            _download_tasks[preset_id]["progress"] = 100.0
        except Exception as e:
            # 실패 시 다운로드 중이던 임시 파일 삭제
            temp_path = Path(config.MODELS_DIR) / f"{preset['filename']}.downloading"
            if temp_path.exists():
                try:
                    temp_path.unlink()
                except Exception:
                    pass
            _download_tasks[preset_id]["status"] = "error"
            _download_tasks[preset_id]["error"] = str(e)
            
    threading.Thread(target=_download_thread, daemon=True).start()


def get_download_status(preset_id: str) -> Optional[Dict]:
    """특정 모델의 다운로드 상태를 반환합니다."""
    return _download_tasks.get(preset_id)

def delete_local_model(filename: str) -> bool:
    """로컬 모델 파일을 삭제합니다."""
    filepath = Path(config.MODELS_DIR) / filename
    if filepath.exists():
        try:
            filepath.unlink()
            return True
        except Exception:
            return False
    return False
