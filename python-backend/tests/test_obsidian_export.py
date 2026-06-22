import os
import sys
import tempfile
import unittest
from pathlib import Path

BACKEND_ROOT = Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from src.sink.obsidian import export_to_obsidian, sanitize_filename, yaml_quote


class ObsidianExportTests(unittest.TestCase):
    def test_filename_sanitization(self):
        self.assertEqual(sanitize_filename('A/B:C*D?E"F<G>H|I'), "A_B_C_D_E_F_G_H_I")
        self.assertEqual(sanitize_filename("   "), "untitled_note")

    def test_yaml_quote_handles_obsidian_property_title(self):
        self.assertEqual(yaml_quote("[정보 묶음] llm wiki (6월 23일) Wiki"), "'[정보 묶음] llm wiki (6월 23일) Wiki'")
        self.assertEqual(yaml_quote("Bob's Wiki"), "'Bob''s Wiki'")

    def test_invalid_path_returns_error(self):
        result = export_to_obsidian(os.path.join(tempfile.gettempdir(), "missing-vault-for-test"), "Title", "Body")

        self.assertEqual(result["status"], "error")
        self.assertIn("유효하지 않은", result["message"])

    def test_utf8_write_and_duplicate_suffix(self):
        with tempfile.TemporaryDirectory() as vault_path:
            first = export_to_obsidian(vault_path, "회의/요약", "본문 한글 😀", ["gmail", "지식 관리"])
            second = export_to_obsidian(vault_path, "회의/요약", "두 번째 본문", ["gmail"])

            self.assertEqual(first["status"], "success")
            self.assertEqual(second["status"], "success")
            self.assertEqual(first["filename"], "회의_요약.md")
            self.assertEqual(second["filename"], "회의_요약_1.md")

            with open(first["filepath"], "r", encoding="utf-8") as file:
                content = file.read()

            self.assertIn("본문 한글 😀", content)
            self.assertIn("title: '회의/요약'", content)
            self.assertIn("  - gmail", content)

    def test_frontmatter_quotes_bracket_title_so_tags_parse(self):
        with tempfile.TemporaryDirectory() as vault_path:
            result = export_to_obsidian(
                vault_path,
                "[정보 묶음] llm wiki (6월 23일) Wiki",
                "본문",
                ["자료찾기", "정보묶음"],
            )

            self.assertEqual(result["status"], "success")
            with open(result["filepath"], "r", encoding="utf-8") as file:
                content = file.read()

            self.assertIn("title: '[정보 묶음] llm wiki (6월 23일) Wiki'", content)
            self.assertIn("tags:\n  - 자료찾기\n  - 정보묶음\n", content)


if __name__ == "__main__":
    unittest.main()
