import html
import re
from typing import Final

TRACKING_HOSTS: Final = (
    "event.stibee.com",
    "stib.ee",
)
TRACKING_LINK_RE: Final[re.Pattern[str]] = re.compile(
    r"\[([^\]\n]{0,160})\]\(https?://[^)]+(?:event\.stibee\.com|stib\.ee)[^)]+\)",
    re.IGNORECASE,
)
IMAGE_MARKDOWN_RE: Final[re.Pattern[str]] = re.compile(r"!\[[^\]]*\]\([^)]+\)")
BARE_TRACKING_URL_RE: Final[re.Pattern[str]] = re.compile(
    r"\(?https?://[^\s)]+(?:event\.stibee\.com|stib\.ee)[^\s)]*\)?",
    re.IGNORECASE,
)
DECORATIVE_PIPE_RUN_RE: Final[re.Pattern[str]] = re.compile(r"(?:\s*\|[\s:\-]*){3,}")
EMOJI_RE: Final[re.Pattern[str]] = re.compile(
    "["
    "\U0001F1E6-\U0001F1FF"
    "\U0001F300-\U0001FAFF"
    "\u2600-\u27BF"
    "]",
)
BOILERPLATE_PHRASES: Final = (
    "잘림 없이 보기",
    "수신거부",
    "unsubscribe",
    "view in browser",
)


def _raw_html_to_markdown(text: str) -> str:
    if "<" not in text or ">" not in text:
        return text

    converted = re.sub(r"<img\b[^>]*>", "", text, flags=re.IGNORECASE)
    converted = re.sub(r"<h1\b[^>]*>(.*?)</h1>", r"\n# \1\n", converted, flags=re.IGNORECASE | re.DOTALL)
    converted = re.sub(r"<h2\b[^>]*>(.*?)</h2>", r"\n## \1\n", converted, flags=re.IGNORECASE | re.DOTALL)
    converted = re.sub(r"<h3\b[^>]*>(.*?)</h3>", r"\n### \1\n", converted, flags=re.IGNORECASE | re.DOTALL)
    converted = re.sub(r"<li\b[^>]*>(.*?)</li>", r"\n- \1", converted, flags=re.IGNORECASE | re.DOTALL)
    converted = re.sub(r"<br\s*/?>", "\n", converted, flags=re.IGNORECASE)
    converted = re.sub(r"</(?:p|div|tr|table)>", "\n", converted, flags=re.IGNORECASE)
    converted = re.sub(r"<a\b[^>]*href=[\"'][^\"']*(?:event\.stibee\.com|stib\.ee)[^\"']*[\"'][^>]*>(.*?)</a>", r"\1", converted, flags=re.IGNORECASE | re.DOTALL)
    converted = re.sub(r"<[^>]+>", "", converted)
    return html.unescape(converted)


def _is_tracking_link(text: str) -> bool:
    lower_text = text.lower()
    return any(host in lower_text for host in TRACKING_HOSTS)


def _tracking_link_replacement(match: re.Match[str]) -> str:
    label = match.group(1).strip()
    if not label:
        return ""
    if any(phrase in label.lower() for phrase in BOILERPLATE_PHRASES):
        return ""
    return label


def _is_noise_line(line: str) -> bool:
    stripped = line.strip()
    if not stripped:
        return False
    if any(phrase in stripped.lower() for phrase in BOILERPLATE_PHRASES):
        informative = re.sub(r"[^0-9A-Za-z가-힣ㄱ-ㅎㅏ-ㅣ]", "", stripped)
        return len(informative) <= 20
    if _is_tracking_link(stripped):
        return True
    informative = re.sub(r"[^0-9A-Za-z가-힣ㄱ-ㅎㅏ-ㅣ]", "", stripped)
    table_marks = stripped.count("|") + stripped.count("-") + stripped.count(":")
    if table_marks >= 4 and len(informative) <= 2:
        return True
    return len(informative) == 0 and len(stripped) >= 4


def _normalize_setext_headings(lines: list[str]) -> list[str]:
    normalized: list[str] = []
    index = 0
    while index < len(lines):
        current = lines[index].strip()
        next_line = lines[index + 1].strip() if index + 1 < len(lines) else ""
        if current and re.fullmatch(r"=+", next_line):
            normalized.append(f"# {current}")
            index += 2
            continue
        if current and re.fullmatch(r"-+", next_line):
            normalized.append(f"## {current}")
            index += 2
            continue
        normalized.append(lines[index].rstrip())
        index += 1
    return normalized


def clean_original_markdown(markdown: str) -> str:
    """Remove tracking/layout artifacts while preserving readable original text."""
    text = html.unescape(_raw_html_to_markdown(markdown)).replace("\r\n", "\n").replace("\r", "\n")
    text = IMAGE_MARKDOWN_RE.sub("", text)
    text = TRACKING_LINK_RE.sub(_tracking_link_replacement, text)
    text = BARE_TRACKING_URL_RE.sub("", text)
    text = DECORATIVE_PIPE_RUN_RE.sub(" ", text)
    for phrase in BOILERPLATE_PHRASES:
        text = re.sub(re.escape(phrase), "", text, flags=re.IGNORECASE)
    text = EMOJI_RE.sub("", text)

    lines = [line.rstrip() for line in text.split("\n")]
    lines = _normalize_setext_headings(lines)
    cleaned_lines: list[str] = []
    previous_blank = True
    for line in lines:
        stripped = line.strip()
        if _is_noise_line(stripped):
            continue
        if not stripped:
            if not previous_blank:
                cleaned_lines.append("")
            previous_blank = True
            continue
        cleaned_lines.append(stripped)
        previous_blank = False

    return "\n".join(cleaned_lines).strip()
