from typing import Iterable, Protocol


class WikiSourceLocation(Protocol):
    original_url: str
    location_label: str
    provider_item_id: str
    message_id: str
    thread_id: str
    file_id: str


class WikiEvidence(Protocol):
    evidence_id: str
    title: str
    snippet: str
    content_snapshot: str
    source_location: WikiSourceLocation


class WikiEvidenceSet(Protocol):
    title: str
    evidence_items: Iterable[WikiEvidence]


def _format_source_location(location: WikiSourceLocation) -> str:
    parts = []
    seen: set[str] = set()
    for part in [
        location.location_label,
        location.original_url,
        location.provider_item_id,
        location.message_id,
        location.thread_id,
        location.file_id,
    ]:
        value = str(part or "").strip()
        if not value or value in seen:
            continue
        seen.add(value)
        parts.append(value)
    return " | ".join(part for part in parts if part) or "위치 정보 없음"


def _trim_line(value: str, max_length: int = 220) -> str:
    text = " ".join((value or "").split())
    if len(text) <= max_length:
        return text
    return f"{text[: max_length - 1].rstrip()}…"


def _table_cell(value: str) -> str:
    return " ".join((value or "-").replace("|", "/").split())


def build_grounded_wiki_fallback(evidence_set: WikiEvidenceSet, error: str = "") -> str:
    fact_lines: list[str] = []
    link_lines: list[str] = []
    source_rows = [
        "| 근거 | 출처 | 위치 | 왜 중요한가 |",
        "|---|---|---|---|",
    ]
    for evidence in evidence_set.evidence_items:
        marker = f"[{evidence.evidence_id}]"
        snapshot = _trim_line(evidence.content_snapshot or evidence.snippet or evidence.title)
        fact_lines.append(f"- {snapshot} {marker}")
        link_lines.append(f"- {marker} {evidence.title}: {_format_source_location(evidence.source_location)}")
        source_rows.append(
            f"| {marker} | {_table_cell(evidence.title)} | "
            f"{_table_cell(_format_source_location(evidence.source_location))} | {_table_cell(snapshot)} |"
        )

    shortage = "- LLM 응답을 받지 못해 저장된 근거를 인용한 로컬 Wiki 초안으로 대체했습니다."
    if error:
        shortage += f" 원인: {error}"

    return (
        f"# {evidence_set.title} Wiki\n\n"
        "## 한 줄 결론\n"
        "저장된 근거를 바탕으로 검토가 필요한 Wiki 후보입니다.\n\n"
        "## 확정에 가까운 사실\n"
        + "\n".join(fact_lines)
        + "\n\n## 주장/평가\n"
        "- 저장된 근거만으로 분리된 평가성 주장은 없습니다.\n\n"
        "## 검증 필요\n"
        "- 단일 근거이거나 평가성 표현은 원문 재확인이 필요합니다.\n\n"
        "## 우리 앱에 주는 의미\n"
        "- 검색 결과를 정보 묶음으로 검토한 뒤 승인 Wiki로 전환합니다.\n\n"
        "## 관련 페이지\n"
        "- [[Evidence Set]]\n- [[RAG]]\n\n"
        "## 출처 지도\n"
        + "\n".join(source_rows)
        + "\n\n"
        "## 원문 링크\n"
        + "\n".join(link_lines)
        + "\n\n## 근거 부족\n"
        + shortage
    )
