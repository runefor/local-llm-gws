import json
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import Mock, patch

from fastapi.testclient import TestClient

BACKEND_ROOT = Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))


import main
from src import evidence, settings, wiki_conditions
from src.gws import drive
from src.llm import manager, server
from src.rag import indexer


HEADERS = {"host": "localhost:18731", "origin": "http://localhost:18732"}


class _FakeCollection:
    def __init__(self) -> None:
        self.deleted_ids: list[str] | None = None
        self.upsert_payload: dict[str, object] | None = None

    def get(self, where=None, include=None):
        return {"ids": ["drive_f1_0"], "metadatas": [{"document_hash": "old"}]}

    def delete(self, ids) -> None:
        self.deleted_ids = ids

    def upsert(self, ids, embeddings, documents, metadatas) -> None:
        self.upsert_payload = {"ids": ids, "documents": documents, "metadatas": metadatas}


class _FakeClient:
    def __init__(self, collection: object) -> None:
        self.collection = collection

    def get_or_create_collection(self, name):
        return self.collection


class _FakeProcess:
    def __init__(self) -> None:
        self.terminated = False
        self.killed = False

    def poll(self):
        return None

    def terminate(self) -> None:
        self.terminated = True

    def wait(self, timeout=None) -> None:
        return None

    def kill(self) -> None:
        self.killed = True


class BackendAuditFixTests(unittest.TestCase):
    def test_delete_local_model_rejects_parent_path_traversal(self):
        with tempfile.TemporaryDirectory() as tmp_dir:
            root = Path(tmp_dir)
            models_dir = root / "models"
            models_dir.mkdir()
            outside_file = root / "settings.json"
            outside_file.write_text("secret", encoding="utf-8")

            with patch.object(manager.config, "MODELS_DIR", models_dir):
                deleted = manager.delete_local_model("../settings.json")

            self.assertFalse(deleted)
            self.assertEqual(outside_file.read_text(encoding="utf-8"), "secret")

    def test_start_server_rejects_parent_path_traversal(self):
        with tempfile.TemporaryDirectory() as tmp_dir:
            root = Path(tmp_dir)
            models_dir = root / "models"
            models_dir.mkdir()
            outside_model = root / "outside.gguf"
            outside_model.write_text("model", encoding="utf-8")

            with patch.object(server.config, "MODELS_DIR", models_dir), patch("src.llm.server._find_binary") as find_binary:
                result = server.start_server("../outside.gguf")

            self.assertEqual(result["status"], "error")
            self.assertIn("모델 파일", result["message"])
            find_binary.assert_not_called()

    def test_start_server_timeout_terminates_and_clears_process_state(self):
        with tempfile.TemporaryDirectory() as tmp_dir:
            models_dir = Path(tmp_dir)
            model_path = models_dir / "safe.gguf"
            model_path.write_text("model", encoding="utf-8")
            fake_process = _FakeProcess()

            with patch.object(server.config, "MODELS_DIR", models_dir), \
                 patch("src.llm.server._find_binary", return_value=models_dir / "llama-server"), \
                 patch("src.llm.server.subprocess.Popen", return_value=fake_process) as popen, \
                 patch("src.llm.server._wait_until_ready", return_value=False):
                result = server.start_server("safe.gguf")

            self.assertEqual(result["status"], "error")
            self.assertTrue(fake_process.terminated)
            self.assertEqual(server.get_server_status()["running"], False)
            command = popen.call_args.args[0]
            flash_attn_index = command.index("--flash-attn")
            self.assertEqual(command[flash_attn_index + 1], "auto")

    def test_drive_index_empty_fetch_preserves_existing_chunks(self):
        collection = _FakeCollection()
        drive_file = {"id": "f1", "name": "Doc", "mimeType": "text/plain"}

        with patch("src.rag.indexer.get_chroma_client", return_value=_FakeClient(collection)), \
             patch("src.rag.indexer.fetch_drive_file_content", return_value=""), \
             patch("src.rag.indexer.get_embedding_model") as get_embedding_model:
            indexed = indexer.index_drive_raw([drive_file])

        self.assertEqual(indexed, 0)
        self.assertIsNone(collection.deleted_ids)
        self.assertIsNone(collection.upsert_payload)
        get_embedding_model.assert_not_called()

    def test_index_status_reports_collection_count_failure(self):
        class FailingCollection:
            def count(self):
                raise StopIteration()

        with patch("src.rag.indexer.get_chroma_client", return_value=_FakeClient(FailingCollection())):
            status = indexer.get_index_status()

        self.assertEqual(status["status"], "error")
        self.assertIn("컬렉션 카운트 실패", status["message"])
        self.assertNotIn("total_chunks", status)

    def test_originless_settings_get_masks_notion_api_key(self):
        client = TestClient(main.app)
        with patch("src.settings.load_settings", return_value={
            "obsidian_vault_path": "C:/vault",
            "notion_api_key": "secret-token",
            "notion_page_id": "page",
            "suppress_external_llm_sensitive_warning": False,
        }):
            response = client.get("/api/settings", headers={"host": "localhost:18731"})

        self.assertEqual(response.status_code, 200)
        body = response.json()
        self.assertEqual(body["notion_api_key"], "")
        self.assertEqual(body["notion_page_id"], "page")

    def test_drive_plain_query_escapes_apostrophes(self):
        files_resource = Mock()
        files_resource.list.return_value.execute.return_value = {"files": [], "nextPageToken": None}
        service = Mock()
        service.files.return_value = files_resource

        with patch("src.gws.drive.get_credentials", return_value=object()), patch("src.gws.drive.build", return_value=service):
            drive.list_drive_files(query="draft's", mime_types=["text/plain"], max_results=3)

        drive_query = files_resource.list.call_args.kwargs["q"]
        self.assertIn("name contains 'draft\\'s'", drive_query)
        self.assertIn("fullText contains 'draft\\'s'", drive_query)

    def test_settings_evidence_and_wiki_conditions_write_atomically(self):
        with tempfile.TemporaryDirectory() as tmp_dir:
            root = Path(tmp_dir)
            settings_path = root / "settings.json"
            evidence_path = root / "evidence_store.json"
            wiki_path = root / "wiki_conditions.json"

            with patch.object(settings, "SETTINGS_FILE", settings_path):
                self.assertTrue(settings.save_settings({"notion_api_key": "secret"}))
            with patch.object(evidence, "STORE_PATH", evidence_path):
                evidence.create_evidence_set("제목", "query", [])
            wiki_conditions.WikiConditionStore(wiki_path).create({"name": "문서", "keyword": "draft", "period": "1w"})

            self.assertEqual(json.loads(settings_path.read_text(encoding="utf-8"))["notion_api_key"], "secret")
            self.assertEqual(json.loads(evidence_path.read_text(encoding="utf-8"))["evidence_sets"][0]["title"], "제목")
            self.assertEqual(json.loads(wiki_path.read_text(encoding="utf-8"))[0]["keyword"], "draft")
            self.assertEqual(list(root.glob("*.tmp")), [])

    def test_json_write_failures_preserve_existing_files(self):
        with tempfile.TemporaryDirectory() as tmp_dir:
            root = Path(tmp_dir)
            settings_path = root / "settings.json"
            evidence_path = root / "evidence_store.json"
            wiki_path = root / "wiki_conditions.json"
            settings_path.write_text(json.dumps({"notion_api_key": "old"}), encoding="utf-8")
            evidence_path.write_text(json.dumps({"evidence_sets": [], "artifacts": [], "relevance_feedback": []}), encoding="utf-8")
            wiki_path.write_text(json.dumps([]), encoding="utf-8")

            with patch.object(settings, "SETTINGS_FILE", settings_path), patch("src.settings.json.dump", side_effect=RuntimeError("boom")):
                self.assertFalse(settings.save_settings({"notion_api_key": "new"}))
            with patch.object(evidence, "STORE_PATH", evidence_path), patch("src.evidence.json.dump", side_effect=RuntimeError("boom")):
                with self.assertRaises(RuntimeError):
                    evidence.create_evidence_set("제목", "query", [])
            with patch("src.wiki_conditions.json.dump", side_effect=RuntimeError("boom")):
                with self.assertRaises(RuntimeError):
                    wiki_conditions.WikiConditionStore(wiki_path).create({"name": "문서", "keyword": "draft", "period": "1w"})

            self.assertEqual(json.loads(settings_path.read_text(encoding="utf-8"))["notion_api_key"], "old")
            self.assertEqual(json.loads(evidence_path.read_text(encoding="utf-8"))["evidence_sets"], [])
            self.assertEqual(json.loads(wiki_path.read_text(encoding="utf-8")), [])
            self.assertEqual(list(root.glob("*.tmp")), [])


if __name__ == "__main__":
    unittest.main()
