import json
import sys
import tempfile
import types
import unittest
from pathlib import Path
from unittest.mock import patch

from fastapi.testclient import TestClient

BACKEND_ROOT = Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))


def _install_dependency_stubs() -> None:
    googleapiclient = types.ModuleType("googleapiclient")
    discovery = types.ModuleType("googleapiclient.discovery")
    setattr(discovery, "build", lambda *args, **kwargs: None)
    setattr(googleapiclient, "discovery", discovery)
    sys.modules.setdefault("googleapiclient", googleapiclient)
    sys.modules.setdefault("googleapiclient.discovery", discovery)

    google = types.ModuleType("google")
    google_auth = types.ModuleType("google.auth")
    google_auth_transport = types.ModuleType("google.auth.transport")
    google_auth_requests = types.ModuleType("google.auth.transport.requests")
    setattr(google_auth_requests, "Request", lambda *args, **kwargs: None)
    google_oauth2 = types.ModuleType("google.oauth2")
    google_oauth2_credentials = types.ModuleType("google.oauth2.credentials")
    credentials = type("Credentials", (), {"from_authorized_user_file": staticmethod(lambda *args, **kwargs: None)})
    setattr(google_oauth2_credentials, "Credentials", credentials)
    google_auth_oauthlib = types.ModuleType("google_auth_oauthlib")
    google_auth_oauthlib_flow = types.ModuleType("google_auth_oauthlib.flow")
    flow = type("Flow", (), {"from_client_secrets_file": staticmethod(lambda *args, **kwargs: None)})
    setattr(google_auth_oauthlib_flow, "Flow", flow)
    sys.modules.setdefault("google", google)
    sys.modules.setdefault("google.auth", google_auth)
    sys.modules.setdefault("google.auth.transport", google_auth_transport)
    sys.modules.setdefault("google.auth.transport.requests", google_auth_requests)
    sys.modules.setdefault("google.oauth2", google_oauth2)
    sys.modules.setdefault("google.oauth2.credentials", google_oauth2_credentials)
    sys.modules.setdefault("google_auth_oauthlib", google_auth_oauthlib)
    sys.modules.setdefault("google_auth_oauthlib.flow", google_auth_oauthlib_flow)

    chromadb = types.ModuleType("chromadb")
    setattr(chromadb, "PersistentClient", lambda *args, **kwargs: None)
    chromadb_config = types.ModuleType("chromadb.config")
    setattr(chromadb_config, "Settings", lambda *args, **kwargs: None)
    sys.modules.setdefault("chromadb", chromadb)
    sys.modules.setdefault("chromadb.config", chromadb_config)

    markdownify = types.ModuleType("markdownify")
    setattr(markdownify, "markdownify", lambda value: value)
    sys.modules.setdefault("markdownify", markdownify)

    rank_bm25 = types.ModuleType("rank_bm25")
    setattr(rank_bm25, "BM25Okapi", lambda *args, **kwargs: None)
    sys.modules.setdefault("rank_bm25", rank_bm25)


_install_dependency_stubs()

import main
from src import evidence as evidence_module
from src.rag import retriever


HEADERS = {"host": "localhost:18731", "origin": "http://localhost:18732"}


class FakeVector:
    def tolist(self):
        return [0.1, 0.2, 0.3]


class FakeModel:
    def encode(self, _query):
        return FakeVector()


class FakeCollection:
    def __init__(self, chunks):
        self.chunks = chunks

    def query(self, **_kwargs):
        return {
            "ids": [[chunk["id"] for chunk in self.chunks]],
            "documents": [[chunk["content"] for chunk in self.chunks]],
            "metadatas": [[chunk["metadata"] for chunk in self.chunks]],
            "distances": [[0.1 for _chunk in self.chunks]],
        }


class FakeClient:
    def __init__(self, chunks):
        self.collection = FakeCollection(chunks)

    def get_or_create_collection(self, _name, **_kwargs):
        return self.collection


def _chunk(chunk_id: str, doc_id: str):
    return {
        "id": chunk_id,
        "content": f"{doc_id} 계약 일정 문서",
        "metadata": {"doc_id": doc_id, "title": doc_id, "source": "drive"},
        "source": "drive",
    }


def _retrieve(chunks, query: str = "계약 일정"):
    with (
        patch.object(retriever, "get_embedding_model", return_value=FakeModel()),
        patch.object(retriever, "get_chroma_client", return_value=FakeClient(chunks)),
        patch.object(retriever, "load_bm25_index", return_value=None),
    ):
        return retriever.retrieve_chunks(query, top_k=len(chunks), sources=["drive"])


def _record(query: str, chunk_id: str, doc_id: str, feedback: str):
    return evidence_module.record_relevance_feedback(
        query=query,
        evidence_id=f"ev_{chunk_id}",
        chunk_id=chunk_id,
        doc_id=doc_id,
        source="drive",
        feedback=feedback,
    )


class RelevanceFeedbackStateTests(unittest.TestCase):
    def test_old_format_store_loads_without_migration(self):
        old_store = {
            "evidence_sets": [],
            "artifacts": [],
            "relevance_feedback": [
                {
                    "id": "fb_relevant",
                    "query": "계약 일정",
                    "evidence_id": "ev_drive_a_0",
                    "chunk_id": "drive_a_0",
                    "doc_id": "doc_a",
                    "source": "drive",
                    "feedback": "relevant",
                    "title": "",
                    "match_reason": "",
                    "created_at": "2026-01-01T00:00:00Z",
                },
                {
                    "id": "fb_irrelevant",
                    "query": "회의 일정",
                    "evidence_id": "ev_drive_b_0",
                    "chunk_id": "drive_b_0",
                    "doc_id": "doc_b",
                    "source": "drive",
                    "feedback": "irrelevant",
                    "title": "",
                    "match_reason": "",
                    "created_at": "2026-01-02T00:00:00Z",
                },
            ],
        }

        with tempfile.TemporaryDirectory() as tmp_dir:
            store_path = Path(tmp_dir) / "evidence_store.json"
            store_path.write_text(json.dumps(old_store), encoding="utf-8")

            with patch.object(evidence_module, "STORE_PATH", store_path):
                store = evidence_module._load_store()

        self.assertEqual([item.feedback for item in store.relevance_feedback], ["relevant", "irrelevant"])

    def test_important_feedback_ranks_above_relevant_feedback(self):
        chunks = [_chunk("drive_relevant_0", "doc_relevant"), _chunk("drive_important_0", "doc_important")]
        with tempfile.TemporaryDirectory() as tmp_dir, patch.object(evidence_module, "STORE_PATH", Path(tmp_dir) / "evidence_store.json"):
            _record("계약 일정", "drive_relevant_0", "doc_relevant", "relevant")
            _record("계약 일정", "drive_important_0", "doc_important", "important")

            results = _retrieve(chunks)

        self.assertEqual(results[0]["id"], "drive_important_0")
        self.assertGreater(results[0]["metadata"]["personalization_score"], results[1]["metadata"]["personalization_score"])

    def test_latest_excluded_feedback_hides_chunk(self):
        chunks = [_chunk("drive_excluded_0", "doc_excluded"), _chunk("drive_visible_0", "doc_visible")]
        with tempfile.TemporaryDirectory() as tmp_dir, patch.object(evidence_module, "STORE_PATH", Path(tmp_dir) / "evidence_store.json"):
            _record("계약 일정", "drive_excluded_0", "doc_excluded", "excluded")

            results = _retrieve(chunks)

        result_ids = [result["id"] for result in results]
        self.assertNotIn("drive_excluded_0", result_ids)
        self.assertIn("drive_visible_0", result_ids)

    def test_relevant_feedback_after_excluded_restores_chunk(self):
        chunks = [_chunk("drive_restored_0", "doc_restored"), _chunk("drive_other_0", "doc_other")]
        with tempfile.TemporaryDirectory() as tmp_dir, patch.object(evidence_module, "STORE_PATH", Path(tmp_dir) / "evidence_store.json"):
            with patch.object(evidence_module, "_now_iso", side_effect=["2026-01-01T00:00:00Z", "2026-01-02T00:00:00Z"]):
                _record("계약 일정", "drive_restored_0", "doc_restored", "excluded")
                _record("계약 일정", "drive_restored_0", "doc_restored", "relevant")

            results = _retrieve(chunks)

        self.assertIn("drive_restored_0", [result["id"] for result in results])

    def test_excluding_every_candidate_falls_back_to_penalized_results(self):
        chunks = [_chunk("drive_a_0", "doc_a"), _chunk("drive_b_0", "doc_b")]
        with tempfile.TemporaryDirectory() as tmp_dir, patch.object(evidence_module, "STORE_PATH", Path(tmp_dir) / "evidence_store.json"):
            _record("계약 일정", "drive_a_0", "doc_a", "excluded")
            _record("계약 일정", "drive_b_0", "doc_b", "excluded")

            results = _retrieve(chunks)

        self.assertEqual({result["id"] for result in results}, {"drive_a_0", "drive_b_0"})
        self.assertTrue(all(result["metadata"]["personalization_score"] < 0 for result in results))

    def test_feedback_api_accepts_important_and_excluded(self):
        with tempfile.TemporaryDirectory() as tmp_dir, patch.object(evidence_module, "STORE_PATH", Path(tmp_dir) / "evidence_store.json"):
            client = TestClient(main.app)

            for feedback in ("important", "excluded"):
                with self.subTest(feedback=feedback):
                    response = client.post(
                        "/api/rag/feedback",
                        headers=HEADERS,
                        json={
                            "query": "계약 일정",
                            "evidence_id": f"ev_{feedback}",
                            "chunk_id": f"drive_{feedback}_0",
                            "doc_id": f"doc_{feedback}",
                            "source": "drive",
                            "feedback": feedback,
                            "title": "계약 일정",
                            "match_reason": "계약 일정이 일치했습니다.",
                        },
                    )

                    self.assertEqual(response.status_code, 200)
                    body = response.json()
                    self.assertEqual(body["status"], "success")
                    self.assertEqual(body["feedback"]["feedback"], feedback)


if __name__ == "__main__":
    unittest.main()
