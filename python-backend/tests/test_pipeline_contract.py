import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

BACKEND_ROOT = Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from src import evidence as evidence_module
from src.processor import pipeline


class PipelineContractTests(unittest.TestCase):
    def test_legacy_pipeline_returns_search_candidates_without_llm_summary(self):
        chunks = [
            {
                "source": "drive",
                "content": "프로젝트 킥오프 결정사항",
                "metadata": {
                    "doc_id": "drive-1",
                    "title": "Kickoff Notes",
                    "modifiedTime": "2026-06-01T00:00:00Z",
                },
            },
            {
                "source": "drive",
                "content": "후속 할 일",
                "metadata": {
                    "doc_id": "drive-1",
                    "title": "Kickoff Notes",
                    "modifiedTime": "2026-06-01T00:00:00Z",
                },
            },
        ]
        with patch.object(pipeline, "retrieve_chunks", return_value=chunks), patch.object(pipeline, "chat_completion") as chat_completion:
            result = pipeline.run_pipeline("킥오프", sources=["drive"])

        self.assertEqual(result["status"], "success")
        self.assertTrue(result["requires_evidence_set"])
        self.assertTrue(result["deprecated_direct_generation"])
        self.assertIn("정보 묶음", result["answer"])
        self.assertEqual(len(result["sources"]), 1)
        self.assertEqual(result["sources"][0]["chunk_count"], 2)
        chat_completion.assert_not_called()

    def test_wiki_artifact_prompt_requires_structured_grounded_sections(self):
        with tempfile.TemporaryDirectory() as tmp_dir, patch.object(evidence_module, "STORE_PATH", Path(tmp_dir) / "evidence_store.json"):
            evidence_set = evidence_module.create_evidence_set(
                title="프로젝트 정리",
                original_query="킥오프",
                evidence_items=[
                    {
                        "evidence_id": "ev_test1234",
                        "chunk_id": "chunk-1",
                        "doc_id": "doc-1",
                        "source": "drive",
                        "title": "Kickoff Notes",
                        "snippet": "결정사항",
                        "content_snapshot": "6월 1일 킥오프에서 다음 액션을 정했다.",
                        "date": "2026-06-01",
                        "source_location": {
                            "original_url": "https://drive.google.com/file/d/doc-1",
                            "location_label": "Drive 문서",
                            "provider_item_id": "doc-1",
                        },
                    }
                ],
            )
            with patch("src.llm.inference.chat_completion", return_value={"content": "## 요약\n킥오프 정리 [ev_test1234]"}) as chat_completion:
                artifact = evidence_module.create_artifact(evidence_set.id, "wiki", "프로젝트 Wiki로 정리")

        self.assertIsNotNone(artifact)
        assert artifact is not None
        prompt = chat_completion.call_args.kwargs["messages"][0]["content"]
        self.assertIn("## 핵심 사실", prompt)
        self.assertIn("## 원문 링크", prompt)
        self.assertIn("https://drive.google.com/file/d/doc-1", prompt)
        self.assertEqual(len(artifact.citation_map), 1)
        self.assertEqual(artifact.citation_map[0].evidence_id, "ev_test1234")


if __name__ == "__main__":
    unittest.main()
