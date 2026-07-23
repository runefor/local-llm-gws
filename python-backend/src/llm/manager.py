import os
import subprocess
import threading
from typing import List, Dict, Optional
from pathlib import Path
from pydantic import BaseModel
from huggingface_hub import hf_hub_download
from config import config

# -----------------------------------------------------------------------
# 2026년형 추천 모델 프리셋 (Harness-1 문서 기반)
# -----------------------------------------------------------------------
PRESET_MODELS = [
    {
        "id": "qwen2.5-0.5b",
        "name": "Qwen2.5 0.5B Instruct (초경량/공개)",
        "repo_id": "Qwen/Qwen2.5-0.5B-Instruct-GGUF",
        "filename": "qwen2.5-0.5b-instruct-q4_k_m.gguf",
        "profile": "cpu_only",
        "ram_gb_required": 2,
        "vram_gb_required": 0,
        "description": "인증 없이 받을 수 있는 공식 Qwen 초경량 모델. 약 491MB의 Q4_K_M 파일로 한국어를 포함한 다국어 대화를 지원합니다.",
        "category": "recommended",
    },
    {
        "id": "exaone3-7.8b",
        "name": "LG EXAONE 3.0 7.8B (순수 한국어 최고성능)",
        "repo_id": "bartowski/EXAONE-3.0-7.8B-Instruct-GGUF",
        "filename": "EXAONE-3.0-7.8B-Instruct-Q4_K_M.gguf",
        "profile": "cpu_only",
        "ram_gb_required": 8,
        "vram_gb_required": 0,
        "description": "LG AI 연구원이 만든 토종 모델. 뜬금없이 중국어가 나오는 현상이 0%이며, 아주 자연스러운 한국어 문장력을 보여줍니다. (용량 약 4.6GB)",
        "category": "power_user",
    },
    {
        "id": "llama3.2-3b",
        "name": "Llama 3.2 3B Instruct (속도/품질 밸런스)",
        "repo_id": "bartowski/Llama-3.2-3B-Instruct-GGUF",
        "filename": "Llama-3.2-3B-Instruct-Q4_K_M.gguf",
        "profile": "cpu_only",
        "ram_gb_required": 8,
        "vram_gb_required": 0,
        "description": "약 2GB 수준으로 8GB 노트북에 가장 적합한 밸런스형 소형 모델. 중국어 이슈가 없는 안전한 선택입니다.",
        "category": "recommended",
    },
    {
        "id": "qwen3.5-9b",
        "name": "Qwen 3.5 9B Instruct (VRAM 6GB 추천)",
        "repo_id": "Qwen/Qwen3.5-9B-Instruct-GGUF",
        "filename": "qwen3.5-9b-instruct-q4_k_m.gguf",
        "profile": "entry_6gb",
        "ram_gb_required": 8,
        "vram_gb_required": 6,
        "description": "6GB VRAM 환경에서 35~55 tok/s. 한국어 지시 이행력이 뛰어납니다.",
        "category": "power_user",
    },
    {
        "id": "gemma4-12b-q4",
        "name": "Gemma 4 12B IT QAT Q4_0 (VRAM 8GB 추천)",
        "repo_id": "google/gemma-4-12b-it-qat-q4_0-gguf",
        "filename": "gemma-4-12b-it-qat-q4_0.gguf",
        "profile": "mid_8gb",
        "ram_gb_required": 16,
        "vram_gb_required": 8,
        "description": "QAT 기법으로 정확도 손실 없이 6.6GB VRAM만으로 구동. 초당 45~65 토큰.",
        "category": "power_user",
    },
    {
        "id": "gemma4-12b-q5",
        "name": "Gemma 4 12B IT Q5_K_M (VRAM 12GB 추천)",
        "repo_id": "bartowski/gemma-4-12b-it-GGUF",
        "filename": "gemma-4-12b-it-Q5_K_M.gguf",
        "profile": "high_12gb",
        "ram_gb_required": 16,
        "vram_gb_required": 12,
        "description": "12GB VRAM에서 50~90 tok/s. MMLU Pro 77.2% 기록, 구형 27B 성능 추월.",
        "category": "power_user",
    },
    {
        "id": "deepseek-r1-14b",
        "name": "DeepSeek-R1-Distill-Qwen-14B Q5_K_M (VRAM 16GB 추천)",
        "repo_id": "bartowski/DeepSeek-R1-Distill-Qwen-14B-GGUF",
        "filename": "DeepSeek-R1-Distill-Qwen-14B-Q5_K_M.gguf",
        "profile": "ultra_16gb",
        "ram_gb_required": 32,
        "vram_gb_required": 16,
        "description": "o1급 수리 논리력. 자가 디버깅 및 <think> 추론 체인 지원. 60~100 tok/s.",
        "category": "power_user",
    },
]

# 메모리 기반 다운로드 상태 추적
_download_tasks: Dict[str, Dict] = {}


# -----------------------------------------------------------------------
# 하드웨어 프로파일
# -----------------------------------------------------------------------
class HardwareProfile(BaseModel):
    ram_gb: int
    gpu_name: str = "없음"
    vram_gb: int = 0          # 0 = GPU 없음 또는 감지 실패
    profile_tier: str = "cpu_only"  # cpu_only / entry_6gb / mid_8gb / high_12gb / ultra_16gb


def _detect_vram_nvidia() -> tuple[str, int]:
    """nvidia-smi로 첫 번째 GPU 이름과 VRAM(GB)을 반환합니다."""
    try:
        out = subprocess.check_output(
            ["nvidia-smi", "--query-gpu=name,memory.total", "--format=csv,noheader,nounits"],
            timeout=5,
            stderr=subprocess.DEVNULL,
        ).decode().strip().split("\n")[0]
        parts = [p.strip() for p in out.split(",")]
        name = parts[0]
        vram_mb = int(parts[1])
        return name, vram_mb // 1024
    except Exception:
        return "", 0


def get_hardware_profile() -> HardwareProfile:
    """현재 시스템의 하드웨어 프로파일을 반환합니다."""
    import psutil

    ram_gb = round(psutil.virtual_memory().total / (1024 ** 3))
    gpu_name, vram_gb = _detect_vram_nvidia()

    if vram_gb == 0:
        tier = "cpu_only"
    elif vram_gb <= 6:
        tier = "entry_6gb"
    elif vram_gb <= 8:
        tier = "mid_8gb"
    elif vram_gb <= 12:
        tier = "high_12gb"
    else:
        tier = "ultra_16gb"

    return HardwareProfile(
        ram_gb=ram_gb,
        gpu_name=gpu_name or "없음",
        vram_gb=vram_gb,
        profile_tier=tier,
    )


def get_recommended_model_id() -> str:
    """현재 하드웨어 프로파일에 맞는 추천 모델 ID를 반환합니다."""
    hw = get_hardware_profile()
    lightweight_model_id = "qwen2.5-0.5b"

    if hw.ram_gb < 8:
        return lightweight_model_id
    tier_map = {
        "cpu_only":   lightweight_model_id,
        "entry_6gb":  "qwen3.5-9b",
        "mid_8gb":    "gemma4-12b-q4",
        "high_12gb":  "gemma4-12b-q5",
        "ultra_16gb": "deepseek-r1-14b",
    }
    return tier_map.get(hw.profile_tier, lightweight_model_id)


def get_preset_models() -> List[Dict]:
    return PRESET_MODELS


def get_local_models() -> List[Dict]:
    """로컬 models 디렉토리에 존재하는 GGUF 파일 목록을 반환합니다."""
    models_dir = Path(config.MODELS_DIR)
    local_files = []

    if models_dir.exists():
        for file in models_dir.glob("*.gguf"):
            matched = next((p for p in PRESET_MODELS if p["filename"] == file.name), None)
            local_files.append({
                "filename": file.name,
                "path": str(file),
                "size_mb": round(file.stat().st_size / (1024 ** 2), 2),
                "preset_id": matched["id"] if matched else None,
                "name": matched["name"] if matched else file.name,
                "profile": matched["profile"] if matched else "unknown",
            })
    return local_files


def is_model_downloaded(filename: str) -> bool:
    return (Path(config.MODELS_DIR) / filename).exists()


def download_model_background(preset_id: str):
    """백그라운드에서 HuggingFace로부터 모델을 다운로드합니다."""
    preset = next((p for p in PRESET_MODELS if p["id"] == preset_id), None)
    if not preset:
        raise ValueError(f"알 수 없는 preset_id: {preset_id}")

    filename = preset["filename"]
    if is_model_downloaded(filename):
        return

    if preset_id in _download_tasks and _download_tasks[preset_id]["status"] == "downloading":
        return

    _download_tasks[preset_id] = {"status": "downloading", "progress": 0.0, "error": None}

    def _thread():
        import httpx

        url = f"https://huggingface.co/{preset['repo_id']}/resolve/main/{preset['filename']}"
        models_dir = Path(config.MODELS_DIR)
        models_dir.mkdir(parents=True, exist_ok=True)
        dest = models_dir / filename
        tmp = models_dir / f"{filename}.downloading"

        try:
            with httpx.stream("GET", url, follow_redirects=True, timeout=60.0) as r:
                if r.status_code != 200:
                    raise Exception(f"HTTP {r.status_code}")
                total = int(r.headers.get("content-length", 0))
                done = 0
                with open(tmp, "wb") as f:
                    for chunk in r.iter_bytes(chunk_size=1024 * 1024):
                        f.write(chunk)
                        done += len(chunk)
                        if total > 0:
                            _download_tasks[preset_id]["progress"] = round(done / total * 100, 1)

            if tmp.exists():
                if dest.exists():
                    dest.unlink()
                tmp.rename(dest)

            _download_tasks[preset_id]["status"] = "completed"
            _download_tasks[preset_id]["progress"] = 100.0

        except Exception as e:
            if tmp.exists():
                try:
                    tmp.unlink()
                except Exception:
                    pass
            _download_tasks[preset_id]["status"] = "error"
            _download_tasks[preset_id]["error"] = str(e)

    threading.Thread(target=_thread, daemon=True).start()


def get_download_status(preset_id: str) -> Optional[Dict]:
    return _download_tasks.get(preset_id)


def delete_local_model(filename: str) -> bool:
    models_dir = Path(config.MODELS_DIR).resolve()
    filepath = (models_dir / filename).resolve()
    if filepath.parent != models_dir:
        return False
    if filepath.exists():
        try:
            filepath.unlink()
            return True
        except Exception:
            return False
    return False
