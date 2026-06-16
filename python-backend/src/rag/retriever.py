import logging
import pickle
from typing import Dict, Any, List, Optional
import chromadb
from config import config
from src.llm.inference import chat_completion
from src.rag.indexer import get_embedding_model, get_chroma_client

logger = logging.getLogger(__name__)

def load_bm25_index() -> Optional[Dict[str, Any]]:
    """로컬 파일에서 직렬화된 BM25 인덱스를 로드합니다."""
    bm25_path = config.DATA_DIR / "bm25_index.pkl"
    if not bm25_path.exists():
        logger.warning(f"BM25 인덱스 파일이 존재하지 않습니다: {bm25_path}")
        return None
    try:
        with open(bm25_path, "rb") as f:
            return pickle.load(f)
    except Exception as e:
        logger.error(f"BM25 인덱스 파일 로드 중 오류: {e}")
        return None

def reciprocal_rank_fusion(vector_results: List[Dict[str, Any]], bm25_results: List[Dict[str, Any]], k: int = 60) -> List[Dict[str, Any]]:
    """RRF (Reciprocal Rank Fusion) 알고리즘을 사용해 벡터 결과와 키워드 결과를 융합합니다."""
    rrf_scores = {}
    doc_map = {}
    
    # 1. 벡터 검색 결과 점수 계산 (순위 1부터 시작)
    for rank, doc in enumerate(vector_results, 1):
        doc_id = doc["id"]
        doc_map[doc_id] = doc
        rrf_scores[doc_id] = rrf_scores.get(doc_id, 0.0) + 1.0 / (k + rank)
        
    # 2. BM25 검색 결과 점수 계산
    for rank, doc in enumerate(bm25_results, 1):
        doc_id = doc["id"]
        if doc_id not in doc_map:
            doc_map[doc_id] = {
                "id": doc_id,
                "content": doc["content"],
                "metadata": doc["metadata"],
                "distance": 999.0,  # BM25 단독 매칭된 문서용 높은 디스턴스 설정
                "source": doc["source"]
            }
        rrf_scores[doc_id] = rrf_scores.get(doc_id, 0.0) + 1.0 / (k + rank)
        
    # RRF 점수가 높은 순으로 정렬
    sorted_ids = sorted(rrf_scores.keys(), key=lambda x: rrf_scores[x], reverse=True)
    
    merged = []
    for doc_id in sorted_ids:
        merged.append(doc_map[doc_id])
    return merged

def retrieve_chunks(query: str, top_k: int = 5) -> List[Dict[str, Any]]:
    """Vector (ChromaDB) + Keyword (BM25) 하이브리드 검색을 수행하고 RRF로 병합합니다."""
    client = get_chroma_client()
    model = get_embedding_model()
    
    # 1. 벡터 검색 수행용 쿼리 임베딩 생성 (multilingual-e5 모델 요구사항인 'query: ' 접두사 추가)
    prefixed_query = f"query: {query}"
    query_vector = model.encode(prefixed_query).tolist()
    
    gmail_col = client.get_or_create_collection(config.CHROMA_COLLECTION_GMAIL)
    drive_col = client.get_or_create_collection(config.CHROMA_COLLECTION_DRIVE)
    
    vector_results = []
    pool_size = top_k * 3  # RRF 병합을 위해 충분한 후보군 확보
    
    # Gmail 벡터 검색
    try:
        gmail_res = gmail_col.query(
            query_embeddings=[query_vector],
            n_results=pool_size
        )
        if gmail_res and gmail_res["documents"] and gmail_res["documents"][0]:
            for i in range(len(gmail_res["documents"][0])):
                vector_results.append({
                    "id": gmail_res["ids"][0][i],
                    "content": gmail_res["documents"][0][i],
                    "metadata": gmail_res["metadatas"][0][i],
                    "distance": gmail_res["distances"][0][i] if "distances" in gmail_res and gmail_res["distances"] else 0.0,
                    "source": "gmail"
                })
    except Exception as e:
        logger.error(f"Gmail ChromaDB 검색 중 오류: {e}")
        
    # Drive 벡터 검색
    try:
        drive_res = drive_col.query(
            query_embeddings=[query_vector],
            n_results=pool_size
        )
        if drive_res and drive_res["documents"] and drive_res["documents"][0]:
            for i in range(len(drive_res["documents"][0])):
                vector_results.append({
                    "id": drive_res["ids"][0][i],
                    "content": drive_res["documents"][0][i],
                    "metadata": drive_res["metadatas"][0][i],
                    "distance": drive_res["distances"][0][i] if "distances" in drive_res and drive_res["distances"] else 0.0,
                    "source": "drive"
                })
    except Exception as e:
        logger.error(f"Drive ChromaDB 검색 중 오류: {e}")
        
    # 거리 순 정렬 후 후보군 풀 크기로 제한
    vector_results.sort(key=lambda x: x["distance"])
    vector_pool = vector_results[:pool_size]
    
    # 2. BM25 키워드 검색 수행
    bm25_pool = []
    bm25_data = load_bm25_index()
    if bm25_data:
        try:
            from src.rag.indexer import tokenize_text
            bm25 = bm25_data["bm25"]
            chunks = bm25_data["chunks"]
            
            tokenized_query = tokenize_text(query)
            if tokenized_query:
                # 검색 쿼리에 대해 모든 청크의 점수 획득
                scores = bm25.get_scores(tokenized_query)
                # 매칭 점수가 0보다 큰 인덱스만 매칭 청크로 추출
                valid_res = []
                for idx, score in enumerate(scores):
                    if score > 0.0:
                        valid_res.append((score, chunks[idx]))
                # 점수 역순 정렬
                valid_res.sort(key=lambda x: x[0], reverse=True)
                bm25_pool = [item[1] for item in valid_res[:pool_size]]
        except Exception as e:
            logger.error(f"BM25 키워드 검색 중 오류: {e}")
            
    # 3. RRF 결과 융합
    if bm25_pool:
        hybrid_results = reciprocal_rank_fusion(vector_pool, bm25_pool)
    else:
        hybrid_results = vector_pool
        
    return hybrid_results[:top_k]

def search_and_summarize(query: str, top_k: int = 5) -> Dict[str, Any]:
    """검색한 컨텍스트를 활용하여 LLM 요약 및 답변을 생성합니다."""
    chunks = retrieve_chunks(query, top_k=top_k)
    
    if not chunks:
        return {
            "status": "success",
            "query": query,
            "answer": "검색 결과가 없습니다.",
            "sources": []
        }
        
    # 컨텍스트 마크다운 포맷팅
    context_parts = []
    sources = []
    
    for idx, chunk in enumerate(chunks):
        meta = chunk["metadata"]
        title = meta.get("title", "(제목 없음)")
        source_type = chunk["source"]
        
        # 출처 리스트 중복 제거하며 추가
        doc_id = meta.get("doc_id")
        if not any(s["doc_id"] == doc_id for s in sources):
            sources.append({
                "doc_id": doc_id,
                "title": title,
                "source": source_type,
                "date": meta.get("date", "")
            })
            
        context_parts.append(
            f"[{idx+1}] 출처: {source_type.upper()} | 제목: {title}\n"
            f"내용: {chunk['content']}"
        )
        
    context_str = "\n\n".join(context_parts)
    
    # LLM용 시스템 프롬프트 구성
    system_prompt = (
        "당신은 사용자의 Google Workspace(Gmail, Google Drive) 데이터를 바탕으로 질문에 답하는 비서입니다.\n"
        "제공된 검색 결과를 기반으로 질문에 사실적이고 친절하게 답해주세요.\n"
        "답변에 근거가 된 출처([1], [2] 등)를 본문에 명시해주시기 바랍니다.\n"
        "주어진 정보로 답할 수 없다면, 추측하지 말고 모른다고 하십시오.\n"
        "반드시 한국어로 자연스럽게 답변하십시오.\n\n"
        f"--- 검색된 관련 정보 ---\n{context_str}"
    )
    
    messages = [
        {"role": "system", "content": system_prompt},
        {"role": "user", "content": query}
    ]
    
    # LLM 호출
    llm_resp = chat_completion(
        messages=messages,
        max_tokens=1024,
        temperature=0.3
    )
    
    if "error" in llm_resp:
        return {
            "status": "error",
            "message": f"LLM 요약 생성 중 오류: {llm_resp['error']}",
            "sources": sources
        }
        
    return {
        "status": "success",
        "query": query,
        "answer": llm_resp.get("content", ""),
        "thought": llm_resp.get("thought"),
        "sources": sources
    }
