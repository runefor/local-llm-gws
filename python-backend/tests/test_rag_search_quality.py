import json
import sys
import unittest
from pathlib import Path

BACKEND_ROOT = Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from src.rag import evaluation


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


if __name__ == "__main__":
    unittest.main()
