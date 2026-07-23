import hashlib
import importlib
import math
import sys
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, cast

config = importlib.import_module("config").config
_indexer = importlib.import_module("src.rag.indexer")
get_chroma_collection = _indexer.get_chroma_collection
get_chroma_collection_name = _indexer.get_chroma_collection_name
tokenize_text = _indexer.tokenize_text


def _import_real_module(name: str):
    module = sys.modules.get(name)
    if module is not None and getattr(module, "__file__", None) is None:
        for loaded_name in list(sys.modules):
            if loaded_name == name or loaded_name.startswith(f"{name}."):
                del sys.modules[loaded_name]
    return importlib.import_module(name)


class _Vector:
    def __init__(self, values: list[float]):
        self._values = values

    def tolist(self) -> list[float]:
        return list(self._values)


class FakeDeterministicEmbedder:
    def encode(self, text: str) -> _Vector:
        normalized = text
        for prefix in ("query: ", "passage: "):
            if normalized.startswith(prefix):
                normalized = normalized[len(prefix):]
                break

        values = [0.0] * 128
        for token in tokenize_text(normalized):
            index = int(hashlib.md5(token.encode()).hexdigest(), 16) % len(values)
            values[index] += 1.0

        norm = math.sqrt(sum(value * value for value in values))
        if norm:
            values = [value / norm for value in values]

        return _Vector(values)


def build_fixture_index(tmp_dir: Path, corpus: list[dict[str, Any]]) -> tuple[Any, Dict[str, Any]]:
    chromadb = _import_real_module("chromadb")
    Settings = _import_real_module("chromadb.config").Settings
    BM25Okapi = _import_real_module("rank_bm25").BM25Okapi

    client = chromadb.PersistentClient(
        path=str(tmp_dir),
        settings=Settings(anonymized_telemetry=False),
    )
    gmail_collection = get_chroma_collection(client, get_chroma_collection_name(config.CHROMA_COLLECTION_GMAIL))
    drive_collection = get_chroma_collection(client, get_chroma_collection_name(config.CHROMA_COLLECTION_DRIVE))
    embedder = FakeDeterministicEmbedder()

    chunks = []
    tokenized_corpus = []
    for doc in corpus:
        source = doc["source"]
        content = doc["content"]
        metadata = cast(dict[str, Any], doc["metadata"])
        collection = gmail_collection if source == "gmail" else drive_collection
        collection.add(
            ids=[doc["id"]],
            embeddings=[embedder.encode(f"passage: {content}").tolist()],
            documents=[content],
            metadatas=[metadata],
        )
        chunk = {
            "id": doc["id"],
            "content": content,
            "metadata": metadata,
            "source": source,
        }
        chunks.append(chunk)
        tokenized_corpus.append(tokenize_text(content))

    return client, {
        "bm25": BM25Okapi(tokenized_corpus),
        "chunks": chunks,
        "timestamp": datetime.now().isoformat(),
    }
