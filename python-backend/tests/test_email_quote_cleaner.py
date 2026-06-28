import unittest
from src.gws.text_cleaner import remove_email_quoted_text


class EmailQuoteCleanerTest(unittest.TestCase):
    def test_korean_reply_header_truncation(self):
        body = (
            "안녕하세요. 임베디드SW경진대회 참가자 김주형입니다.\n"
            "다시 올바른 파일 보내드립니다.\n"
            "감사합니다.\n"
            "\n"
            "2026년 6월 15일 (월) 오후 3:33, 임베디드SW경진대회 님이 작성:\n"
            "\n"
            "> 안녕하세요, 임베디드SW경진대회 사무국입니다.\n"
            "> 제출해주신 참가신청서 파일에 오류가 있어서 연락드립니다."
        )
        cleaned = remove_email_quoted_text(body)
        self.assertIn("다시 올바른 파일 보내드립니다.", cleaned)
        self.assertNotIn("임베디드SW경진대회 사무국입니다", cleaned)
        self.assertNotIn("2026년 6월 15일", cleaned)

    def test_english_reply_header_truncation(self):
        body = (
            "Hi, this is the main response content.\n"
            "Thanks for reaching out.\n"
            "\n"
            "On Sun, Jun 28, 2026 at 8:06 PM, User <user@example.com> wrote:\n"
            "\n"
            "> Hello, this is the original thread context.\n"
            "> I have a question about the SDK."
        )
        cleaned = remove_email_quoted_text(body)
        self.assertIn("Thanks for reaching out.", cleaned)
        self.assertNotIn("original thread context", cleaned)
        self.assertNotIn("On Sun, Jun 28", cleaned)

    def test_outlook_style_header_block_truncation(self):
        body = (
            "Here is my reply to your request.\n"
            "\n"
            "From: contest@fkii.org\n"
            "Sent: Monday, June 15, 2026 3:33 PM\n"
            "To: fkjy132@gmail.com\n"
            "Subject: Re: [임베디드SW경진대회] 참가신청서 파일 확인 부탁드립니다.\n"
            "\n"
            "안녕하세요. 임베디드SW경진대회 사무국입니다."
        )
        cleaned = remove_email_quoted_text(body)
        self.assertIn("Here is my reply to your request.", cleaned)
        self.assertNotIn("contest@fkii.org", cleaned)
        self.assertNotIn("안녕하세요. 임베디드SW경진대회 사무국입니다.", cleaned)

    def test_inlined_headers_truncation(self):
        body = (
            "안녕하세요. 멘토링 답변입니다.\n"
            "\n"
            "Date: 2026/06/15 15:45:16 From: mentor@example.com To: student@example.com Subject: Re: 멘토링 질문\n"
            "안녕하세요. 질문글 확인했습니다."
        )
        cleaned = remove_email_quoted_text(body)
        self.assertIn("안녕하세요. 멘토링 답변입니다.", cleaned)
        self.assertNotIn("mentor@example.com", cleaned)
        self.assertNotIn("Date: 2026/06/15", cleaned)

    def test_blockquote_filtering(self):
        body = (
            "이것은 본인 작성 영역입니다.\n"
            "\n"
            "> 이것은 첫 번째 인용 라인입니다.\n"
            "> 이것은 두 번째 인용 라인입니다.\n"
            "\n"
            "여기는 다시 본인 작성 영역입니다."
        )
        cleaned = remove_email_quoted_text(body)
        self.assertIn("이것은 본인 작성 영역입니다.", cleaned)
        self.assertIn("여기는 다시 본인 작성 영역입니다.", cleaned)
        self.assertNotIn("이것은 첫 번째 인용 라인입니다.", cleaned)

    def test_normal_text_not_truncated(self):
        body = (
            "이 메일은 일반적인 비즈니스 메일입니다.\n"
            "From: 김철수 라는 문장이 본문 중간에 들어있지만, 헤더 테이블 블록이 아니므로 잘리면 안 됩니다.\n"
            "감사합니다."
        )
        cleaned = remove_email_quoted_text(body)
        self.assertIn("From: 김철수", cleaned)
        self.assertIn("일반적인 비즈니스 메일입니다.", cleaned)


if __name__ == "__main__":
    unittest.main()
