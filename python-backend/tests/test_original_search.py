import unittest
from unittest.mock import patch

from fastapi.testclient import TestClient

import main


HEADERS = {"Host": "127.0.0.1:18731", "Origin": "http://127.0.0.1:18732"}


class OriginalSearchApiTest(unittest.TestCase):
    def test_combined_original_search_returns_gmail_and_drive_without_indexing(self):
        client = TestClient(main.app)
        gmail_messages = [
            {"id": "g1", "subject": "취업 메일", "from": "sender@example.com", "snippet": "메일 원본", "date": "2026-06-18T00:00:00Z"}
        ]
        drive_files = [
            {"id": "d1", "name": "취업 문서", "mimeType": "application/pdf", "modifiedTime": "2026-06-17T00:00:00Z"}
        ]

        with (
            patch("main.list_message_metadata", return_value=(gmail_messages, None)) as list_message_metadata,
            patch("main.list_drive_files", return_value=(drive_files, None)) as list_drive_files,
            patch("src.rag.indexer.index_drive_raw") as index_drive_raw,
            patch("src.rag.indexer.index_gmail_message_ids") as index_gmail_message_ids,
        ):
            response = client.post(
                "/api/gws/originals/search",
                headers=HEADERS,
                json={"max_emails": 10, "query": "취업"},
            )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(
            response.json(),
            {
                "status": "success",
                "count": 2,
                "gmail_count": 1,
                "drive_count": 1,
                "messages": gmail_messages,
                "files": drive_files,
                "has_more": False,
            },
        )
        list_message_metadata.assert_called_once_with(max_results=10, query="취업", label_ids=None)
        list_drive_files.assert_called_once_with(max_results=10, query="취업")
        index_drive_raw.assert_not_called()
        index_gmail_message_ids.assert_not_called()


if __name__ == "__main__":
    unittest.main()
