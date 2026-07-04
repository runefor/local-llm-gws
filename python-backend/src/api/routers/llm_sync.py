from typing import List, Optional

from fastapi import APIRouter
from pydantic import BaseModel, Field

from config import config
from src.gws.drive import list_drive_files
from src.gws.gmail import list_labels, list_message_metadata
from src.llm import manager as llm_manager
from src.llm import server as llm_server

router = APIRouter()

class SyncRequest(BaseModel):
    max_emails: Optional[int] = Field(default=50, ge=1, le=200)
    query: Optional[str] = Field(default=None, max_length=500)
    label_ids: Optional[List[str]] = Field(default=None, max_length=50)

class GmailVectorizeRequest(BaseModel):
    message_ids: List[str] = Field(default_factory=list, max_length=200)

class LLMTestRequest(BaseModel):
    endpoint: str
    model: str

@router.post("/api/llm/test")
def test_llm(req: LLMTestRequest):
    """로컬 LLM 서버(llama.cpp, Ollama 등)와의 OpenAI 호환 API 연결 상태를 검증합니다."""
    from src.llm.inference import test_connection
    return test_connection(endpoint=req.endpoint, model=req.model or None)

@router.get("/api/gmail/labels")
def gmail_labels():
    """Gmail 라벨(태그) 목록을 반환합니다."""
    try:
        labels = list_labels()
        return {"status": "success", "labels": labels}
    except Exception as e:
        return {"status": "error", "message": str(e), "labels": []}

@router.post("/api/sync/gmail")
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

@router.post("/api/sync/drive")
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

@router.get("/api/llm/hardware")
def get_hardware():
    """현재 시스템 하드웨어 프로파일을 반환합니다."""
    hw = llm_manager.get_hardware_profile()
    return hw.model_dump()

@router.get("/api/llm/presets")
def get_presets():
    return {
        "presets": llm_manager.get_preset_models(),
        "recommended": llm_manager.get_recommended_model_id(),
    }

@router.get("/api/llm/local_models")
def get_local_models():
    return {"models": llm_manager.get_local_models()}

@router.get("/api/llm/detect")
def detect_local_llms():
    """실행 중인 로컬 LLM 서버(Ollama, LM Studio 등)를 감지합니다."""
    from src.llm import detector
    return {"status": "success", "servers": detector.detect_servers()}


class LLMDownloadRequest(BaseModel):
    preset_id: str

@router.post("/api/llm/download")
def download_model(req: LLMDownloadRequest):
    try:
        llm_manager.download_model_background(req.preset_id)
        return {"status": "success", "message": "다운로드가 시작되었습니다."}
    except Exception as e:
        return {"status": "error", "message": str(e)}

@router.get("/api/llm/download/progress/{preset_id}")
def download_progress(preset_id: str):
    status = llm_manager.get_download_status(preset_id)
    if status:
        return status
    return {"status": "not_found", "progress": 0.0}

class LLMDeleteRequest(BaseModel):
    filename: str

@router.post("/api/llm/delete")
def delete_model(req: LLMDeleteRequest):
    if llm_manager.delete_local_model(req.filename):
        return {"status": "success"}
    return {"status": "error", "message": "삭제 실패"}


# -----------------------------------------------------------------------
# llama.cpp 서버 관리 API

class ServerStartRequest(BaseModel):
    model_filename: str

@router.post("/api/llm/server/start")
def start_llm_server(req: ServerStartRequest):
    """llama.cpp 서버를 기동합니다."""
    return llm_server.start_server(req.model_filename)

@router.post("/api/llm/server/stop")
def stop_llm_server():
    """llama.cpp 서버를 종료합니다."""
    return llm_server.stop_server()

@router.get("/api/llm/server/status")
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

@router.get("/api/llm/config", response_model=LLMConfigResponse)
def get_llm_config_route():
    """현재 백엔드에 설정된 로컬 LLM 환경 설정을 반환합니다."""
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

@router.post("/api/llm/config")
def update_llm_config_route(req: LLMConfigRequest):
    """백엔드의 로컬 LLM 환경 설정을 실시간으로 갱신하고 config.json에 저장합니다."""
    try:
            
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

@router.post("/api/gmail/search")
def gmail_search(req: SyncRequest):
    """Gmail API 쿼리로 본문 없이 메타데이터 검색 결과만 반환합니다."""
    return sync_gmail(req)


@router.post("/api/gmail/vectorize")
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
