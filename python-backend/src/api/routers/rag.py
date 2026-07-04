from typing import Any, Dict, List, Literal, Optional

from fastapi import APIRouter
from pydantic import BaseModel, Field

from src.evidence import record_relevance_feedback

router = APIRouter()

class RagIndexRequest(BaseModel):
    sources: Optional[List[str]] = None
    drive_files: List[Dict[str, Any]] = Field(default_factory=list, max_length=100)

@router.post("/api/rag/index")
def rag_index(req: Optional[RagIndexRequest] = None):
    """선택된 Gmail/Drive 자료를 ChromaDB에 인덱싱합니다."""
    try:
        from src.rag.indexer import index_all
        result = index_all(req.sources if req else None, req.drive_files if req else None)
        return result
    except Exception as e:
        return {"status": "error", "message": str(e)}
        return {"status": "error", "message": str(e)}

@router.get("/api/rag/status")
def rag_status():
    """RAG 인덱스 상태(문서 수, 마지막 인덱싱 시각)를 반환합니다."""
    try:
        from src.rag.indexer import get_index_status
        return get_index_status()
    except Exception as e:
        return {"status": "error", "message": str(e)}

class RagSearchRequest(BaseModel):
    query: str
    top_k: int = 5
    sources: Optional[List[str]] = None

@router.post("/api/rag/search")
def rag_search(req: RagSearchRequest):
    """동기화된 데이터에서 citation-ready 근거 레코드를 검색합니다."""
    try:
        from src.rag.retriever import search_evidence
        return search_evidence(req.query, req.top_k, req.sources)
    except Exception as e:
        return {"status": "error", "message": str(e)}

class RelevanceFeedbackRequest(BaseModel):
    query: str = Field(default="", max_length=500)
    evidence_id: str = Field(max_length=120)
    chunk_id: str = Field(max_length=240)
    doc_id: str = Field(max_length=240)
    source: Literal["gmail", "drive", "unknown"] = "unknown"
    feedback: Literal["relevant", "irrelevant", "important", "excluded"]
    title: str = Field(default="", max_length=500)
    match_reason: str = Field(default="", max_length=2000)

@router.post("/api/rag/feedback")
def rag_feedback(req: RelevanceFeedbackRequest):
    try:
        feedback = record_relevance_feedback(
            query=req.query,
            evidence_id=req.evidence_id,
            chunk_id=req.chunk_id,
            doc_id=req.doc_id,
            source=req.source,
            feedback=req.feedback,
            title=req.title,
            match_reason=req.match_reason,
        )
        return {"status": "success", "feedback": feedback.model_dump()}
    except Exception as e:
        return {"status": "error", "message": str(e)}
