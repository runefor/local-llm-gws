import os
import sys
import tempfile
import unittest
from pathlib import Path

BACKEND_ROOT = Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from src.sink.obsidian import export_to_obsidian, export_to_obsidian_with_originals, sanitize_filename, yaml_quote


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

    def test_export_with_originals_writes_original_folder_and_relinks_wiki(self):
        wiki = """# 계약 Wiki

## 요약
- 계약 마감 확인 [ev_contract_0]

## 원문 링크
- [ev_contract_0] 기존 구글 링크

## 확인 범위
- 저장된 정보 묶음 밖의 자료는 별도로 확인하지 않았습니다.
"""
        with tempfile.TemporaryDirectory() as vault_path:
            result = export_to_obsidian_with_originals(
                vault_path,
                "계약 Wiki",
                wiki,
                ["자료찾기"],
                [{
                    "evidence_id": "ev_contract_0",
                    "title": "계약 일정",
                    "content": "전체 원문 본문입니다.",
                    "source_line": "drive | 2026-06-01",
                    "open_url": "https://drive.google.com/file/d/d1",
                }],
            )

            self.assertEqual(result["status"], "success")
            self.assertTrue(os.path.isdir(result["originals_dir"]))
            self.assertEqual(len(result["original_files"]), 1)

            with open(result["filepath"], "r", encoding="utf-8") as file:
                wiki_content = file.read()
            with open(result["original_files"][0], "r", encoding="utf-8") as file:
                original_content = file.read()

            self.assertIn("- [[계약 Wiki_원문/ev_contract_0 계약 일정|계약 일정]] (근거: ev_contract_0)", wiki_content)
            self.assertNotIn("- [ev_contract_0]", wiki_content)
            self.assertNotIn("전체 원문 본문입니다.", wiki_content)
            self.assertIn("[[계약 Wiki|계약 Wiki]]", original_content)
            self.assertIn("## 원문 정보", original_content)
            self.assertIn("## 연결", original_content)
            self.assertIn("## 본문", original_content)
            self.assertIn("전체 원문 본문입니다.", original_content)
            self.assertIn("원문 열기: https://drive.google.com/file/d/d1", original_content)

    def test_export_with_originals_cleans_gmail_html_before_writing_original(self):
        wiki = """# PyTorchKR Wiki

## 원문 링크
- [ev_mail_0] 기존 구글 링크
"""
        html_original = """
<html lang="ko"><head><meta><style>.hidden{display:none}</style></head>
<body style="line-height: 1.4">
<div style="display: none"></div>
<h1>PyTorchKR 새 소식</h1>
<p>읽어야 할 본문입니다.</p>
<img src="https://event.stibee.com/v2/open/TRACK" />
</body></html>
"""
        with tempfile.TemporaryDirectory() as vault_path:
            result = export_to_obsidian_with_originals(
                vault_path,
                "PyTorchKR Wiki",
                wiki,
                ["gmail"],
                [{
                    "evidence_id": "ev_mail_0",
                    "title": "PyTorchKR 새 소식",
                    "content": html_original,
                    "source_line": "gmail | 2026-06-21 | Gmail: PyTorchKR",
                    "open_url": "https://mail.google.com/mail/u/0/#search/rfc822msgid:abc",
                }],
            )

            self.assertEqual(result["status"], "success")
            with open(result["original_files"][0], "r", encoding="utf-8") as file:
                original_content = file.read()

            self.assertIn("## 본문", original_content)
            self.assertIn("### PyTorchKR 새 소식", original_content)
            self.assertIn("읽어야 할 본문입니다.", original_content)
            self.assertNotIn("<html", original_content)
            self.assertNotIn("<meta", original_content)
            self.assertNotIn("display: none", original_content)
            self.assertNotIn("event.stibee.com", original_content)

    def test_export_with_originals_uses_wikilinks_without_bracketed_evidence_labels(self):
        wiki = """# LLM Wiki

## 원문 링크
- [ev_mail_0] 기존 구글 링크
"""
        html_original = """
<html><body>
마지막 방문 이후<br>35<br>3<br>59<br>새 주제<br>읽지 않은 알림<br>신규 사용자<br>인기 주제<br>
읽을거리&정보공유<br>5월 6<br>
<h2>OpenKB: LLM이 문서를 자동으로 위키 형태의 지식 베이스로 컴파일하는 오픈소스 도구</h2>
<p>박정환<br>9bow</p>
<p>Andrej Karpathy는 LLM이 문서를 그때그때 검색하는 것을 넘어, 지식을 위키로 컴파일하는 방식이 강력하다고 이야기했습니다.</p>
<p>5</p><p>4</p><p>더 보기</p><p>읽을거리&정보공유</p>
</body></html>
"""
        with tempfile.TemporaryDirectory() as vault_path:
            result = export_to_obsidian_with_originals(
                vault_path,
                "[정보 묶음] llm wiki (6월 23일) Wiki",
                wiki,
                ["gmail"],
                [{
                    "evidence_id": "ev_mail_0",
                    "title": "Gmail: [PyTorchKR] PyTorch.kr의 새로운 소식이 도착했습니다!",
                    "content": html_original,
                    "source_line": "gmail | 2026-06-21 | Gmail: [PyTorchKR]",
                    "open_url": "https://mail.google.com/mail/u/0/#search/rfc822msgid:abc",
                }],
            )

            self.assertEqual(result["status"], "success")
            with open(result["filepath"], "r", encoding="utf-8") as file:
                wiki_content = file.read()
            with open(result["original_files"][0], "r", encoding="utf-8") as file:
                original_content = file.read()

            self.assertIn("[[[정보 묶음] llm wiki (6월 23일) Wiki_원문/ev_mail_0 Gmail_ [PyTorchKR] PyTorch.kr의 새로운 소식이 도착했습니다!|Gmail: [PyTorchKR] PyTorch.kr의 새로운 소식이 도착했습니다!]]", wiki_content)
            self.assertIn("(근거: ev_mail_0)", wiki_content)
            self.assertNotIn("[ev_mail_0]", wiki_content)
            self.assertIn("[[[정보 묶음] llm wiki (6월 23일) Wiki|[정보 묶음] llm wiki (6월 23일) Wiki]]", original_content)
            self.assertIn("### OpenKB: LLM이 문서를 자동으로 위키 형태의 지식 베이스로 컴파일하는 오픈소스 도구", original_content)
            self.assertIn("Andrej Karpathy는 LLM이 문서를", original_content)
            self.assertNotIn("마지막 방문 이후", original_content)
            self.assertNotIn("읽지 않은 알림", original_content)
            self.assertNotIn("\n5월 6\n", original_content)
            self.assertNotIn("\n35\n", original_content)
            self.assertNotIn("\n더 보기\n", original_content)

    def test_export_with_originals_links_inline_citations_to_source_link_blocks(self):
        wiki = """# RAG Wiki

## 한 줄 결론
RAG는 반복 추론에 토큰과 시간이 듭니다 [ev_gmail_19ee68dd4766f012_9].

## 원문 링크
- [ev_gmail_19ee68dd4766f012_9] 기존 구글 링크
"""
        with tempfile.TemporaryDirectory() as vault_path:
            result = export_to_obsidian_with_originals(
                vault_path,
                "RAG Wiki",
                wiki,
                ["gmail"],
                [{
                    "evidence_id": "ev_gmail_19ee68dd4766f012_9",
                    "title": "Gmail: PyTorchKR",
                    "content": "OpenKB 본문입니다.",
                    "source_line": "gmail | 2026-06-21 | Gmail: PyTorchKR",
                    "open_url": "https://mail.google.com/mail/u/0/#search/rfc822msgid:abc",
                }],
            )

            self.assertEqual(result["status"], "success")
            with open(result["filepath"], "r", encoding="utf-8") as file:
                wiki_content = file.read()

            self.assertIn(
                "토큰과 시간이 듭니다 [[#^ev_gmail_19ee68dd4766f012_9|[ev_gmail_19ee68dd4766f012_9]]].",
                wiki_content,
            )
            self.assertIn(
                "- [[RAG Wiki_원문/ev_gmail_19ee68dd4766f012_9 Gmail_ PyTorchKR|Gmail: PyTorchKR]] "
                "(근거: ev_gmail_19ee68dd4766f012_9) ^ev_gmail_19ee68dd4766f012_9",
                wiki_content,
            )

    def test_export_with_originals_preserves_html_code_as_fenced_blocks(self):
        wiki = """# 코드 Wiki

## 원문 링크
- [ev_code_0] 기존 구글 링크
"""
        html_original = """
<html><body>
<p>아래 명령으로 실행합니다.</p>
<pre><code>python -m pip install torch
print("hello")</code></pre>
<p>inline <code>torch.compile()</code> 도 언급됩니다.</p>
</body></html>
"""
        with tempfile.TemporaryDirectory() as vault_path:
            result = export_to_obsidian_with_originals(
                vault_path,
                "코드 Wiki",
                wiki,
                ["gmail"],
                [{
                    "evidence_id": "ev_code_0",
                    "title": "코드 예시 메일",
                    "content": html_original,
                    "source_line": "gmail | 2026-06-23 | Gmail: 코드",
                    "open_url": "https://mail.google.com/mail/u/0/#search/rfc822msgid:code",
                }],
            )

            self.assertEqual(result["status"], "success")
            with open(result["original_files"][0], "r", encoding="utf-8") as file:
                original_content = file.read()

            self.assertIn("아래 명령으로 실행합니다.", original_content)
            self.assertIn("```\npython -m pip install torch\nprint(\"hello\")\n```", original_content)
            self.assertIn("`torch.compile()`", original_content)
            self.assertNotIn("<pre", original_content)
            self.assertNotIn("<code", original_content)


if __name__ == "__main__":
    unittest.main()
