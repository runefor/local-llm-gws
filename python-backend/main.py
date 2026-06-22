from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse
from fastapi.responses import HTMLResponse
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from typing import Any, Dict, List, Literal, Optional
import uvicorn
from src.gws.gmail import list_labels, list_message_metadata
from src.gws.drive import list_drive_files
from src.gws.originals import router as gws_originals_router
from src.evidence import record_relevance_feedback
from src.wiki_conditions import ConditionValidationError, WikiConditionStore
from src.wiki_condition_runner import run_condition

app = FastAPI(title="Local LLM GWS API", description="Python Backend API for Tauri")
app.include_router(gws_originals_router)

ALLOWED_ORIGINS = {
    "http://localhost:18732",
    "http://127.0.0.1:18732",
    "http://tauri.localhost",
    "https://tauri.localhost",
    "tauri://localhost",
}
ALLOWED_HOSTS = {"localhost:18731", "127.0.0.1:18731", "localhost", "127.0.0.1"}

app.add_middleware(
    CORSMiddleware,
    allow_origins=sorted(ALLOWED_ORIGINS),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.middleware("http")
async def enforce_local_app_boundary(request: Request, call_next):
    """Reject browser requests that do not originate from the local app shell."""
    host = request.headers.get("host", "")
    origin = request.headers.get("origin")

    if host not in ALLOWED_HOSTS:
        return JSONResponse({"status": "error", "message": "허용되지 않은 Host입니다."}, status_code=403)

    if origin and origin not in ALLOWED_ORIGINS:
        return JSONResponse({"status": "error", "message": "허용되지 않은 Origin입니다."}, status_code=403)

    return await call_next(request)

class SyncRequest(BaseModel):
    max_emails: Optional[int] = Field(default=50, ge=1, le=200)
    query: Optional[str] = Field(default=None, max_length=500)
    label_ids: Optional[List[str]] = Field(default=None, max_length=50)

class GmailVectorizeRequest(BaseModel):
    message_ids: List[str] = Field(default_factory=list, max_length=200)

class LLMTestRequest(BaseModel):
    endpoint: str
    model: str

class WikiConditionRequest(BaseModel):
    name: str = Field(max_length=120)
    gmailLabelIds: List[str] = Field(default_factory=list, max_length=50)
    driveFolderIds: List[str] = Field(default_factory=list, max_length=20)
    keyword: str = Field(default="", max_length=300)
    period: str = Field(default="1w")
    autoWikiEnabled: bool = True

class WikiConditionPatchRequest(BaseModel):
    name: Optional[str] = Field(default=None, max_length=120)
    gmailLabelIds: Optional[List[str]] = Field(default=None, max_length=50)
    driveFolderIds: Optional[List[str]] = Field(default=None, max_length=20)
    keyword: Optional[str] = Field(default=None, max_length=300)
    period: Optional[str] = None
    autoWikiEnabled: Optional[bool] = None

class WikiConditionRunRequest(BaseModel):
    confirm_external_llm: bool = False

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

@app.get("/api/gmail/labels")
def gmail_labels():
    """Gmail 라벨(태그) 목록을 반환합니다."""
    try:
        labels = list_labels()
        return {"status": "success", "labels": labels}
    except Exception as e:
        return {"status": "error", "message": str(e), "labels": []}

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
    """Gmail 목록을 본문 없이 메타데이터만 동기화합니다."""
    try:
        detailed_messages, next_token = list_message_metadata(max_results=req.max_emails, query=req.query, label_ids=req.label_ids)

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
    """Google Drive 원본 파일 목록만 가져옵니다. 벡터 인덱싱은 /api/rag/index에서만 수행합니다."""
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


@app.post("/api/gws/originals/search")
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


@app.get("/api/wiki-conditions")
def wiki_conditions_list():
    """Gmail/Drive 조건 기반 가져오기 규칙 목록을 반환합니다."""
    try:
        return {"status": "success", "conditions": WikiConditionStore().list()}
    except ConditionValidationError as e:
        return {"status": "error", "message": str(e), "conditions": []}
    except Exception as e:
        return {"status": "error", "message": str(e), "conditions": []}


@app.post("/api/wiki-conditions")
def wiki_conditions_create(req: WikiConditionRequest):
    """조건 기반 Gmail/Drive 가져오기 규칙을 생성합니다."""
    try:
        condition = WikiConditionStore().create(req.model_dump())
        return {"status": "success", "condition": condition}
    except ConditionValidationError as e:
        return {"status": "error", "message": str(e)}
    except Exception as e:
        return {"status": "error", "message": str(e)}


@app.patch("/api/wiki-conditions/{condition_id}")
def wiki_conditions_update(condition_id: str, req: WikiConditionPatchRequest):
    """조건 기반 가져오기 규칙을 수정합니다."""
    try:
        condition = WikiConditionStore().update(condition_id, req.model_dump(exclude_unset=True, exclude_none=True))
        if condition is None:
            return {"status": "error", "message": "조건을 찾을 수 없습니다."}
        return {"status": "success", "condition": condition}
    except ConditionValidationError as e:
        return {"status": "error", "message": str(e)}
    except Exception as e:
        return {"status": "error", "message": str(e)}


@app.delete("/api/wiki-conditions/{condition_id}")
def wiki_conditions_delete(condition_id: str):
    """조건 기반 가져오기 규칙을 삭제합니다."""
    try:
        if not WikiConditionStore().delete(condition_id):
            return {"status": "error", "message": "조건을 찾을 수 없습니다."}
        return {"status": "success"}
    except ConditionValidationError as e:
        return {"status": "error", "message": str(e)}
    except Exception as e:
        return {"status": "error", "message": str(e)}


@app.post("/api/wiki-conditions/{condition_id}/run")
def wiki_conditions_run(condition_id: str, req: WikiConditionRunRequest):
    """조건 범위 안에서 Gmail/Drive를 가져오고 자동 Wiki 상태를 반환합니다."""
    try:
        condition = WikiConditionStore().get(condition_id)
        if condition is None:
            return {"status": "error", "message": "조건을 찾을 수 없습니다."}
        return run_condition(condition, confirm_external_llm=req.confirm_external_llm)
    except ConditionValidationError as e:
        return {"status": "error", "message": str(e)}
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
    """백엔드의 로컬 LLM 환경 설정을 실시간으로 갱신하고 config.json에 저장합니다."""
    try:
        from config import config
        
        # config.json 저장 데이터 구성
        updates = {
            "LLM_SERVE_MODE": req.mode,
            "LLM_MODEL": req.model
        }
        if req.mode == "ollama":
            updates["OLLAMA_BASE"] = req.endpoint
        elif req.mode == "external":
            updates["LLM_API_BASE"] = req.endpoint
            
        config.save_user_config(updates)
        
        return {"status": "success", "message": "LLM 설정이 정상적으로 업데이트 및 저장되었습니다."}
    except Exception as e:
        return {"status": "error", "message": str(e)}


# -----------------------------------------------------------------------
# RAG 파이프라인 API (Phase 2에서 구현체 채워짐)
# -----------------------------------------------------------------------

class RagIndexRequest(BaseModel):
    sources: Optional[List[str]] = None
    drive_files: List[Dict[str, Any]] = Field(default_factory=list, max_length=100)

@app.post("/api/rag/index")
def rag_index(req: Optional[RagIndexRequest] = None):
    """선택된 Gmail/Drive 자료를 ChromaDB에 인덱싱합니다."""
    try:
        from src.rag.indexer import index_all
        result = index_all(req.sources if req else None, req.drive_files if req else None)
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
    sources: Optional[List[str]] = None

@app.post("/api/rag/search")
def rag_search(req: RagSearchRequest):
    """동기화된 데이터에서 citation-ready 근거 레코드를 검색합니다."""
    try:
        from src.rag.retriever import search_evidence
        return search_evidence(req.query, req.top_k, req.sources)
    except Exception as e:
        return {"status": "error", "message": str(e)}


@app.post("/api/gmail/search")
def gmail_search(req: SyncRequest):
    """Gmail API 쿼리로 본문 없이 메타데이터 검색 결과만 반환합니다."""
    return sync_gmail(req)


@app.post("/api/gmail/vectorize")
def gmail_vectorize(req: GmailVectorizeRequest):
    """선택된 Gmail 메시지만 본문 조회 후 벡터화합니다."""
    message_ids = [message_id.strip() for message_id in req.message_ids if message_id.strip()]
    if not message_ids:
        return {"status": "error", "message": "벡터화할 Gmail 메시지를 선택해 주세요.", "indexed": 0}
    try:
        from src.rag.indexer import index_gmail_message_ids, rebuild_bm25_index
        indexed = index_gmail_message_ids(message_ids)
        rebuild_bm25_index()
        return {"status": "success", "indexed": indexed, "message_ids": message_ids}
    except Exception as e:
        return {"status": "error", "message": str(e), "indexed": 0}


class EvidenceSetCreateRequest(BaseModel):
    title: str
    original_query: str = ""
    evidence_items: List[Dict[str, Any]] = []
    notes: str = ""
    tags: List[str] = []

class EvidenceSetUpdateRequest(BaseModel):
    title: Optional[str] = None
    notes: Optional[str] = None
    tags: Optional[List[str]] = None
    evidence_items: Optional[List[Dict[str, Any]]] = None

class RelevanceFeedbackRequest(BaseModel):
    query: str = Field(default="", max_length=500)
    evidence_id: str = Field(max_length=120)
    chunk_id: str = Field(max_length=240)
    doc_id: str = Field(max_length=240)
    source: Literal["gmail", "drive", "unknown"] = "unknown"
    feedback: Literal["relevant", "irrelevant"]
    title: str = Field(default="", max_length=500)
    match_reason: str = Field(default="", max_length=2000)

class ArtifactCreateRequest(BaseModel):
    artifact_type: str = "summary"
    instruction: str = ""

class ArtifactUpdateRequest(BaseModel):
    title: Optional[str] = None
    content: Optional[str] = None

class ArtifactStatusRequest(BaseModel):
    status: Literal["candidate", "approved"]

@app.get("/api/evidence-sets")
def evidence_sets_list():
    try:
        from src.evidence import list_evidence_sets
        return {"status": "success", "evidence_sets": list_evidence_sets()}
    except Exception as e:
        return {"status": "error", "message": str(e)}

@app.post("/api/evidence-sets")
def evidence_sets_create(req: EvidenceSetCreateRequest):
    try:
        from src.evidence import create_evidence_set
        evidence_set = create_evidence_set(
            title=req.title,
            original_query=req.original_query,
            evidence_items=req.evidence_items,
            notes=req.notes,
            tags=req.tags,
        )
        return {"status": "success", "evidence_set": evidence_set.model_dump()}
    except Exception as e:
        return {"status": "error", "message": str(e)}

@app.get("/api/evidence-sets/{evidence_set_id}")
def evidence_sets_get(evidence_set_id: str):
    try:
        from src.evidence import get_evidence_set, list_artifacts
        evidence_set = get_evidence_set(evidence_set_id)
        if evidence_set is None:
            return {"status": "error", "message": "정보 묶음을 찾을 수 없습니다."}
        return {
            "status": "success",
            "evidence_set": evidence_set.model_dump(),
            "artifacts": list_artifacts(evidence_set_id),
        }
    except Exception as e:
        return {"status": "error", "message": str(e)}

@app.patch("/api/evidence-sets/{evidence_set_id}")
def evidence_sets_update(evidence_set_id: str, req: EvidenceSetUpdateRequest):
    try:
        from src.evidence import update_evidence_set
        evidence_set = update_evidence_set(
            evidence_set_id=evidence_set_id,
            title=req.title,
            notes=req.notes,
            tags=req.tags,
            evidence_items=req.evidence_items,
        )
        if evidence_set is None:
            return {"status": "error", "message": "정보 묶음을 찾을 수 없습니다."}
        return {"status": "success", "evidence_set": evidence_set.model_dump()}
    except Exception as e:
        return {"status": "error", "message": str(e)}

@app.delete("/api/evidence-sets/{evidence_set_id}")
def evidence_sets_delete(evidence_set_id: str):
    try:
        from src.evidence import delete_evidence_set
        if not delete_evidence_set(evidence_set_id):
            return {"status": "error", "message": "정보 묶음을 찾을 수 없습니다."}
        return {"status": "success"}
    except Exception as e:
        return {"status": "error", "message": str(e)}

@app.post("/api/rag/feedback")
def rag_feedback(req: RelevanceFeedbackRequest):
    try:
        feedback = record_relevance_feedback(
            query=req.query,
            evidence_id=req.evidence_id,
            chunk_id=req.chunk_id,
            doc_id=req.doc_id,
            source=req.source,
            feedback=req.feedback,
            title=req.title,
            match_reason=req.match_reason,
        )
        return {"status": "success", "feedback": feedback.model_dump()}
    except Exception as e:
        return {"status": "error", "message": str(e)}

@app.post("/api/evidence-sets/{evidence_set_id}/artifacts")
def evidence_sets_create_artifact(evidence_set_id: str, req: ArtifactCreateRequest):
    try:
        from src.evidence import create_artifact
        artifact = create_artifact(evidence_set_id, req.artifact_type, req.instruction)
        if artifact is None:
            return {"status": "error", "message": "정보 묶음을 찾을 수 없습니다."}
        return {"status": "success", "artifact": artifact.model_dump()}
    except Exception as e:
        return {"status": "error", "message": str(e)}

@app.patch("/api/artifacts/{artifact_id}")
def artifacts_update(artifact_id: str, req: ArtifactUpdateRequest):
    try:
        from src.evidence import update_artifact
        artifact = update_artifact(artifact_id, title=req.title, content=req.content)
        if artifact is None:
            return {"status": "error", "message": "산출물을 찾을 수 없습니다."}
        return {"status": "success", "artifact": artifact.model_dump()}
    except Exception as e:
        return {"status": "error", "message": str(e)}

@app.patch("/api/artifacts/{artifact_id}/status")
def artifacts_update_status(artifact_id: str, req: ArtifactStatusRequest):
    try:
        from src.evidence import update_artifact_status
        artifact = update_artifact_status(artifact_id, req.status)
        if artifact is None:
            return {"status": "error", "message": "산출물을 찾을 수 없습니다."}
        return {"status": "success", "artifact": artifact.model_dump()}
    except Exception as e:
        return {"status": "error", "message": str(e)}


# -----------------------------------------------------------------------
# 지식 파이프라인 및 서비스 연동 설정 API
# -----------------------------------------------------------------------

class SettingsUpdateRequest(BaseModel):
    obsidian_vault_path: Optional[str] = None
    notion_api_key: Optional[str] = None
    notion_page_id: Optional[str] = None
    suppress_external_llm_sensitive_warning: Optional[bool] = None

class ObsidianExportRequest(BaseModel):
    title: str
    content: str
    tags: List[str] = Field(default_factory=list)

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
        success = save_settings(req.model_dump(exclude_unset=True, exclude_none=True))
        if success:
            return {"status": "success", "message": "설정이 저장되었습니다."}
        return {"status": "error", "message": "설정 저장 실패"}
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
    uvicorn.run(app, host="127.0.0.1", port=18731)
