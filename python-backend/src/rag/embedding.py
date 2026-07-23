import logging
import os
import sys
from typing import Any, Iterable

logger = logging.getLogger(__name__)

EMBEDDING_BACKEND_ENV = "LOCAL_LLM_GWS_EMBEDDING_BACKEND"
SENTENCE_TRANSFORMERS_BACKEND = "sentence-transformers"
ONNX_BACKEND = "onnx"

_embedding_model: Any = None
_embedding_backend: str | None = None


def get_embedding_backend() -> str:
    value = os.getenv(EMBEDDING_BACKEND_ENV, "auto").strip().lower()
    if value in {"", "auto"}:
        return ONNX_BACKEND if getattr(sys, "frozen", False) else SENTENCE_TRANSFORMERS_BACKEND
    if value in {"onnx", "chroma-onnx"}:
        return ONNX_BACKEND
    if value in {"sentence-transformers", "sentence_transformers", "e5"}:
        return SENTENCE_TRANSFORMERS_BACKEND
    raise ValueError(
        f"지원하지 않는 임베딩 백엔드입니다: {value}. 사용 가능: auto, onnx, sentence-transformers"
    )


def collection_name(base_name: str) -> str:
    if get_embedding_backend() == ONNX_BACKEND:
        return f"{base_name}_onnx"
    return base_name


class _ChromaOnnxEncoder:
    def __init__(self) -> None:
        from chromadb.utils.embedding_functions.onnx_mini_lm_l6_v2 import ONNXMiniLM_L6_V2

        self._embedder = ONNXMiniLM_L6_V2()

    def encode(self, texts: str | Iterable[str]):
        single = isinstance(texts, str)
        docs = [texts] if single else list(texts)
        docs = [_strip_e5_prefix(text) for text in docs]
        embeddings = self._embedder(docs)
        return embeddings[0] if single else embeddings


def _strip_e5_prefix(text: str) -> str:
    for prefix in ("query: ", "passage: "):
        if text.startswith(prefix):
            return text[len(prefix) :]
    return text


def get_embedding_model():
    global _embedding_model, _embedding_backend

    backend = get_embedding_backend()
    if _embedding_model is not None and _embedding_backend == backend:
        return _embedding_model

    if backend == ONNX_BACKEND:
        logger.info("Chroma ONNX 임베딩 모델 로드 중...")
        _embedding_model = _ChromaOnnxEncoder()
    else:
        from sentence_transformers import SentenceTransformer

        logger.info("SentenceTransformer 모델 로드 중...")
        _embedding_model = SentenceTransformer("intfloat/multilingual-e5-small")
    _embedding_backend = backend
    return _embedding_model


def reset_embedding_model_for_tests() -> None:
    global _embedding_model, _embedding_backend
    _embedding_model = None
    _embedding_backend = None
