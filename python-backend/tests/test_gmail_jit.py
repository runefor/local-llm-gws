import unittest
import importlib
import sys
import types
from fastapi.testclient import TestClient
from pathlib import Path
from typing import Any
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
retriever = importlib.import_module("src.rag.retriever")
gmail = importlib.import_module("src.gws.gmail")
settings = importlib.import_module("src.settings")


class _FakeModel:
    def encode(self, chunks):
        class _FakeEmbedding:
            def tolist(self):
                return [[0.1, 0.2] for _ in chunks]

        return _FakeEmbedding()


class _FakeCollection:
    def __init__(self, existing=None):
        self.existing = existing or {"ids": []}
        self.upsert_payload: dict[str, Any] | None = None
        self.deleted_ids = None

    def get(self, where=None, include=None):
        return self.existing

    def upsert(self, ids, embeddings, documents, metadatas):
        self.upsert_payload = {
            "ids": ids,
            "embeddings": embeddings,
            "documents": documents,
            "metadatas": metadatas,
        }

    def delete(self, ids):
        self.deleted_ids = ids


class _FakeClient:
    def __init__(self, collection):
        self.collection = collection

    def get_or_create_collection(self, name):
        return self.collection


class _FakeQueryEmbedding:
    def tolist(self):
        return [0.1, 0.2]


class _FakeQueryModel:
    def __init__(self):
        self.queries: list[str] = []

    def encode(self, query):
        self.queries.append(query)
        return _FakeQueryEmbedding()


class _FakeSearchCollection:
    def __init__(self, source: str):
        self.source = source
        self.calls: list[int] = []

    def query(self, query_embeddings, n_results):
        self.calls.append(n_results)
        call_index = len(self.calls)
        chunk_id = f"{self.source}_{call_index}_0"
        return {
            "ids": [[chunk_id]],
            "documents": [[f"{self.source} 계약 일정 본문"]],
            "metadatas": [[{
                "doc_id": chunk_id,
                "title": "계약 일정",
                "source": self.source,
                "original_url": f"https://example.invalid/{self.source}/{call_index}",
            }]],
            "distances": [[0.1 + (call_index / 100)]],
        }


class _FakeSearchClient:
    def __init__(self):
        self.collections = {
            "gmail_chunks": _FakeSearchCollection("gmail"),
            "drive_chunks": _FakeSearchCollection("drive"),
        }

    def get_or_create_collection(self, name):
        if "gmail" in name:
            return self.collections["gmail_chunks"]
        if "drive" in name:
            return self.collections["drive_chunks"]
        raise KeyError(name)


class _FakeGmailListRequest:
    def __init__(self, response):
        self.response = response

    def execute(self):
        return self.response


class _FakeGmailMessagesResource:
    def __init__(self, response):
        self.response = response
        self.list_calls: list[dict[str, Any]] = []

    def list(self, **kwargs):
        self.list_calls.append(kwargs)
        return _FakeGmailListRequest(self.response)


class _FakeGmailUsersResource:
    def __init__(self, messages_resource):
        self.messages_resource = messages_resource

    def messages(self):
        return self.messages_resource


class _FakeGmailService:
    def __init__(self, messages_resource):
        self.messages_resource = messages_resource

    def users(self):
        return _FakeGmailUsersResource(self.messages_resource)


class GmailJitEndpointTests(unittest.TestCase):
    def test_retriever_expands_domain_query_hints(self):
        expansions = retriever.expand_query("지난번 계약 일정")

        self.assertEqual(expansions[0], "지난번 계약 일정")
        self.assertTrue(any("계약서" in expansion for expansion in expansions))
        self.assertTrue(any("deadline" in expansion for expansion in expansions))
        self.assertLessEqual(len(expansions), 3)

    def test_query_expansion_is_bounded_for_repeated_noisy_terms(self):
        expansions = retriever.expand_query("  계약   계약   일정   일정   ")

        self.assertEqual(expansions[0], "계약 계약 일정 일정")
        self.assertEqual(len(expansions), len(set(expansions)))
        self.assertLessEqual(len(expansions), retriever.MAX_VECTOR_QUERY_VARIANTS)

    def test_match_metadata_uses_content_and_source_metadata_terms(self):
        chunk = {
            "id": "gmail_m1_0",
            "content": "본문에는 직접 단서가 적습니다.",
            "metadata": {
                "title": "계약 일정 확인",
                "sender": "manager@example.com",
                "owners": "Owner <owner@example.com>",
            },
            "source": "gmail",
        }

        annotated = retriever._with_match_metadata(chunk, "semantic", ["계약 일정 manager owner"])
        metadata = annotated["metadata"]

        self.assertIn("semantic", metadata["match_channels"])
        self.assertIn("계약", metadata["matched_terms"])
        self.assertIn("일정", metadata["matched_terms"])
        self.assertIn("manager", metadata["matched_terms"])
        self.assertIn("title", metadata["matched_fields"])
        self.assertIn("sender", metadata["matched_fields"])
        self.assertIn("owners", metadata["matched_fields"])
        self.assertIn("매칭", metadata["match_reason"])

    def test_retrieve_chunks_uses_expanded_queries_and_wide_candidate_pool(self):
        client = _FakeSearchClient()
        model = _FakeQueryModel()
        expansions = retriever.expand_query("계약 일정")

        with patch("src.rag.retriever.get_chroma_client", return_value=client), \
             patch("src.rag.retriever.get_embedding_model", return_value=model), \
             patch("src.rag.retriever.load_bm25_index", return_value=None):
            results = retriever.retrieve_chunks("계약 일정", top_k=3, sources=["gmail", "drive"])

        self.assertEqual(len(model.queries), len(expansions))
        self.assertTrue(all(query.startswith("query: ") for query in model.queries))
        self.assertEqual(client.collections["gmail_chunks"].calls, [24] * len(expansions))
        self.assertEqual(client.collections["drive_chunks"].calls, [24] * len(expansions))
        self.assertEqual(len(results), 3)
        self.assertTrue(all("semantic" in item["metadata"]["match_channels"] for item in results))
        self.assertTrue(all(item["metadata"].get("match_reason") for item in results))

    def test_low_signal_drive_filename_fallback_is_filtered(self):
        chunks = [
            {
                "id": "drive_fallback",
                "content": "파일명: 오래된 파일\n파일 형식: application/pdf",
                "metadata": {"source": "drive"},
                "source": "drive",
            },
            {
                "id": "drive_real",
                "content": "계약 일정 본문",
                "metadata": {"source": "drive"},
                "source": "drive",
            },
            {
                "id": "gmail_filename_like",
                "content": "파일명: 메일 첨부\n파일 형식: text/plain",
                "metadata": {"source": "gmail"},
                "source": "gmail",
            },
        ]

        filtered = retriever._filter_low_signal_chunks(chunks)

        self.assertEqual([chunk["id"] for chunk in filtered], ["drive_real", "gmail_filename_like"])

    def test_chunk_to_evidence_record_preserves_location_metadata(self):
        chunk = {
            "id": "drive_f1_2",
            "content": "계약 일정 본문",
            "metadata": {
                "doc_id": "f1",
                "title": "계약 일정",
                "source": "drive",
                "original_url": "https://drive.google.com/file/d/f1",
                "location_label": "DRIVE: 계약 일정",
                "provider_item_id": "f1",
                "chunk_index": "2",
                "file_id": "f1",
                "resourceKey": "rk",
                "page_number": "7",
                "heading_path": "Root > 계약",
                "text_start_offset": "10",
                "text_end_offset": "42",
                "match_reason": "의미 검색 매칭: 계약, 일정",
            },
            "distance": 0.15,
            "rrf_score": 0.05,
            "source": "drive",
        }

        evidence = retriever.chunk_to_evidence_record(chunk, rank=4)

        self.assertEqual(evidence.source_location.original_url, "https://drive.google.com/file/d/f1")
        self.assertEqual(evidence.source_location.location_label, "DRIVE: 계약 일정")
        self.assertEqual(evidence.source_location.chunk_index, 2)
        self.assertEqual(evidence.source_location.page_number, 7)
        self.assertEqual(evidence.source_location.heading_path, "Root > 계약")
        self.assertEqual(evidence.source_location.text_start_offset, 10)
        self.assertEqual(evidence.source_location.text_end_offset, 42)
        self.assertEqual(evidence.metadata["match_reason"], "의미 검색 매칭: 계약, 일정")

    def test_rrf_merges_semantic_and_keyword_match_metadata(self):
        vector_chunk = {
            "id": "drive_f1_0",
            "content": "계약서 초안",
            "metadata": {
                "title": "계약서",
                "match_channels": "semantic",
                "matched_terms": "계약",
                "matched_fields": "title",
                "query_expansions": "계약 일정",
            },
            "distance": 0.1,
            "source": "drive",
        }
        keyword_chunk = {
            "id": "drive_f1_0",
            "content": "계약서 초안",
            "metadata": {
                "title": "계약서",
                "match_channels": "keyword",
                "matched_terms": "일정",
                "matched_fields": "title",
                "query_expansions": "계약 일정",
            },
            "source": "drive",
        }

        merged = retriever.reciprocal_rank_fusion([vector_chunk], [keyword_chunk])

        metadata = merged[0]["metadata"]
        self.assertIn("semantic", metadata["match_channels"])
        self.assertIn("keyword", metadata["match_channels"])
        self.assertIn("계약", metadata["matched_terms"])
        self.assertIn("일정", metadata["matched_terms"])
        self.assertIn("title", metadata["matched_fields"])
        self.assertIn("매칭", metadata["match_reason"])

    def test_rrf_keeps_keyword_only_result_with_match_metadata(self):
        keyword_chunk = {
            "id": "gmail_m1_0",
            "content": "면접 일정 메일",
            "metadata": {
                "title": "면접 일정",
                "match_channels": "keyword",
                "matched_terms": "면접, 일정",
                "query_expansions": "지원자 면접 자료",
            },
            "source": "gmail",
        }

        merged = retriever.reciprocal_rank_fusion([], [keyword_chunk])

        self.assertEqual(merged[0]["id"], "gmail_m1_0")
        self.assertEqual(merged[0]["distance"], 999.0)
        self.assertEqual(merged[0]["source"], "gmail")
        self.assertIn("keyword", merged[0]["metadata"]["match_channels"])
        self.assertIn("매칭", merged[0]["metadata"]["match_reason"])

    def test_search_evidence_returns_query_expansions(self):
        chunk = {
            "id": "drive_f1_0",
            "content": "계약서 마감 일정은 다음 주입니다.",
            "metadata": {
                "doc_id": "f1",
                "title": "계약 일정",
                "source": "drive",
                "match_channels": "semantic",
                "matched_terms": "계약, 일정",
                "match_reason": "의미 검색 매칭: 계약, 일정",
            },
            "distance": 0.2,
            "source": "drive",
        }
        with patch("src.rag.retriever.retrieve_chunks", return_value=[chunk]):
            result = retriever.search_evidence("계약 일정", top_k=12, sources=["drive"])

        self.assertEqual(result["status"], "success")
        self.assertIn("query_expansions", result)
        self.assertTrue(any("계약서" in expansion for expansion in result["query_expansions"]))
        self.assertEqual(result["evidence"][0]["metadata"]["match_reason"], "의미 검색 매칭: 계약, 일정")

    def test_evidence_record_strips_html_markup_from_existing_vector_content(self):
        chunk = {
            "id": "drive_f1_0",
            "content": '<h1>전략 문서</h1><p>계약 일정 <a href="https://example.com">링크</a></p>',
            "metadata": {"doc_id": "f1", "title": "전략 문서", "source": "drive"},
            "distance": 0.2,
            "source": "drive",
        }

        evidence = retriever.chunk_to_evidence_record(chunk, rank=1)

        self.assertIn("# 전략 문서", evidence.content_snapshot)
        self.assertIn("계약 일정", evidence.content_snapshot)
        self.assertNotIn("<h1", evidence.content_snapshot)
        self.assertNotIn("<a href", evidence.snippet)

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

    def test_label_only_metadata_search_does_not_add_hidden_date_filter(self):
        messages_resource = _FakeGmailMessagesResource({"messages": [{"id": "m1"}]})
        service = _FakeGmailService(messages_resource)

        with patch("src.gws.gmail.get_credentials", return_value=object()), \
             patch("src.gws.gmail.build", return_value=service):
            messages, next_token = gmail.list_messages(max_results=25, query=None, label_ids=["Label_123"])

        self.assertEqual(messages, [{"id": "m1"}])
        self.assertIsNone(next_token)
        self.assertEqual(messages_resource.list_calls[0]["maxResults"], 25)
        self.assertEqual(messages_resource.list_calls[0]["labelIds"], ["Label_123"])
        self.assertIsNone(messages_resource.list_calls[0]["q"])

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

    def test_legacy_rag_index_rejects_gmail_full_body_indexing(self):
        with patch("src.rag.indexer.is_authenticated", return_value=True), \
             patch("src.rag.indexer.get_message") as get_message:
            result = indexer.index_all(["gmail"])

        self.assertEqual(result["status"], "error")
        self.assertEqual(result["gmail_indexed"], 0)
        self.assertIn("선택 메일 벡터화", result["message"])
        get_message.assert_not_called()

    def test_drive_index_requires_search_results(self):
        with patch("src.rag.indexer.is_authenticated", return_value=True), \
             patch("src.rag.indexer.index_drive_raw") as index_drive_raw:
            result = indexer.index_all(["drive"])

        self.assertEqual(result["status"], "error")
        self.assertEqual(result["drive_indexed"], 0)
        self.assertIn("Drive 원본 검색 결과", result["message"])
        index_drive_raw.assert_not_called()

    def test_drive_index_uses_search_result_files_only(self):
        drive_files = [{"id": "d1", "name": "관련 문서", "mimeType": "text/plain"}]
        with patch("src.rag.indexer.is_authenticated", return_value=True), \
             patch("src.rag.indexer.index_drive_raw", return_value=1) as index_drive_raw, \
             patch("src.rag.indexer.rebuild_bm25_index", return_value={"status": "success"}):
            result = indexer.index_all(["drive"], drive_files=drive_files)

        self.assertEqual(result["status"], "success")
        self.assertEqual(result["drive_indexed"], 1)
        index_drive_raw.assert_called_once_with(drive_files)

    def test_rag_index_api_forwards_drive_search_results(self):
        drive_files = [{"id": "d1", "name": "관련 문서", "mimeType": "text/plain"}]
        with patch("src.rag.indexer.index_all", return_value={"status": "success"}) as index_all:
            result = main.rag_index(main.RagIndexRequest(sources=["drive"], drive_files=drive_files))

        self.assertEqual(result["status"], "success")
        index_all.assert_called_once_with(["drive"], drive_files)

    def test_selected_gmail_index_persists_label_ids_metadata(self):
        collection = _FakeCollection()
        message = {
            "id": "m1",
            "threadId": "t1",
            "internalDate": "1767225600000",
            "labelIds": ["INBOX", "IMPORTANT"],
            "payload": {
                "headers": [
                    {"name": "Subject", "value": "Hello"},
                    {"name": "From", "value": "a@example.com"},
                    {"name": "Message-ID", "value": "<msg@example.com>"},
                ],
                "mimeType": "text/plain",
                "body": {"data": "Qm9keQ=="},
            },
        }
        with patch("src.rag.indexer.get_chroma_client", return_value=_FakeClient(collection)), \
             patch("src.rag.indexer.get_embedding_model", return_value=_FakeModel()):
            indexed = indexer.index_gmail_raw([message])

        self.assertEqual(indexed, 1)
        payload = collection.upsert_payload
        self.assertIsNotNone(payload)
        assert payload is not None
        metadata = payload["metadatas"][0]
        self.assertEqual(metadata["labelIds"], "INBOX,IMPORTANT")
        self.assertEqual(metadata["label_ids"], "INBOX,IMPORTANT")
        self.assertEqual(metadata["sender"], "a@example.com")

    def test_selected_gmail_index_strips_html_before_vector_storage(self):
        import base64

        collection = _FakeCollection()
        html = '<html><body><h1>계약 일정</h1><script>noise()</script><p>본문입니다.</p></body></html>'
        message = {
            "id": "m1",
            "threadId": "t1",
            "internalDate": "1767225600000",
            "payload": {
                "headers": [
                    {"name": "Subject", "value": "Hello"},
                    {"name": "From", "value": "a@example.com"},
                ],
                "mimeType": "text/html",
                "body": {"data": base64.urlsafe_b64encode(html.encode()).decode().rstrip("=")},
            },
        }
        with patch("src.rag.indexer.get_chroma_client", return_value=_FakeClient(collection)), \
             patch("src.rag.indexer.get_embedding_model", return_value=_FakeModel()):
            indexed = indexer.index_gmail_raw([message])

        self.assertEqual(indexed, 1)
        payload = collection.upsert_payload
        self.assertIsNotNone(payload)
        assert payload is not None
        document = payload["documents"][0]
        self.assertIn("# 계약 일정", document)
        self.assertIn("본문입니다.", document)
        self.assertNotIn("<h1", document)
        self.assertNotIn("<script", document)
        self.assertNotIn("noise()", document)

    def test_selected_gmail_index_skips_unchanged_message(self):
        message = {
            "id": "m1",
            "threadId": "t1",
            "internalDate": "1767225600000",
            "payload": {
                "headers": [
                    {"name": "Subject", "value": "Hello"},
                    {"name": "From", "value": "a@example.com"},
                ],
                "mimeType": "text/plain",
                "body": {"data": "Qm9keQ=="},
            },
        }
        document_hash = indexer._content_hash("Subject: Hello\nFrom: a@example.com\n\nBody")
        collection = _FakeCollection({"ids": ["gmail_m1_0"], "metadatas": [{"document_hash": document_hash}]})
        with patch("src.rag.indexer.get_chroma_client", return_value=_FakeClient(collection)), \
             patch("src.rag.indexer.get_embedding_model") as get_embedding_model:
            indexed = indexer.index_gmail_raw([message])

        self.assertEqual(indexed, 0)
        self.assertIsNone(collection.upsert_payload)
        get_embedding_model.assert_not_called()

    def test_drive_index_persists_owner_creator_metadata(self):
        collection = _FakeCollection()
        drive_file = {
            "id": "f1",
            "name": "Doc",
            "mimeType": "text/plain",
            "modifiedTime": "2026-01-02T00:00:00Z",
            "createdTime": "2026-01-01T00:00:00Z",
            "webViewLink": "https://drive.google.com/file",
            "resourceKey": "rk",
            "owners": [{"displayName": "Owner", "emailAddress": "owner@example.com"}],
            "lastModifyingUser": {"displayName": "Editor", "emailAddress": "editor@example.com"},
        }
        with patch("src.rag.indexer.get_chroma_client", return_value=_FakeClient(collection)), \
             patch("src.rag.indexer.get_embedding_model", return_value=_FakeModel()), \
             patch("src.rag.indexer.fetch_drive_file_content", return_value="Drive body"):
            indexed = indexer.index_drive_raw([drive_file])

        self.assertEqual(indexed, 1)
        payload = collection.upsert_payload
        self.assertIsNotNone(payload)
        assert payload is not None
        metadata = payload["metadatas"][0]
        self.assertEqual(metadata["owners"], "Owner <owner@example.com>")
        self.assertEqual(metadata["creator"], "Owner <owner@example.com>")
        self.assertEqual(metadata["last_modifying_user"], "Editor <editor@example.com>")
        self.assertEqual(metadata["created_time"], "2026-01-01T00:00:00Z")

    def test_drive_index_skips_unchanged_file(self):
        collection = _FakeCollection({"ids": ["drive_f1_0"], "metadatas": [{"document_hash": indexer._content_hash("Drive body")}]})
        drive_file = {
            "id": "f1",
            "name": "Doc",
            "mimeType": "text/plain",
            "modifiedTime": "2026-01-02T00:00:00Z",
        }
        with patch("src.rag.indexer.get_chroma_client", return_value=_FakeClient(collection)), \
             patch("src.rag.indexer.get_embedding_model") as get_embedding_model, \
             patch("src.rag.indexer.fetch_drive_file_content", return_value="Drive body"):
            indexed = indexer.index_drive_raw([drive_file])

        self.assertEqual(indexed, 0)
        self.assertIsNone(collection.upsert_payload)
        get_embedding_model.assert_not_called()

    def test_settings_api_partial_update_preserves_existing_values(self):
        settings_path = BACKEND_ROOT / "data" / "test-settings-api-preserve.json"
        if settings_path.exists():
            settings_path.unlink()
        try:
            with patch("src.settings.SETTINGS_FILE", settings_path):
                client = TestClient(main.app)
                headers = {"host": "localhost:18731", "origin": "http://localhost:18732"}
                first = client.post("/api/settings", headers=headers, json={
                    "obsidian_vault_path": "C:/vault",
                    "notion_api_key": "secret",
                    "notion_page_id": "page",
                    "suppress_external_llm_sensitive_warning": False,
                })
                second = client.post("/api/settings", headers=headers, json={
                    "suppress_external_llm_sensitive_warning": True,
                })
                saved = settings.load_settings()

            self.assertEqual(first.status_code, 200)
            self.assertEqual(second.status_code, 200)
            self.assertEqual(saved["obsidian_vault_path"], "C:/vault")
            self.assertEqual(saved["notion_api_key"], "secret")
            self.assertEqual(saved["notion_page_id"], "page")
            self.assertTrue(saved["suppress_external_llm_sensitive_warning"])
        finally:
            if settings_path.exists():
                settings_path.unlink()


    def test_settings_partial_save_preserves_existing_values(self):
        settings_path = BACKEND_ROOT / "data" / "test-settings-preserve.json"
        if settings_path.exists():
            settings_path.unlink()
        try:
            with patch("src.settings.SETTINGS_FILE", settings_path):
                self.assertTrue(settings.save_settings({
                    "obsidian_vault_path": "C:/vault",
                    "notion_api_key": "secret",
                    "notion_page_id": "page",
                    "suppress_external_llm_sensitive_warning": False,
                }))
                self.assertTrue(settings.save_settings({
                    "suppress_external_llm_sensitive_warning": True,
                }))

                saved = settings.load_settings()

            self.assertEqual(saved["obsidian_vault_path"], "C:/vault")
            self.assertEqual(saved["notion_api_key"], "secret")
            self.assertEqual(saved["notion_page_id"], "page")
            self.assertTrue(saved["suppress_external_llm_sensitive_warning"])
        finally:
            if settings_path.exists():
                settings_path.unlink()


if __name__ == "__main__":
    unittest.main()
