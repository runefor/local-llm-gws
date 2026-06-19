import re
from typing import Any, Dict, List, Literal, Optional, Set

from pydantic import BaseModel, Field


ArtifactStatus = Literal["candidate", "needs_review", "approved", "source_missing"]
WIKI_ARTIFACT_TYPES = {"wiki", "llm_wiki", "llm-wiki"}
REQUIRED_WIKI_SECTIONS = ["요약", "핵심 사실", "원문 링크", "근거 부족"]
CITATION_RE = re.compile(r"\[ev_[A-Za-z0-9_\-]+\]")


class ArtifactLintIssue(BaseModel):
    code: str
    severity: Literal["error", "warning"] = "error"
    message: str
    evidence_id: str = ""


class ArtifactLintResult(BaseModel):
    status: Literal["passed", "failed"]
    issues: List[ArtifactLintIssue] = Field(default_factory=list)


class WikiFrontmatter(BaseModel):
    id: str
    title: str
    type: str
    status: ArtifactStatus
    evidence_set_id: str
    source_count: int
    evidence_ids: List[str] = Field(default_factory=list)
    created_at: str
    updated_at: str
    approved_at: Optional[str] = None


def is_wiki_artifact_type(artifact_type: str) -> bool:
    return artifact_type.strip().lower() in WIKI_ARTIFACT_TYPES


def citation_markers_for_content(content: str) -> List[str]:
    return sorted(set(CITATION_RE.findall(content or "")))


def evidence_marker(evidence_id: str) -> str:
    return f"[{evidence_id}]"


def extract_artifact_title(content: str, fallback: str) -> str:
    for line in (content or "").splitlines():
        match = re.match(r"^#\s+(.+?)\s*$", line.strip())
        if match:
            return match.group(1).strip()
    return fallback.strip() or "Wiki 후보"


def _evidence_ids(evidence_set: Any) -> List[str]:
    return [str(item.evidence_id) for item in getattr(evidence_set, "evidence_items", [])]


def _location_has_pointer(location: Any) -> bool:
    fields = [
        "original_url",
        "location_label",
        "provider_item_id",
        "message_id",
        "thread_id",
        "file_id",
    ]
    return any(str(getattr(location, field, "") or "").strip() for field in fields)


def _has_heading(content: str, heading: str, level: Optional[int] = None) -> bool:
    if level is None:
        pattern = r"^#{1,6}\s+" + re.escape(heading) + r"\s*$"
    else:
        pattern = r"^" + "#" * level + r"\s+" + re.escape(heading) + r"\s*$"
    return re.search(pattern, content or "", flags=re.MULTILINE) is not None


def lint_artifact_content(content: str, evidence_set: Any, artifact_type: str) -> ArtifactLintResult:
    issues: List[ArtifactLintIssue] = []
    evidence_items = list(getattr(evidence_set, "evidence_items", []))
    known_ids: Set[str] = set(_evidence_ids(evidence_set))

    if is_wiki_artifact_type(artifact_type):
        if not evidence_items:
            issues.append(
                ArtifactLintIssue(
                    code="source_missing",
                    message="원문 근거가 없어 Wiki 후보를 만들 수 없습니다.",
                )
            )
        if not re.search(r"^#\s+\S+", content or "", flags=re.MULTILINE):
            issues.append(ArtifactLintIssue(code="missing_title", message="Wiki 후보에는 H1 제목이 필요합니다."))
        for section in REQUIRED_WIKI_SECTIONS:
            if not _has_heading(content, section, level=2):
                issues.append(
                    ArtifactLintIssue(
                        code="missing_section",
                        message=f"필수 섹션이 없습니다: ## {section}",
                    )
                )
        if evidence_items and not citation_markers_for_content(content):
            issues.append(
                ArtifactLintIssue(
                    code="missing_citation",
                    message="근거가 있는 Wiki 후보에는 최소 1개 이상의 [ev_...] 인용이 필요합니다.",
                )
            )

    for marker in citation_markers_for_content(content):
        marker_id = marker.strip("[]")
        if marker_id not in known_ids:
            issues.append(
                ArtifactLintIssue(
                    code="unknown_citation_marker",
                    message=f"근거 묶음에 없는 인용 마커입니다: {marker}",
                    evidence_id=marker_id,
                )
            )

    for evidence in evidence_items:
        if not _location_has_pointer(getattr(evidence, "source_location", None)):
            issues.append(
                ArtifactLintIssue(
                    code="source_location_missing",
                    message="원문 위치 정보가 비어 있습니다.",
                    evidence_id=str(getattr(evidence, "evidence_id", "")),
                )
            )

    status = "failed" if any(issue.severity == "error" for issue in issues) else "passed"
    return ArtifactLintResult(status=status, issues=issues)


def status_for_lint(lint: ArtifactLintResult) -> ArtifactStatus:
    if any(issue.code == "source_missing" for issue in lint.issues):
        return "source_missing"
    if lint.status == "passed":
        return "candidate"
    return "needs_review"


def build_frontmatter(
    *,
    artifact_id: str,
    title: str,
    artifact_type: str,
    status: ArtifactStatus,
    evidence_set: Any,
    created_at: str,
    updated_at: str,
    approved_at: Optional[str] = None,
) -> WikiFrontmatter:
    evidence_ids = _evidence_ids(evidence_set)
    return WikiFrontmatter(
        id=artifact_id,
        title=title,
        type=artifact_type,
        status=status,
        evidence_set_id=str(getattr(evidence_set, "id", "")),
        source_count=len(evidence_ids),
        evidence_ids=evidence_ids,
        created_at=created_at,
        updated_at=updated_at,
        approved_at=approved_at,
    )


def markdown_with_frontmatter(frontmatter: Dict[str, Any], content: str) -> str:
    lines = ["---"]
    for key, value in frontmatter.items():
        if value in (None, ""):
            continue
        if isinstance(value, list):
            lines.append(f"{key}:")
            for item in value:
                lines.append(f"  - {item}")
        else:
            lines.append(f"{key}: {value}")
    lines.append("---")
    lines.append("")
    lines.append(content)
    return "\n".join(lines)
