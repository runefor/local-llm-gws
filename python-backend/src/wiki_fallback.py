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
    parts = [
        location.location_label,
        location.original_url,
        location.provider_item_id,
        location.message_id,
        location.thread_id,
        location.file_id,
    ]
    return " | ".join(part for part in parts if part) or "위치 정보 없음"


def _trim_line(value: str, max_length: int = 220) -> str:
    text = " ".join((value or "").split())
    if len(text) <= max_length:
        return text
    return f"{text[: max_length - 1].rstrip()}…"


def build_grounded_wiki_fallback(evidence_set: WikiEvidenceSet, error: str = "") -> str:
    summary_lines: list[str] = []
    fact_lines: list[str] = []
    link_lines: list[str] = []
    for evidence in evidence_set.evidence_items:
        marker = f"[{evidence.evidence_id}]"
        snapshot = _trim_line(evidence.content_snapshot or evidence.snippet or evidence.title)
        summary_lines.append(f"- {evidence.title}: {snapshot} {marker}")
        fact_lines.append(f"- {snapshot} {marker}")
        link_lines.append(f"- {marker} {evidence.title}: {_format_source_location(evidence.source_location)}")

    shortage = "- LLM 응답을 받지 못해 저장된 근거를 인용한 로컬 Wiki 초안으로 대체했습니다."
    if error:
        shortage += f" 원인: {error}"

    return (
        f"# {evidence_set.title} Wiki\n\n"
        "## 요약\n"
        + "\n".join(summary_lines)
        + "\n\n## 핵심 사실\n"
        + "\n".join(fact_lines)
        + "\n\n## 관련 사람/프로젝트\n"
        "- 저장된 근거에서 별도 관계자는 자동 확정하지 않았습니다.\n\n"
        "## 결정사항\n"
        "- 저장된 근거만으로 확정된 결정사항은 별도 검토가 필요합니다.\n\n"
        "## 할 일\n"
        "- 원문 링크의 근거를 열어 Wiki 초안을 검토하고 승인합니다.\n\n"
        "## 원문 링크\n"
        + "\n".join(link_lines)
        + "\n\n## 근거 부족\n"
        + shortage
    )
