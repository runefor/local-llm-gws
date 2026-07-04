from typing import Dict, List, Optional

from fastapi import APIRouter, Request
from pydantic import BaseModel, Field

router = APIRouter()

class SettingsUpdateRequest(BaseModel):
    obsidian_vault_path: Optional[str] = None
    notion_api_key: Optional[str] = None
    notion_page_id: Optional[str] = None
    suppress_external_llm_sensitive_warning: Optional[bool] = None

class ObsidianExportRequest(BaseModel):
    title: str
    content: str
    tags: List[str] = Field(default_factory=list)
    originals: List[Dict[str, str]] = Field(default_factory=list)

class NotionExportRequest(BaseModel):
    title: str
    content: str
    originals: List[Dict[str, str]] = Field(default_factory=list)

@router.get("/api/settings")
def get_settings(request: Request):
    """Obsidian 및 Notion 연동 설정을 가져옵니다."""
    try:
        from src.settings import load_settings
        loaded_settings = load_settings()
        if not request.headers.get("origin"):
            return {**loaded_settings, "notion_api_key": ""}
        return loaded_settings
    except Exception as e:
        return {"status": "error", "message": str(e)}

@router.post("/api/settings")
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

@router.post("/api/export/obsidian")
def export_obsidian(req: ObsidianExportRequest):
    """정리된 내용을 Obsidian Vault에 마크다운 파일로 생성합니다."""
    try:
        from src.settings import load_settings
        from src.sink.obsidian import export_to_obsidian_with_originals
        settings = load_settings()
        vault_path = settings.get("obsidian_vault_path", "")
        if not vault_path:
            return {"status": "error", "message": "Obsidian Vault 경로가 설정되지 않았습니다. 설정 탭에서 입력해 주세요."}
        return export_to_obsidian_with_originals(vault_path, req.title, req.content, req.tags, req.originals)
    except Exception as e:
        return {"status": "error", "message": str(e)}

@router.post("/api/export/notion")
def export_notion(req: NotionExportRequest):
    """정리된 내용을 Notion 페이지의 하위 블록으로 내보냅니다."""
    try:
        from src.settings import load_settings
        from src.sink.notion import export_to_notion_with_originals
        settings = load_settings()
        api_key = settings.get("notion_api_key", "")
        page_id = settings.get("notion_page_id", "")
        if not api_key or not page_id:
            return {"status": "error", "message": "Notion API Key 또는 Page ID가 설정되지 않았습니다. 설정 탭에서 입력해 주세요."}
        return export_to_notion_with_originals(api_key, page_id, req.title, req.content, req.originals)
    except Exception as e:
        return {"status": "error", "message": str(e)}

@router.post("/api/utils/select_directory")
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
