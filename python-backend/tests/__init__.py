import os
from pathlib import Path


BACKEND_ROOT = Path(__file__).resolve().parents[1]
TEST_DATA_DIR = BACKEND_ROOT / "data" / "test-runtime"

os.environ.setdefault("LOCAL_LLM_GWS_DATA_DIR", str(TEST_DATA_DIR))
os.environ.setdefault("LOCAL_LLM_GWS_CHROMA_DB_PATH", str(TEST_DATA_DIR / "test-vectordb"))
