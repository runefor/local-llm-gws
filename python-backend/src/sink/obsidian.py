import os
import re
from datetime import datetime
from typing import Any, Dict, List, Optional

from src.gws.text_cleaner import clean_original_markdown

EXPORT_NOISE_LINES = {
    "마지막 방문 이후",
    "새 주제",
    "읽지 않은 알림",
    "신규 사용자",
    "인기 주제",
    "더 보기",
    "읽을거리&정보공유",
}
EXPORT_DATE_NOISE_RE = re.compile(r"\d{1,2}월\s+\d{1,2}")
CITATION_RE = re.compile(r"\[(ev_[A-Za-z0-9_\-]+)\]")

def sanitize_filename(filename: str) -> str:
    """파일명으로 사용할 수 없는 특수문자를 제거하거나 언더스코어로 대체합니다."""
    # Obsidian에서 지원되지 않는 파일명 문자 제거 (예: \ / : * ? " < > |)
    cleaned = re.sub(r'[\/\\\:\*\?\"<>\|]', '_', filename)
    # 공백이나 연속된 특수 문자 정돈
    cleaned = re.sub(r'\s+', ' ', cleaned).strip()
    return cleaned if cleaned else "untitled_note"

def yaml_quote(value: str) -> str:
    """Obsidian frontmatter에서 안전한 YAML 문자열로 감쌉니다."""
    escaped = value.replace("'", "''")
    return f"'{escaped}'"

def _wiki_link(target: str, label: str) -> str:
    page = target[:-3] if target.endswith(".md") else target
    return f"[[{page}|{label}]]"

def _link_inline_citations(content: str, evidence_ids: set[str]) -> str:
    if not evidence_ids:
        return content

    def replace(match: re.Match[str]) -> str:
        evidence_id = match.group(1)
        if evidence_id not in evidence_ids:
            return match.group(0)
        return f"[[#^{evidence_id}|[{evidence_id}]]]"

    pattern = r"^##\s+원문 링크\s*\n.*?(?=^##\s+|\Z)"
    parts: List[str] = []
    cursor = 0
    for section in re.finditer(pattern, content, flags=re.MULTILINE | re.DOTALL):
        parts.append(CITATION_RE.sub(replace, content[cursor:section.start()]))
        parts.append(section.group(0))
        cursor = section.end()
    parts.append(CITATION_RE.sub(replace, content[cursor:]))
    return "".join(parts)

def _replace_source_links(content: str, links: List[Dict[str, str]]) -> str:
    if not links:
        return content

    lines = [
        f"- {_wiki_link(link['target'], link['title'])} (근거: {link['evidence_id']}) ^{link['evidence_id']}"
        for link in links
    ]
    section = "## 원문 링크\n" + "\n".join(lines)
    pattern = r"^## 원문 링크\s*\n.*?(?=^##\s+|\Z)"
    if re.search(pattern, content, flags=re.MULTILINE | re.DOTALL):
        return re.sub(pattern, section + "\n\n", content, flags=re.MULTILINE | re.DOTALL).rstrip()
    return content.rstrip() + "\n\n" + section

def _write_markdown_file(path: str, title: str, content: str, tags: Optional[List[str]] = None) -> None:
    now_str = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    frontmatter = f"---\ntitle: {yaml_quote(title)}\ndate: {now_str}\n"
    if tags:
        frontmatter += "tags:\n"
        for tag in tags:
            cleaned_tag = re.sub(r'[^\w\-_]', '', tag)
            if cleaned_tag:
                frontmatter += f"  - {cleaned_tag}\n"
    frontmatter += "---\n\n"
    with open(path, "w", encoding="utf-8") as f:
        f.write(frontmatter)
        f.write(content)

def _unique_path(directory: str, title: str) -> tuple[str, str]:
    safe_title = sanitize_filename(title)
    filename = f"{safe_title}.md"
    file_path = os.path.join(directory, filename)
    counter = 1
    while os.path.exists(file_path):
        filename = f"{safe_title}_{counter}.md"
        file_path = os.path.join(directory, filename)
        counter += 1
    return filename, file_path

def _export_original_content(content: str) -> str:
    cleaned = clean_original_markdown(content)
    lines: List[str] = []
    for line in cleaned.splitlines():
        stripped = line.strip()
        # ponytail: forum/newsletter counters are noise in saved originals; use 원문 열기 for exact chrome.
        if stripped in EXPORT_NOISE_LINES or re.fullmatch(r"\d{1,4}", stripped) or EXPORT_DATE_NOISE_RE.fullmatch(stripped):
            continue
        heading = re.match(r"^(#{1,5})\s+(.*)$", stripped)
        if heading:
            level = max(3, len(heading.group(1)) + 1)
            lines.append(f"{'#' * level} {heading.group(2)}")
            continue
        lines.append(line.rstrip())
    return "\n".join(lines).strip()

def _original_body(original: Dict[str, str], wiki_title: str, wiki_filename: str) -> str:
    body = _export_original_content(original.get("content", ""))
    info_lines = [
        f"- 출처: {original.get('source_line', '')}" if original.get("source_line") else "",
        f"- 원문 열기: {original.get('open_url', '')}" if original.get("open_url") else "",
    ]
    info = "\n".join(line for line in info_lines if line)
    return (
        "## 원문 정보\n"
        + (info or "- 원문 메타데이터 없음")
        + "\n\n## 연결\n"
        + f"- LLM Wiki: {_wiki_link(wiki_filename, wiki_title)}"
        + "\n\n## 본문\n"
        + (body or "원문 본문을 불러오지 못했습니다.")
    )

def export_to_obsidian(vault_path: str, title: str, content: str, tags: Optional[List[str]] = None) -> Dict[str, Any]:
    """주어진 Obsidian Vault 경로에 Markdown 노트를 생성합니다.
    
    Args:
        vault_path (str): Obsidian Vault 로컬 경로
        title (str): 노트 제목 (파일명으로 활용)
        content (str): 마크다운 본문 내용
        tags (list): 노트에 추가할 태그 목록 (예: ['workspace', 'gmail', 'summary'])
    """
    if not vault_path or not os.path.exists(vault_path):
        return {
            "status": "error",
            "message": f"유효하지 않은 Obsidian Vault 경로입니다: {vault_path}"
        }
        
    filename, file_path = _unique_path(vault_path, title)

    try:
        _write_markdown_file(file_path, title, content, tags)
        
        return {
            "status": "success",
            "message": "Obsidian 노트가 생성되었습니다.",
            "filepath": file_path,
            "filename": filename
        }
    except Exception as e:
        return {
            "status": "error",
            "message": f"파일 쓰기 실패: {str(e)}"
        }

def export_to_obsidian_with_originals(
    vault_path: str,
    title: str,
    content: str,
    tags: Optional[List[str]] = None,
    originals: Optional[List[Dict[str, str]]] = None,
) -> Dict[str, Any]:
    """LLM Wiki와 원문을 분리 저장하고 Wiki 원문 링크를 로컬 원문 파일로 연결합니다."""
    if not originals:
        return export_to_obsidian(vault_path, title, content, tags)
    if not vault_path or not os.path.exists(vault_path):
        return {
            "status": "error",
            "message": f"유효하지 않은 Obsidian Vault 경로입니다: {vault_path}"
        }

    try:
        originals_dir_name = f"{sanitize_filename(title)}_원문"
        originals_dir = os.path.join(vault_path, originals_dir_name)
        os.makedirs(originals_dir, exist_ok=True)

        wiki_filename, wiki_file_path = _unique_path(vault_path, title)
        links: List[Dict[str, str]] = []
        original_files: List[str] = []
        for original in originals:
            evidence_id = original.get("evidence_id", "")
            original_title = original.get("title", evidence_id or "원문")
            filename, file_path = _unique_path(originals_dir, f"{evidence_id} {original_title}".strip())
            _write_markdown_file(file_path, original_title, _original_body(original, title, wiki_filename), ["원문"])
            original_files.append(file_path)
            links.append({
                "evidence_id": evidence_id,
                "title": original_title,
                "target": f"{originals_dir_name}/{filename}",
            })

        wiki_content = _replace_source_links(content, links)
        wiki_content = _link_inline_citations(wiki_content, {link["evidence_id"] for link in links})
        _write_markdown_file(wiki_file_path, title, wiki_content, tags)
        return {
            "status": "success",
            "message": "Obsidian 노트가 생성되었습니다.",
            "filepath": wiki_file_path,
            "filename": wiki_filename,
            "originals_dir": originals_dir,
            "original_files": original_files,
        }
    except OSError as e:
        return {"status": "error", "message": f"원문 파일 쓰기 실패: {str(e)}"}
