import unittest
from unittest.mock import patch

from fastapi.testclient import TestClient

import main
from src.gws import drive as drive_module
from src.gws import gmail as gmail_module


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
            patch("src.gws.originals.list_message_metadata", return_value=(gmail_messages, None)) as list_message_metadata,
            patch("src.gws.originals.list_drive_files", return_value=(drive_files, None)) as list_drive_files,
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


    def test_gmail_original_detail_returns_full_body(self):
        client = TestClient(main.app)
        original = {
            "id": "g1",
            "type": "gmail",
            "title": "긴 메일",
            "subtitle": "sender@example.com",
            "content": "스니펫이 아니라 전체 메일 본문입니다.",
            "content_type": "text/markdown",
            "open_url": "https://mail.google.com/mail/u/0/#search/rfc822msgid%3Aabc",
        }

        with patch("src.gws.originals.get_gmail_message_original", return_value=original) as get_original:
            response = client.get("/api/gws/originals/gmail/g1", headers=HEADERS)

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json(), {"status": "success", "original": original})
        get_original.assert_called_once_with("g1")

    def test_drive_original_detail_uses_mime_type_and_returns_content(self):
        client = TestClient(main.app)
        original = {
            "id": "d1",
            "type": "drive",
            "title": "문서",
            "subtitle": "application/vnd.google-apps.document",
            "content": "드라이브 문서 전체 내용",
            "content_type": "text/markdown",
            "open_url": "https://docs.google.com/document/d/d1/edit",
        }

        with patch("src.gws.originals.get_drive_file_original", return_value=original) as get_original:
            response = client.get(
                "/api/gws/originals/drive/d1",
                headers=HEADERS,
                params={"mime_type": "application/vnd.google-apps.document"},
            )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json(), {"status": "success", "original": original})
        get_original.assert_called_once_with("d1", "application/vnd.google-apps.document", "")

    def test_drive_original_detail_accepts_missing_mime_type(self):
        client = TestClient(main.app)
        original = {
            "id": "d1",
            "type": "drive",
            "title": "문서",
            "subtitle": "application/vnd.google-apps.document",
            "content": "드라이브 문서 전체 내용",
            "content_type": "text/markdown",
            "open_url": "https://docs.google.com/document/d/d1/edit",
        }

        with patch("src.gws.originals.get_drive_file_original", return_value=original) as get_original:
            response = client.get("/api/gws/originals/drive/d1", headers=HEADERS)

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json(), {"status": "success", "original": original})
        get_original.assert_called_once_with("d1", "", "")

    def test_drive_original_detail_forwards_resource_key(self):
        client = TestClient(main.app)
        original = {
            "id": "d1",
            "type": "drive",
            "title": "문서",
            "subtitle": "application/pdf",
            "content": "원문",
            "content_type": "application/pdf",
            "open_url": "https://drive.google.com/file/d/d1/view?resourcekey=rk1",
        }

        with patch("src.gws.originals.get_drive_file_original", return_value=original) as get_original:
            response = client.get(
                "/api/gws/originals/drive/d1",
                headers=HEADERS,
                params={"mime_type": "application/pdf", "resource_key": "rk1"},
            )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json(), {"status": "success", "original": original})
        get_original.assert_called_once_with("d1", "application/pdf", "rk1")

    def test_drive_original_detail_uses_shared_drive_and_resource_key_requests(self):
        class FakeRequest:
            def __init__(self, payload):
                self.payload = payload
                self.headers = {}

            def execute(self):
                return self.payload

        class FakeFiles:
            def __init__(self):
                self.get_kwargs = None
                self.get_request = None
                self.export_kwargs = None
                self.export_request = None

            def get(self, **kwargs):
                self.get_kwargs = kwargs
                self.get_request = FakeRequest({
                    "id": "d1",
                    "name": "공유 문서",
                    "mimeType": "application/vnd.google-apps.document",
                    "webViewLink": "https://docs.google.com/document/d/d1/edit?resourcekey=rk1",
                    "resourceKey": "rk1",
                })
                return self.get_request

            def export_media(self, **kwargs):
                self.export_kwargs = kwargs
                self.export_request = FakeRequest(b"<p>Drive original</p>")
                return self.export_request

        class FakeService:
            def __init__(self):
                self.files_resource = FakeFiles()

            def files(self):
                return self.files_resource

        fake_service = FakeService()

        with (
            patch("src.gws.drive.get_credentials", return_value=object()),
            patch("src.gws.drive.build", return_value=fake_service),
        ):
            original = drive_module.get_drive_file_original("d1", "application/vnd.google-apps.document", "rk1")

        self.assertIn("Drive original", original["content"])
        self.assertTrue(fake_service.files_resource.get_kwargs["supportsAllDrives"])
        self.assertIn("resourceKey", fake_service.files_resource.get_kwargs["fields"])
        self.assertEqual(fake_service.files_resource.export_kwargs, {"fileId": "d1", "mimeType": "text/html"})
        self.assertEqual(
            fake_service.files_resource.get_request.headers["X-Goog-Drive-Resource-Keys"],
            "d1/rk1",
        )
        self.assertEqual(
            fake_service.files_resource.export_request.headers["X-Goog-Drive-Resource-Keys"],
            "d1/rk1",
        )






if __name__ == "__main__":
    unittest.main()
