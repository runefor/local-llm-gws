import os
import json
import sys
from pathlib import Path
from urllib.parse import urlparse
from dotenv import load_dotenv

if getattr(sys, "frozen", False):
    # PyInstaller onefile 실행 파일에서는 __file__이 매 실행마다 새로 만들어지는
    # 임시 추출 폴더(_MEIxxxx)를 가리켜, 여기에 저장한 토큰/벡터DB/설정이 재시작 시
    # 사라진다. 배포본에서는 사용자 로컬 앱 데이터 폴더를 기준으로 삼는다.
    _persistent_base = os.environ.get("LOCALAPPDATA") or str(Path.home())
    BASE_DIR = Path(_persistent_base) / "local-llm-gws"
else:
    BASE_DIR = Path(__file__).resolve().parent
IS_UNITTEST_COMMAND = any(part == "discover" or part.endswith("unittest") or part == "tests" for part in sys.argv)
DEFAULT_DATA_DIR = BASE_DIR / "data" / "test-runtime" if IS_UNITTEST_COMMAND else BASE_DIR / "data"
DATA_DIR = Path(os.getenv("LOCAL_LLM_GWS_DATA_DIR", DEFAULT_DATA_DIR)).resolve()
DEFAULT_VECTOR_DB_DIR = DATA_DIR / ("test-vectordb" if IS_UNITTEST_COMMAND else "vectordb")
VECTOR_DB_DIR = Path(os.getenv("LOCAL_LLM_GWS_CHROMA_DB_PATH", DEFAULT_VECTOR_DB_DIR)).resolve()

# 필수 폴더 자동 생성
DATA_DIR.mkdir(parents=True, exist_ok=True)
(DATA_DIR / "raw").mkdir(parents=True, exist_ok=True)
VECTOR_DB_DIR.mkdir(parents=True, exist_ok=True)
(DATA_DIR / "models").mkdir(parents=True, exist_ok=True)

# 환경 변수 로드
env_path = BASE_DIR / ".env"
load_dotenv(dotenv_path=env_path)

class Config:
    DATA_DIR = DATA_DIR
    VECTOR_DB_PATH = VECTOR_DB_DIR
    CREDENTIALS_PATH = DATA_DIR / "client_secrets.json"
    TOKEN_PATH = DATA_DIR / "token.json"
    MODELS_DIR = DATA_DIR / "models"
    USER_CONFIG_PATH = DATA_DIR / "config.json"

    def __init__(self):
        # JSON 기반 사용자 설정 파일 우선 로드 및 오버라이드
        self.load_user_config()

    def _validate_google_client_config(self, path: Path) -> None:
        required = ("client_id", "client_secret", "auth_uri", "token_uri")
        try:
            with open(path, "r", encoding="utf-8") as f:
                data = json.load(f)
        except json.JSONDecodeError as e:
            raise ValueError(f"Google OAuth 설정 파일이 올바른 JSON이 아닙니다: {path}") from e
        except OSError as e:
            raise FileNotFoundError(f"Google OAuth 설정 파일을 읽을 수 없습니다: {path}") from e

        if not isinstance(data, dict):
            raise ValueError("Google OAuth 설정 파일의 최상위 값은 객체여야 합니다.")

        installed = data.get("installed")
        if not isinstance(installed, dict):
            raise ValueError("Google OAuth 설정 파일에 installed 객체가 없습니다.")

        missing = [
            field
            for field in required
            if not isinstance(installed.get(field), str) or not installed[field].strip()
        ]
        if missing:
            raise ValueError(f"Google OAuth 설정 파일에 필수 항목이 없습니다: {', '.join(missing)}")

        redirects = installed.get("redirect_uris")
        if not isinstance(redirects, list) or not any(
            isinstance(uri, str)
            and (parsed := urlparse(uri)).scheme == "http"
            and parsed.hostname in {"localhost", "127.0.0.1"}
            for uri in redirects
        ):
            raise ValueError("Google OAuth 설정 파일에 loopback redirect_uris 항목이 없습니다.")

    def resolve_google_client_config_path(self) -> Path:
        user_path = Path(self.CREDENTIALS_PATH)
        if user_path.exists():
            self._validate_google_client_config(user_path)
            return user_path

        if getattr(sys, "frozen", False):
            bundle_root = getattr(sys, "_MEIPASS", None)
            if not bundle_root:
                raise FileNotFoundError("앱의 Google OAuth 설정 경로를 확인할 수 없습니다.")
            bundled_path = Path(bundle_root) / "client_secrets.json"
            if bundled_path.exists():
                self._validate_google_client_config(bundled_path)
                return bundled_path
            raise FileNotFoundError(
                "앱에 Google OAuth 설정 파일이 포함되어 있지 않습니다. "
                "릴리스 빌드 입력 GOOGLE_OAUTH_CLIENT_CONFIG_PATH를 확인해 주세요."
            )

        raise FileNotFoundError(
            f"Google OAuth 설정 파일이 없습니다. 개발 환경에서는 {user_path}에 "
            "Desktop OAuth client JSON을 저장해 주세요."
        )

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
    CHROMA_DB_PATH = VECTOR_DB_DIR
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
