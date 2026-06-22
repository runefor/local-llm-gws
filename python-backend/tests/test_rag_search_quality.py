import json
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

BACKEND_ROOT = Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from src.rag import evaluation
from src.rag import retriever
from src import evidence as evidence_module


FIXTURE_PATH = Path(__file__).resolve().parent / "fixtures" / "rag_eval_cases.json"


class RagSearchQualityTests(unittest.TestCase):
    def test_golden_cases_meet_minimum_search_quality_metrics(self):
        fixture = json.loads(FIXTURE_PATH.read_text(encoding="utf-8"))

        results = [evaluation.evaluate_search_case(case, case["result_ids"]) for case in fixture["cases"]]

        self.assertTrue(all(result["passed"] for result in results), results)
        self.assertEqual(results[0]["metrics"]["recall_at_5"], 1.0)
        self.assertEqual(results[0]["metrics"]["mrr"], 1.0)
        self.assertEqual(results[1]["metrics"]["mrr"], 0.5)

    def test_quality_metrics_expose_duplicate_and_source_location_regressions(self):
        self.assertGreater(evaluation.duplicate_rate(["a", "a", "b"]), 0.0)
        self.assertEqual(evaluation.recall_at(["expected"], ["noise"], 5), 0.0)
        self.assertEqual(evaluation.mean_reciprocal_rank(["expected"], ["noise", "expected"]), 0.5)

        records = [
            {"source_location": {"original_url": "https://example.invalid/doc"}},
            {"source_location": {"original_url": "", "location_label": ""}},
        ]
        self.assertEqual(evaluation.missing_source_location_rate(records), 0.5)

    def test_retriever_fuses_vector_and_keyword_results_with_match_reason(self):
        class FakeVector:
            def tolist(self):
                return [0.1, 0.2, 0.3]

        class FakeModel:
            def encode(self, _query):
                return FakeVector()

        class FakeCollection:
            def query(self, **_kwargs):
                return {
                    "ids": [["drive_noise_0"]],
                    "documents": [["무관한 일반 문서"]],
                    "metadatas": [[{"doc_id": "noise", "title": "소음", "source": "drive"}]],
                    "distances": [[0.1]],
                }

        class FakeClient:
            def get_or_create_collection(self, _name):
                return FakeCollection()

        class FakeBm25:
            def get_scores(self, _tokens):
                return [3.0]

        bm25_data = {
            "bm25": FakeBm25(),
            "chunks": [
                {
                    "id": "drive_contract_0",
                    "content": "계약서와 agreement 마감 일정이 정리된 문서",
                    "metadata": {"doc_id": "contract", "title": "계약 일정", "source": "drive"},
                    "source": "drive",
                }
            ],
        }

        with (
            patch.object(retriever, "get_embedding_model", return_value=FakeModel()),
            patch.object(retriever, "get_chroma_client", return_value=FakeClient()),
            patch.object(retriever, "load_bm25_index", return_value=bm25_data),
        ):
            results = retriever.retrieve_chunks("지난번 계약 일정", top_k=3, sources=["drive"])

        by_id = {result["id"]: result for result in results}
        self.assertIn("drive_contract_0", by_id)
        self.assertIn("키워드 검색", by_id["drive_contract_0"]["metadata"]["match_reason"])
        self.assertIn("drive_noise_0", by_id)

    def test_retriever_uses_relevance_feedback_to_personalize_rank(self):
        class FakeVector:
            def tolist(self):
                return [0.1, 0.2, 0.3]

        class FakeModel:
            def encode(self, _query):
                return FakeVector()

        class FakeCollection:
            def query(self, **_kwargs):
                return {
                    "ids": [["drive_noise_0", "drive_contract_0"]],
                    "documents": [["일반 회의 메모", "계약 일정 문서"]],
                    "metadatas": [[
                        {"doc_id": "noise", "title": "회의", "source": "drive"},
                        {"doc_id": "contract", "title": "계약 일정", "source": "drive"},
                    ]],
                    "distances": [[0.1, 0.2]],
                }

        class FakeClient:
            def get_or_create_collection(self, _name):
                return FakeCollection()

        with (
            tempfile.TemporaryDirectory() as tmp_dir,
            patch.object(evidence_module, "STORE_PATH", Path(tmp_dir) / "evidence_store.json"),
            patch.object(retriever, "get_embedding_model", return_value=FakeModel()),
            patch.object(retriever, "get_chroma_client", return_value=FakeClient()),
            patch.object(retriever, "load_bm25_index", return_value=None),
        ):
            evidence_module.record_relevance_feedback(
                query="계약 일정",
                evidence_id="ev_drive_contract_0",
                chunk_id="drive_contract_0",
                doc_id="contract",
                source="drive",
                feedback="relevant",
            )

            results = retriever.retrieve_chunks("계약 일정", top_k=2, sources=["drive"])

        self.assertEqual(results[0]["id"], "drive_contract_0")
        self.assertGreater(results[0]["metadata"]["personalization_score"], 0.0)


if __name__ == "__main__":
    unittest.main()
