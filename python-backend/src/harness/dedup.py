from datasketch import MinHash
from typing import List

def get_minhash(text: str, num_perm: int = 128) -> MinHash:
    """텍스트의 3-gram Shingle에 대한 MinHash 객체를 생성합니다."""
    m = MinHash(num_perm=num_perm)
    # 캐릭터 단위 3-gram shingle 사용 (한국어/영어 둘 다 문맥 유사도를 잘 비교하기 위함)
    text_cleaned = "".join(text.lower().split()) # 공백 제거
    shingles = set(text_cleaned[i:i+3] for i in range(len(text_cleaned)-2))
    
    for shingle in shingles:
        m.update(shingle.encode('utf-8'))
    return m

def should_merge(text1: str, text2: str, threshold: float = 0.9) -> bool:
    """두 텍스트의 자카드 유사도를 계산하여 threshold 이상인지 검사합니다."""
    if not text1 or not text2:
        return False
        
    # 글자 수가 매우 적은 경우 처리
    if len(text1) < 10 or len(text2) < 10:
        return text1.strip().lower() == text2.strip().lower()
        
    m1 = get_minhash(text1)
    m2 = get_minhash(text2)
    
    jaccard = m1.jaccard(m2)
    return jaccard >= threshold

def merge_documents(text1: str, text2: str) -> str:
    """두 문서의 문장들을 병합하되, 중복 문장은 순서를 유지하며 필터링합니다."""
    from src.harness.compressor import split_sentences
    s1 = split_sentences(text1)
    s2 = split_sentences(text2)
    
    merged = []
    seen = set()
    
    for s in s1 + s2:
        norm_s = "".join(s.strip().lower().split())
        if norm_s not in seen:
            seen.add(norm_s)
            merged.append(s)
            
    return " ".join(merged)
