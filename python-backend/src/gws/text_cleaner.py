import html
import re
from html.parser import HTMLParser
from typing import Final
from urllib.parse import urlparse

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

ALLOWED_EMAIL_TAGS: Final = {
    "a",
    "abbr",
    "b",
    "blockquote",
    "body",
    "br",
    "center",
    "code",
    "col",
    "colgroup",
    "dd",
    "del",
    "div",
    "dl",
    "dt",
    "em",
    "font",
    "h1",
    "h2",
    "h3",
    "h4",
    "h5",
    "h6",
    "head",
    "hr",
    "html",
    "i",
    "img",
    "li",
    "meta",
    "ol",
    "p",
    "pre",
    "s",
    "small",
    "span",
    "strike",
    "strong",
    "style",
    "sub",
    "sup",
    "table",
    "tbody",
    "td",
    "tfoot",
    "th",
    "thead",
    "tr",
    "u",
    "ul",
}
VOID_EMAIL_TAGS: Final = {"br", "col", "hr", "img", "meta"}
DROP_WITH_CONTENT_TAGS: Final = {"script", "iframe", "object", "embed", "form", "textarea", "select", "button"}
URL_ATTRS: Final = {"href", "src", "background"}
GLOBAL_EMAIL_ATTRS: Final = {
    "align",
    "alt",
    "bgcolor",
    "border",
    "cellpadding",
    "cellspacing",
    "class",
    "color",
    "colspan",
    "dir",
    "height",
    "lang",
    "role",
    "rowspan",
    "scope",
    "style",
    "summary",
    "target",
    "title",
    "valign",
    "width",
}
TAG_SPECIFIC_ATTRS: Final = {
    "a": {"href", "name"},
    "img": {"src", "srcset"},
}
SAFE_URL_SCHEMES: Final = {"http", "https", "mailto", "tel"}
SAFE_DATA_IMAGE_PREFIX_RE: Final[re.Pattern[str]] = re.compile(
    r"^data:image/(?:gif|png|jpe?g|webp);base64,[a-z0-9+/=\s]+$",
    re.IGNORECASE,
)
UNSAFE_STYLE_RE: Final[re.Pattern[str]] = re.compile(
    r"(?:expression\s*\(|javascript\s*:|behavior\s*:|-\s*moz-binding)",
    re.IGNORECASE,
)
DARK_BACKGROUND_STYLE_RE: Final[re.Pattern[str]] = re.compile(
    r"(?:^|;)\s*background(?:-color)?\s*:\s*(?:#(?:0{3}|0{6}|1f1f1f|222|222222|333|333333)|rgb\(\s*(?:0|1?[0-9]|2[0-9]|3[0-9]|4[0-8])\s*,\s*(?:0|1?[0-9]|2[0-9]|3[0-9]|4[0-8])\s*,\s*(?:0|1?[0-9]|2[0-9]|3[0-9]|4[0-8])\s*\))[^;]*;?",
    re.IGNORECASE,
)
CSS_HEX_COLOR_RE: Final[re.Pattern[str]] = re.compile(r"#([0-9a-f]{3}|[0-9a-f]{6})\b", re.IGNORECASE)
CSS_RGB_COLOR_RE: Final[re.Pattern[str]] = re.compile(
    r"rgba?\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})(?:\s*,\s*(?:0|0?\.\d+|1))?\s*\)",
    re.IGNORECASE,
)


def _raw_html_to_markdown(text: str) -> str:
    if "<" not in text or ">" not in text:
        return text

    converted = re.sub(r"<(?:script|style|iframe|object|embed|form)\b[^>]*>.*?</(?:script|style|iframe|object|embed|form)>", "", text, flags=re.IGNORECASE | re.DOTALL)
    converted = re.sub(r"<img\b[^>]*>", "", converted, flags=re.IGNORECASE)
    converted = re.sub(r"<h1\b[^>]*>(.*?)</h1>", r"\n# \1\n", converted, flags=re.IGNORECASE | re.DOTALL)
    converted = re.sub(r"<h2\b[^>]*>(.*?)</h2>", r"\n## \1\n", converted, flags=re.IGNORECASE | re.DOTALL)
    converted = re.sub(r"<h3\b[^>]*>(.*?)</h3>", r"\n### \1\n", converted, flags=re.IGNORECASE | re.DOTALL)
    converted = re.sub(r"<li\b[^>]*>(.*?)</li>", r"\n- \1", converted, flags=re.IGNORECASE | re.DOTALL)
    converted = re.sub(r"<br\s*/?>", "\n", converted, flags=re.IGNORECASE)
    converted = re.sub(r"</(?:p|div|tr|table)>", "\n", converted, flags=re.IGNORECASE)
    converted = re.sub(r"<a\b[^>]*href=[\"'][^\"']*(?:event\.stibee\.com|stib\.ee)[^\"']*[\"'][^>]*>(.*?)</a>", r"\1", converted, flags=re.IGNORECASE | re.DOTALL)
    converted = re.sub(r"<[^>]+>", "", converted)
    return html.unescape(converted)


def _is_safe_url(value: str) -> bool:
    stripped = value.strip()
    if not stripped:
        return False
    if SAFE_DATA_IMAGE_PREFIX_RE.match(stripped):
        return True
    if _is_tracking_link(stripped):
        return False
    parsed = urlparse(stripped)
    return parsed.scheme.lower() in SAFE_URL_SCHEMES


def _hex_to_rgb(hex_color: str) -> tuple[int, int, int] | None:
    raw = hex_color.strip().lower().lstrip("#")
    if len(raw) == 3:
        raw = "".join(char * 2 for char in raw)
    if len(raw) != 6:
        return None
    try:
        return int(raw[0:2], 16), int(raw[2:4], 16), int(raw[4:6], 16)
    except ValueError:
        return None


def _is_dark_rgb(red: int, green: int, blue: int) -> bool:
    # WCAG relative luminance approximation; threshold catches common dark code themes.
    luminance = (0.2126 * red) + (0.7152 * green) + (0.0722 * blue)
    return luminance <= 72


def _contains_dark_color(value: str) -> bool:
    lower_value = value.lower().replace("!important", " ")
    if re.search(r"\bblack\b", lower_value):
        return True

    for match in CSS_HEX_COLOR_RE.finditer(lower_value):
        rgb = _hex_to_rgb(match.group(1))
        if rgb and _is_dark_rgb(*rgb):
            return True

    for match in CSS_RGB_COLOR_RE.finditer(lower_value):
        red, green, blue = (max(0, min(255, int(channel))) for channel in match.groups()[:3])
        if _is_dark_rgb(red, green, blue):
            return True

    return False


def _is_dark_background_declaration(name: str, value: str) -> bool:
    return name.strip().lower() in {"background", "background-color"} and _contains_dark_color(value)


def _clean_style(value: str) -> str:
    if UNSAFE_STYLE_RE.search(value):
        return ""
    cleaned = DARK_BACKGROUND_STYLE_RE.sub(";", value)
    declarations: list[str] = []
    for part in cleaned.split(";"):
        declaration = part.strip()
        if not declaration or ":" not in declaration:
            continue
        name, raw_value = declaration.split(":", 1)
        if _is_dark_background_declaration(name, raw_value):
            continue
        declarations.append(f"{name.strip()}: {raw_value.strip()}")
    return "; ".join(declarations)


def _clean_srcset(value: str) -> str:
    safe_candidates: list[str] = []
    for candidate in value.split(","):
        parts = candidate.strip().split()
        if parts and _is_safe_url(parts[0]):
            safe_candidates.append(" ".join(parts))
    return ", ".join(safe_candidates)


class _EmailHtmlSanitizer(HTMLParser):
    def __init__(self) -> None:
        super().__init__(convert_charrefs=False)
        self._parts: list[str] = []
        self._drop_stack: list[str] = []
        self._style_depth = 0

    def _dropping(self) -> bool:
        return len(self._drop_stack) > 0

    def _clean_attrs(self, tag: str, attrs: list[tuple[str, str | None]]) -> list[tuple[str, str]]:
        cleaned: list[tuple[str, str]] = []
        allowed_attrs = GLOBAL_EMAIL_ATTRS | TAG_SPECIFIC_ATTRS.get(tag, set())

        for raw_name, raw_value in attrs:
            name = raw_name.lower().strip()
            if not name or name.startswith("on") or name not in allowed_attrs:
                continue

            value = "" if raw_value is None else raw_value
            if name in URL_ATTRS and not _is_safe_url(value):
                continue
            if name == "bgcolor" and _contains_dark_color(value):
                continue
            if name == "srcset":
                value = _clean_srcset(value)
                if not value:
                    continue
            if name == "style":
                value = _clean_style(value)
                if not value:
                    continue
            if name == "target" and value.lower() not in {"_blank", "_self"}:
                value = "_blank"

            cleaned.append((name, value))

        if tag == "a":
            attr_names = {name for name, _ in cleaned}
            if "href" in attr_names:
                if "target" not in attr_names:
                    cleaned.append(("target", "_blank"))
                cleaned.append(("rel", "noopener noreferrer"))

        return cleaned

    def _append_start_tag(self, tag: str, attrs: list[tuple[str, str]]) -> None:
        if tag == "img" and not any(name == "src" for name, _ in attrs):
            return
        rendered_attrs = "".join(f' {name}="{html.escape(value, quote=True)}"' for name, value in attrs)
        self._parts.append(f"<{tag}{rendered_attrs}>")

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        safe_tag = tag.lower()
        if safe_tag in DROP_WITH_CONTENT_TAGS:
            self._drop_stack.append(safe_tag)
            return
        if self._dropping() or safe_tag not in ALLOWED_EMAIL_TAGS:
            return
        if safe_tag == "style":
            self._style_depth += 1
        self._append_start_tag(safe_tag, self._clean_attrs(safe_tag, attrs))

    def handle_startendtag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        safe_tag = tag.lower()
        if self._dropping() or safe_tag not in ALLOWED_EMAIL_TAGS:
            return
        self._append_start_tag(safe_tag, self._clean_attrs(safe_tag, attrs))

    def handle_endtag(self, tag: str) -> None:
        safe_tag = tag.lower()
        if self._drop_stack:
            if safe_tag == self._drop_stack[-1]:
                self._drop_stack.pop()
            return
        if safe_tag in ALLOWED_EMAIL_TAGS and safe_tag not in VOID_EMAIL_TAGS:
            if safe_tag == "style" and self._style_depth > 0:
                self._style_depth -= 1
            self._parts.append(f"</{safe_tag}>")

    def handle_data(self, data: str) -> None:
        if not self._dropping() and (self._style_depth == 0 or not UNSAFE_STYLE_RE.search(data)):
            self._parts.append(data)

    def handle_entityref(self, name: str) -> None:
        if not self._dropping():
            self._parts.append(f"&{name};")

    def handle_charref(self, name: str) -> None:
        if not self._dropping():
            self._parts.append(f"&#{name};")

    def sanitized(self) -> str:
        return "".join(self._parts).strip()


def sanitize_email_html(raw_html: str) -> str:
    """Preserve Gmail-like HTML while removing active content and unsafe URLs."""
    sanitizer = _EmailHtmlSanitizer()
    sanitizer.feed(raw_html)
    sanitizer.close()
    sanitized = sanitizer.sanitized()
    for phrase in BOILERPLATE_PHRASES:
        sanitized = re.sub(
            rf"<a\b[^>]*>\s*\[?\s*{re.escape(phrase)}\s*\]?\s*</a>",
            "",
            sanitized,
            flags=re.IGNORECASE,
        )
    sanitized = DECORATIVE_PIPE_RUN_RE.sub(" ", sanitized)
    return sanitized.strip()


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
