import base64
import binascii
from datetime import datetime, timezone
from email import policy
from email.message import EmailMessage, Message
from email.parser import BytesParser
from typing import List, Optional

from googleapiclient.discovery import build
from markdownify import markdownify as md
from .auth import get_credentials
from .text_cleaner import clean_original_markdown

# Gmail API Quota 참고:
# 1. users.messages.list (목록 가져오기)는 한 번에 최대 500개(maxResults=500)까지 페이징(pageToken)하여 가져올 수 있습니다.
# 2. 할당량 비용: 목록(list) 조회 1점, 개별 메시지(get) 조회 5점.
# 3. 일일 할당량: 1,000,000,000점으로 매우 넉넉하지만, 한 번에 수만 통의 get 요청을 보내면 초당 할당량 제한(Rate Limit)에 걸릴 수 있습니다.
# 결론: 목록을 들고 오는 것(list)은 한계가 없지만, 내용을 모두 가져오는 것(get)은 트래픽 조절이 필요합니다.

def list_labels():
    """Gmail 라벨(태그) 목록을 가져옵니다."""
    creds = get_credentials()
    service = build('gmail', 'v1', credentials=creds)

    results = service.users().labels().list(userId='me').execute()
    return results.get('labels', [])


def list_messages(max_results=None, page_token=None, query=None, label_ids: Optional[List[str]] = None):
    """
    Gmail 목록을 가져옵니다. 페이징을 지원합니다.
    """
    creds = get_credentials()
    service = build('gmail', 'v1', credentials=creds)
    
    import datetime
    seven_days_ago = datetime.datetime.now(datetime.timezone.utc) - datetime.timedelta(days=7)
    default_after = f"after:{seven_days_ago.year}/{seven_days_ago.month:02d}/{seven_days_ago.day:02d}"
    
    actual_query = None
    if query:
        # 기간 관련 키워드가 없으면 기본 7일 전 필터 추가
        if not any(k in query for k in ["newer_than:", "after:", "before:", "older_than:"]):
            actual_query = f"{query} {default_after}"
        else:
            actual_query = query
    else:
        actual_query = default_after
    
    messages = []
    next_page_token = page_token

    while True:
        remaining = None if max_results is None else max_results - len(messages)
        if remaining is not None and remaining <= 0:
            break

        page_size = 500 if remaining is None else min(500, remaining)
        request_params = {
            'userId': 'me',
            'maxResults': page_size,
            'pageToken': next_page_token,
            'q': actual_query,
        }
        if label_ids:
            request_params['labelIds'] = label_ids

        results = service.users().messages().list(**request_params).execute()

        messages.extend(results.get('messages', []))
        next_page_token = results.get('nextPageToken', None)

        if not next_page_token:
            break

    return messages, next_page_token

def get_message(msg_id, format='full', metadata_headers: Optional[List[str]] = None):
    """
    특정 메시지의 상세 내용을 가져옵니다.
    """
    creds = get_credentials()
    service = build('gmail', 'v1', credentials=creds)

    request_params = {
        'userId': 'me',
        'id': msg_id,
        'format': format,
    }
    if metadata_headers:
        request_params['metadataHeaders'] = metadata_headers

    message = service.users().messages().get(**request_params).execute()
    
    return message


def _header_value(headers, name: str, default: str = "") -> str:
    return next((h.get('value', default) for h in headers if h.get('name', '').lower() == name.lower()), default)


def format_message_metadata(message_detail):
    headers = message_detail.get('payload', {}).get('headers', [])
    internal_date_ms = int(message_detail.get('internalDate', 0) or 0)
    if internal_date_ms:
        date_iso = datetime.fromtimestamp(internal_date_ms / 1000.0, tz=timezone.utc).isoformat().replace("+00:00", "Z")
    else:
        date_iso = datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")

    return {
        "id": message_detail.get('id', ''),
        "threadId": message_detail.get('threadId', ''),
        "subject": _header_value(headers, 'subject', '(제목 없음)'),
        "from": _header_value(headers, 'from', '알 수 없음'),
        "snippet": message_detail.get('snippet', ''),
        "date": date_iso,
        "labelIds": message_detail.get('labelIds', []),
    }


def _decode_gmail_body_data(data: str) -> str:
    normalized = data.replace("-", "+").replace("_", "/")
    padding = "=" * (-len(normalized) % 4)
    try:
        return base64.b64decode(normalized + padding).decode("utf-8", errors="ignore")
    except (binascii.Error, UnicodeDecodeError):
        return ""


def _decode_gmail_raw(raw: str) -> bytes:
    padding = "=" * (-len(raw) % 4)
    try:
        return base64.urlsafe_b64decode(raw + padding)
    except binascii.Error:
        return b""


def _message_text_part(part: Message) -> str:
    if part.get_content_disposition() == "attachment":
        return ""

    content_type = part.get_content_type()
    if content_type not in {"text/plain", "text/html"}:
        return ""

    try:
        content = part.get_content()
    except (LookupError, UnicodeDecodeError):
        return ""

    if not isinstance(content, str):
        return ""
    if content_type == "text/html":
        return clean_original_markdown(md(content))
    return clean_original_markdown(content)


def _extract_raw_message_text(message: EmailMessage) -> str:
    plain_parts: list[str] = []
    html_parts: list[str] = []

    for part in message.walk():
        text = _message_text_part(part)
        if not text:
            continue
        if part.get_content_type() == "text/html":
            html_parts.append(text)
        else:
            plain_parts.append(text)

    plain_text = clean_original_markdown("\n\n".join(plain_parts))
    html_text = clean_original_markdown("\n\n".join(html_parts))
    return html_text or plain_text


def _parse_raw_message(raw: str) -> EmailMessage | None:
    raw_bytes = _decode_gmail_raw(raw)
    if not raw_bytes:
        return None
    parsed = BytesParser(policy=policy.default).parsebytes(raw_bytes)
    if isinstance(parsed, EmailMessage):
        return parsed
    return None


def _extract_body_text(payload) -> str:
    body = payload.get("body", {})
    data = body.get("data", "")
    mime_type = payload.get("mimeType", "").split(";", 1)[0].strip().lower()
    parts = payload.get("parts", [])

    if data and mime_type == "text/plain":
        return clean_original_markdown(_decode_gmail_body_data(data))
    if data and mime_type == "text/html":
        return clean_original_markdown(md(_decode_gmail_body_data(data)))

    plain_parts = []
    html_parts = []
    for part in parts:
        text = _extract_body_text(part)
        if not text:
            continue
        if part.get("mimeType", "") == "text/html":
            html_parts.append(text)
        else:
            plain_parts.append(text)

    return clean_original_markdown("\n".join(html_parts or plain_parts))


def _gmail_search_url(message_id_header: str) -> str:
    if not message_id_header:
        return "https://mail.google.com/mail/u/0/#inbox"
    return f"https://mail.google.com/mail/u/0/#search/rfc822msgid:{message_id_header}"


def get_gmail_message_original(message_id: str):
    """Gmail 메시지의 메타데이터와 전체 본문을 원문 보기용으로 반환합니다."""
    detail = get_message(message_id, format="raw")
    raw_message = _parse_raw_message(detail.get("raw", ""))
    if raw_message is not None:
        subject = raw_message.get("subject", "(제목 없음)")
        sender = raw_message.get("from", "알 수 없음")
        message_id_header = raw_message.get("message-id", "")
        content = _extract_raw_message_text(raw_message) or detail.get("snippet", "")
    else:
        headers = detail.get("payload", {}).get("headers", [])
        subject = _header_value(headers, "subject", "(제목 없음)")
        sender = _header_value(headers, "from", "알 수 없음")
        message_id_header = _header_value(headers, "message-id", "")
        content = _extract_body_text(detail.get("payload", {})) or detail.get("snippet", "")

    return {
        "id": detail.get("id", message_id),
        "type": "gmail",
        "title": subject,
        "subtitle": sender,
        "content": clean_original_markdown(content),
        "content_type": "text/markdown",
        "open_url": _gmail_search_url(message_id_header),
    }


def list_message_metadata(max_results=None, page_token=None, query=None, label_ids: Optional[List[str]] = None):
    """Gmail 검색 결과를 본문 없이 메타데이터만 조회합니다."""
    messages, next_token = list_messages(
        max_results=max_results,
        page_token=page_token,
        query=query,
        label_ids=label_ids,
    )
    metadata_messages = []
    for message in messages:
        detail = get_message(
            message['id'],
            format='metadata',
            metadata_headers=['Subject', 'From', 'Date', 'Message-ID'],
        )
        metadata_messages.append(format_message_metadata(detail))

    return metadata_messages, next_token
