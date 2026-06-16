import json
import re
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Literal, Optional
from uuid import uuid4

from pydantic import BaseModel, Field

from config import config


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


def _new_id(prefix: str) -> str:
    return f"{prefix}_{uuid4().hex[:12]}"


class SourceLocation(BaseModel):
    original_url: str = ""
    location_label: str = ""
    provider_item_id: str = ""
    chunk_index: Optional[int] = None
    message_id: str = ""
    thread_id: str = ""
    rfc822msgid: str = ""
    file_id: str = ""
    resource_key: str = ""
    page_number: Optional[int] = None
    heading_path: str = ""
    text_start_offset: Optional[int] = None
    text_end_offset: Optional[int] = None


class EvidenceScores(BaseModel):
    vector_distance: Optional[float] = None
    rrf_score: Optional[float] = None
    rank: Optional[int] = None


class EvidenceRecord(BaseModel):
    evidence_id: str
    chunk_id: str
    doc_id: str
    source: Literal["gmail", "drive", "unknown"] = "unknown"
    title: str = "(제목 없음)"
    snippet: str = ""
    content_snapshot: str
    date: str = ""
    sender: str = ""
    mime_type: str = ""
    source_location: SourceLocation = Field(default_factory=SourceLocation)
    scores: EvidenceScores = Field(default_factory=EvidenceScores)
    metadata: Dict[str, Any] = Field(default_factory=dict)


class EvidenceSet(BaseModel):
    id: str
    title: str
    original_query: str = ""
    evidence_items: List[EvidenceRecord] = Field(default_factory=list)
    notes: str = ""
    tags: List[str] = Field(default_factory=list)
    created_at: str
    updated_at: str


class CitationMapEntry(BaseModel):
    marker: str
    evidence_id: str
    chunk_id: str
    doc_id: str
    title: str
    source_location: SourceLocation


class Artifact(BaseModel):
    id: str
    evidence_set_id: str
    artifact_type: str
    instruction: str = ""
    content: str
    citation_map: List[CitationMapEntry] = Field(default_factory=list)
    created_at: str


class EvidenceStore(BaseModel):
    evidence_sets: List[EvidenceSet] = Field(default_factory=list)
    artifacts: List[Artifact] = Field(default_factory=list)


STORE_PATH: Path = config.DATA_DIR / "evidence_store.json"


def _load_store() -> EvidenceStore:
    if not STORE_PATH.exists():
        return EvidenceStore()
    with open(STORE_PATH, "r", encoding="utf-8") as f:
        data = json.load(f)
    return EvidenceStore.model_validate(data)


def _save_store(store: EvidenceStore) -> None:
    with open(STORE_PATH, "w", encoding="utf-8") as f:
        json.dump(store.model_dump(), f, ensure_ascii=False, indent=2)


def list_evidence_sets() -> List[Dict[str, Any]]:
    store = _load_store()
    return [item.model_dump() for item in store.evidence_sets]


def get_evidence_set(evidence_set_id: str) -> Optional[EvidenceSet]:
    store = _load_store()
    for evidence_set in store.evidence_sets:
        if evidence_set.id == evidence_set_id:
            return evidence_set
    return None


def create_evidence_set(
    title: str,
    original_query: str,
    evidence_items: List[Dict[str, Any]],
    notes: str = "",
    tags: Optional[List[str]] = None,
) -> EvidenceSet:
    store = _load_store()
    now = _now_iso()
    records = [EvidenceRecord.model_validate(item) for item in evidence_items]
    evidence_set = EvidenceSet(
        id=_new_id("es"),
        title=title or "새 근거 묶음",
        original_query=original_query,
        evidence_items=records,
        notes=notes,
        tags=tags or [],
        created_at=now,
        updated_at=now,
    )
    store.evidence_sets.append(evidence_set)
    _save_store(store)
    return evidence_set


def update_evidence_set(
    evidence_set_id: str,
    title: Optional[str] = None,
    notes: Optional[str] = None,
    tags: Optional[List[str]] = None,
    evidence_items: Optional[List[Dict[str, Any]]] = None,
) -> Optional[EvidenceSet]:
    store = _load_store()
    for idx, evidence_set in enumerate(store.evidence_sets):
        if evidence_set.id != evidence_set_id:
            continue
        data = evidence_set.model_dump()
        if title is not None:
            data["title"] = title
        if notes is not None:
            data["notes"] = notes
        if tags is not None:
            data["tags"] = tags
        if evidence_items is not None:
            data["evidence_items"] = evidence_items
        data["updated_at"] = _now_iso()
        updated = EvidenceSet.model_validate(data)
        store.evidence_sets[idx] = updated
        _save_store(store)
        return updated
    return None


def delete_evidence_set(evidence_set_id: str) -> bool:
    store = _load_store()
    before = len(store.evidence_sets)
    store.evidence_sets = [item for item in store.evidence_sets if item.id != evidence_set_id]
    if len(store.evidence_sets) == before:
        return False
    _save_store(store)
    return True


def list_artifacts(evidence_set_id: Optional[str] = None) -> List[Dict[str, Any]]:
    store = _load_store()
    artifacts = store.artifacts
    if evidence_set_id:
        artifacts = [item for item in artifacts if item.evidence_set_id == evidence_set_id]
    return [item.model_dump() for item in artifacts]


def _build_citation_map(content: str, evidence_set: EvidenceSet) -> List[CitationMapEntry]:
    entries: List[CitationMapEntry] = []
    for evidence in evidence_set.evidence_items:
        marker = f"[{evidence.evidence_id}]"
        if marker not in content:
            continue
        entries.append(
            CitationMapEntry(
                marker=marker,
                evidence_id=evidence.evidence_id,
                chunk_id=evidence.chunk_id,
                doc_id=evidence.doc_id,
                title=evidence.title,
                source_location=evidence.source_location,
            )
        )
    return entries


def create_artifact(evidence_set_id: str, artifact_type: str, instruction: str = "") -> Optional[Artifact]:
    evidence_set = get_evidence_set(evidence_set_id)
    if evidence_set is None:
        return None

    from src.llm.inference import chat_completion

    evidence_blocks = []
    for evidence in evidence_set.evidence_items:
        evidence_blocks.append(
            f"[{evidence.evidence_id}] {evidence.title} | {evidence.source} | {evidence.source_location.location_label}\n"
            f"{evidence.content_snapshot}"
        )

    system_prompt = (
        "당신은 저장된 근거 묶음만 사용해 산출물을 만드는 지식 작업 비서입니다.\n"
        "아래 근거 밖의 내용은 추측하지 마십시오.\n"
        "사실 주장이나 요약 항목 끝에는 반드시 해당 근거 ID를 대괄호로 인용하십시오. "
        "예: [ev_abcd1234]\n"
        "근거가 부족한 내용은 '근거 부족'이라고 명시하십시오.\n"
        f"산출물 유형: {artifact_type}\n"
        f"사용자 지시: {instruction or '선택된 근거를 바탕으로 유용한 마크다운 산출물을 작성'}\n\n"
        "--- 저장된 근거 ---\n"
        + "\n\n".join(evidence_blocks)
    )

    llm_resp = chat_completion(
        messages=[{"role": "system", "content": system_prompt}],
        max_tokens=2048,
        temperature=0.2,
    )
    if "error" in llm_resp:
        content = f"Artifact 생성 중 오류: {llm_resp['error']}"
    else:
        content = llm_resp.get("content", "")

    artifact = Artifact(
        id=_new_id("art"),
        evidence_set_id=evidence_set_id,
        artifact_type=artifact_type,
        instruction=instruction,
        content=content,
        citation_map=_build_citation_map(content, evidence_set),
        created_at=_now_iso(),
    )
    store = _load_store()
    store.artifacts.append(artifact)
    _save_store(store)
    return artifact


def citation_markers(content: str) -> List[str]:
    return sorted(set(re.findall(r"\[ev_[A-Za-z0-9_\-]+\]", content)))
