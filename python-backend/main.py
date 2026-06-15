from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import uvicorn
from src.gws.gmail import list_messages

app = FastAPI(title="Local LLM GWS API", description="Python Backend API for Tauri")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

class SyncRequest(BaseModel):
    max_emails: int = 100

@app.get("/")
def read_root():
    return {"status": "ok", "message": "Python Backend is running!"}

@app.get("/api/auth/status")
def auth_status():
    """
    현재 구글 API 로그인 상태를 반환합니다 (뼈대)
    """
    try:
        from src.gws.auth import get_credentials
        creds = get_credentials()
        return {"authenticated": creds.valid}
    except Exception as e:
        return {"authenticated": False, "error": str(e)}

@app.post("/api/sync/gmail")
def sync_gmail(req: SyncRequest):
    """
    Gmail 목록을 가져오는 테스트 엔드포인트
    """
    try:
        messages, next_token = list_messages(max_results=req.max_emails)
        return {
            "status": "success", 
            "count": len(messages), 
            "has_more": next_token is not None
        }
    except Exception as e:
        return {"status": "error", "message": str(e)}

if __name__ == "__main__":
    # Tauri 사이드카로 실행될 때를 고려하여 기본 포트를 지정
    uvicorn.run(app, host="127.0.0.1", port=8000)
