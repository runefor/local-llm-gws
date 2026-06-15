from googleapiclient.discovery import build
from .auth import get_credentials
import os

def list_drive_files(mime_types=None, page_token=None, max_results=100):
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
        
    query = " or ".join([f"mimeType='{t}'" for t in mime_types])
    
    results = service.files().list(
        q=query,
        pageSize=max_results,
        fields="nextPageToken, files(id, name, mimeType, modifiedTime)",
        pageToken=page_token
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
