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
    """로컬 LLM 서버(llama.cpp, Ollama 등)와의 OpenAI 호환 API 연결 상태를 검증합니다."""
    from src.llm.inference import test_connection
    return test_connection(endpoint=req.endpoint, model=req.model or None)

@app.get("/api/auth/status")
def auth_status():
    """현재 구글 API 로그인 상태를 반환합니다 (브라우저를 자동으로 띄우지 않음)"""
    try:
        from src.gws.auth import is_authenticated
        authenticated = is_authenticated()
        return {"authenticated": authenticated}
    except Exception as e:
        return {"authenticated": False, "error": str(e)}

@app.post("/api/auth/login")
def auth_login():
    """사용자가 직접 로그인할 수 있도록 구글 인증 URL을 반환하고 백그라운드 서버를 구동합니다."""
    try:
        from src.gws.auth import get_auth_url_and_start_server
        url = get_auth_url_and_start_server()
        return {"status": "pending", "url": url}
    except Exception as e:
        return {"status": "error", "message": str(e)}

@app.get("/api/auth/callback", response_class=HTMLResponse)
def auth_callback(request: Request):
    """구글 로그인 성공 후 리디렉션되는 콜백 엔드포인트입니다."""
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
                        var win = window.open('', '_self', '');
                        win.close();
                        window.close();
                    }
                    setTimeout(closeWindow, 1500);
                </script>
            </body>
            </html>
            """
        )
    except Exception as e:
        import traceback, os
        from config import config
        error_log_path = os.path.join(os.path.dirname(config.TOKEN_PATH), "auth_error.log")
        with open(error_log_path, "w", encoding="utf-8") as f:
            f.write(f"콜백 에러 메시지: {str(e)}\n")
            f.write(traceback.format_exc())
        return HTMLResponse(
            content=f"<html><body><div style='text-align:center;margin-top:100px;font-family:sans-serif;'><h1>인증 오류 발생</h1><p>{str(e)}</p></div></body></html>",
            status_code=500
        )

@app.post("/api/sync/gmail")
def sync_gmail(req: SyncRequest):
    """Gmail 목록을 가져오고 본문 요약을 동기화합니다."""
    try:
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
    """Google Drive 파일 목록을 가져옵니다."""
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


# -----------------------------------------------------------------------
# LLM 관리 API
# -----------------------------------------------------------------------
from src.llm import manager as llm_manager

@app.get("/api/llm/hardware")
def get_hardware():
    """현재 시스템 하드웨어 프로파일을 반환합니다."""
    hw = llm_manager.get_hardware_profile()
    return hw.model_dump()

@app.get("/api/llm/presets")
def get_presets():
    return {
        "presets": llm_manager.get_preset_models(),
        "recommended": llm_manager.get_recommended_model_id(),
    }

@app.get("/api/llm/local_models")
def get_local_models():
    return {"models": llm_manager.get_local_models()}

@app.get("/api/llm/detect")
def detect_local_llms():
    """실행 중인 로컬 LLM 서버(Ollama, LM Studio 등)를 감지합니다."""
    from src.llm import detector
    return {"status": "success", "servers": detector.detect_servers()}


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


# -----------------------------------------------------------------------
# llama.cpp 서버 관리 API
# -----------------------------------------------------------------------
from src.llm import server as llm_server

class ServerStartRequest(BaseModel):
    model_filename: str

@app.post("/api/llm/server/start")
def start_llm_server(req: ServerStartRequest):
    """llama.cpp 서버를 기동합니다."""
    return llm_server.start_server(req.model_filename)

@app.post("/api/llm/server/stop")
def stop_llm_server():
    """llama.cpp 서버를 종료합니다."""
    return llm_server.stop_server()

@app.get("/api/llm/server/status")
def llm_server_status():
    """llama.cpp 서버의 현재 상태를 반환합니다."""
    return llm_server.get_server_status()


# -----------------------------------------------------------------------
# RAG 파이프라인 API (Phase 2에서 구현체 채워짐)
# -----------------------------------------------------------------------

@app.post("/api/rag/index")
def rag_index():
    """동기화된 Gmail/Drive 데이터를 ChromaDB에 인덱싱합니다."""
    try:
        from src.rag.indexer import index_all
        result = index_all()
        return result
    except Exception as e:
        return {"status": "error", "message": str(e)}

@app.get("/api/rag/status")
def rag_status():
    """RAG 인덱스 상태(문서 수, 마지막 인덱싱 시각)를 반환합니다."""
    try:
        from src.rag.indexer import get_index_status
        return get_index_status()
    except Exception as e:
        return {"status": "error", "message": str(e)}

class RagSearchRequest(BaseModel):
    query: str
    top_k: int = 5

@app.post("/api/rag/search")
def rag_search(req: RagSearchRequest):
    """ChromaDB 벡터 검색 후 LLM 요약 응답을 반환합니다."""
    try:
        from src.rag.retriever import search_and_summarize
        return search_and_summarize(req.query, req.top_k)
    except Exception as e:
        return {"status": "error", "message": str(e)}


# -----------------------------------------------------------------------
# 에이전트 API (Phase 4에서 구현체 채워짐)
# -----------------------------------------------------------------------

class AgentRunRequest(BaseModel):
    query: str
    max_turns: int = 15

@app.post("/api/agent/run")
async def agent_run(req: AgentRunRequest):
    """하네스 에이전트를 실행하고 최종 결과를 반환합니다."""
    try:
        from src.harness.agent_loop import run_agent
        result = await run_agent(req.query, req.max_turns)
        return result
    except Exception as e:
        return {"status": "error", "message": str(e)}

@app.get("/api/agent/run/stream")
async def agent_run_stream(query: str, max_turns: int = 15):
    """하네스 에이전트를 실행하며 각 턴의 상태와 생각을 SSE 스트리밍으로 전달합니다."""
    from sse_starlette.sse import EventSourceResponse
    from src.harness.agent_loop import run_agent_generator
    
    if not query:
        return {"status": "error", "message": "query 파라미터가 필요합니다."}
        
    return EventSourceResponse(run_agent_generator(query, max_turns))



if __name__ == "__main__":
    uvicorn.run(app, host="127.0.0.1", port=8000)

