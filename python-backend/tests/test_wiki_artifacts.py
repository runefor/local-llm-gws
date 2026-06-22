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

    def test_wiki_artifact_falls_back_to_grounded_markdown_when_llm_fails(self):
        with tempfile.TemporaryDirectory() as tmp_dir, patch.object(evidence_module, "STORE_PATH", Path(tmp_dir) / "evidence_store.json"):
            evidence_set = evidence_module.create_evidence_set(
                title="계약 자료",
                original_query="계약 일정",
                evidence_items=[_evidence_item()],
            )
            client = TestClient(main.app)
            with patch("src.llm.inference.chat_completion", return_value={"error": "server offline"}):
                response = client.post(
                    f"/api/evidence-sets/{evidence_set.id}/artifacts",
                    headers=HEADERS,
                    json={"artifact_type": "wiki", "instruction": "Wiki 후보 작성"},
                ).json()

            self.assertEqual(response["status"], "success")
            artifact = response["artifact"]
            self.assertEqual(artifact["status"], "candidate")
            self.assertEqual(artifact["lint"]["status"], "passed")
            self.assertIn("# 계약 자료 Wiki", artifact["content"])
            self.assertIn("[ev_contract_0]", artifact["content"])
            self.assertIn("https://drive.google.com/file/d/drive-contract", artifact["content"])
            self.assertEqual(len(artifact["citation_map"]), 1)

    def test_wiki_artifact_adds_missing_source_link_and_shortage_sections(self):
        llm_content = """# 계약 일정 Wiki

## 요약
- 계약서 최종 검토 마감은 6월 30일이다. [ev_contract_0]

## 핵심 사실
- 마감 일정은 Drive 원문에서 확인된다. [ev_contract_0]
"""
        with tempfile.TemporaryDirectory() as tmp_dir, patch.object(evidence_module, "STORE_PATH", Path(tmp_dir) / "evidence_store.json"):
            evidence_set = evidence_module.create_evidence_set(
                title="계약 자료",
                original_query="계약 일정",
                evidence_items=[_evidence_item()],
            )
            with patch("src.llm.inference.chat_completion", return_value={"content": llm_content}):
                artifact = evidence_module.create_artifact(evidence_set.id, "wiki", "Wiki 후보 작성")

            self.assertIsNotNone(artifact)
            assert artifact is not None
            self.assertEqual(artifact.status, "candidate")
            self.assertEqual(artifact.lint["status"], "passed")
            self.assertIn("## 원문 링크", artifact.content)
            self.assertIn("[ev_contract_0] 계약 일정", artifact.content)
            self.assertIn("https://drive.google.com/file/d/drive-contract", artifact.content)
            self.assertIn("## 근거 부족", artifact.content)

    def test_wiki_artifact_adds_review_sections_and_source_map(self):
        llm_content = """# 계약 일정 Wiki

## 한 줄 결론
계약 일정을 검토해야 한다. [ev_contract_0]
"""
        with tempfile.TemporaryDirectory() as tmp_dir, patch.object(evidence_module, "STORE_PATH", Path(tmp_dir) / "evidence_store.json"):
            evidence_set = evidence_module.create_evidence_set(
                title="계약 자료",
                original_query="계약 일정",
                evidence_items=[_evidence_item()],
            )
            with patch("src.llm.inference.chat_completion", return_value={"content": llm_content}):
                artifact = evidence_module.create_artifact(evidence_set.id, "wiki", "Wiki 후보 작성")

            self.assertIsNotNone(artifact)
            assert artifact is not None
            self.assertEqual(artifact.lint["status"], "passed")
            self.assertIn("## 확정에 가까운 사실", artifact.content)
            self.assertIn("## 주장/평가", artifact.content)
            self.assertIn("## 검증 필요", artifact.content)
            self.assertIn("## 우리 앱에 주는 의미", artifact.content)
            self.assertIn("## 관련 페이지", artifact.content)
            self.assertIn("## 출처 지도", artifact.content)
            self.assertIn("| 근거 | 출처 | 날짜 | 위치 | 왜 중요한가 |", artifact.content)
            self.assertIn("제목/본문에서 계약 일정이 일치했습니다.", artifact.content)

    def test_wiki_artifact_flags_subjective_claims_in_confirmed_facts(self):
        llm_content = """# 계약 일정 Wiki

## 한 줄 결론
계약 일정을 검토해야 한다. [ev_contract_0]

## 확정에 가까운 사실
- 이 자료가 가장 좋은 계약 근거다. [ev_contract_0]

## 주장/평가
- 없음

## 검증 필요
- 없음

## 우리 앱에 주는 의미
- 정보 묶음에서 검토한다.

## 관련 페이지
- [[계약]]

## 출처 지도
| 근거 | 출처 | 날짜 | 위치 | 왜 중요한가 |
|---|---|---|---|---|
| [ev_contract_0] | 계약 일정 | 2026-06-01 | Drive | 계약 일정 |

## 원문 링크
- [ev_contract_0] 계약 일정: https://drive.google.com/file/d/drive-contract

## 근거 부족
- 없음
"""
        with tempfile.TemporaryDirectory() as tmp_dir, patch.object(evidence_module, "STORE_PATH", Path(tmp_dir) / "evidence_store.json"):
            evidence_set = evidence_module.create_evidence_set(
                title="계약 자료",
                original_query="계약 일정",
                evidence_items=[_evidence_item()],
            )
            with patch("src.llm.inference.chat_completion", return_value={"content": llm_content}):
                artifact = evidence_module.create_artifact(evidence_set.id, "wiki", "Wiki 후보 작성")

            self.assertIsNotNone(artifact)
            assert artifact is not None
            self.assertEqual(artifact.status, "needs_review")
            self.assertTrue(
                any(issue["code"] == "subjective_claim_in_confirmed_facts" for issue in artifact.lint["issues"])
            )

    def test_wiki_artifact_replaces_generic_review_sections_and_dedupes_source_location(self):
        evidence = _evidence_item()
        evidence["source_location"] = {
            "original_url": "https://mail.google.com/mail/u/0/#search/rfc822msgid%3Aabc",
            "location_label": "Gmail: PyTorchKR",
            "provider_item_id": "gmail-1",
            "message_id": "gmail-1",
            "thread_id": "gmail-1",
        }
        llm_content = """# LLM Wiki

## 한 줄 결론
LLM Wiki를 검토한다. [ev_contract_0]

## 확정에 가까운 사실
- LLM Wiki 자료가 있다. [ev_contract_0]

## 주장/평가
- OpenKB는 긍정적으로 평가된다. [ev_contract_0]

## 검증 필요
- 단일 근거이거나 평가성 표현은 원문 재확인이 필요합니다.

## 우리 앱에 주는 의미
- 검색 결과를 정보 묶음으로 검토한 뒤 승인 Wiki로 전환합니다.

## 관련 페이지
- [[Evidence Set]]
- [[RAG]]
"""
        with tempfile.TemporaryDirectory() as tmp_dir, patch.object(evidence_module, "STORE_PATH", Path(tmp_dir) / "evidence_store.json"):
            evidence_set = evidence_module.create_evidence_set(
                title="LLM Wiki",
                original_query="llm wiki",
                evidence_items=[evidence],
            )
            with patch("src.llm.inference.chat_completion", return_value={"content": llm_content}):
                artifact = evidence_module.create_artifact(evidence_set.id, "wiki", "Wiki 후보 작성")

            self.assertIsNotNone(artifact)
            assert artifact is not None
            self.assertEqual(artifact.lint["status"], "passed")
            self.assertNotIn("단일 근거이거나 평가성 표현은 원문 재확인이 필요합니다.", artifact.content)
            self.assertIn("평가성 표현과 단일 출처 주장은 원문에서 재확인해야 합니다: [ev_contract_0]", artifact.content)
            self.assertIn("정보 묶음 1개 근거", artifact.content)
            self.assertIn("Gmail: PyTorchKR / https://mail.google.com", artifact.content)
            self.assertNotIn("gmail-1 | gmail-1", artifact.content)

    def test_artifact_api_defaults_to_wiki_when_type_is_omitted(self):
        with tempfile.TemporaryDirectory() as tmp_dir, patch.object(evidence_module, "STORE_PATH", Path(tmp_dir) / "evidence_store.json"):
            evidence_set = evidence_module.create_evidence_set(
                title="계약 자료",
                original_query="계약 일정",
                evidence_items=[_evidence_item()],
            )
            client = TestClient(main.app)
            with patch("src.llm.inference.chat_completion", return_value={"content": ""}):
                response = client.post(
                    f"/api/evidence-sets/{evidence_set.id}/artifacts",
                    headers=HEADERS,
                    json={"instruction": "Wiki 후보 작성"},
                ).json()

            self.assertEqual(response["status"], "success")
            artifact = response["artifact"]
            self.assertEqual(artifact["artifact_type"], "wiki")
            self.assertEqual(artifact["status"], "candidate")
            self.assertEqual(artifact["lint"]["status"], "passed")
            self.assertIn("[ev_contract_0]", artifact["content"])


if __name__ == "__main__":
    unittest.main()
