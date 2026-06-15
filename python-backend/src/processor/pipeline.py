from typing import Dict, Any, List
from src.rag.retriever import retrieve_chunks
from src.llm.inference import chat_completion

def run_pipeline(query: str, top_k: int = 8) -> Dict[str, Any]:
    """사용자의 쿼리를 받아서 RAG 검색을 통해 관련 문서 및 이메일을 탐색한 후,
    로컬 LLM을 이용하여 정보를 가공/요약하고 원본 카드 표시용 소스 텍스트를 포함해 반환합니다.
    """
    # 충분한 정보를 얻기 위해 top_k를 기본 8개로 확대해 검색
    chunks = retrieve_chunks(query, top_k=top_k)
    
    if not chunks:
        return {
            "status": "success",
            "answer": "검색 결과 관련 정보를 찾지 못했습니다. 지메일 및 드라이브 동기화 상태를 확인해 주세요.",
            "thought": None,
            "sources": []
        }
        
    context_parts = []
    sources = []
    
    for idx, chunk in enumerate(chunks):
        meta = chunk["metadata"]
        title = meta.get("title") or meta.get("name") or "(제목 없음)"
        source_type = chunk["source"]
        doc_id = meta.get("doc_id")
        date_str = meta.get("date") or meta.get("modifiedTime") or ""
        
        # 중복된 문서의 경우 하나의 소스 카드 객체로 병합하고 내용은 덧붙임
        existing_src = next((s for s in sources if s["doc_id"] == doc_id), None)
        if existing_src:
            existing_src["content"] += f"\n\n[추가 청크 내용]\n{chunk['content']}"
            existing_src["snippet"] = existing_src["content"][:160] + "..."
        else:
            sources.append({
                "doc_id": doc_id,
                "title": title,
                "source": source_type,
                "date": date_str,
                "sender": meta.get("sender") or meta.get("from") or ("알 수 없음" if source_type == "gmail" else ""),
                "content": chunk["content"],
                "snippet": chunk["content"][:160] + "..." if len(chunk["content"]) > 160 else chunk["content"]
            })
            
        context_parts.append(
            f"[{idx+1}] 출처: {source_type.upper()} | 제목: {title} | 일시: {date_str}\n"
            f"내용: {chunk['content']}"
        )
        
    context_str = "\n\n".join(context_parts)
    
    # 지식 정리에 유용한 풍부하고 구조화된 마크다운을 유도하는 프롬프트
    system_prompt = (
        "당신은 사용자의 민감한 개인 정보(지메일, 구글 드라이브 문서)를 종합적으로 분석하고 체계적으로 정돈하는 지식 관리 비서입니다.\n"
        "제공된 검색 결과를 면밀히 파악하고, 사용자의 요청 주제에 맞추어 정보를 정리하여 보고서 형태의 마크다운(Markdown) 문서로 작성해 주세요.\n"
        "이 요약 문서는 사용자의 개인 지식 베이스(Obsidian 또는 Notion)에 즉시 저장될 예정이므로 가시성이 좋고 정돈된 포맷이 중요합니다.\n"
        "- 소제목(H2, H3)과 요약 항목(불릿 포인트, 표 등)을 적절히 사용해 가독성을 극대화하세요.\n"
        "- 정보의 신뢰성을 위해 필요한 경우 본문 내에 검색 정보의 출처 제목을 간결히 언급해 주세요.\n"
        "- 외부 인터넷을 통한 정보 검색이 불가능하므로 반드시 주어진 정보만을 기반으로 하되, 가능한 한 자세하고 친절하게 설명해 주세요.\n"
        "- 반드시 자연스럽고 격식 있는 말투의 한국어로 작성해 주세요.\n\n"
        f"--- 검색된 구글 워크스페이스 원본 정보 ---\n{context_str}"
    )
    
    messages = [
        {"role": "system", "content": system_prompt},
        {"role": "user", "content": query}
    ]
    
    # 풍부한 콘텐츠 생성을 위해 max_tokens 확보
    llm_resp = chat_completion(
        messages=messages,
        max_tokens=2048,
        temperature=0.3
    )
    
    if "error" in llm_resp:
        return {
            "status": "error",
            "message": f"로컬 LLM 지식 정리 생성 중 실패: {llm_resp['error']}",
            "sources": sources
        }
        
    return {
        "status": "success",
        "answer": llm_resp.get("content", ""),
        "thought": llm_resp.get("thought"),
        "sources": sources
    }
