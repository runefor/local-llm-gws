from fastapi import APIRouter

from src.gws.drive import get_drive_file_original
from src.gws.gmail import get_gmail_message_original

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
