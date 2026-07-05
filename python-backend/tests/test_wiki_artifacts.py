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
from src.wiki_artifacts import lint_artifact_content, status_for_lint


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

## 확인 범위
- 저장된 정보 묶음 밖의 자료는 별도로 확인하지 않았습니다.
"""


def _evidence_set():
    return evidence_module.EvidenceSet(
        id="es_contract",
        title="계약 자료",
        original_query="계약 일정",
        evidence_items=[evidence_module.EvidenceRecord.model_validate(_evidence_item())],
        created_at="2026-07-05T00:00:00Z",
        updated_at="2026-07-05T00:00:00Z",
    )


def _complete_wiki(**sections: str) -> str:
    defaults = {
        "한 줄 결론": "계약 일정은 6월 30일 검토 대상이다. [ev_contract_0]",
        "확정에 가까운 사실": "- 계약서 최종 검토 마감은 6월 30일이다. [ev_contract_0]",
        "주장/평가": "- 저장된 근거만으로 분리된 평가성 주장은 없습니다.",
        "검증 필요": "- 단일 근거이므로 원문 재확인이 필요합니다. [ev_contract_0]",
        "우리 앱에 주는 의미": "- 정보 묶음에서 계약 일정을 검토할 수 있습니다.",
        "관련 페이지": "- [[계약 일정]]",
        "출처 지도": "\n".join([
            "| 근거ID | 출처 | 날짜 | 위치 | 왜 중요한지 |",
            "|---|---|---|---|---|",
            "| [ev_contract_0] | 계약 일정 | 2026-06-01 | Drive: 계약 일정 | 마감 일정 근거 |",
        ]),
        "원문 링크": "- [ev_contract_0] 계약 일정: https://drive.google.com/file/d/drive-contract",
        "확인 범위": "- 저장된 정보 묶음의 근거만 기준으로 작성했습니다.",
    }
    defaults.update(sections)
    body = "\n\n".join(f"## {heading}\n{text}" for heading, text in defaults.items())
    return f"# 계약 일정 Wiki\n\n{body}\n"


def _lint_codes(content: str):
    lint = lint_artifact_content(content, _evidence_set(), "wiki")
    return lint, [issue.code for issue in lint.issues]


class WikiArtifactContractTests(unittest.TestCase):
    def test_empty_section_fails_when_required_section_has_no_body(self):
        lint, codes = _lint_codes(_complete_wiki(**{"검증 필요": "  \n---\n  "}))

        self.assertEqual(lint.status, "failed")
        self.assertIn("empty_section", codes)
        self.assertEqual(status_for_lint(lint), "needs_review")

    def test_empty_section_passes_when_required_sections_have_body(self):
        lint, codes = _lint_codes(_complete_wiki())

        self.assertEqual(lint.status, "passed")
        self.assertNotIn("empty_section", codes)

    def test_uncited_fact_fails_in_confirmed_facts_section(self):
        lint, codes = _lint_codes(_complete_wiki(**{"확정에 가까운 사실": "- 계약서 최종 검토 마감은 6월 30일이다."}))

        self.assertEqual(lint.status, "failed")
        self.assertIn("uncited_fact", codes)

    def test_uncited_fact_passes_when_each_confirmed_fact_has_citation(self):
        lint, codes = _lint_codes(_complete_wiki(**{"확정에 가까운 사실": "- 계약서 최종 검토 마감은 6월 30일이다. [ev_contract_0]"}))

        self.assertEqual(lint.status, "passed")
        self.assertNotIn("uncited_fact", codes)

    def test_source_map_not_table_fails_when_source_map_is_not_required_table(self):
        lint, codes = _lint_codes(_complete_wiki(**{"출처 지도": "- [ev_contract_0] 계약 일정"}))

        self.assertEqual(lint.status, "failed")
        self.assertIn("source_map_not_table", codes)

    def test_source_map_not_table_passes_with_required_columns(self):
        lint, codes = _lint_codes(_complete_wiki())

        self.assertEqual(lint.status, "passed")
        self.assertNotIn("source_map_not_table", codes)

    def test_subjective_claim_fails_in_one_line_conclusion(self):
        lint, codes = _lint_codes(_complete_wiki(**{"한 줄 결론": "계약 일정은 확실히 가장 중요한 검토 대상이다. [ev_contract_0]"}))

        self.assertEqual(lint.status, "failed")
        self.assertIn("subjective_claim_in_confirmed_facts", codes)

    def test_subjective_claim_passes_when_conclusion_and_facts_are_neutral(self):
        lint, codes = _lint_codes(_complete_wiki())

        self.assertEqual(lint.status, "passed")
        self.assertNotIn("subjective_claim_in_confirmed_facts", codes)

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

    def test_wiki_artifact_adds_missing_source_link_and_scope_sections(self):
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
            self.assertIn("## 확인 범위", artifact.content)
            self.assertIn("저장된 정보 묶음의 근거만 기준으로 작성했습니다.", artifact.content)

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
            self.assertIn("| 근거ID | 출처 | 날짜 | 위치 | 왜 중요한지 |", artifact.content)
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

## 확인 범위
- 저장된 정보 묶음 밖의 자료는 별도로 확인하지 않았습니다.
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

    def test_condition_draft_promotes_to_evidence_set_artifact_with_strengthened_lint(self):
        condition_draft = "# 취업 자료 후보\n\n## 요약\n스니펫 기준 후보 초안입니다."
        evidence = _evidence_item()
        evidence["evidence_id"] = "ev_condition_draft"
        evidence["title"] = "조건 후보 초안"
        evidence["content_snapshot"] = condition_draft
        evidence["snippet"] = "조건 후보 기반 스니펫 초안"

        with tempfile.TemporaryDirectory() as tmp_dir, patch.object(evidence_module, "STORE_PATH", Path(tmp_dir) / "evidence_store.json"):
            evidence_set = evidence_module.create_evidence_set(
                title="조건 후보 승격",
                original_query="취업 자료",
                evidence_items=[evidence],
            )
            with patch("src.llm.inference.chat_completion", return_value={"content": "# 조건 후보 승격 Wiki"}):
                artifact = evidence_module.create_artifact(evidence_set.id, "wiki", "조건 후보를 정보 묶음 Wiki로 승격")

            self.assertIsNotNone(artifact)
            assert artifact is not None
            self.assertEqual(artifact.status, "candidate")
            self.assertEqual(artifact.lint["status"], "passed")
            self.assertIn("## 확정에 가까운 사실", artifact.content)
            self.assertIn("[ev_condition_draft]", artifact.content)


if __name__ == "__main__":
    unittest.main()
