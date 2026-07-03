import contextlib
import importlib
import json
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

BACKEND_ROOT = Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

evidence_module = importlib.import_module("src.evidence")
evaluation = importlib.import_module("src.rag.evaluation")
retriever = importlib.import_module("src.rag.retriever")
eval_index = importlib.import_module("tests.support.eval_index")
FakeDeterministicEmbedder = eval_index.FakeDeterministicEmbedder
build_fixture_index = eval_index.build_fixture_index


FIXTURE_DIR = Path(__file__).resolve().parent / "fixtures"
CORPUS_PATH = FIXTURE_DIR / "rag_eval_corpus.json"
CASE_PATH = FIXTURE_DIR / "rag_eval_cases.json"


class RagEvalOfflineTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls._tmp = tempfile.TemporaryDirectory()
        corpus = json.loads(CORPUS_PATH.read_text(encoding="utf-8"))
        client, bm25_data = build_fixture_index(Path(cls._tmp.name), corpus)
        cls._client = client
        embedder = FakeDeterministicEmbedder()

        cls._stack = contextlib.ExitStack()
        cls._stack.enter_context(patch.object(retriever, "get_chroma_client", return_value=client))
        cls._stack.enter_context(patch.object(retriever, "get_embedding_model", return_value=embedder))
        cls._stack.enter_context(patch.object(retriever, "load_bm25_index", return_value=bm25_data))
        cls._stack.enter_context(
            patch.object(evidence_module, "STORE_PATH", Path(cls._tmp.name) / "evidence_store_unused.json")
        )
        cls.cases = json.loads(CASE_PATH.read_text(encoding="utf-8"))["cases"]

    @classmethod
    def tearDownClass(cls):
        cls._stack.close()
        system = getattr(cls._client, "_system", None)
        if system is not None and hasattr(system, "stop"):
            system.stop()
        if hasattr(cls._client, "clear_system_cache"):
            cls._client.clear_system_cache()
        cls._tmp.cleanup()

    def test_fixture_cases_meet_calibrated_search_quality(self):
        results = []
        for case in self.cases:
            chunks = retriever.retrieve_chunks(case["query"], top_k=12, sources=case.get("sources"))
            result_ids = [chunk["id"] for chunk in chunks]
            if case.get("sources"):
                self.assertTrue(all(chunk["source"] in case["sources"] for chunk in chunks), case["id"])
            self.assertFalse(any(result_id.startswith("drive_fallback_") for result_id in result_ids), case["id"])
            results.append(evaluation.evaluate_search_case(case, result_ids))

        self.assertTrue(all(result["passed"] for result in results), [r for r in results if not r["passed"]])

    def test_search_evidence_keeps_source_locations(self):
        for case in self.cases:
            with self.subTest(case=case["id"]):
                response = retriever.search_evidence(case["query"], top_k=12, sources=case.get("sources"))
                self.assertEqual(evaluation.missing_source_location_rate(response["evidence"]), 0.0)


if __name__ == "__main__":
    unittest.main()
