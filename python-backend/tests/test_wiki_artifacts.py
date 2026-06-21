import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

BACKEND_ROOT = Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from fastapi.testclient import TestClient

import main
from src import evidence as evidence_module


HEADERS = {"host": "localhost:18731", "origin": "http://localhost:18732"}


def _evidence_item(evidence_id: str = "ev_contract_0"):
    return {
        "evidence_id": evidence_id,
        "chunk_id": "drive-contract-0",
        "doc_id": "drive-contract",
        "source": "drive",
        "title": "계약 일정",
        "snippet": "마감 일정",
        "content_snapshot": "계약서 최종 검토 마감은 6월 30일이다.",
        "date": "2026-06-01",
        "source_location": {
            "original_url": "https://drive.google.com/file/d/drive-contract",
            "location_label": "Drive: 계약 일정",
            "provider_item_id": "drive-contract",
        },
        "metadata": {
            "match_reason": "제목/본문에서 계약 일정이 일치했습니다.",
        },
    }


VALID_WIKI = """# 계약 일정 Wiki

## 요약
- 계약서 최종 검토 마감은 6월 30일이다. [ev_contract_0]

## 핵심 사실
- 마감 일정은 Drive 원문에서 확인된다. [ev_contract_0]

## 원문 링크
- [ev_contract_0] 계약 일정: https://drive.google.com/file/d/drive-contract

## 근거 부족
- 추가 의사결정자는 확인되지 않았다.
"""


class WikiArtifactContractTests(unittest.TestCase):
    def test_relevance_feedback_api_persists_search_signal(self):
        with tempfile.TemporaryDirectory() as tmp_dir, patch.object(evidence_module, "STORE_PATH", Path(tmp_dir) / "evidence_store.json"):
            client = TestClient(main.app)

            response = client.post(
                "/api/rag/feedback",
                headers=HEADERS,
                json={
                    "query": "계약 일정",
                    "evidence_id": "ev_contract_0",
                    "chunk_id": "drive-contract-0",
                    "doc_id": "drive-contract",
                    "source": "drive",
                    "feedback": "relevant",
                    "title": "계약 일정",
                    "match_reason": "제목/본문에서 계약 일정이 일치했습니다.",
                },
            ).json()

            self.assertEqual(response["status"], "success")
            feedback = response["feedback"]
            self.assertEqual(feedback["query"], "계약 일정")
            self.assertEqual(feedback["evidence_id"], "ev_contract_0")
            self.assertEqual(feedback["chunk_id"], "drive-contract-0")
            self.assertEqual(feedback["doc_id"], "drive-contract")
            self.assertEqual(feedback["source"], "drive")
            self.assertEqual(feedback["feedback"], "relevant")
            self.assertEqual(feedback["title"], "계약 일정")
            self.assertEqual(feedback["match_reason"], "제목/본문에서 계약 일정이 일치했습니다.")
            self.assertTrue(feedback["created_at"])

            saved = evidence_module._load_store()
            self.assertEqual(len(saved.relevance_feedback), 1)
            self.assertEqual(saved.relevance_feedback[0].feedback, "relevant")
            self.assertEqual(saved.relevance_feedback[0].doc_id, "drive-contract")
            self.assertEqual(saved.relevance_feedback[0].title, "계약 일정")
            self.assertEqual(saved.relevance_feedback[0].match_reason, "제목/본문에서 계약 일정이 일치했습니다.")

    def test_wiki_artifact_gets_schema_lint_and_approval_state(self):
        with tempfile.TemporaryDirectory() as tmp_dir, patch.object(evidence_module, "STORE_PATH", Path(tmp_dir) / "evidence_store.json"):
            evidence_set = evidence_module.create_evidence_set(
                title="계약 자료",
                original_query="계약 일정",
                evidence_items=[_evidence_item()],
            )
            with patch("src.llm.inference.chat_completion", return_value={"content": VALID_WIKI}):
                artifact = evidence_module.create_artifact(evidence_set.id, "wiki", "Wiki 후보 작성")

            self.assertIsNotNone(artifact)
            assert artifact is not None
            self.assertEqual(artifact.status, "candidate")
            self.assertEqual(artifact.title, "계약 일정 Wiki")
            self.assertEqual(artifact.lint["status"], "passed")
            self.assertEqual(artifact.frontmatter["source_count"], 1)
            self.assertEqual(artifact.frontmatter["evidence_ids"], ["ev_contract_0"])
            self.assertEqual(len(artifact.citation_map), 1)

            client = TestClient(main.app)
            approved = client.patch(
                f"/api/artifacts/{artifact.id}/status",
                headers=HEADERS,
                json={"status": "approved"},
            ).json()
            self.assertEqual(approved["status"], "success")
            self.assertEqual(approved["artifact"]["status"], "approved")
            self.assertIsNotNone(approved["artifact"]["approved_at"])

            edited = client.patch(
                f"/api/artifacts/{artifact.id}",
                headers=HEADERS,
                json={"content": "# 계약 일정 Wiki\n\n## 요약\n근거 없는 초안"},
            ).json()
            self.assertEqual(edited["status"], "success")
            self.assertEqual(edited["artifact"]["status"], "needs_review")
            self.assertIsNone(edited["artifact"]["approved_at"])

            rejected = client.patch(
                f"/api/artifacts/{artifact.id}/status",
                headers=HEADERS,
                json={"status": "approved"},
            ).json()
            self.assertEqual(rejected["status"], "error")
            self.assertIn("lint", rejected["message"])

    def test_empty_wiki_source_is_source_missing_without_llm_call(self):
        with tempfile.TemporaryDirectory() as tmp_dir, patch.object(evidence_module, "STORE_PATH", Path(tmp_dir) / "evidence_store.json"):
            evidence_set = evidence_module.create_evidence_set(
                title="빈 자료",
                original_query="없는 검색",
                evidence_items=[],
            )
            with patch("src.llm.inference.chat_completion") as chat_completion:
                artifact = evidence_module.create_artifact(evidence_set.id, "wiki", "Wiki 후보 작성")

            self.assertIsNotNone(artifact)
            assert artifact is not None
            self.assertEqual(artifact.status, "source_missing")
            self.assertEqual(artifact.lint["status"], "failed")
            self.assertTrue(any(issue["code"] == "source_missing" for issue in artifact.lint["issues"]))
            chat_completion.assert_not_called()


if __name__ == "__main__":
    unittest.main()
