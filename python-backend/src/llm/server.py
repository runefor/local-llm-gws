"""
llama.cpp 서버 프로세스 관리 모듈.

llama-server 바이너리를 서브프로세스로 기동하고,
FastAPI 백엔드가 종료될 때 함께 종료시킵니다.
"""

import subprocess
import threading
import time
import shutil
import logging
from pathlib import Path
from typing import Optional

import httpx

from config import config

logger = logging.getLogger(__name__)

# -----------------------------------------------------------------------
# 내부 상태
# -----------------------------------------------------------------------
_server_process: Optional[subprocess.Popen] = None
_server_lock = threading.Lock()
_current_model_path: Optional[str] = None

# llama.cpp 서버 바이너리 후보 이름 목록 (Windows / Linux / macOS 모두 대응)
_BINARY_CANDIDATES = [
    "llama-server",
    "llama-server.exe",
    "server",           # 구버전 llama.cpp 빌드
    "server.exe",
]


def _find_binary() -> Optional[Path]:
    """Tauri 리소스, PyInstaller frozen, 프로젝트 bin/, PATH 순으로 llama-server를 탐색합니다."""
    import sys

    # 1) Tauri 리소스 디렉토리 탐색 (릴리스 모드 - 최우선)
    resource_dir = getattr(config, 'TAURI_RESOURCE_DIR', '')
    if resource_dir:
        res_path = Path(resource_dir)
        for search_dir in [res_path / "bin", res_path]:
            for name in _BINARY_CANDIDATES:
                candidate = search_dir / name
                if candidate.exists():
                    return candidate

    # 2) PyInstaller frozen 환경 — exe 인접 경로 탐색
    if getattr(sys, 'frozen', False):
        exe_dir = Path(sys.executable).parent
        for search_dir in [exe_dir / "resources" / "bin", exe_dir / "bin", exe_dir]:
            for name in _BINARY_CANDIDATES:
                candidate = search_dir / name
                if candidate.exists():
                    return candidate

    # 3) 개발 모드 — 프로젝트 루트 bin/ 폴더
    project_root = Path(__file__).resolve().parents[3]
    for name in _BINARY_CANDIDATES:
        candidate = project_root / "bin" / name
        if candidate.exists():
            return candidate

    # 4) PATH 전역 탐색 (최하위 폴백)
    for name in _BINARY_CANDIDATES:
        found = shutil.which(name)
        if found:
            return Path(found)

    return None


def _wait_until_ready(host: str, port: int, timeout: float = 30.0) -> bool:
    """llama.cpp 서버의 /health 엔드포인트가 응답할 때까지 대기합니다."""
    url = f"http://{host}:{port}/health"
    deadline = time.time() + timeout
    while time.time() < deadline:
        try:
            r = httpx.get(url, timeout=2.0)
            if r.status_code == 200:
                return True
        except Exception:
            pass
        time.sleep(0.5)
    return False


def start_server(model_filename: str) -> dict:
    """
    지정한 GGUF 모델 파일로 llama.cpp 서버를 기동합니다.

    이미 같은 모델이 실행 중이면 재기동하지 않습니다.
    다른 모델이 실행 중이면 먼저 종료한 후 새 모델로 기동합니다.

    반환값:
        {"status": "running" | "started" | "error", "message": str}
    """
    global _server_process, _current_model_path

    model_dir = Path(config.MODELS_DIR).resolve()
    model_path = (model_dir / model_filename).resolve()
    if model_path.parent != model_dir:
        return {"status": "error", "message": "모델 파일을 찾을 수 없습니다."}
    if not model_path.exists():
        return {"status": "error", "message": f"모델 파일을 찾을 수 없습니다: {model_path}"}

    with _server_lock:
        # 이미 같은 모델로 실행 중인 경우
        if _server_process is not None and _server_process.poll() is None:
            if _current_model_path == str(model_path):
                return {"status": "running", "message": "이미 서버가 실행 중입니다."}
            # 다른 모델 → 먼저 종료
            _stop_server_internal()

        binary = _find_binary()
        if binary is None:
            return {
                "status": "error",
                "message": (
                    "llama-server 바이너리를 찾을 수 없습니다. "
                    "PATH에 llama-server를 추가하거나 프로젝트 bin/ 폴더에 배치해주세요."
                ),
            }

        host = config.LLAMACPP_HOST
        port = config.LLAMACPP_PORT

        cmd = [
            str(binary),
            "--model", str(model_path),
            "--host", host,
            "--port", str(port),
            "--ctx-size", "8192",
            "--n-gpu-layers", "99",   # GPU에 최대한 올리기 (없으면 CPU 폴백)
            "--flash-attn",           # Flash Attention (지원 시 속도 향상)
            "--log-disable",          # 콘솔 로그 억제
        ]

        logger.info(f"llama.cpp 서버 기동: {' '.join(cmd)}")
        try:
            _server_process = subprocess.Popen(
                cmd,
                stdout=subprocess.DEVNULL,
                stderr=subprocess.DEVNULL,
            )
            _current_model_path = str(model_path)
        except Exception as e:
            return {"status": "error", "message": f"서버 기동 실패: {e}"}

    # 서버가 준비될 때까지 대기 (최대 30초)
    if _wait_until_ready(host, port, timeout=30.0):
        logger.info(f"llama.cpp 서버 준비 완료: http://{host}:{port}")
        return {"status": "started", "message": f"서버가 시작되었습니다 (http://{host}:{port})"}
    with _server_lock:
        _stop_server_internal()
    return {"status": "error", "message": "서버가 30초 내에 응답하지 않았습니다."}


def _stop_server_internal():
    """_server_lock을 획득한 상태에서 서버를 종료합니다."""
    global _server_process, _current_model_path
    if _server_process is not None:
        try:
            _server_process.terminate()
            _server_process.wait(timeout=5)
        except Exception:
            try:
                _server_process.kill()
            except Exception:
                pass
        _server_process = None
        _current_model_path = None


def stop_server() -> dict:
    """실행 중인 llama.cpp 서버를 종료합니다."""
    with _server_lock:
        if _server_process is None or _server_process.poll() is not None:
            return {"status": "not_running", "message": "실행 중인 서버가 없습니다."}
        _stop_server_internal()
    return {"status": "stopped", "message": "서버를 종료했습니다."}


def get_server_status() -> dict:
    """현재 서버 상태를 반환합니다."""
    with _server_lock:
        if _server_process is None or _server_process.poll() is not None:
            return {
                "running": False,
                "model": None,
                "endpoint": None,
            }
        return {
            "running": True,
            "model": Path(_current_model_path).name if _current_model_path else None,
            "endpoint": f"http://{config.LLAMACPP_HOST}:{config.LLAMACPP_PORT}/v1",
        }
