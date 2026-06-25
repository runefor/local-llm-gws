import json
import os
from pathlib import Path
from typing import Mapping

from config import config

SETTINGS_FILE = config.DATA_DIR / "settings.json"

DEFAULT_SETTINGS = {
    "obsidian_vault_path": "",
    "notion_api_key": "",
    "notion_page_id": "",
    "suppress_external_llm_sensitive_warning": False,
}

def load_settings() -> dict:
    """data/settings.json 파일에서 사용자의 외부 서비스 연동 설정을 불러옵니다."""
    if not SETTINGS_FILE.exists():
        save_settings(DEFAULT_SETTINGS)
        return DEFAULT_SETTINGS
    
    try:
        with open(SETTINGS_FILE, "r", encoding="utf-8") as f:
            data = json.load(f)
            # 신규 키 누락 대비 폴백
            for k, v in DEFAULT_SETTINGS.items():
                if k not in data:
                    data[k] = v
            return data
    except Exception:
        return DEFAULT_SETTINGS

def _write_json_atomic(path: Path, payload: object) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp_path = path.with_name(f"{path.name}.tmp")
    try:
        with open(tmp_path, "w", encoding="utf-8") as f:
            json.dump(payload, f, ensure_ascii=False, indent=2)
            f.flush()
            os.fsync(f.fileno())
        tmp_path.replace(path)
    except Exception:
        tmp_path.unlink(missing_ok=True)
        raise


def save_settings(settings: Mapping[str, object]) -> bool:
    """data/settings.json 파일에 사용자의 외부 서비스 연동 설정을 저장합니다."""
    try:
        existing_settings = {}
        if SETTINGS_FILE.exists():
            with open(SETTINGS_FILE, "r", encoding="utf-8") as f:
                loaded = json.load(f)
                if isinstance(loaded, dict):
                    existing_settings = loaded

        # 안전한 키 필터링: 기본값 < 기존 저장값 < 이번 요청값 순서로 병합해
        # 일부 설정만 저장하는 요청이 Obsidian/Notion 값을 지우지 않도록 한다.
        clean_settings = {}
        for k, default_value in DEFAULT_SETTINGS.items():
            clean_settings[k] = settings.get(k, existing_settings.get(k, default_value))

        _write_json_atomic(SETTINGS_FILE, clean_settings)
        return True
    except Exception:
        return False
