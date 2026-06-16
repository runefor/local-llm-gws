from fastapi import FastAPI, Request
from fastapi.responses import HTMLResponse
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import Optional
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
    max_emails: Optional[int] = None
    query: Optional[str] = None

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
        raw_messages, next_token = list_messages(max_results=req.max_emails, query=req.query)

        from src.gws.gmail import get_message
        import datetime
        detailed_messages = []
        for msg in raw_messages:
            try:
                m_details = get_message(msg['id'])
                headers = m_details.get('payload', {}).get('headers', [])
                subject = next((h['value'] for h in headers if h['name'].lower() == 'subject'), '(제목 없음)')
                sender = next((h['value'] for h in headers if h['name'].lower() == 'from'), '알 수 없음')
                snippet = m_details.get('snippet', '')
                
                internal_date_ms = int(m_details.get('internalDate', 0))
                if internal_date_ms:
                    date_iso = datetime.datetime.fromtimestamp(internal_date_ms / 1000.0, tz=datetime.timezone.utc).isoformat().replace("+00:00", "Z")
                else:
                    date_iso = datetime.datetime.now(datetime.timezone.utc).isoformat().replace("+00:00", "Z")
                
                detailed_messages.append({
                    "id": msg['id'],
                    "subject": subject,
                    "from": sender,
                    "snippet": snippet,
                    "date": date_iso
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
        files, next_token = list_drive_files(max_results=req.max_emails or 100, query=req.query)
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


class LLMConfigResponse(BaseModel):
    endpoint: str
    model: str
    mode: str

class LLMConfigRequest(BaseModel):
    endpoint: str
    model: str
    mode: str

@app.get("/api/llm/config", response_model=LLMConfigResponse)
def get_llm_config_route():
    """현재 백엔드에 설정된 로컬 LLM 환경 설정을 반환합니다."""
    from config import config
    if config.LLM_SERVE_MODE == "llamacpp":
        current_endpoint = f"http://{config.LLAMACPP_HOST}:{config.LLAMACPP_PORT}/v1"
    elif config.LLM_SERVE_MODE == "ollama":
        current_endpoint = config.OLLAMA_BASE
    else:
        current_endpoint = config.LLM_API_BASE
        
    return {
        "endpoint": current_endpoint,
        "model": config.LLM_MODEL,
        "mode": config.LLM_SERVE_MODE
    }

@app.post("/api/llm/config")
def update_llm_config_route(req: LLMConfigRequest):
    """백엔드의 로컬 LLM 환경 설정을 실시간으로 갱신합니다."""
    try:
        from config import config
        config.LLM_SERVE_MODE = req.mode
        config.LLM_MODEL = req.model
        config.LLM_API_BASE = req.endpoint
        
        if req.mode == "ollama":
            config.OLLAMA_BASE = req.endpoint
            
        return {"status": "success", "message": "LLM 설정이 정상적으로 업데이트되었습니다."}
    except Exception as e:
        return {"status": "error", "message": str(e)}


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


# -----------------------------------------------------------------------
# 지식 파이프라인 및 서비스 연동 설정 API
# -----------------------------------------------------------------------

class SettingsUpdateRequest(BaseModel):
    obsidian_vault_path: str = ""
    notion_api_key: str = ""
    notion_page_id: str = ""

class PipelineRunRequest(BaseModel):
    query: str
    top_k: int = 8

class ObsidianExportRequest(BaseModel):
    title: str
    content: str
    tags: list = []

class NotionExportRequest(BaseModel):
    title: str
    content: str

@app.get("/api/settings")
def get_settings():
    """Obsidian 및 Notion 연동 설정을 가져옵니다."""
    try:
        from src.settings import load_settings
        return load_settings()
    except Exception as e:
        return {"status": "error", "message": str(e)}

@app.post("/api/settings")
def update_settings(req: SettingsUpdateRequest):
    """Obsidian 및 Notion 연동 설정을 저장합니다."""
    try:
        from src.settings import save_settings
        success = save_settings(req.model_dump())
        if success:
            return {"status": "success", "message": "설정이 저장되었습니다."}
        return {"status": "error", "message": "설정 저장 실패"}
    except Exception as e:
        return {"status": "error", "message": str(e)}

@app.post("/api/pipeline/run")
def pipeline_run(req: PipelineRunRequest):
    """RAG와 로컬 LLM을 엮은 지식 수집 및 요약 파이프라인을 실행합니다."""
    try:
        from src.processor.pipeline import run_pipeline
        return run_pipeline(req.query, req.top_k)
    except Exception as e:
        return {"status": "error", "message": str(e)}

@app.post("/api/export/obsidian")
def export_obsidian(req: ObsidianExportRequest):
    """정리된 내용을 Obsidian Vault에 마크다운 파일로 생성합니다."""
    try:
        from src.settings import load_settings
        from src.sink.obsidian import export_to_obsidian
        settings = load_settings()
        vault_path = settings.get("obsidian_vault_path", "")
        if not vault_path:
            return {"status": "error", "message": "Obsidian Vault 경로가 설정되지 않았습니다. 설정 탭에서 입력해 주세요."}
        return export_to_obsidian(vault_path, req.title, req.content, req.tags)
    except Exception as e:
        return {"status": "error", "message": str(e)}

@app.post("/api/export/notion")
def export_notion(req: NotionExportRequest):
    """정리된 내용을 Notion 페이지의 하위 블록으로 내보냅니다."""
    try:
        from src.settings import load_settings
        from src.sink.notion import export_to_notion
        settings = load_settings()
        api_key = settings.get("notion_api_key", "")
        page_id = settings.get("notion_page_id", "")
        if not api_key or not page_id:
            return {"status": "error", "message": "Notion API Key 또는 Page ID가 설정되지 않았습니다. 설정 탭에서 입력해 주세요."}
        return export_to_notion(api_key, page_id, req.title, req.content)
    except Exception as e:
        return {"status": "error", "message": str(e)}

@app.post("/api/utils/select_directory")
def select_directory():
    """Tkinter를 활용하여 로컬 폴더 선택창을 표시하고 선택된 경로를 반환합니다."""
    try:
        import tkinter as tk
        from tkinter import filedialog
        
        root = tk.Tk()
        root.withdraw()  # 빈 tkinter 메인 윈도우 감춤
        root.wm_attributes('-topmost', 1)  # 선택창을 가장 화면 앞으로 띄움
        
        directory = filedialog.askdirectory(title="Obsidian Vault 폴더 선택")
        root.destroy()
        
        if directory:
            return {"status": "success", "directory": directory}
        return {"status": "cancelled"}
    except Exception as e:
        return {"status": "error", "message": f"폴더 선택창을 열지 못했습니다: {str(e)}. 직접 경로를 입력해 주세요."}

# -----------------------------------------------------------------------
# Notion OAuth 연동 API
# -----------------------------------------------------------------------

@app.get("/api/auth/notion/url")
def get_notion_auth_url():
    """노션 OAuth 인증 주소를 반환합니다."""
    from config import config
    client_id = config.NOTION_CLIENT_ID
    redirect_uri = config.NOTION_REDIRECT_URI
    if not client_id:
        return {"status": "error", "message": "NOTION_CLIENT_ID가 설정되지 않았습니다. 백엔드 .env 파일을 확인해 주세요."}
    
    url = f"https://api.notion.com/v1/oauth/authorize?client_id={client_id}&response_type=code&owner=user&redirect_uri={redirect_uri}"
    return {"status": "success", "url": url}

@app.get("/api/auth/notion/callback", response_class=HTMLResponse)
def notion_auth_callback(code: Optional[str] = None, error: Optional[str] = None):
    """노션 OAuth 인증 완료 후 호출되는 콜백입니다."""
    if error:
        return HTMLResponse(
            content=f"<html><body><div style='text-align:center;margin-top:100px;font-family:sans-serif;'><h1>인증 에러</h1><p>{error}</p></div></body></html>",
            status_code=400
        )
    if not code:
        return HTMLResponse(
            content="<html><body><div style='text-align:center;margin-top:100px;font-family:sans-serif;'><h1>인증 실패</h1><p>code 파라미터가 누락되었습니다.</p></div></body></html>",
            status_code=400
        )
    
    import base64
    import httpx
    from config import config
    from src.settings import load_settings, save_settings
    
    client_id = config.NOTION_CLIENT_ID
    client_secret = config.NOTION_CLIENT_SECRET
    redirect_uri = config.NOTION_REDIRECT_URI
    
    if not client_id or not client_secret:
        return HTMLResponse(
            content="<html><body><div style='text-align:center;margin-top:100px;font-family:sans-serif;'><h1>서버 설정 에러</h1><p>Notion Client ID 또는 Client Secret 설정이 누락되었습니다.</p></div></body></html>",
            status_code=500
        )
        
    token_url = "https://api.notion.com/v1/oauth/token"
    auth_header = base64.b64encode(f"{client_id}:{client_secret}".encode()).decode()
    headers = {
        "Authorization": f"Basic {auth_header}",
        "Content-Type": "application/json",
        "Notion-Version": "2022-06-28"
    }
    payload = {
        "grant_type": "authorization_code",
        "code": code,
        "redirect_uri": redirect_uri
    }
    
    try:
        resp = httpx.post(token_url, json=payload, headers=headers, timeout=10.0)
        if resp.status_code != 200:
            return HTMLResponse(
                content=f"<html><body><div style='text-align:center;margin-top:100px;font-family:sans-serif;'><h1>토큰 발급 실패</h1><p>{resp.text}</p></div></body></html>",
                status_code=400
            )
            
        data = resp.json()
        access_token = data.get("access_token")
        
        settings = load_settings()
        settings["notion_api_key"] = access_token
        save_settings(settings)
        
        return HTMLResponse(
            content="""
            <html>
            <head>
                <meta charset="utf-8">
                <title>Notion 인증 완료</title>
                <style>
                    body { font-family: sans-serif; text-align: center; margin-top: 100px; background-color: #0f172a; color: #cbd5e1; display: flex; align-items: center; justify-content: center; min-height: 50vh; }
                    .card { background-color: #1e293b; padding: 40px; border-radius: 16px; box-shadow: 0 10px 15px -3px rgba(0,0,0,0.3); max-width: 420px; border: 1px solid #334155; }
                    h1 { color: #f59e0b; font-size: 24px; margin-bottom: 16px; }
                    p { font-size: 14px; color: #94a3b8; line-height: 1.6; }
                    .btn { display: inline-block; margin-top: 24px; background-color: #4f46e5; color: white; padding: 10px 24px; border-radius: 8px; text-decoration: none; font-weight: bold; font-size: 13px; border: none; cursor: pointer; transition: background-color 0.2s; }
                    .btn:hover { background-color: #4338ca; }
                </style>
            </head>
            <body>
                <div class="card">
                    <h1>Notion 인증 완료! 🚀</h1>
                    <p>Notion 연동이 성공적으로 완료되었습니다. 이제 이 브라우저 창을 닫고 데스크톱 앱으로 돌아가셔도 좋습니다.</p>
                    <button class="btn" onclick="window.close()">창 닫기</button>
                </div>
            </body>
            </html>
            """
        )
    except Exception as e:
        return HTMLResponse(
            content=f"<html><body><div style='text-align:center;margin-top:100px;font-family:sans-serif;'><h1>오류 발생</h1><p>{str(e)}</p></div></body></html>",
            status_code=500
        )

@app.get("/api/notion/pages")
def list_notion_pages():
    """Notion Search API를 호출하여 현재 연동된 페이지 리스트를 가져옵니다."""
    try:
        import httpx
        from src.settings import load_settings
        settings = load_settings()
        api_key = settings.get("notion_api_key", "")
        
        if not api_key:
            return {"status": "success", "pages": []}
            
        url = "https://api.notion.com/v1/search"
        headers = {
            "Authorization": f"Bearer {api_key}",
            "Notion-Version": "2022-06-28",
            "Content-Type": "application/json"
        }
        payload = {
            "filter": {
                "property": "object",
                "value": "page"
            }
        }
        
        resp = httpx.post(url, json=payload, headers=headers, timeout=10.0)
        if resp.status_code != 200:
            # 토큰 유효성이 다했거나 오류가 나면 빈 목록 반환
            return {"status": "success", "pages": []}
            
        data = resp.json()
        results = data.get("results", [])
        
        pages = []
        for p in results:
            page_id = p.get("id")
            url_str = p.get("url")
            title = "(제목 없음)"
            
            properties = p.get("properties", {})
            for prop_name, prop_val in properties.items():
                if prop_val.get("type") == "title":
                    title_list = prop_val.get("title", [])
                    if title_list:
                        title = title_list[0].get("plain_text", "(제목 없음)")
                        break
            
            pages.append({
                "id": page_id,
                "title": title,
                "url": url_str
            })
            
        return {"status": "success", "pages": pages}
    except Exception as e:
        return {"status": "error", "message": str(e)}




if __name__ == "__main__":
    uvicorn.run(app, host="127.0.0.1", port=18000)

