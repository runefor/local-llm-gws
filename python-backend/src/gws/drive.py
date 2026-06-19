from googleapiclient.discovery import build
from markdownify import markdownify as md
from .auth import get_credentials
from .text_cleaner import clean_original_markdown
import os

import datetime

RESOURCE_KEYS_HEADER = "X-Goog-Drive-Resource-Keys"


def _execute_with_resource_key(request, file_id: str, resource_key: str = ""):
    if resource_key:
        request.headers[RESOURCE_KEYS_HEADER] = f"{file_id}/{resource_key}"
    return request.execute()

def list_drive_files(query=None, mime_types=None, page_token=None, max_results=100):
    """
    지정된 mime_type(Docs, Sheets, PDF 등)의 파일 목록을 가져옵니다.
    """
    creds = get_credentials()
    service = build('drive', 'v3', credentials=creds)
    
    # 기본 타겟: Docs, Sheets, PDF, Plain Text
    if not mime_types:
        mime_types = [
            "application/vnd.google-apps.document",
            "application/vnd.google-apps.spreadsheet",
            "application/pdf",
            "text/plain"
        ]
        
    clauses = ["(" + " or ".join([f"mimeType='{t}'" for t in mime_types]) + ")"]
    
    # 2. Date 쿼리 구성 (modifiedTime > '...')
    has_custom_date = False
    if query and "modifiedTime" in query:
        has_custom_date = True
        
    if not has_custom_date:
        seven_days_ago = (datetime.datetime.now(datetime.timezone.utc) - datetime.timedelta(days=7)).isoformat().replace("+00:00", "Z")
        clauses.append(f"modifiedTime > '{seven_days_ago}'")
        
    # 3. User Query 쿼리 구성
    if query:
        if any(op in query for op in ["contains", "=", ">", "<"]):
            clauses.append(f"({query})")
        else:
            clauses.append(f"(name contains '{query}' or fullText contains '{query}')")
            
    drive_q = " and ".join(clauses)
    
    results = service.files().list(
        q=drive_q,
        pageSize=max_results,
        fields="nextPageToken, files(id, name, mimeType, modifiedTime, webViewLink, resourceKey, owners(displayName,emailAddress), lastModifyingUser(displayName,emailAddress), createdTime)",
        pageToken=page_token,
        includeItemsFromAllDrives=True,
        supportsAllDrives=True,
    ).execute()
    
    return results.get('files', []), results.get('nextPageToken', None)

def export_google_doc(file_id, mime_type):
    """
    Google Docs/Sheets를 LLM이 읽기 편한 포맷으로 Export 합니다.
    Docs -> HTML (이후 markdownify로 .md 변환 예정)
    Sheets -> CSV
    """
    creds = get_credentials()
    service = build('drive', 'v3', credentials=creds)
    
    export_mime = 'text/plain'
    if mime_type == 'application/vnd.google-apps.document':
        export_mime = 'text/html'  # 구조 보존을 위해 HTML로 먼저 빼오기
    elif mime_type == 'application/vnd.google-apps.spreadsheet':
        export_mime = 'text/csv'
        
    request = service.files().export_media(fileId=file_id, mimeType=export_mime)
    # 실제로는 여기서 request.execute() 결과를 받아 파싱
    return request


def _decode_media_response(raw_content) -> str:
    if isinstance(raw_content, bytes):
        return raw_content.decode("utf-8", errors="ignore")
    return str(raw_content)


def _fetch_drive_original_content(service, file_id: str, mime_type: str, resource_key: str = "") -> tuple[str, str]:
    if mime_type == "application/vnd.google-apps.document":
        request = service.files().export_media(fileId=file_id, mimeType="text/html")
        return clean_original_markdown(md(_decode_media_response(_execute_with_resource_key(request, file_id, resource_key)))), "text/markdown"
    if mime_type == "application/vnd.google-apps.spreadsheet":
        request = service.files().export_media(fileId=file_id, mimeType="text/csv")
        return _decode_media_response(_execute_with_resource_key(request, file_id, resource_key)), "text/csv"
    if mime_type == "text/plain":
        request = service.files().get_media(fileId=file_id, supportsAllDrives=True)
        return _decode_media_response(_execute_with_resource_key(request, file_id, resource_key)), "text/plain"
    return (
        "이 파일 형식은 앱 안에서 텍스트 원문 미리보기를 지원하지 않습니다. 원문 열기로 Google Drive에서 확인하세요.",
        mime_type,
    )


def get_drive_file_original(file_id: str, mime_type: str, resource_key: str = ""):
    """Drive 파일의 메타데이터와 앱에서 표시 가능한 원문 텍스트를 반환합니다."""
    creds = get_credentials()
    service = build("drive", "v3", credentials=creds)
    metadata_request = service.files().get(
        fileId=file_id,
        fields="id, name, mimeType, webViewLink, modifiedTime, resourceKey",
        supportsAllDrives=True,
    )
    metadata = _execute_with_resource_key(metadata_request, file_id, resource_key)
    actual_mime_type = metadata.get("mimeType", mime_type)
    actual_resource_key = metadata.get("resourceKey", resource_key)
    content, content_type = _fetch_drive_original_content(service, file_id, actual_mime_type, actual_resource_key)

    return {
        "id": metadata.get("id", file_id),
        "type": "drive",
        "title": metadata.get("name", "이름 없는 파일"),
        "subtitle": actual_mime_type,
        "content": content,
        "content_type": content_type,
        "open_url": metadata.get("webViewLink", ""),
    }
