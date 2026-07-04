from typing import Any, Dict, List, Literal, Optional

from fastapi import APIRouter
from pydantic import BaseModel

router = APIRouter()

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

class ArtifactCreateRequest(BaseModel):
    artifact_type: str = "wiki"
    instruction: str = ""

class ArtifactUpdateRequest(BaseModel):
    title: Optional[str] = None
    content: Optional[str] = None

class ArtifactStatusRequest(BaseModel):
    status: Literal["candidate", "approved"]

@router.get("/api/evidence-sets")
def evidence_sets_list():
    try:
        from src.evidence import list_evidence_sets
        return {"status": "success", "evidence_sets": list_evidence_sets()}
    except Exception as e:
        return {"status": "error", "message": str(e)}

@router.post("/api/evidence-sets")
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

@router.get("/api/evidence-sets/{evidence_set_id}")
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

@router.patch("/api/evidence-sets/{evidence_set_id}")
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

@router.delete("/api/evidence-sets/{evidence_set_id}")
def evidence_sets_delete(evidence_set_id: str):
    try:
        from src.evidence import delete_evidence_set
        if not delete_evidence_set(evidence_set_id):
            return {"status": "error", "message": "정보 묶음을 찾을 수 없습니다."}
        return {"status": "success"}
    except Exception as e:
        return {"status": "error", "message": str(e)}

@router.post("/api/evidence-sets/{evidence_set_id}/artifacts")
def evidence_sets_create_artifact(evidence_set_id: str, req: ArtifactCreateRequest):
    try:
        from src.evidence import create_artifact
        artifact = create_artifact(evidence_set_id, req.artifact_type, req.instruction)
        if artifact is None:
            return {"status": "error", "message": "정보 묶음을 찾을 수 없습니다."}
        return {"status": "success", "artifact": artifact.model_dump()}
    except Exception as e:
        return {"status": "error", "message": str(e)}

@router.patch("/api/artifacts/{artifact_id}")
def artifacts_update(artifact_id: str, req: ArtifactUpdateRequest):
    try:
        from src.evidence import update_artifact
        artifact = update_artifact(artifact_id, title=req.title, content=req.content)
        if artifact is None:
            return {"status": "error", "message": "산출물을 찾을 수 없습니다."}
        return {"status": "success", "artifact": artifact.model_dump()}
    except Exception as e:
        return {"status": "error", "message": str(e)}

@router.patch("/api/artifacts/{artifact_id}/status")
def artifacts_update_status(artifact_id: str, req: ArtifactStatusRequest):
    try:
        from src.evidence import update_artifact_status
        artifact = update_artifact_status(artifact_id, req.status)
        if artifact is None:
            return {"status": "error", "message": "산출물을 찾을 수 없습니다."}
        return {"status": "success", "artifact": artifact.model_dump()}
    except Exception as e:
        return {"status": "error", "message": str(e)}
