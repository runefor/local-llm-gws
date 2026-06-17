import unittest
import importlib
import sys
import types
from fastapi.testclient import TestClient
from pathlib import Path
from unittest.mock import patch

BACKEND_ROOT = Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))


def _install_dependency_stubs():
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

    sentence_transformers = types.ModuleType("sentence_transformers")
    setattr(sentence_transformers, "SentenceTransformer", lambda *args, **kwargs: None)
    sys.modules.setdefault("sentence_transformers", sentence_transformers)

    markdownify = types.ModuleType("markdownify")
    setattr(markdownify, "markdownify", lambda value: value)
    sys.modules.setdefault("markdownify", markdownify)

    rank_bm25 = types.ModuleType("rank_bm25")
    setattr(rank_bm25, "BM25Okapi", lambda *args, **kwargs: None)
    sys.modules.setdefault("rank_bm25", rank_bm25)


_install_dependency_stubs()

main = importlib.import_module("main")
indexer = importlib.import_module("src.rag.indexer")
gmail = importlib.import_module("src.gws.gmail")


class GmailJitEndpointTests(unittest.TestCase):
    def test_rejects_untrusted_browser_origin(self):
        client = TestClient(main.app)

        response = client.get(
            "/",
            headers={"host": "localhost:18731", "origin": "https://attacker.example"},
        )

        self.assertEqual(response.status_code, 403)

    def test_allows_tauri_dev_origin(self):
        client = TestClient(main.app)

        response = client.get(
            "/",
            headers={"host": "localhost:18731", "origin": "http://localhost:18732"},
        )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["status"], "ok")

    def test_metadata_helper_uses_gmail_metadata_format(self):
        listed = [{"id": "m1"}]
        detail = {
            "id": "m1",
            "threadId": "t1",
            "snippet": "hello",
            "internalDate": "1767225600000",
            "labelIds": ["INBOX"],
            "payload": {"headers": [{"name": "Subject", "value": "Hello"}, {"name": "From", "value": "a@example.com"}]},
        }
        with patch("src.gws.gmail.list_messages", return_value=(listed, None)) as list_messages, \
             patch("src.gws.gmail.get_message", return_value=detail) as get_message:
            messages, next_token = gmail.list_message_metadata(max_results=5, query="newer_than:1d", label_ids=["INBOX"])

        self.assertIsNone(next_token)
        self.assertEqual(messages[0]["subject"], "Hello")
        list_messages.assert_called_once_with(max_results=5, page_token=None, query="newer_than:1d", label_ids=["INBOX"])
        get_message.assert_called_once_with("m1", format="metadata", metadata_headers=["Subject", "From", "Date", "Message-ID"])

    def test_metadata_search_does_not_fetch_full_body_or_index(self):
        metadata = [{"id": "m1", "subject": "Subject", "from": "a@example.com", "snippet": "hello", "date": "2026-01-01T00:00:00Z", "labelIds": []}]
        with patch("main.list_message_metadata", return_value=(metadata, None)) as list_metadata, \
             patch("src.gws.gmail.get_message") as get_message:
            result = main.sync_gmail(main.SyncRequest(max_emails=10, query="from:a@example.com"))

        self.assertEqual(result["status"], "success")
        self.assertEqual(result["count"], 1)
        self.assertEqual(result["messages"], metadata)
        self.assertFalse(result["has_more"])
        list_metadata.assert_called_once_with(max_results=10, query="from:a@example.com", label_ids=None)
        get_message.assert_not_called()

    def test_metadata_search_does_not_import_indexer(self):
        metadata = [{"id": "m1", "subject": "Subject", "from": "a@example.com", "snippet": "hello", "date": "2026-01-01T00:00:00Z", "labelIds": []}]
        original_indexer = sys.modules.pop("src.rag.indexer", None)
        try:
            with patch("main.list_message_metadata", return_value=(metadata, None)):
                result = main.gmail_search(main.SyncRequest(max_emails=1, query="subject:test"))
            self.assertEqual(result["status"], "success")
            self.assertNotIn("src.rag.indexer", sys.modules)
        finally:
            if original_indexer is not None:
                sys.modules["src.rag.indexer"] = original_indexer

    def test_vectorize_rejects_empty_message_ids(self):
        with patch("src.rag.indexer.index_gmail_message_ids") as index_selected:
            result = main.gmail_vectorize(main.GmailVectorizeRequest(message_ids=["", "  "]))

        self.assertEqual(result["status"], "error")
        self.assertEqual(result["indexed"], 0)
        index_selected.assert_not_called()

    def test_vectorize_uses_selected_message_ids(self):
        with patch("src.rag.indexer.index_gmail_message_ids", return_value=2) as index_selected, \
             patch("src.rag.indexer.rebuild_bm25_index", return_value={"status": "success"}) as rebuild_bm25_index:
            result = main.gmail_vectorize(main.GmailVectorizeRequest(message_ids=[" m1 ", "m2"]))

        self.assertEqual(result["status"], "success")
        self.assertEqual(result["indexed"], 2)
        self.assertEqual(result["message_ids"], ["m1", "m2"])
        index_selected.assert_called_once_with(["m1", "m2"])
        rebuild_bm25_index.assert_called_once()

    def test_process_uses_vectorized_chunks_without_gmail_api(self):
        chunks = [{
            "id": "gmail_m1_0",
            "content": "Subject: Hello\nBody content",
            "metadata": {"doc_id": "m1", "title": "Hello", "sender": "a@example.com", "date": "2026-01-01"},
            "source": "gmail",
        }]
        with patch("src.processor.pipeline.get_gmail_chunks_by_message_ids", return_value=chunks) as get_chunks, \
             patch("src.processor.pipeline.chat_completion", return_value={"content": "# Markdown"}) as chat_completion, \
             patch("src.gws.gmail.get_message") as get_message:
            result = main.gmail_process(main.GmailProcessRequest(message_ids=[" m1 "], instruction="summarize"))

        self.assertEqual(result["status"], "success")
        self.assertEqual(result["markdown"], "# Markdown")
        get_chunks.assert_called_once_with(["m1"])
        chat_completion.assert_called_once()
        get_message.assert_not_called()

    def test_legacy_rag_index_rejects_gmail_full_body_indexing(self):
        with patch("src.rag.indexer.is_authenticated", return_value=True), \
             patch("src.rag.indexer.list_messages") as list_messages, \
             patch("src.rag.indexer.get_message") as get_message:
            result = indexer.index_all(["gmail"])

        self.assertEqual(result["status"], "error")
        self.assertEqual(result["gmail_indexed"], 0)
        self.assertIn("선택 메일 벡터화", result["message"])
        list_messages.assert_not_called()
        get_message.assert_not_called()


if __name__ == "__main__":
    unittest.main()
