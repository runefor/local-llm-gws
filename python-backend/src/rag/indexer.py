import base64
import hashlib
import logging
from datetime import datetime
from typing import Dict, List, Any
import chromadb
from sentence_transformers import SentenceTransformer
from markdownify import markdownify as md

from config import config
from src.gws.auth import is_authenticated
from src.gws.gmail import list_messages, get_message
from src.gws.drive import list_drive_files

logger = logging.getLogger(__name__)

# 임베딩 모델 캐싱
_embedding_model = None

def get_embedding_model():
    global _embedding_model
    if _embedding_model is None:
        logger.info("SentenceTransformer 모델 로드 중...")
        _embedding_model = SentenceTransformer("all-MiniLM-L6-v2")
    return _embedding_model

def get_chroma_client():
    from chromadb.config import Settings
    return chromadb.PersistentClient(
        path=str(config.CHROMA_DB_PATH),
        settings=Settings(anonymized_telemetry=False)
    )

def chunk_text(text: str, chunk_size: int = 500, chunk_overlap: int = 50) -> List[str]:
    """텍스트를 청크 단위로 분할합니다."""
    if not text:
        return []
    chunks = []
    start = 0
    while start < len(text):
        end = start + chunk_size
        chunks.append(text[start:end])
        start += chunk_size - chunk_overlap
    return chunks

def parse_gmail_body(message_detail: Dict[str, Any]) -> str:
    """Gmail API 상세 응답에서 본문 텍스트를 추출합니다."""
    payload = message_detail.get("payload", {})
    body_text = ""
    
    def _extract_parts(part):
        nonlocal body_text
        mime_type = part.get("mimeType", "")
        body = part.get("body", {})
        data = body.get("data", "")
        
        if mime_type == "text/plain" and data:
            try:
                decoded = base64.urlsafe_b64decode(data).decode("utf-8", errors="ignore")
                body_text += decoded + "\n"
            except Exception:
                pass
        elif mime_type == "text/html" and data and not body_text:
            try:
                decoded = base64.urlsafe_b64decode(data).decode("utf-8", errors="ignore")
                body_text += md(decoded) + "\n"
            except Exception:
                pass
                
        parts = part.get("parts", [])
        for p in parts:
            _extract_parts(p)
            
    body = payload.get("body", {})
    data = body.get("data", "")
    mime_type = payload.get("mimeType", "")
    
    if data and mime_type == "text/plain":
        try:
            body_text = base64.urlsafe_b64decode(data).decode("utf-8", errors="ignore")
        except Exception:
            pass
    elif data and mime_type == "text/html":
        try:
            body_text = md(base64.urlsafe_b64decode(data).decode("utf-8", errors="ignore"))
        except Exception:
            pass
    else:
        parts = payload.get("parts", [])
        for p in parts:
            _extract_parts(p)
            
    return body_text.strip()

def fetch_drive_file_content(file_id: str, mime_type: str) -> str:
    """Google Drive 파일의 본문 텍스트를 가져옵니다."""
    from src.gws.auth import get_credentials
    from googleapiclient.discovery import build
    
    creds = get_credentials()
    service = build('drive', 'v3', credentials=creds)
    
    try:
        if mime_type == 'application/vnd.google-apps.document':
            request = service.files().export_media(fileId=file_id, mimeType='text/html')
            html_content = request.execute().decode('utf-8', errors='ignore')
            return md(html_content)
        elif mime_type == 'application/vnd.google-apps.spreadsheet':
            request = service.files().export_media(fileId=file_id, mimeType='text/csv')
            csv_content = request.execute().decode('utf-8', errors='ignore')
            return csv_content
        elif mime_type == 'text/plain':
            request = service.files().get_media(fileId=file_id)
            text_content = request.execute().decode('utf-8', errors='ignore')
            return text_content
    except Exception as e:
        logger.error(f"드라이브 파일 {file_id} 다운로드 실패: {e}")
        
    return ""

def index_all() -> Dict[str, Any]:
    """Gmail 및 Google Drive 최신 데이터를 동기화하여 ChromaDB에 인덱싱합니다."""
    if not is_authenticated():
        return {"status": "error", "message": "Google Workspace 인증이 필요합니다."}
        
    logger.info("ChromaDB 인덱싱 시작...")
    client = get_chroma_client()
    model = get_embedding_model()
    
    gmail_col = client.get_or_create_collection(config.CHROMA_COLLECTION_GMAIL)
    drive_col = client.get_or_create_collection(config.CHROMA_COLLECTION_DRIVE)
    
    # 1. Gmail 인덱싱 (최근 50개 대상)
    gmail_indexed = 0
    try:
        messages, _ = list_messages(max_results=50)
        for msg in messages:
            msg_id = msg["id"]
            
            # 이미 인덱싱되었는지 확인 (메타데이터 중복 조회 방지용)
            existing = gmail_col.get(ids=[f"gmail_{msg_id}_0"])
            if existing and existing["ids"]:
                continue
                
            msg_detail = get_message(msg_id)
            headers = msg_detail.get("payload", {}).get("headers", [])
            subject = next((h["value"] for h in headers if h["name"].lower() == "subject"), "(제목 없음)")
            sender = next((h["value"] for h in headers if h["name"].lower() == "from"), "알 수 없음")
            body = parse_gmail_body(msg_detail)
            
            if not body:
                body = msg_detail.get("snippet", "")
                
            full_text = f"Subject: {subject}\nFrom: {sender}\n\n{body}"
            chunks = chunk_text(full_text)
            
            if chunks:
                embeddings = model.encode(chunks).tolist()
                ids = [f"gmail_{msg_id}_{i}" for i in range(len(chunks))]
                documents = chunks
                metadatas = [{
                    "doc_id": msg_id,
                    "source": "gmail",
                    "title": subject,
                    "sender": sender,
                    "date": datetime.now().isoformat()
                } for _ in range(len(chunks))]
                
                gmail_col.upsert(ids=ids, embeddings=embeddings, documents=documents, metadatas=metadatas)
                gmail_indexed += 1
    except Exception as e:
        logger.error(f"Gmail 인덱싱 중 오류 발생: {e}")
        
    # 2. Drive 인덱싱 (최근 30개 대상)
    drive_indexed = 0
    try:
        files, _ = list_drive_files(max_results=30)
        for f in files:
            file_id = f["id"]
            name = f["name"]
            mime_type = f["mimeType"]
            
            existing = drive_col.get(ids=[f"drive_{file_id}_0"])
            if existing and existing["ids"]:
                continue
                
            content = fetch_drive_file_content(file_id, mime_type)
            if not content:
                # 텍스트 추출이 불가능한 경우 파일명으로 대체
                content = f"파일명: {name}\n파일 형식: {mime_type}"
                
            chunks = chunk_text(content)
            if chunks:
                embeddings = model.encode(chunks).tolist()
                ids = [f"drive_{file_id}_{i}" for i in range(len(chunks))]
                documents = chunks
                metadatas = [{
                    "doc_id": file_id,
                    "source": "drive",
                    "title": name,
                    "mime_type": mime_type,
                    "date": f.get("modifiedTime", datetime.now().isoformat())
                } for _ in range(len(chunks))]
                
                drive_col.upsert(ids=ids, embeddings=embeddings, documents=documents, metadatas=metadatas)
                drive_indexed += 1
    except Exception as e:
        logger.error(f"Drive 인덱싱 중 오류 발생: {e}")
        
    return {
        "status": "success",
        "gmail_indexed": gmail_indexed,
        "drive_indexed": drive_indexed,
        "timestamp": datetime.now().isoformat()
    }

def get_index_status() -> Dict[str, Any]:
    """현재 ChromaDB 인덱스 상태 정보를 조회합니다."""
    try:
        client = get_chroma_client()
        gmail_col = client.get_or_create_collection(config.CHROMA_COLLECTION_GMAIL)
        drive_col = client.get_or_create_collection(config.CHROMA_COLLECTION_DRIVE)
        
        gmail_count = gmail_col.count()
        drive_count = drive_col.count()
        
        return {
            "status": "success",
            "gmail_chunks": gmail_count,
            "drive_chunks": drive_count,
            "total_chunks": gmail_count + drive_count
        }
    except Exception as e:
        return {"status": "error", "message": str(e)}
