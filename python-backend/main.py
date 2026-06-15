from fastapi import FastAPI, Request
from fastapi.responses import HTMLResponse
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import uvicorn
from src.gws.gmail import list_messages
from src.gws.drive import list_drive_files

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

class LLMTestRequest(BaseModel):
    endpoint: str
    model: str

@app.get("/")
def read_root():
    return {"status": "ok", "message": "Python Backend is running!"}

@app.post("/api/llm/test")
def test_llm(req: LLMTestRequest):
    """
    로컬 LLM 서버(Ollama, LM Studio 등)와의 OpenAI 호환 API 연결 상태를 검증합니다.
    """
    import httpx
    url = f"{req.endpoint.rstrip('/')}/chat/completions"
    headers = {
        "Content-Type": "application/json",
        "Authorization": "Bearer not-needed"
    }
    payload = {
        "model": req.model,
        "messages": [{"role": "user", "content": "ping"}],
        "max_tokens": 5
    }
    
    try:
        # 동기 httpx 요청으로 연결 상태 확인
        with httpx.Client(timeout=5.0) as client:
            response = client.post(url, json=payload, headers=headers)
            if response.status_code == 200:
                return {"status": "success", "message": "연결 성공"}
            else:
                return {"status": "error", "message": f"서버 응답 오류 (HTTP {response.status_code})"}
    except Exception as e:
        return {"status": "error", "message": f"연결 실패: {str(e)}"}

@app.get("/api/auth/status")
def auth_status():
    """
    현재 구글 API 로그인 상태를 반환합니다 (브라우저를 자동으로 띄우지 않음)
    """
    try:
        from src.gws.auth import is_authenticated
        authenticated = is_authenticated()
        return {"authenticated": authenticated}
    except Exception as e:
        return {"authenticated": False, "error": str(e)}

@app.post("/api/auth/login")
def auth_login():
    """
    사용자가 직접 로그인할 수 있도록 구글 인증 URL을 반환하고 백그라운드 서버를 구동합니다.
    """
    try:
        from src.gws.auth import get_auth_url_and_start_server
        url = get_auth_url_and_start_server()
        return {"status": "pending", "url": url}
    except Exception as e:
        return {"status": "error", "message": str(e)}

@app.get("/api/auth/callback", response_class=HTMLResponse)
def auth_callback(request: Request):
    """
    구글 로그인 성공 후 리디렉션되는 콜백 엔드포인트입니다.
    """
    try:
        from src.gws.auth import _active_flow
        from config import config
        import os
        
        if not _active_flow:
            return HTMLResponse(
                content="<html><body><div style='text-align:center;margin-top:100px;font-family:sans-serif;'><h1>인증 실패</h1><p>만료되었거나 유효하지 않은 세션입니다. 다시 로그인해 주세요.</p></div></body></html>",
                status_code=400
            )
            
        # oauthlib 내부 검증을 위해 http 루프백 허용
        os.environ['OAUTHLIB_INSECURE_TRANSPORT'] = '1'
        
        # 구글 콜백 응답 수신
        request_url = str(request.url)
        # oauthlib의 rfc6749 사양에 맞추기 위해 127.0.0.1 -> localhost 변환
        if "127.0.0.1" in request_url:
            request_url = request_url.replace("127.0.0.1", "localhost")
            
        _active_flow.fetch_token(authorization_response=request_url)
        creds = _active_flow.credentials
        
        # token.json 저장
        with open(config.TOKEN_PATH, 'w') as token_file:
            token_file.write(creds.to_json())
            
        # 브라우저 창 강제 종료 꼼수 삽입 (window.open hack)
        return HTMLResponse(
            content="""
            <html>
            <head>
                <meta charset="utf-8">
                <title>인증 완료</title>
                <style>
                    body { font-family: sans-serif; text-align: center; margin-top: 100px; background-color: #0f172a; color: #cbd5e1; display: flex; align-items: center; justify-content: center; min-height: 50vh; }
                    .card { background-color: #1e293b; padding: 40px; border-radius: 16px; box-shadow: 0 10px 15px -3px rgba(0,0,0,0.3); max-width: 420px; border: 1px solid #334155; }
                    h1 { color: #10b981; font-size: 24px; margin-bottom: 16px; }
                    p { font-size: 14px; color: #94a3b8; line-height: 1.6; }
                    .btn { display: inline-block; margin-top: 24px; background-color: #4f46e5; color: white; padding: 10px 24px; border-radius: 8px; text-decoration: none; font-weight: bold; font-size: 13px; border: none; cursor: pointer; transition: background-color 0.2s; }
                    .btn:hover { background-color: #4338ca; }
                </style>
            </head>
            <body>
                <div class="card">
                    <h1>인증 완료! 🎉</h1>
                    <p>Google Workspace 연동이 성공적으로 완료되었습니다. 이제 이 브라우저 창을 닫고 데스크톱 앱으로 돌아가셔도 좋습니다.</p>
                    <button class="btn" onclick="closeWindow()">창 닫기</button>
                </div>
                <script>
                    function closeWindow() {
                        // 사용자 Interaction(클릭)이나 우회 꼼수를 복합적으로 활용하여 창 닫기 시도
                        var win = window.open('', '_self', '');
                        win.close();
                        window.close();
                    }
                    
                    // 1.5초 후 자동 닫기 시도 (차단 시 사용자가 수동 버튼을 클릭해 닫을 수 있음)
                    setTimeout(closeWindow, 1500);
                </script>
            </body>
            </html>
            """
        )
    except Exception as e:
        import traceback
        from config import config
        error_log_path = os.path.join(os.path.dirname(config.TOKEN_PATH), "auth_error.log")
        with open(error_log_path, "w", encoding="utf-8") as f:
            f.write(f"콜백 에러 메시지: {str(e)}\n")
            f.write(traceback.format_exc())
        return HTMLResponse(
            content=f"<html><body><div style='text-align:center;margin-top:100px;font-family:sans-serif;'><h1>인증 오류 발생</h1><p>{str(e)}</p><p>자세한 로그는 auth_error.log를 확인하세요.</p></div></body></html>",
            status_code=500
        )

@app.post("/api/sync/gmail")
def sync_gmail(req: SyncRequest):
    """
    Gmail 목록을 가져오고 본문 요약을 동기화합니다.
    """
    try:
        # 속도를 위해 테스트 시에는 최근 10개만 상세 내역을 가져옵니다.
        raw_messages, next_token = list_messages(max_results=min(req.max_emails, 10))
        
        from src.gws.gmail import get_message
        detailed_messages = []
        for msg in raw_messages:
            try:
                m_details = get_message(msg['id'])
                headers = m_details.get('payload', {}).get('headers', [])
                subject = next((h['value'] for h in headers if h['name'].lower() == 'subject'), '(제목 없음)')
                sender = next((h['value'] for h in headers if h['name'].lower() == 'from'), '알 수 없음')
                snippet = m_details.get('snippet', '')
                detailed_messages.append({
                    "id": msg['id'],
                    "subject": subject,
                    "from": sender,
                    "snippet": snippet
                })
            except Exception as e:
                print(f"[Gmail] 개별 메일 상세 로드 에러: {e}")
                
        return {
            "status": "success", 
            "count": len(detailed_messages), 
            "messages": detailed_messages,
            "has_more": next_token is not None
        }
    except Exception as e:
        return {"status": "error", "message": str(e)}

@app.post("/api/sync/drive")
def sync_drive(req: SyncRequest):
    """
    Google Drive 파일 목록을 가져옵니다.
    """
    try:
        files, next_token = list_drive_files(max_results=min(req.max_emails, 15))
        return {
            "status": "success",
            "count": len(files),
            "files": files,
            "has_more": next_token is not None
        }
    except Exception as e:
        return {"status": "error", "message": str(e)}

# --- Local LLM Manager APIs ---
from src.llm import manager as llm_manager

@app.get("/api/llm/presets")
def get_presets():
    return {"presets": llm_manager.get_preset_models(), "recommended": llm_manager.get_recommended_model_id()}

@app.get("/api/llm/local_models")
def get_local_models():
    return {"models": llm_manager.get_local_models()}

class LLMDownloadRequest(BaseModel):
    preset_id: str

@app.post("/api/llm/download")
def download_model(req: LLMDownloadRequest):
    try:
        llm_manager.download_model_background(req.preset_id)
        return {"status": "success", "message": "다운로드가 시작되었습니다."}
    except Exception as e:
        return {"status": "error", "message": str(e)}

@app.get("/api/llm/download/progress/{preset_id}")
def download_progress(preset_id: str):
    status = llm_manager.get_download_status(preset_id)
    if status:
        return status
    return {"status": "not_found", "progress": 0.0}

class LLMDeleteRequest(BaseModel):
    filename: str

@app.post("/api/llm/delete")
def delete_model(req: LLMDeleteRequest):
    if llm_manager.delete_local_model(req.filename):
        return {"status": "success"}
    return {"status": "error", "message": "삭제 실패"}

class LLMChatRequest(BaseModel):
    model_filename: str
    messages: list
    max_tokens: int = 512
    temperature: float = 0.7

@app.post("/api/llm/chat/local")
def chat_local(req: LLMChatRequest):
    """내장 llama.cpp 엔진을 이용해 채팅 응답을 생성합니다."""
    from src.llm import inference as llm_inference
    res = llm_inference.chat_completion(
        req.model_filename, 
        req.messages, 
        req.max_tokens, 
        req.temperature
    )
    if "error" in res:
        from fastapi import HTTPException
        raise HTTPException(status_code=500, detail=res["error"])
    return res

if __name__ == "__main__":
    # Tauri 사이드카로 실행될 때를 고려하여 기본 포트를 지정
    uvicorn.run(app, host="127.0.0.1", port=8000)

