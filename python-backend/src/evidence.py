import json
import os
import re
from collections import Counter
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
from src.wiki_fallback import build_grounded_wiki_fallback


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
    feedback: Literal["relevant", "irrelevant", "important", "excluded"]
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
    STORE_PATH.parent.mkdir(parents=True, exist_ok=True)
    tmp_path = STORE_PATH.with_name(f"{STORE_PATH.name}.tmp")
    try:
        with open(tmp_path, "w", encoding="utf-8") as f:
            json.dump(store.model_dump(), f, ensure_ascii=False, indent=2)
            f.flush()
            os.fsync(f.fileno())
        tmp_path.replace(STORE_PATH)
    except Exception:
        tmp_path.unlink(missing_ok=True)
        raise


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
    feedback: Literal["relevant", "irrelevant", "important", "excluded"],
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
        "- 다음 섹션을 사용하십시오: # 제목, ## 한 줄 결론, ## 확정에 가까운 사실, "
        "## 주장/평가, ## 검증 필요, ## 우리 앱에 주는 의미, ## 관련 페이지, ## 출처 지도, ## 원문 링크, ## 확인 범위.\n"
        "- 사실 주장 끝에는 반드시 근거 ID를 붙이십시오. 예: [ev_abcd1234]\n"
        "- '가장 좋다', '나은 것으로 보인다' 같은 평가성 표현은 ## 주장/평가 또는 ## 검증 필요에만 쓰십시오.\n"
        "- ## 출처 지도는 근거 ID, 출처 제목, 날짜, 위치, 왜 중요한지를 표로 남기십시오.\n"
        "- 저장된 정보 묶음 밖의 자료는 별도로 확인했다고 쓰지 마십시오."
    )


def _format_source_location(location: SourceLocation) -> str:
    parts = _unique_parts([
        location.location_label,
        location.original_url,
        location.provider_item_id,
        location.message_id,
        location.thread_id,
        location.file_id,
    ])
    return " | ".join(part for part in parts if part) or "위치 정보 없음"


def _unique_parts(parts: List[str]) -> List[str]:
    seen: set[str] = set()
    unique: List[str] = []
    for part in parts:
        value = str(part or "").strip()
        if not value or value in seen:
            continue
        seen.add(value)
        unique.append(value)
    return unique


def _primary_source_location(location: SourceLocation) -> str:
    visible = _unique_parts([location.location_label, location.original_url])
    if visible:
        return " / ".join(visible)
    fallback = _unique_parts([location.file_id, location.message_id, location.provider_item_id, location.thread_id])
    return fallback[0] if fallback else "위치 정보 없음"


def _has_markdown_heading(content: str, heading: str) -> bool:
    return re.search(r"^##\s+" + re.escape(heading) + r"\s*$", content or "", flags=re.MULTILINE) is not None


def _section_text(content: str, heading: str) -> str:
    match = re.search(
        r"^##\s+" + re.escape(heading) + r"\s*\n(.*?)(?=^##\s+|\Z)",
        content or "",
        flags=re.MULTILINE | re.DOTALL,
    )
    return match.group(1).strip() if match else ""


def _replace_section(content: str, heading: str, body: str) -> str:
    section = f"## {heading}\n{body}"
    pattern = r"^##\s+" + re.escape(heading) + r"\s*\n.*?(?=^##\s+|\Z)"
    if re.search(pattern, content, flags=re.MULTILINE | re.DOTALL):
        return re.sub(pattern, section + "\n\n", content, flags=re.MULTILINE | re.DOTALL).rstrip()
    return content.rstrip() + "\n\n" + section


def _table_cell(value: str) -> str:
    return " ".join((value or "-").replace("|", "/").split())


def _evidence_marker_list(evidence_set: EvidenceSet) -> str:
    return ", ".join(f"[{evidence.evidence_id}]" for evidence in evidence_set.evidence_items)


def _verification_body(evidence_set: EvidenceSet) -> str:
    markers = _evidence_marker_list(evidence_set)
    title_counts = Counter(evidence.title for evidence in evidence_set.evidence_items)
    lines = [f"- 평가성 표현과 단일 출처 주장은 원문에서 재확인해야 합니다: {markers}"]
    if any(count > 1 for count in title_counts.values()):
        lines.append("- 같은 제목의 검색 결과가 여러 조각으로 들어왔습니다. 중복 근거를 줄이면 Wiki 품질이 좋아집니다.")
    return "\n".join(lines)


def _app_meaning_body(evidence_set: EvidenceSet) -> str:
    count = len(evidence_set.evidence_items)
    return (
        f"- 이 Wiki는 정보 묶음 {count}개 근거로 만든 후보입니다.\n"
        "- 출처 지도에서 원문을 열어 평가성 주장과 중복 근거를 확인한 뒤 승인 Wiki로 전환합니다."
    )


def _replace_placeholder_sections(content: str, evidence_set: EvidenceSet) -> str:
    verification_placeholder = "- 단일 근거이거나 평가성 표현은 원문 재확인이 필요합니다."
    app_placeholder = "- 검색 결과를 정보 묶음으로 검토한 뒤 승인 Wiki로 전환합니다."
    updated = content
    if _section_text(updated, "검증 필요") == verification_placeholder:
        updated = _replace_section(updated, "검증 필요", _verification_body(evidence_set))
    if _section_text(updated, "우리 앱에 주는 의미") == app_placeholder:
        updated = _replace_section(updated, "우리 앱에 주는 의미", _app_meaning_body(evidence_set))
    return updated


def _ensure_wiki_required_sections(content: str, evidence_set: EvidenceSet) -> str:
    content = _replace_placeholder_sections(content, evidence_set)
    additions: List[str] = []
    if not _has_markdown_heading(content, "한 줄 결론"):
        additions.append("## 한 줄 결론\n저장된 근거를 바탕으로 검토가 필요한 Wiki 후보입니다.")
    if not _has_markdown_heading(content, "확정에 가까운 사실"):
        facts = [
            f"- {evidence.content_snapshot or evidence.snippet or evidence.title} [{evidence.evidence_id}]"
            for evidence in evidence_set.evidence_items
        ]
        additions.append("## 확정에 가까운 사실\n" + ("\n".join(facts) if facts else "- 확인된 근거가 없습니다."))
    if not _has_markdown_heading(content, "주장/평가"):
        additions.append("## 주장/평가\n- 저장된 근거만으로 분리된 평가성 주장은 없습니다.")
    if not _has_markdown_heading(content, "검증 필요"):
        additions.append("## 검증 필요\n" + _verification_body(evidence_set))
    if not _has_markdown_heading(content, "우리 앱에 주는 의미"):
        additions.append("## 우리 앱에 주는 의미\n" + _app_meaning_body(evidence_set))
    if not _has_markdown_heading(content, "관련 페이지"):
        additions.append("## 관련 페이지\n- [[Evidence Set]]\n- [[RAG]]")
    if not _has_markdown_heading(content, "출처 지도"):
        rows = [
            "| 근거 | 출처 | 날짜 | 위치 | 왜 중요한가 |",
            "|---|---|---|---|---|",
        ]
        rows.extend(
            "| "
            + " | ".join(
                [
                    f"[{evidence.evidence_id}]",
                    _table_cell(evidence.title),
                    _table_cell(evidence.date),
                    _table_cell(_primary_source_location(evidence.source_location)),
                    _table_cell(str(evidence.metadata.get("match_reason") or evidence.snippet or "선택된 근거")),
                ]
            )
            + " |"
            for evidence in evidence_set.evidence_items
        )
        additions.append("## 출처 지도\n" + "\n".join(rows))
    if not _has_markdown_heading(content, "원문 링크"):
        links = [
            f"- [{evidence.evidence_id}] {evidence.title}: {_primary_source_location(evidence.source_location)}"
            for evidence in evidence_set.evidence_items
        ]
        additions.append("## 원문 링크\n" + ("\n".join(links) if links else "- 원문 링크 없음"))
    if not _has_markdown_heading(content, "확인 범위"):
        additions.append(
            "## 확인 범위\n"
            "- 이 Wiki는 저장된 정보 묶음의 근거만 기준으로 작성했습니다.\n"
            "- 저장된 정보 묶음 밖의 자료는 별도로 확인하지 않았습니다."
        )
    if not additions:
        return content
    return content.rstrip() + "\n\n" + "\n\n".join(additions)


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
            "## 확인 범위\n- 검색 결과 또는 선택 근거를 먼저 정보 묶음으로 저장해야 합니다."
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
        "저장된 정보 묶음 밖의 자료는 별도로 확인했다고 쓰지 마십시오.\n"
        f"산출물 유형: {artifact_type}\n"
        f"사용자 지시: {instruction or '선택된 근거를 바탕으로 유용한 마크다운 산출물을 작성'}\n"
        f"{_artifact_prompt_guidance(artifact_type)}\n\n"
        "--- 저장된 근거 ---\n"
        + "\n\n".join(evidence_blocks)
    )

    llm_resp = chat_completion(
        messages=[{"role": "system", "content": system_prompt}],
        max_tokens=4096,
        temperature=0.2,
    )
    if "error" in llm_resp:
        error_message = str(llm_resp["error"])
        content = (
            build_grounded_wiki_fallback(evidence_set, error_message)
            if is_wiki_artifact_type(artifact_type)
            else f"Artifact 생성 중 오류: {error_message}"
        )
    else:
        content = str(llm_resp.get("content", "") or "")
        if is_wiki_artifact_type(artifact_type) and not content.strip():
            retry_resp = chat_completion(
                messages=[{"role": "system", "content": system_prompt}],
                max_tokens=8192,
                temperature=0.2,
            )
            if "error" in retry_resp:
                content = build_grounded_wiki_fallback(evidence_set, f"empty LLM response; retry failed: {retry_resp['error']}")
            else:
                content = str(retry_resp.get("content", "") or "")
            if not content.strip():
                content = build_grounded_wiki_fallback(evidence_set, "empty LLM response")

    if is_wiki_artifact_type(artifact_type) and evidence_set.evidence_items:
        content = _ensure_wiki_required_sections(content, evidence_set)

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
