import sys
import unittest
from pathlib import Path
from unittest.mock import patch

BACKEND_ROOT = Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from src.sink.notion import export_to_notion_with_originals, parse_markdown_to_notion_blocks


class FakeResponse:
    def __init__(self, status_code: int, payload: dict, text: str = ""):
        self.status_code = status_code
        self.payload = payload
        self.text = text

    def json(self):
        return self.payload


class NotionExportTests(unittest.TestCase):
    def test_export_with_originals_creates_source_pages_and_relinks_wiki(self):
        wiki = """# 계약 Wiki

## 요약
- 계약 마감 확인 [ev_contract_0]

## 원문 링크
- [ev_contract_0] 기존 링크

## 근거 부족
- 없음
"""
        patches = []

        def fake_post(url, headers, json, timeout):
            self.assertEqual(url, "https://api.notion.com/v1/pages")
            self.assertIn("전체 원문 본문입니다.", str(json))
            return FakeResponse(200, {"id": "original-page", "url": "https://notion.so/original-contract"})

        def fake_patch(url, headers, json, timeout):
            patches.append(json)
            return FakeResponse(200, {})

        with patch("src.sink.notion.httpx.post", side_effect=fake_post), patch("src.sink.notion.httpx.patch", side_effect=fake_patch):
            result = export_to_notion_with_originals(
                "secret",
                "12345678123412341234123456789012",
                "계약 Wiki",
                wiki,
                [{
                    "evidence_id": "ev_contract_0",
                    "title": "계약 일정",
                    "content": "전체 원문 본문입니다.",
                    "source_line": "drive | 2026-06-01",
                    "open_url": "https://drive.google.com/file/d/d1",
                }],
            )

        self.assertEqual(result["status"], "success")
        self.assertTrue(patches)
        patched_text = str(patches[0])
        self.assertIn("https://notion.so/original-contract", patched_text)
        self.assertNotIn("기존 링크", patched_text)

    def test_markdown_parser_preserves_long_original_lines(self):
        long_line = "가" * 2500

        blocks = parse_markdown_to_notion_blocks(long_line)

        rich_text = blocks[0]["paragraph"]["rich_text"]
        self.assertEqual("".join(part["text"]["content"] for part in rich_text), long_line)


if __name__ == "__main__":
    unittest.main()
