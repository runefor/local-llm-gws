import unittest
from src.rag.indexer import (
    classify_email,
    _filter_parallel_english,
    _chunk_by_headings,
    _chunk_newsletter_digest,
    _chunk_by_paragraphs,
    chunk_drive_doc,
    chunk_gmail,
    clean_subject_for_prefix,
)

class TestAdaptiveChunking(unittest.TestCase):
    def test_clean_subject_for_prefix(self):
        # 1. 태그 제거 및 축약
        subj1 = "[PyTorchKR] [읽을거리] LinkedIn은 PyTorch로 어떻게 최적화 문제를 푸는가 | 사용자 모임"
        self.assertEqual(clean_subject_for_prefix(subj1), "LinkedIn은 PyTorch로 어떻게...")
        
        # 2. 짧은 제목 보존
        subj2 = "미팅 일정 안내"
        self.assertEqual(clean_subject_for_prefix(subj2), "미팅 일정 안내")
        
        # 3. 빈 제목
        self.assertEqual(clean_subject_for_prefix(""), "")

    def test_classify_email(self):
        # 1. 뉴스레터
        self.assertEqual(classify_email("[PyTorchKR] PyTorch.kr의 새로운 소식이 도착했습니다!🔥", "본문"), "newsletter_digest")
        self.assertEqual(classify_email("주간 뉴스레터 5호", "본문"), "newsletter_digest")
        
        # 2. 구조화된 기술 문서 (헤딩 2개 이상, 200자 초과)
        body_structured = "## 들어가며\n" + "내용이 아주 길고 유익합니다. " * 15 + "\n\n## 본론\n" + "본론 내용 역시 풍부합니다. " * 15
        self.assertEqual(classify_email("제목", body_structured), "structured_blog")
        
        # 3. 짧은 이메일
        self.assertEqual(classify_email("제목", "이메일 본문이 아주 짧습니다."), "short")
        
        # 4. 일반 긴 이메일
        body_long = "단락1\n\n" * 200 # 800자 초과하면서 헤딩이 없는 경우
        self.assertEqual(classify_email("제목", body_long), "long_plain")

    def test_filter_parallel_english(self):
        # 한글 단락 바로 뒤에 동일 성격의 영어 단락이 오면 영어 단락이 필터링되어야 함
        text = (
            "오늘날의 인터넷 플랫폼은 단순히 예측만 하는 것이 아니라 의사결정도 합니다.\n\n"
            "Modern internet platforms don't just make predictions; they also make decisions.\n\n"
            "```python\n"
            "print('Hello Code Block')\n"
            "```\n\n"
            "이 단락은 한글 단락이며 뒤에 영어 단락이 없습니다.\n\n"
            "This paragraph is standalone English and should not be filtered because it has no preceding Korean."
        )
        filtered = _filter_parallel_english(text)
        
        # 첫 번째 영어 단락은 한글 단락 바로 뒤에 매칭되므로 필터링(삭제)되어야 함
        self.assertNotIn("Modern internet platforms", filtered)
        # 코드 블록은 한글이 없어도 보존되어야 함
        self.assertIn("print('Hello Code Block')", filtered)
        # 독립적인 한국어 및 영어 단락은 보존되어야 함
        self.assertIn("이 단락은 한글 단락이며", filtered)
        self.assertIn("This paragraph is standalone English", filtered)

    def test_chunk_by_headings(self):
        body = (
            "## 섹션 1\n" +
            "섹션 1의 내용입니다. 꽤 길게 작성합니다. " * 25 + "\n\n"
            "## 섹션 2\n" +
            "섹션 2의 내용입니다. 마찬가지입니다. " * 25
        )
        chunks = _chunk_by_headings(body, "테스트 제목")
        self.assertEqual(len(chunks), 2)
        self.assertTrue(chunks[0].startswith("[테스트 제목] ## 섹션 1"))
        self.assertTrue(chunks[1].startswith("[테스트 제목] ## 섹션 2"))

    def test_chunk_newsletter_digest(self):
        body = (
            "인기 주제 목록입니다.\n\n"
            "[첫 번째 인기 글 제목 | 사용자 모임][1]\n\n" +
            "첫 번째 글 요약입니다. " * 50 + "\n\n"
            "[두 번째 인기 글 제목 | 사용자 모임][2]\n\n" +
            "두 번째 글 요약입니다. " * 50
        )
        chunks = _chunk_newsletter_digest(body, "주간 뉴스레터")
        # 포스트 단위로 분할됨
        self.assertEqual(len(chunks), 2)
        self.assertIn("[첫 번째 인기 글 제목", chunks[0])
        self.assertIn("[두 번째 인기 글 제목", chunks[1])
        for chunk in chunks:
            self.assertTrue(chunk.startswith("[주간 뉴스레터] "))

    def test_chunk_by_paragraphs_and_merge(self):
        # 1. 단락 병합 테스트 ( target_max=500 설정 시 )
        body = (
            "짧은 단락 1입니다. (50자)\n\n"
            "짧은 단락 2입니다. (50자)\n\n"
            "짧은 단락 3입니다. (50자)\n\n"
            "매우 긴 단락 4입니다. " * 20 # 약 300자
        )
        # target_max=300자 정도로 병합 테스트
        chunks = _chunk_by_paragraphs(body, "일반 이메일", target_min=100, target_max=300)
        self.assertTrue(len(chunks) >= 2)
        # 작은 청크들이 적절히 병합되었는지 확인
        self.assertTrue(all(len(c) > 100 for c in chunks))

    def test_chunk_drive_doc_csv(self):
        csv_content = (
            "id,name,email,role\n"
            "1,김철수,chulsoo@example.com,developer\n"
            "2,이영희,younghee@example.com,designer\n"
            "3,박민수,minsu@example.com,manager\n"
            "4,최진아,jina@example.com,marketer\n"
        )
        # 한 청크당 2행씩 분할 검증
        # indexer.py에는 rows_per_chunk=15로 하드코딩 되어 있으므로,
        # csv_content를 충분히 늘려서 여러 청크가 나오는지 검증
        csv_long = "id,name,email,role\n" + "".join(f"{i},이름_{i},email_{i}@example.com,role_{i}\n" for i in range(1, 40))
        chunks = chunk_drive_doc(csv_long, "application/vnd.google-apps.spreadsheet", "사용자 명부")
        self.assertTrue(len(chunks) >= 2)
        for chunk in chunks:
            self.assertTrue(chunk.startswith("[사용자 명부] id,name,email,role"))

    def test_chunk_gmail_integration(self):
        body = (
            "## 1. 들어가며\n" +
            "이번 vLLM 분석 내용입니다. " * 40 + "\n\n" +
            "This is the forward analysis of vLLM. " * 20 + "\n\n"
            "## 2. 결론\n" +
            "매우 만족스러운 성능 향상입니다. " * 40 + "\n\n" +
            "We observed satisfying throughput improvement. " * 20
        )
        chunks = chunk_gmail(body, "[PyTorchKR] vLLM 성능 리포트")
        # 1. 한영 병렬 제거 결과 영어 문장이 빠져야 함
        # 2. 헤딩 기준 청킹되어 2개의 청크가 생겨야 함
        self.assertGreaterEqual(len(chunks), 2)
        for chunk in chunks:
            self.assertNotIn("This is the forward", chunk)
            self.assertNotIn("We observed satisfying", chunk)
            self.assertIn("vLLM 성능 리포트", chunk)

if __name__ == "__main__":
    unittest.main()
