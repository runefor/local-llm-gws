import re
from typing import List
from rank_bm25 import BM25Okapi
from config import config

def split_sentences(text: str) -> List[str]:
    """텍스트를 문장 단위로 분할합니다."""
    if not text:
        return []
    # 마침표, 물음표, 느낌표 뒤의 공백을 기준으로 분할
    sentences = re.split(r'(?<=[.!?])\s+', text)
    return [s.strip() for s in sentences if s.strip()]

def compress_text(query: str, text: str, top_n: int = None) -> List[str]:
    """
    주어진 텍스트를 문장 단위로 쪼갠 후, 
    쿼리와의 BM25 유사도 점수가 가장 높은 상위 N개의 문장을 추출해 반환합니다.
    """
    if top_n is None:
        top_n = config.HARNESS_BM25_TOP_N
        
    sentences = split_sentences(text)
    if not sentences:
        return []
        
    if len(sentences) <= top_n:
        return sentences
        
    # 간단한 토큰화 (공백 및 하소문자 변환)
    tokenized_corpus = [s.lower().split() for s in sentences]
    tokenized_query = query.lower().split()
    
    try:
        bm25 = BM25Okapi(tokenized_corpus)
        scores = bm25.get_scores(tokenized_query)
        
        # (문장, 점수, 원래 인덱스) 튜플 생성
        scored_sentences = [
            (sentences[i], scores[i], i) 
            for i in range(len(sentences))
        ]
        
        # 점수 내림차순 정렬 후 상위 top_n개 선택
        scored_sentences.sort(key=lambda x: x[1], reverse=True)
        top_scored = scored_sentences[:top_n]
        
        # 원래 문서 흐름을 해치지 않도록 원래 인덱스(순서)대로 다시 정렬
        top_scored.sort(key=lambda x: x[2])
        
        return [item[0] for item in top_scored]
    except Exception:
        # 예외 상황 시 본문의 처음 N개 문장을 기본적으로 추출
        return sentences[:top_n]
