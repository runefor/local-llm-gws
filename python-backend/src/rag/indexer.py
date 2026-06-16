import base64
import hashlib
import logging
from datetime import datetime
from typing import Dict, List, Any, Optional
import chromadb
from sentence_transformers import SentenceTransformer
from markdownify import markdownify as md
import os
import re
import pickle
from rank_bm25 import BM25Okapi
from urllib.parse import quote

from config import config
from src.gws.auth import is_authenticated
from src.gws.gmail import list_messages, get_message
from src.gws.drive import list_drive_files

logger = logging.getLogger(__name__)

VALID_RAG_SOURCES = {"gmail", "drive"}

def normalize_sources(sources: Optional[List[str]] = None) -> List[str]:
    if sources is None:
        return ["gmail", "drive"]
    normalized = []
    for source in sources:
        value = str(source).strip().lower()
        if value in VALID_RAG_SOURCES and value not in normalized:
            normalized.append(value)
    if not normalized:
        raise ValueError("최소 하나 이상의 검색 재료를 선택해 주세요. 사용 가능: gmail, drive")
    return normalized

# 임베딩 모델 캐싱
_embedding_model = None

def get_embedding_model():
    global _embedding_model
    if _embedding_model is None:
        logger.info("SentenceTransformer 모델 로드 중...")
        _embedding_model = SentenceTransformer("intfloat/multilingual-e5-small")
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

def _gmail_search_url(message_id_header: str) -> str:
    if not message_id_header:
        return ""
    normalized = message_id_header.strip().strip("<>")
    return f"https://mail.google.com/mail/u/0/#search/rfc822msgid%3A{quote(normalized)}"

def _content_hash(text: str) -> str:
    return hashlib.sha256(text.encode("utf-8", errors="ignore")).hexdigest()

def _existing_ids_for_doc(collection, doc_id: str) -> List[str]:
    existing = collection.get(where={"doc_id": doc_id}, include=[])
    if not existing:
        return []
    return list(existing.get("ids") or [])

def _replace_doc_chunks(collection, doc_id: str, ids: List[str], embeddings: List[Any], documents: List[str], metadatas: List[Dict[str, Any]]) -> None:
    existing_ids = _existing_ids_for_doc(collection, doc_id)
    if existing_ids:
        collection.delete(ids=existing_ids)
    collection.upsert(ids=ids, embeddings=embeddings, documents=documents, metadatas=metadatas)

def _delete_doc_chunks(collection, doc_id: str) -> None:
    existing_ids = _existing_ids_for_doc(collection, doc_id)
    if existing_ids:
        collection.delete(ids=existing_ids)

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

def tokenize_text(text: str) -> List[str]:
    """한국어, 일본어, 영어 혼합 환경을 지원하는 CJK 대응 토큰화기"""
    if not text:
        return []
    text = text.lower()
    # 단어 단위 토큰 추출 (영어, 숫자, 한글, 일어, 한자 등)
    words = re.findall(r'[a-zA-Z0-9가-힣ぁ-んァ-ヶ亜-熙\u4e00-\u9fff]+', text)
    tokens = list(words)
    for w in words:
        is_cjk = False
        for c in w:
            o = ord(c)
            if (0xac00 <= o <= 0xd7a3) or (0x3040 <= o <= 0x30ff) or (0x4e00 <= o <= 0x9fff):
                is_cjk = True
                break
        if is_cjk:
            # Bi-gram 생성
            for i in range(len(w) - 1):
                tokens.append(w[i:i+2])
            # Uni-gram 생성
            for c in w:
                tokens.append(c)
    return tokens

def rebuild_bm25_index() -> Dict[str, Any]:
    """ChromaDB의 전체 문서를 읽어 BM25 인덱스를 생성하고 파일로 저장합니다."""
    logger.info("BM25 인덱스 생성 시작...")
    client = get_chroma_client()
    gmail_col = client.get_or_create_collection(config.CHROMA_COLLECTION_GMAIL)
    drive_col = client.get_or_create_collection(config.CHROMA_COLLECTION_DRIVE)
    
    # ChromaDB에서 모든 문서 가져오기 (충분히 큰 한계값 설정)
    gmail_data = gmail_col.get(limit=10000, include=["documents", "metadatas"])
    drive_data = drive_col.get(limit=10000, include=["documents", "metadatas"])
    
    corpus_chunks = []
    
    # Gmail 데이터 파싱
    if gmail_data and gmail_data["ids"]:
        for i in range(len(gmail_data["ids"])):
            corpus_chunks.append({
                "id": gmail_data["ids"][i],
                "content": gmail_data["documents"][i],
                "metadata": gmail_data["metadatas"][i],
                "source": "gmail"
            })
            
    # Drive 데이터 파싱
    if drive_data and drive_data["ids"]:
        for i in range(len(drive_data["ids"])):
            corpus_chunks.append({
                "id": drive_data["ids"][i],
                "content": drive_data["documents"][i],
                "metadata": drive_data["metadatas"][i],
                "source": "drive"
            })
            
    if not corpus_chunks:
        logger.warning("BM25 인덱싱할 문서가 없습니다.")
        bm25_path = config.DATA_DIR / "bm25_index.pkl"
        if bm25_path.exists():
            try:
                os.remove(bm25_path)
            except Exception:
                pass
        return {"status": "success", "message": "No documents to index"}
        
    # 토큰화 진행
    tokenized_corpus = [tokenize_text(chunk["content"]) for chunk in corpus_chunks]
    
    # BM25 모델 학습
    bm25 = BM25Okapi(tokenized_corpus)
    
    # 저장 데이터 패킹
    index_data = {
        "bm25": bm25,
        "chunks": corpus_chunks,
        "timestamp": datetime.now().isoformat()
    }
    
    bm25_path = config.DATA_DIR / "bm25_index.pkl"
    with open(bm25_path, "wb") as f:
        pickle.dump(index_data, f)
        
    logger.info(f"BM25 인덱스 생성 완료 및 저장 성공: {bm25_path} (총 {len(corpus_chunks)}개 청크)")
    return {"status": "success", "chunks_count": len(corpus_chunks)}

def index_gmail_raw(msg_details: List[Dict[str, Any]]) -> int:
    """주어진 Gmail 상세 메시지 리스트를 ChromaDB에 인덱싱합니다."""
    client = get_chroma_client()
    model = get_embedding_model()
    gmail_col = client.get_or_create_collection(config.CHROMA_COLLECTION_GMAIL)
    
    gmail_indexed = 0
    for msg_detail in msg_details:
        msg_id = msg_detail["id"]
        
        headers = msg_detail.get("payload", {}).get("headers", [])
        subject = next((h["value"] for h in headers if h["name"].lower() == "subject"), "(제목 없음)")
        sender = next((h["value"] for h in headers if h["name"].lower() == "from"), "알 수 없음")
        message_id_header = next((h["value"] for h in headers if h["name"].lower() == "message-id"), "")
        rfc822msgid = message_id_header.strip().strip("<>")
        internal_date_ms = int(msg_detail.get("internalDate", 0) or 0)
        if internal_date_ms:
            date_iso = datetime.fromtimestamp(internal_date_ms / 1000.0).isoformat()
        else:
            date_iso = datetime.now().isoformat()
        body = parse_gmail_body(msg_detail)
        
        if not body:
            body = msg_detail.get("snippet", "")
            
        full_text = f"Subject: {subject}\nFrom: {sender}\n\n{body}"
        chunks = chunk_text(full_text)
        
        if chunks:
            document_hash = _content_hash(full_text)
            # E5 모델 접두사 추가
            prefixed_chunks = [f"passage: {c}" for c in chunks]
            embeddings = model.encode(prefixed_chunks).tolist()
            ids = [f"gmail_{msg_id}_{i}" for i in range(len(chunks))]
            documents = chunks
            metadatas = [{
                "doc_id": msg_id,
                "provider_item_id": msg_id,
                "thread_id": msg_detail.get("threadId", ""),
                "source": "gmail",
                "title": subject,
                "sender": sender,
                "date": date_iso,
                "internal_date": date_iso,
                "message_id": msg_id,
                "rfc822msgid": rfc822msgid,
                "original_url": _gmail_search_url(message_id_header),
                "location_label": f"Gmail: {subject}",
                "chunk_index": i,
                "content_hash": _content_hash(chunks[i]),
                "document_hash": document_hash,
            } for i in range(len(chunks))]
            
            _replace_doc_chunks(gmail_col, msg_id, ids, embeddings, documents, metadatas)
            gmail_indexed += 1
            
    return gmail_indexed

def index_drive_raw(files: List[Dict[str, Any]]) -> int:
    """주어진 Google Drive 파일 리스트를 다운로드 및 ChromaDB에 인덱싱합니다."""
    client = get_chroma_client()
    model = get_embedding_model()
    drive_col = client.get_or_create_collection(config.CHROMA_COLLECTION_DRIVE)
    
    drive_indexed = 0
    for f in files:
        file_id = f["id"]
        name = f["name"]
        mime_type = f["mimeType"]
        
        content = fetch_drive_file_content(file_id, mime_type)
        if not content:
            _delete_doc_chunks(drive_col, file_id)
            logger.warning("Drive 파일 텍스트 추출 실패로 RAG 인덱싱 제외: %s (%s)", name, mime_type)
            continue
            
        chunks = chunk_text(content)
        if chunks:
            document_hash = _content_hash(content)
            # E5 모델 접두사 추가
            prefixed_chunks = [f"passage: {c}" for c in chunks]
            embeddings = model.encode(prefixed_chunks).tolist()
            ids = [f"drive_{file_id}_{i}" for i in range(len(chunks))]
            documents = chunks
            metadatas = [{
                "doc_id": file_id,
                "provider_item_id": file_id,
                "source": "drive",
                "title": name,
                "mime_type": mime_type,
                "date": f.get("modifiedTime", datetime.now().isoformat()),
                "webViewLink": f.get("webViewLink", ""),
                "resourceKey": f.get("resourceKey", ""),
                "original_url": f.get("webViewLink", ""),
                "file_id": file_id,
                "location_label": f"Drive: {name} · chunk {i + 1}",
                "chunk_index": i,
                "content_hash": _content_hash(chunks[i]),
                "document_hash": document_hash,
            } for i in range(len(chunks))]
            
            _replace_doc_chunks(drive_col, file_id, ids, embeddings, documents, metadatas)
            drive_indexed += 1
            
    return drive_indexed

def index_all(sources: Optional[List[str]] = None) -> Dict[str, Any]:
    """Gmail 및 Google Drive 최신 데이터를 동기화하여 ChromaDB에 인덱싱합니다."""
    if not is_authenticated():
        return {"status": "error", "message": "Google Workspace 인증이 필요합니다."}
    selected_sources = normalize_sources(sources)
        
    logger.info("ChromaDB 인덱싱 시작...")
    
    # 1. Gmail 인덱싱 (최근 50개 대상)
    gmail_indexed = 0
    if "gmail" in selected_sources:
        try:
            messages, _ = list_messages(max_results=50)
            msg_details = []
            for msg in messages:
                msg_details.append(get_message(msg["id"]))
            gmail_indexed = index_gmail_raw(msg_details)
        except Exception as e:
            logger.error(f"Gmail 인덱싱 중 오류 발생: {e}")
        
    # 2. Drive 인덱싱 (최근 30개 대상)
    drive_indexed = 0
    if "drive" in selected_sources:
        try:
            files, _ = list_drive_files(max_results=30)
            drive_indexed = index_drive_raw(files)
        except Exception as e:
            logger.error(f"Drive 인덱싱 중 오류 발생: {e}")
        
    # BM25 인덱스 자동 갱신
    try:
        rebuild_bm25_index()
    except Exception as e:
        logger.error(f"BM25 인덱스 자동 재생성 오류: {e}")
        
    return {
        "status": "success",
        "gmail_indexed": gmail_indexed,
        "drive_indexed": drive_indexed,
        "sources": selected_sources,
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
