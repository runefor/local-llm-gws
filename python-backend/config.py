import os
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
    
    # LLM API 서버 (기본값: llama.cpp / LM Studio 로컬 서버)
    LLM_API_BASE = os.getenv("LLM_API_BASE", "http://localhost:1234/v1")
    LLM_API_KEY = os.getenv("LLM_API_KEY", "not-needed")

config = Config()
