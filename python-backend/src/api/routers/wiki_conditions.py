from typing import List, Optional

from fastapi import APIRouter
from pydantic import BaseModel, Field

from src.gws.drive import list_drive_files
from src.wiki_condition_runner import run_condition
from src.wiki_conditions import ConditionValidationError, WikiConditionStore

router = APIRouter()

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

@router.get("/api/wiki-conditions")
def wiki_conditions_list():
    """Gmail/Drive 조건 기반 가져오기 규칙 목록을 반환합니다."""
    try:
        return {"status": "success", "conditions": WikiConditionStore().list()}
    except ConditionValidationError as e:
        return {"status": "error", "message": str(e), "conditions": []}
    except Exception as e:
        return {"status": "error", "message": str(e), "conditions": []}


@router.post("/api/wiki-conditions")
def wiki_conditions_create(req: WikiConditionRequest):
    """조건 기반 Gmail/Drive 가져오기 규칙을 생성합니다."""
    try:
        condition = WikiConditionStore().create(req.model_dump())
        return {"status": "success", "condition": condition}
    except ConditionValidationError as e:
        return {"status": "error", "message": str(e)}
    except Exception as e:
        return {"status": "error", "message": str(e)}


@router.patch("/api/wiki-conditions/{condition_id}")
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


@router.delete("/api/wiki-conditions/{condition_id}")
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


@router.post("/api/wiki-conditions/{condition_id}/run")
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
