import os
import json
from pathlib import Path
from dotenv import load_dotenv

# 포터블 환경 구성을 위해 프로젝트 루트의 data 폴더를 기본으로 사용
BASE_DIR = Path(__file__).resolve().parent
DATA_DIR = BASE_DIR / "data"

# 필수 폴더 자동 생성
DATA_DIR.mkdir(parents=True, exist_ok=True)
(DATA_DIR / "raw").mkdir(parents=True, exist_ok=True)
(DATA_DIR / "vectordb").mkdir(parents=True, exist_ok=True)
(DATA_DIR / "models").mkdir(parents=True, exist_ok=True)

# 환경 변수 로드
env_path = BASE_DIR / ".env"
load_dotenv(dotenv_path=env_path)

class Config:
    DATA_DIR = DATA_DIR
    VECTOR_DB_PATH = DATA_DIR / "vectordb"
    CREDENTIALS_PATH = DATA_DIR / "client_secrets.json"
    TOKEN_PATH = DATA_DIR / "token.json"
    MODELS_DIR = DATA_DIR / "models"
    USER_CONFIG_PATH = DATA_DIR / "config.json"

    def __init__(self):
        # JSON 기반 사용자 설정 파일 우선 로드 및 오버라이드
        self.load_user_config()

    def load_user_config(self):
        if self.USER_CONFIG_PATH.exists():
            try:
                with open(self.USER_CONFIG_PATH, "r", encoding="utf-8") as f:
                    data = json.load(f)
                if "LLM_SERVE_MODE" in data:
                    self.LLM_SERVE_MODE = data["LLM_SERVE_MODE"]
                if "LLM_MODEL" in data:
                    self.LLM_MODEL = data["LLM_MODEL"]
                if "OLLAMA_BASE" in data:
                    self.OLLAMA_BASE = data["OLLAMA_BASE"]
                if "LLM_API_BASE" in data:
                    self.LLM_API_BASE = data["LLM_API_BASE"]
            except Exception as e:
                import logging
                logging.getLogger(__name__).error(f"사용자 설정 로드 중 오류: {e}")

    def save_user_config(self, updates: dict):
        try:
            data = {}
            if self.USER_CONFIG_PATH.exists():
                try:
                    with open(self.USER_CONFIG_PATH, "r", encoding="utf-8") as f:
                        data = json.load(f)
                except Exception:
                    pass
            data.update(updates)
            # 인스턴스 변수 실시간 동기화
            for key, val in updates.items():
                if hasattr(self, key):
                    setattr(self, key, val)
                    
            with open(self.USER_CONFIG_PATH, "w", encoding="utf-8") as f:
                json.dump(data, f, indent=4, ensure_ascii=False)
        except Exception as e:
            import logging
            logging.getLogger(__name__).error(f"사용자 설정 저장 중 오류: {e}")

    # -------------------------------------------------------------------
    # LLM 추론 서버 설정
    # LLM_SERVE_MODE:
    #   "llamacpp" — 내장 llama.cpp 서버를 자동 기동 (기본값)
    #   "ollama"   — 로컬 Ollama 서버에 연결
    #   "external" — 사용자가 직접 입력한 외부 OpenAI 호환 서버에 연결
    # -------------------------------------------------------------------
    LLM_SERVE_MODE: str = os.getenv("LLM_SERVE_MODE", "llamacpp")
    LLM_MODEL: str = os.getenv("LLM_MODEL", "")

    # llama.cpp 내장 서버 기본 주소 (LLM_SERVE_MODE="llamacpp")
    LLAMACPP_HOST: str = os.getenv("LLAMACPP_HOST", "127.0.0.1")
    LLAMACPP_PORT: int = int(os.getenv("LLAMACPP_PORT", "8080"))

    # Ollama 서버 주소 (LLM_SERVE_MODE="ollama")
    OLLAMA_BASE: str = os.getenv("OLLAMA_BASE", "http://localhost:11434/v1")

    # 외부 API 주소 (LLM_SERVE_MODE="external" 또는 레거시 호환용)
    LLM_API_BASE: str = os.getenv("LLM_API_BASE", "http://127.0.0.1:8080/v1")
    LLM_API_KEY: str = os.getenv("LLM_API_KEY", "not-needed")

    # -------------------------------------------------------------------
    # ChromaDB 설정
    # -------------------------------------------------------------------
    CHROMA_DB_PATH = DATA_DIR / "vectordb"
    CHROMA_COLLECTION_GMAIL: str = "gws_gmail"
    CHROMA_COLLECTION_DRIVE: str = "gws_drive"

    # -------------------------------------------------------------------
    # 하네스 에이전트 설정
    # -------------------------------------------------------------------
    HARNESS_MAX_TURNS: int = int(os.getenv("HARNESS_MAX_TURNS", "15"))
    HARNESS_TOP_K: int = int(os.getenv("HARNESS_TOP_K", "5"))           # RAG 검색 top-k
    HARNESS_BM25_TOP_N: int = int(os.getenv("HARNESS_BM25_TOP_N", "4")) # 문장 압축 보존 개수

    # -------------------------------------------------------------------
    # Notion OAuth 설정
    # -------------------------------------------------------------------
    NOTION_CLIENT_ID: str = os.getenv("NOTION_CLIENT_ID", "")
    NOTION_CLIENT_SECRET: str = os.getenv("NOTION_CLIENT_SECRET", "")
    NOTION_REDIRECT_URI: str = os.getenv("NOTION_REDIRECT_URI", "http://localhost:18731/api/auth/notion/callback")


config = Config()
