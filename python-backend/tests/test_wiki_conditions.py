import json
import sys
import unittest
from pathlib import Path
from unittest.mock import Mock, patch

BACKEND_ROOT = Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from fastapi.testclient import TestClient

import main
from src import wiki_conditions
from src.wiki_condition_runner import run_condition


HEADERS = {"host": "localhost:18731", "origin": "http://localhost:18732"}


class WikiConditionTests(unittest.TestCase):
    def test_condition_store_defaults_auto_wiki_and_rejects_unscoped_all(self):
        path = BACKEND_ROOT / "data" / "test-wiki-conditions.json"
        if path.exists():
            path.unlink()
        try:
            store = wiki_conditions.WikiConditionStore(path)

            condition = store.create({
                "name": "취업 자료",
                "keyword": "resume",
                "period": "all",
            })

            self.assertTrue(condition["autoWikiEnabled"])
            self.assertEqual(condition["keyword"], "resume")
            self.assertEqual(store.list()[0]["id"], condition["id"])
            with self.assertRaises(wiki_conditions.ConditionValidationError):
                store.create({"name": "전체", "period": "all"})
        finally:
            if path.exists():
                path.unlink()

    def test_folder_url_parsing_and_drive_query_escape(self):
        folder_id = wiki_conditions.parse_drive_folder_id(
            "https://drive.google.com/drive/folders/abc'DEF_123?usp=sharing"
        )
        query = wiki_conditions.build_drive_query(keyword="draft's", period="1w", drive_folder_ids=[folder_id])

        self.assertEqual(folder_id, "abc'DEF_123")
        self.assertIn("'abc\\'DEF_123' in parents", query)
        self.assertIn("draft\\'s", query)
        with self.assertRaises(wiki_conditions.ConditionValidationError):
            wiki_conditions.parse_drive_folder_id("not a folder url")

    def test_run_returns_warning_required_before_external_llm_call(self):
        condition = wiki_conditions.normalize_condition({
            "id": "c1",
            "name": "취업",
            "keyword": "resume",
            "period": "1w",
            "autoWikiEnabled": True,
        })
        gmail_client = Mock(return_value=([{"id": "m1", "subject": "Resume", "snippet": "metadata"}], None))
        drive_client = Mock(return_value=([{"id": "d1", "name": "Resume", "mimeType": "text/plain", "modifiedTime": "2026-01-01T00:00:00Z"}], None))
        chat = Mock(return_value={"content": "wiki"})

        result = run_condition(
            condition,
            list_gmail_metadata=gmail_client,
            list_drive_files=drive_client,
            chat_completion=chat,
            suppress_external_warning=False,
            is_external_llm=True,
        )

        self.assertEqual(result["wiki"]["status"], "warning_required")
        chat.assert_not_called()
        gmail_client.assert_called_once()
        called_kwargs = gmail_client.call_args.kwargs
        self.assertEqual(called_kwargs["query"].split()[0], "resume")
        self.assertNotIn("format", called_kwargs)

    def test_api_crud_and_run_do_not_call_drive_sync_indexer(self):
        path = BACKEND_ROOT / "data" / "test-wiki-conditions-api.json"
        if path.exists():
            path.unlink()
        try:
            with patch("src.wiki_conditions.WIKI_CONDITIONS_FILE", path), \
                 patch("src.wiki_condition_runner.list_message_metadata", return_value=([], None)), \
                 patch("src.wiki_condition_runner.list_drive_files", return_value=([], None)), \
                 patch("src.wiki_condition_runner.chat_completion") as chat, \
                 patch("src.rag.indexer.index_drive_raw") as index_drive_raw:
                client = TestClient(main.app)
                created = client.post("/api/wiki-conditions", headers=HEADERS, json={
                    "name": "논문",
                    "keyword": "paper",
                    "period": "1m",
                })
                condition = created.json()["condition"]
                ran = client.post(f"/api/wiki-conditions/{condition['id']}/run", headers=HEADERS, json={})

            self.assertEqual(created.status_code, 200)
            self.assertEqual(ran.status_code, 200)
            self.assertEqual(ran.json()["status"], "success")
            chat.assert_called_once()
            index_drive_raw.assert_not_called()
            saved = json.loads(path.read_text(encoding="utf-8"))
            self.assertEqual(saved[0]["name"], "논문")
        finally:
            if path.exists():
                path.unlink()

    def test_drive_sync_returns_originals_without_vector_indexing(self):
        drive_files = [{"id": "d1", "name": "Resume", "mimeType": "text/plain"}]
        with (
            patch("main.list_drive_files", return_value=(drive_files, None)) as list_drive_files,
            patch("src.rag.indexer.index_drive_raw") as index_drive_raw,
            patch("src.rag.indexer.rebuild_bm25_index") as rebuild_bm25_index,
        ):
            client = TestClient(main.app)
            response = client.post("/api/sync/drive", headers=HEADERS, json={"max_emails": 10, "query": "resume"})

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["status"], "success")
        self.assertEqual(response.json()["files"], drive_files)
        list_drive_files.assert_called_once_with(max_results=10, query="resume")
        index_drive_raw.assert_not_called()
        rebuild_bm25_index.assert_not_called()


if __name__ == "__main__":
    unittest.main()
