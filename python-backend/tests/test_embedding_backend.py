import importlib
import os
import sys
import types
import unittest
from pathlib import Path
from unittest.mock import patch

BACKEND_ROOT = Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

embedding = importlib.import_module("src.rag.embedding")


class _FakeOnnxVector:
    def __init__(self, text: str) -> None:
        self.text = text

    def tolist(self) -> list[float]:
        return [float(len(self.text))]


class _FakeOnnxEmbeddings:
    def __init__(self, docs: list[str]) -> None:
        self.docs = docs

    def __getitem__(self, index: int) -> _FakeOnnxVector:
        return _FakeOnnxVector(self.docs[index])

    def tolist(self) -> list[list[float]]:
        return [[float(len(doc))] for doc in self.docs]


class EmbeddingBackendTests(unittest.TestCase):
    def tearDown(self):
        embedding.reset_embedding_model_for_tests()

    def test_onnx_backend_uses_separate_collection_names(self):
        with patch.dict(os.environ, {"LOCAL_LLM_GWS_EMBEDDING_BACKEND": "onnx"}):
            self.assertEqual(embedding.collection_name("gws_gmail"), "gws_gmail_onnx")
            self.assertEqual(embedding.collection_name("gws_drive"), "gws_drive_onnx")

    def test_onnx_encoder_strips_e5_prefixes_and_keeps_encode_shape(self):
        seen_docs: list[str] = []

        class FakeONNXMiniLM:
            def __call__(self, docs: list[str]) -> _FakeOnnxEmbeddings:
                seen_docs.extend(docs)
                return _FakeOnnxEmbeddings(docs)

        chromadb = types.ModuleType("chromadb")
        setattr(chromadb, "__path__", [])
        chromadb_utils = types.ModuleType("chromadb.utils")
        setattr(chromadb_utils, "__path__", [])
        embedding_functions = types.ModuleType("chromadb.utils.embedding_functions")
        setattr(embedding_functions, "__path__", [])
        onnx_module = types.ModuleType("chromadb.utils.embedding_functions.onnx_mini_lm_l6_v2")
        setattr(onnx_module, "ONNXMiniLM_L6_V2", FakeONNXMiniLM)

        with patch.dict(
            sys.modules,
            {
                "chromadb": chromadb,
                "chromadb.utils": chromadb_utils,
                "chromadb.utils.embedding_functions": embedding_functions,
                "chromadb.utils.embedding_functions.onnx_mini_lm_l6_v2": onnx_module,
            },
        ), patch.dict(os.environ, {"LOCAL_LLM_GWS_EMBEDDING_BACKEND": "onnx"}):
            model = embedding.get_embedding_model()

            self.assertEqual(model.encode("query: 계약").tolist(), [2.0])
            self.assertEqual(model.encode(["passage: 자료", "plain"]).tolist(), [[2.0], [5.0]])

        self.assertEqual(seen_docs, ["계약", "자료", "plain"])


if __name__ == "__main__":
    unittest.main()
