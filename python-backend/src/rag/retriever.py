import logging
from typing import Dict, Any, List
import chromadb
from config import config
from src.llm.inference import chat_completion
from src.rag.indexer import get_embedding_model, get_chroma_client

logger = logging.getLogger(__name__)

def retrieve_chunks(query: str, top_k: int = 5) -> List[Dict[str, Any]]:
    """ChromaDB에서 쿼리와 가장 유사한 청크들을 검색합니다."""
    client = get_chroma_client()
    model = get_embedding_model()
    
    # 쿼리 임베딩 생성
    query_vector = model.encode(query).tolist()
    
    gmail_col = client.get_or_create_collection(config.CHROMA_COLLECTION_GMAIL)
    drive_col = client.get_or_create_collection(config.CHROMA_COLLECTION_DRIVE)
    
    results = []
    
    # Gmail 검색
    try:
        gmail_res = gmail_col.query(
            query_embeddings=[query_vector],
            n_results=top_k
        )
        if gmail_res and gmail_res["documents"] and gmail_res["documents"][0]:
            for i in range(len(gmail_res["documents"][0])):
                doc = gmail_res["documents"][0][i]
                meta = gmail_res["metadatas"][0][i]
                dist = gmail_res["distances"][0][i] if "distances" in gmail_res and gmail_res["distances"] else 0.0
                results.append({
                    "content": doc,
                    "metadata": meta,
                    "distance": dist,
                    "source": "gmail"
                })
    except Exception as e:
        logger.error(f"Gmail ChromaDB 검색 중 오류: {e}")
        
    # Drive 검색
    try:
        drive_res = drive_col.query(
            query_embeddings=[query_vector],
            n_results=top_k
        )
        if drive_res and drive_res["documents"] and drive_res["documents"][0]:
            for i in range(len(drive_res["documents"][0])):
                doc = drive_res["documents"][0][i]
                meta = drive_res["metadatas"][0][i]
                dist = drive_res["distances"][0][i] if "distances" in drive_res and drive_res["distances"] else 0.0
                results.append({
                    "content": doc,
                    "metadata": meta,
                    "distance": dist,
                    "source": "drive"
                })
    except Exception as e:
        logger.error(f"Drive ChromaDB 검색 중 오류: {e}")
        
    # 유사도(distance) 기준으로 정렬하여 상위 top_k개 리턴
    results.sort(key=lambda x: x["distance"])
    return results[:top_k]

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
