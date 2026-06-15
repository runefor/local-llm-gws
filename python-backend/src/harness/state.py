from typing import Dict, List, Literal
from pydantic import BaseModel, Field

class CuratedEvidence(BaseModel):
    doc_id: str
    original_title: str
    importance_tag: Literal["very_high", "high", "fair", "low"] = "fair"
    compressed_chunks: List[str] = Field(default_factory=list)

class VerificationRecord(BaseModel):
    claim_statement: str
    status: Literal["unverified", "verified", "contradicted"] = "unverified"
    assigned_evidence_ids: List[str] = Field(default_factory=list)

class ExternalizedStateStore(BaseModel):
    primary_query: str
    total_allowed_turns: int = 15
    remaining_turns: int = 15
    candidate_pool: Dict[str, str] = Field(default_factory=dict)                       # doc_id -> content 전체
    curated_evidence_ledger: Dict[str, CuratedEvidence] = Field(default_factory=dict)  # doc_id -> CuratedEvidence
    verification_registry: Dict[str, VerificationRecord] = Field(default_factory=dict) # claim_id -> VerificationRecord
    search_history: List[str] = Field(default_factory=list)
