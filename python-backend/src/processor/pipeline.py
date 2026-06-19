from typing import Dict, Any, List, Optional
from src.rag.retriever import get_gmail_chunks_by_message_ids, retrieve_chunks
from src.llm.inference import chat_completion

def _build_source_cards(chunks: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    source_cards: List[Dict[str, Any]] = []
    for chunk in chunks:
        meta = chunk["metadata"]
        title = meta.get("title") or meta.get("name") or "(제목 없음)"
        source_type = chunk["source"]
        doc_id = meta.get("doc_id") or meta.get("message_id") or meta.get("id") or ""
        date_str = meta.get("date") or meta.get("modifiedTime") or ""
        content = chunk["content"]
        existing_src = next((source for source in source_cards if source["doc_id"] == doc_id), None)
        if existing_src:
            existing_src["content"] += f"\n\n[추가 청크 내용]\n{content}"
            existing_src["snippet"] = existing_src["content"][:160] + "..."
            existing_src["chunk_count"] += 1
            continue

        source_cards.append({
            "doc_id": doc_id,
            "title": title,
            "source": source_type,
            "date": date_str,
            "sender": meta.get("sender") or meta.get("from") or ("알 수 없음" if source_type == "gmail" else ""),
            "content": content,
            "snippet": content[:160] + "..." if len(content) > 160 else content,
            "chunk_count": 1,
        })
    return source_cards


def run_pipeline(query: str, top_k: int = 8, sources: Optional[List[str]] = None) -> Dict[str, Any]:
    """Legacy compatibility endpoint for the old summary pipeline.

    The product flow is now search -> reviewed evidence set -> LLM Wiki artifact.
    This endpoint intentionally returns search candidates only and does not call
    an LLM, so Gmail/Drive-derived content cannot bypass the evidence-set review
    gate or the external LLM warning contract.
    """
    chunks = retrieve_chunks(query, top_k=top_k, sources=sources)
    source_cards = _build_source_cards(chunks)

    if not chunks:
        return {
            "status": "success",
            "answer": "검색 결과 관련 정보를 찾지 못했습니다. Gmail/Drive 원본 검색과 선택 벡터화 상태를 확인한 뒤 벡터 자료 찾기에서 다시 검색해 주세요.",
            "thought": None,
            "sources": [],
            "requires_evidence_set": True,
            "deprecated_direct_generation": True,
            "message": "직접 요약 대신 정보 묶음 기반 Wiki 흐름을 사용합니다.",
        }

    return {
        "status": "success",
        "answer": "이 경로는 검색 후보만 반환합니다. 벡터 자료 찾기에서 결과를 검토해 정보 묶음으로 저장한 뒤, 그 묶음에서 LLM Wiki 초안을 생성하세요.",
        "thought": None,
        "sources": source_cards,
        "requires_evidence_set": True,
        "deprecated_direct_generation": True,
        "message": "직접 LLM 요약을 건너뛰고 정보 묶음 검토 게이트로 연결했습니다.",
    }


def process_gmail_chunks(message_ids: List[str], instruction: str) -> Dict[str, Any]:
    """이미 벡터화된 선택 Gmail 청크를 Gmail API 호출 없이 마크다운으로 가공합니다."""
    chunks = get_gmail_chunks_by_message_ids(message_ids)
    if not chunks:
        return {
            "status": "error",
            "message": "선택한 Gmail 메시지의 벡터화된 청크를 찾지 못했습니다. 먼저 벡터화를 실행해 주세요.",
            "sources": [],
        }

    context_parts = []
    source_cards = []
    for idx, chunk in enumerate(chunks):
        meta = chunk["metadata"]
        title = meta.get("title") or "(제목 없음)"
        doc_id = meta.get("doc_id") or meta.get("message_id") or ""
        existing_src = next((source for source in source_cards if source["doc_id"] == doc_id), None)
        if existing_src:
            existing_src["chunk_count"] += 1
        else:
            source_cards.append({
                "doc_id": doc_id,
                "title": title,
                "source": "gmail",
                "date": meta.get("date") or "",
                "sender": meta.get("sender") or meta.get("from") or "",
                "chunk_count": 1,
                "snippet": chunk["content"][:160] + "..." if len(chunk["content"]) > 160 else chunk["content"],
            })

        context_parts.append(
            f"[{idx+1}] 출처: GMAIL | 제목: {title} | 일시: {meta.get('date') or ''}\n"
            f"내용: {chunk['content']}"
        )

    system_prompt = (
        "당신은 사용자의 Gmail 원문 청크를 바탕으로 Obsidian에 저장할 마크다운 문서를 작성하는 지식 관리 비서입니다.\n"
        "반드시 제공된 Gmail 청크만 근거로 사용하고, 소제목과 불릿을 활용해 읽기 쉬운 Markdown으로 작성해 주세요.\n\n"
        f"--- 선택된 Gmail 청크 ---\n{chr(10).join(context_parts)}"
    )
    llm_resp = chat_completion(
        messages=[
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": instruction},
        ],
        max_tokens=2048,
        temperature=0.3,
    )

    if "error" in llm_resp:
        return {"status": "error", "message": f"Gmail 마크다운 생성 중 실패: {llm_resp['error']}", "sources": source_cards}

    return {
        "status": "success",
        "answer": llm_resp.get("content", ""),
        "markdown": llm_resp.get("content", ""),
        "thought": llm_resp.get("thought"),
        "sources": source_cards,
    }
