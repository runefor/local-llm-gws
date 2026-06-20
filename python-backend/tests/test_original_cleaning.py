import unittest
from unittest.mock import patch

from src.gws import drive as drive_module
from src.gws import gmail as gmail_module


class OriginalCleaningTest(unittest.TestCase):
    def test_gmail_original_detail_sanitizes_tracking_and_layout_markup(self):
        encoded_html = ""
        import base64

        html = """
        <html><body>
          <img src="https://event.stibee.com/v2/open/TRACK" width="1" height="1" />
          <table><tr><td>| | | --- | |</td></tr></table>
          <p>Dear. 틔움이 안녕하세요.</p>
          <p><a href="https://event.stibee.com/v2/click/TRACK">[잘림 없이 보기]</a></p>
          <h2>LLM 위키가 뭔데요?</h2>
          <p>원문 본문입니다.</p>
        </body></html>
        """
        encoded_html = base64.urlsafe_b64encode(html.encode()).decode().rstrip("=")
        message = {
            "id": "g1",
            "snippet": "snippet",
            "payload": {
                "headers": [
                    {"name": "Subject", "value": "뉴스레터"},
                    {"name": "From", "value": "sender@example.com"},
                ],
                "mimeType": "text/html",
                "body": {"data": encoded_html},
            },
        }

        with patch("src.gws.gmail.get_message", return_value=message):
            original = gmail_module.get_gmail_message_original("g1")

        self.assertEqual(original["content_type"], "text/html")
        self.assertIn("Dear. 틔움이 안녕하세요.", original["content"])
        self.assertIn("<h2>LLM 위키가 뭔데요?</h2>", original["content"])
        self.assertIn("원문 본문입니다.", original["content"])
        self.assertNotIn("event.stibee.com", original["content"])
        self.assertNotIn("잘림 없이 보기", original["content"])
        self.assertNotIn("| | |", original["content"])
        self.assertNotIn("![]", original["content"])

    def test_gmail_original_detail_sanitizes_plain_text_body(self):
        import base64

        plain = "2026.06.18(목) | 잘림 없이 보기 Dear. 지금 이직하는 게 맞을까? &quot;현재 직무&quot; | | | --- |"
        encoded_plain = base64.urlsafe_b64encode(plain.encode()).decode().rstrip("=")
        message = {
            "id": "g1",
            "snippet": "snippet",
            "payload": {
                "headers": [
                    {"name": "Subject", "value": "뉴스레터"},
                    {"name": "From", "value": "sender@example.com"},
                ],
                "mimeType": "text/plain",
                "body": {"data": encoded_plain},
            },
        }

        with patch("src.gws.gmail.get_message", return_value=message):
            original = gmail_module.get_gmail_message_original("g1")

        self.assertIn("Dear. 지금 이직하는 게 맞을까?", original["content"])
        self.assertIn("\"현재 직무\"", original["content"])
        self.assertNotIn("잘림 없이 보기", original["content"])
        self.assertNotIn("&quot;", original["content"])
        self.assertNotIn("| | |", original["content"])

    def test_gmail_original_detail_sanitizes_snippet_fallback(self):
        message = {
            "id": "g1",
            "snippet": "잘림 없이 보기 Dear. &quot;fallback&quot; | | | --- |",
            "payload": {
                "headers": [
                    {"name": "Subject", "value": "뉴스레터"},
                    {"name": "From", "value": "sender@example.com"},
                ],
                "mimeType": "application/octet-stream",
                "body": {},
            },
        }

        with patch("src.gws.gmail.get_message", return_value=message):
            original = gmail_module.get_gmail_message_original("g1")

        self.assertIn("Dear. \"fallback\"", original["content"])
        self.assertNotIn("잘림 없이 보기", original["content"])
        self.assertNotIn("&quot;", original["content"])
        self.assertNotIn("| | |", original["content"])

    def test_gmail_original_detail_prefers_html_even_when_plain_preview_is_similar_length(self):
        import base64
        from email.message import EmailMessage

        plain_preview = (
            "2026.06.18(목) | Dear. 티둥이 안녕하세요. "
            "요즘은 고민하다 AI한테 슬쩍 털어놔야 본 적 있으세요? "
            "현재 직무 만족도를 점검해보세요. "
            "이 문장은 plain 미리보기를 길게 만들어 기존 길이 기준 선택 버그를 재현합니다."
        )
        message = EmailMessage()
        message["Subject"] = "(광고) 긴 HTML 메일"
        message["From"] = "sender@example.com"
        message.set_content(plain_preview)
        message.add_alternative(
            """
            <html><body>
              <p>2026.06.18(목) | Dear. 티둥이 안녕하세요.</p>
              <h2>나만의 세컨 브레인 만들기</h2>
              <p>Gmail에서 실제로 보이는 첫 번째 본문입니다.</p>
              <p>설치 순서와 활용 예시까지 이어지는 내용입니다.</p>
            </body></html>
            """,
            subtype="html",
        )
        raw = base64.urlsafe_b64encode(message.as_bytes()).decode().rstrip("=")

        with patch("src.gws.gmail.get_message", return_value={"id": "g1", "snippet": plain_preview, "raw": raw}):
            original = gmail_module.get_gmail_message_original("g1")

        self.assertEqual(original["content_type"], "text/html")
        self.assertIn("<h2>나만의 세컨 브레인 만들기</h2>", original["content"])
        self.assertIn("설치 순서와 활용 예시까지 이어지는 내용입니다.", original["content"])

    def test_gmail_original_detail_prefers_richer_raw_html_over_short_plain_alternative(self):
        import base64
        from email.message import EmailMessage

        message = EmailMessage()
        message["Subject"] = "대체 본문"
        message["From"] = "sender@example.com"
        message["Message-ID"] = "<raw-1@example.com>"
        message.set_content("짧은 plain 본문")
        message.add_alternative(
            """
            <html><body>
              <h1>전체 HTML 본문</h1>
              <p>첫 번째 문단입니다.</p>
              <p>두 번째 문단까지 Gmail 원문처럼 보여야 합니다.</p>
              <blockquote>이전 인용문도 원문 보기에서는 사라지면 안 됩니다.</blockquote>
            </body></html>
            """,
            subtype="html",
        )
        message.add_attachment(b"binary", maintype="application", subtype="pdf", filename="file.pdf")
        raw = base64.urlsafe_b64encode(message.as_bytes()).decode().rstrip("=")

        with patch("src.gws.gmail.get_message", return_value={"id": "g1", "snippet": "snippet", "raw": raw}):
            original = gmail_module.get_gmail_message_original("g1")

        self.assertEqual(original["title"], "대체 본문")
        self.assertEqual(original["subtitle"], "sender@example.com")
        self.assertEqual(original["content_type"], "text/html")
        self.assertIn("<h1>전체 HTML 본문</h1>", original["content"])
        self.assertIn("두 번째 문단까지 Gmail 원문처럼 보여야 합니다.", original["content"])
        self.assertIn("이전 인용문도 원문 보기에서는 사라지면 안 됩니다.", original["content"])
        self.assertNotIn("binary", original["content"])

    def test_gmail_original_detail_preserves_links_and_images_as_html(self):
        import base64
        from email.message import EmailMessage

        message = EmailMessage()
        message["Subject"] = "HTML 링크"
        message["From"] = "sender@example.com"
        message.set_content("plain fallback")
        message.add_alternative(
            """
            <html><body>
              <p>문서 링크: <a href="https://example.com/report">보고서 열기</a></p>
              <img src="https://example.com/banner.png" alt="배너" />
            </body></html>
            """,
            subtype="html",
        )
        raw = base64.urlsafe_b64encode(message.as_bytes()).decode().rstrip("=")

        with patch("src.gws.gmail.get_message", return_value={"id": "g1", "snippet": "snippet", "raw": raw}):
            original = gmail_module.get_gmail_message_original("g1")

        self.assertEqual(original["content_type"], "text/html")
        self.assertIn('<a href="https://example.com/report"', original["content"])
        self.assertIn("보고서 열기</a>", original["content"])
        self.assertIn('<img src="https://example.com/banner.png" alt="배너">', original["content"])
        self.assertNotIn("[보고서 열기](https://example.com/report)", original["content"])

    def test_gmail_original_detail_inlines_cid_images(self):
        import base64
        from email.message import EmailMessage

        message = EmailMessage()
        message["Subject"] = "CID 이미지"
        message["From"] = "sender@example.com"
        message.set_content("plain fallback")
        alternative = EmailMessage()
        alternative.set_content("plain fallback")
        alternative.add_alternative(
            '<html><body><img src="cid:chart-1" alt="차트" /></body></html>',
            subtype="html",
        )
        image = EmailMessage()
        image.set_content(b"fake-png", maintype="image", subtype="png")
        image["Content-ID"] = "<chart-1>"
        image["Content-Disposition"] = 'inline; filename="chart.png"'
        message.make_related()
        message.attach(alternative)
        message.attach(image)
        raw = base64.urlsafe_b64encode(message.as_bytes()).decode().rstrip("=")

        with patch("src.gws.gmail.get_message", return_value={"id": "g1", "snippet": "snippet", "raw": raw}):
            original = gmail_module.get_gmail_message_original("g1")

        self.assertIn('src="data:image/png;base64,ZmFrZS1wbmc="', original["content"])
        self.assertNotIn("cid:chart-1", original["content"])

    def test_gmail_original_detail_removes_active_html(self):
        import base64
        from email.message import EmailMessage

        message = EmailMessage()
        message["Subject"] = "위험 HTML"
        message["From"] = "sender@example.com"
        message.set_content("plain fallback")
        message.add_alternative(
            """
            <html><body>
              <script>alert('x')</script>
              <form action="https://example.com"><input name="q" /></form>
              <a href="javascript:alert(1)" onclick="alert(2)">위험 링크</a>
              <p style="background:#333; color:#000">안전 본문</p>
              <pre style="background:#0d1117; color:#c9d1d9"><code style="background-color: rgb(13, 17, 23)">print('hello')</code></pre>
              <table><tr><td bgcolor="#000000">검정 셀 코드</td></tr></table>
            </body></html>
            """,
            subtype="html",
        )
        raw = base64.urlsafe_b64encode(message.as_bytes()).decode().rstrip("=")

        with patch("src.gws.gmail.get_message", return_value={"id": "g1", "snippet": "snippet", "raw": raw}):
            original = gmail_module.get_gmail_message_original("g1")

        self.assertIn("안전 본문", original["content"])
        self.assertNotIn("<script", original["content"])
        self.assertNotIn("<form", original["content"])
        self.assertNotIn("javascript:", original["content"])
        self.assertNotIn("onclick", original["content"])
        self.assertNotIn("background:#333", original["content"])
        self.assertNotIn("background: #333", original["content"])
        self.assertNotIn("background:#0d1117", original["content"])
        self.assertNotIn("background-color: rgb(13, 17, 23)", original["content"])
        self.assertNotIn('bgcolor="#000000"', original["content"])
        self.assertIn("print('hello')", original["content"])
        self.assertIn("검정 셀 코드", original["content"])

    def test_drive_original_detail_preserves_headings_as_markdown(self):
        class FakeRequest:
            def __init__(self, payload):
                self.payload = payload
                self.headers = {}

            def execute(self):
                return self.payload

        class FakeFiles:
            def get(self, **kwargs):
                return FakeRequest({
                    "id": "d1",
                    "name": "문서",
                    "mimeType": "application/vnd.google-apps.document",
                    "webViewLink": "https://docs.google.com/document/d/d1/edit",
                })

            def export_media(self, **kwargs):
                return FakeRequest("<h1>전략 문서</h1><p>본문</p><h2>다음 단계</h2>".encode())

        class FakeService:
            def __init__(self):
                self.files_resource = FakeFiles()

            def files(self):
                return self.files_resource

        with (
            patch("src.gws.drive.get_credentials", return_value=object()),
            patch("src.gws.drive.build", return_value=FakeService()),
        ):
            original = drive_module.get_drive_file_original("d1", "application/vnd.google-apps.document")

        self.assertIn("# 전략 문서", original["content"])
        self.assertIn("## 다음 단계", original["content"])


if __name__ == "__main__":
    unittest.main()
