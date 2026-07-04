from fastapi import APIRouter

from src.api.routers.llm_sync import SyncRequest
from src.gws.drive import get_drive_file_original, list_drive_files
from src.gws.gmail import get_gmail_message_original, list_message_metadata

router = APIRouter(prefix="/api/gws/originals")


@router.get("/gmail/{message_id}")
def get_gws_gmail_original(message_id: str):
    """선택한 Gmail 원본의 전체 본문을 반환합니다."""
    try:
        return {"status": "success", "original": get_gmail_message_original(message_id)}
    except Exception as e:
        return {"status": "error", "message": str(e)}


@router.get("/drive/{file_id}")
def get_gws_drive_original(file_id: str, mime_type: str = "", resource_key: str = ""):
    """선택한 Drive 원본의 표시 가능한 전체 내용을 반환합니다."""
    try:
        return {"status": "success", "original": get_drive_file_original(file_id, mime_type, resource_key)}
    except Exception as e:
        return {"status": "error", "message": str(e)}


@router.post("/search")
def search_gws_originals(req: SyncRequest):
    """Gmail/Drive 원본 목록을 한 번에 검색합니다. 벡터 인덱싱은 수행하지 않습니다."""
    try:
        max_results = req.max_emails or 50
        messages, gmail_next_token = list_message_metadata(
            max_results=max_results,
            query=req.query,
            label_ids=req.label_ids,
        )
        files, drive_next_token = list_drive_files(max_results=max_results, query=req.query)
        return {
            "status": "success",
            "count": len(messages) + len(files),
            "gmail_count": len(messages),
            "drive_count": len(files),
            "messages": messages,
            "files": files,
            "has_more": gmail_next_token is not None or drive_next_token is not None,
        }
    except Exception as e:
        return {"status": "error", "message": str(e)}
