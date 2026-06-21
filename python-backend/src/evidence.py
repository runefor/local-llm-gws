import json
import re
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Literal, Optional
from uuid import uuid4

from pydantic import BaseModel, Field

from config import config
from src.wiki_artifacts import (
    ArtifactStatus,
    build_frontmatter,
    extract_artifact_title,
    is_wiki_artifact_type,
    lint_artifact_content,
    status_for_lint,
)


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
    title: str = ""
    content: str
    status: ArtifactStatus = "candidate"
    frontmatter: Dict[str, Any] = Field(default_factory=dict)
    lint: Dict[str, Any] = Field(default_factory=dict)
    citation_map: List[CitationMapEntry] = Field(default_factory=list)
    created_at: str
    updated_at: str = Field(default_factory=_now_iso)
    approved_at: Optional[str] = None


class RelevanceFeedback(BaseModel):
    id: str
    query: str = ""
    evidence_id: str
    chunk_id: str
    doc_id: str
    source: Literal["gmail", "drive", "unknown"] = "unknown"
    feedback: Literal["relevant", "irrelevant"]
    title: str = ""
    match_reason: str = ""
    created_at: str


class EvidenceStore(BaseModel):
    evidence_sets: List[EvidenceSet] = Field(default_factory=list)
    artifacts: List[Artifact] = Field(default_factory=list)
    relevance_feedback: List[RelevanceFeedback] = Field(default_factory=list)


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


def record_relevance_feedback(
    query: str,
    evidence_id: str,
    chunk_id: str,
    doc_id: str,
    source: Literal["gmail", "drive", "unknown"],
    feedback: Literal["relevant", "irrelevant"],
    title: str = "",
    match_reason: str = "",
) -> RelevanceFeedback:
    store = _load_store()
    feedback_item = RelevanceFeedback(
        id=_new_id("fb"),
        query=query,
        evidence_id=evidence_id,
        chunk_id=chunk_id,
        doc_id=doc_id,
        source=source,
        feedback=feedback,
        title=title,
        match_reason=match_reason,
        created_at=_now_iso(),
    )
    store.relevance_feedback.append(feedback_item)
    _save_store(store)
    return feedback_item


def list_artifacts(evidence_set_id: Optional[str] = None) -> List[Dict[str, Any]]:
    store = _load_store()
    artifacts = store.artifacts
    if evidence_set_id:
        artifacts = [item for item in artifacts if item.evidence_set_id == evidence_set_id]
    return [item.model_dump() for item in artifacts]


def _artifact_prompt_guidance(artifact_type: str) -> str:
    normalized = artifact_type.strip().lower()
    if normalized not in {"wiki", "llm_wiki", "llm-wiki"}:
        return "선택된 근거를 바탕으로 유용한 마크다운 산출물을 작성하십시오."
    return (
        "Wiki 산출물 작성 규칙:\n"
        "- 가능한 범위에서 다음 섹션을 사용하십시오: # 제목, ## 요약, ## 핵심 사실, "
        "## 관련 사람/프로젝트, ## 결정사항, ## 할 일, ## 원문 링크, ## 근거 부족.\n"
        "- 각 핵심 사실, 결정사항, 할 일에는 반드시 근거 ID를 붙이십시오.\n"
        "- 원문 링크 섹션에는 근거 ID, 제목, 위치 라벨 또는 원문 URL을 함께 남기십시오.\n"
        "- 근거로 확인되지 않는 추론은 작성하지 말고 근거 부족 섹션에 분리하십시오."
    )


def _format_source_location(location: SourceLocation) -> str:
    parts = [
        location.location_label,
        location.original_url,
        location.provider_item_id,
        location.message_id,
        location.thread_id,
        location.file_id,
    ]
    return " | ".join(part for part in parts if part) or "위치 정보 없음"


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


def _build_artifact_from_content(
    *,
    artifact_id: str,
    evidence_set: EvidenceSet,
    artifact_type: str,
    instruction: str,
    content: str,
    created_at: str,
    approved_at: Optional[str] = None,
    requested_status: Optional[ArtifactStatus] = None,
) -> Artifact:
    lint_result = lint_artifact_content(content, evidence_set, artifact_type)
    status = requested_status or status_for_lint(lint_result)
    if status == "approved" and lint_result.status != "passed":
        status = status_for_lint(lint_result)
        approved_at = None
    title = extract_artifact_title(content, f"{evidence_set.title} Wiki 후보")
    updated_at = _now_iso()
    frontmatter = build_frontmatter(
        artifact_id=artifact_id,
        title=title,
        artifact_type=artifact_type,
        status=status,
        evidence_set=evidence_set,
        created_at=created_at,
        updated_at=updated_at,
        approved_at=approved_at,
    )
    return Artifact(
        id=artifact_id,
        evidence_set_id=evidence_set.id,
        artifact_type=artifact_type,
        instruction=instruction,
        title=title,
        content=content,
        status=status,
        frontmatter=frontmatter.model_dump(),
        lint=lint_result.model_dump(),
        citation_map=_build_citation_map(content, evidence_set),
        created_at=created_at,
        updated_at=updated_at,
        approved_at=approved_at,
    )


def _save_artifact(artifact: Artifact) -> Artifact:
    store = _load_store()
    for idx, existing in enumerate(store.artifacts):
        if existing.id == artifact.id:
            store.artifacts[idx] = artifact
            _save_store(store)
            return artifact
    store.artifacts.append(artifact)
    _save_store(store)
    return artifact


def get_artifact(artifact_id: str) -> Optional[Artifact]:
    store = _load_store()
    for artifact in store.artifacts:
        if artifact.id == artifact_id:
            return artifact
    return None


def create_artifact(evidence_set_id: str, artifact_type: str, instruction: str = "") -> Optional[Artifact]:
    evidence_set = get_evidence_set(evidence_set_id)
    if evidence_set is None:
        return None

    artifact_id = _new_id("art")
    created_at = _now_iso()
    if is_wiki_artifact_type(artifact_type) and not evidence_set.evidence_items:
        content = (
            "# Wiki 후보 생성 보류\n\n"
            "## 요약\n원문 근거가 없어 Wiki 후보를 만들 수 없습니다.\n\n"
            "## 핵심 사실\n- 확인 가능한 원문 근거가 없습니다.\n\n"
            "## 원문 링크\n- 원문 링크 없음\n\n"
            "## 근거 부족\n- 검색 결과 또는 선택 근거를 먼저 정보 묶음으로 저장해야 합니다."
        )
        artifact = _build_artifact_from_content(
            artifact_id=artifact_id,
            evidence_set=evidence_set,
            artifact_type=artifact_type,
            instruction=instruction,
            content=content,
            created_at=created_at,
        )
        return _save_artifact(artifact)

    from src.llm.inference import chat_completion

    evidence_blocks = []
    for evidence in evidence_set.evidence_items:
        evidence_blocks.append(
            f"[{evidence.evidence_id}] {evidence.title} | {evidence.source}\n"
            f"위치: {_format_source_location(evidence.source_location)}\n"
            f"날짜: {evidence.date}\n"
            f"{evidence.content_snapshot}"
        )

    system_prompt = (
        "당신은 저장된 근거 묶음만 사용해 산출물을 만드는 지식 작업 비서입니다.\n"
        "아래 근거 밖의 내용은 추측하지 마십시오.\n"
        "사실 주장이나 요약 항목 끝에는 반드시 해당 근거 ID를 대괄호로 인용하십시오. "
        "예: [ev_abcd1234]\n"
        "근거가 부족한 내용은 '근거 부족'이라고 명시하십시오.\n"
        f"산출물 유형: {artifact_type}\n"
        f"사용자 지시: {instruction or '선택된 근거를 바탕으로 유용한 마크다운 산출물을 작성'}\n"
        f"{_artifact_prompt_guidance(artifact_type)}\n\n"
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

    artifact = _build_artifact_from_content(
        artifact_id=artifact_id,
        evidence_set=evidence_set,
        artifact_type=artifact_type,
        instruction=instruction,
        content=content,
        created_at=created_at,
    )
    return _save_artifact(artifact)


def update_artifact(
    artifact_id: str,
    title: Optional[str] = None,
    content: Optional[str] = None,
) -> Optional[Artifact]:
    existing = get_artifact(artifact_id)
    if existing is None:
        return None
    evidence_set = get_evidence_set(existing.evidence_set_id)
    if evidence_set is None:
        return None

    next_content = content if content is not None else existing.content
    artifact = _build_artifact_from_content(
        artifact_id=existing.id,
        evidence_set=evidence_set,
        artifact_type=existing.artifact_type,
        instruction=existing.instruction,
        content=next_content,
        created_at=existing.created_at,
    )
    if title is not None and title.strip():
        artifact.title = title.strip()
        artifact.frontmatter["title"] = artifact.title
    return _save_artifact(artifact)


def update_artifact_status(artifact_id: str, status: Literal["candidate", "approved"]) -> Optional[Artifact]:
    existing = get_artifact(artifact_id)
    if existing is None:
        return None
    evidence_set = get_evidence_set(existing.evidence_set_id)
    if evidence_set is None:
        return None
    lint_result = lint_artifact_content(existing.content, evidence_set, existing.artifact_type)
    if status == "approved" and lint_result.status != "passed":
        raise ValueError("lint를 통과한 Wiki 후보만 승인할 수 있습니다.")

    approved_at = _now_iso() if status == "approved" else None
    artifact = _build_artifact_from_content(
        artifact_id=existing.id,
        evidence_set=evidence_set,
        artifact_type=existing.artifact_type,
        instruction=existing.instruction,
        content=existing.content,
        created_at=existing.created_at,
        approved_at=approved_at,
        requested_status=status,
    )
    if existing.title:
        artifact.title = existing.title
        artifact.frontmatter["title"] = existing.title
    return _save_artifact(artifact)


def citation_markers(content: str) -> List[str]:
    return sorted(set(re.findall(r"\[ev_[A-Za-z0-9_\-]+\]", content)))
