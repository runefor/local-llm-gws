from typing import Optional

from fastapi import APIRouter
from fastapi.responses import JSONResponse, StreamingResponse
from pydantic import BaseModel, Field

from src.chat_sessions import ChatGroundingOptions

router = APIRouter()

class ChatSessionCreateRequest(BaseModel):
    title: str = Field(default="", max_length=120)
    options: ChatGroundingOptions = Field(default_factory=ChatGroundingOptions)


class ChatMessageRequest(BaseModel):
    message: str = Field(min_length=1, max_length=12000)
    options: Optional[ChatGroundingOptions] = None


@router.get("/api/chat/sessions")
def chat_sessions_list():
    try:
        from src.chat_sessions import list_chat_sessions

        return {"status": "success", "sessions": list_chat_sessions()}
    except Exception as e:
        return {"status": "error", "message": str(e)}


@router.post("/api/chat/sessions")
def chat_sessions_create(req: ChatSessionCreateRequest):
    try:
        from src.chat_sessions import create_chat_session

        session = create_chat_session(title=req.title, options=req.options)
        return {"status": "success", "session": session.model_dump()}
    except Exception as e:
        return {"status": "error", "message": str(e)}


@router.get("/api/chat/sessions/{session_id}")
def chat_sessions_get(session_id: str):
    try:
        from src.chat_sessions import get_chat_session

        session = get_chat_session(session_id)
        if session is None:
            return {"status": "error", "message": "채팅을 찾을 수 없습니다."}
        return {"status": "success", "session": session.model_dump()}
    except Exception as e:
        return {"status": "error", "message": str(e)}


@router.post("/api/chat/sessions/{session_id}/messages")
def chat_sessions_append_message(session_id: str, req: ChatMessageRequest):
    try:
        from src.chat_sessions import append_chat_message

        session = append_chat_message(session_id, req.message, req.options)
        if session is None:
            return {"status": "error", "message": "채팅을 찾을 수 없습니다."}
        return {"status": "success", "session": session.model_dump()}
    except Exception as e:
        return {"status": "error", "message": str(e)}


@router.post("/api/chat/sessions/{session_id}/messages/stream")
def chat_sessions_stream_message(session_id: str, req: ChatMessageRequest):
    try:
        from src.chat_sessions import stream_chat_message
        return StreamingResponse(
            stream_chat_message(session_id, req.message, req.options),
            media_type="application/x-ndjson"
        )
    except Exception as e:
        return JSONResponse({"status": "error", "message": str(e)}, status_code=500)
