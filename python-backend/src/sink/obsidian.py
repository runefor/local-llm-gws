import os
import re
from datetime import datetime
from typing import Any, Dict, List, Optional

def sanitize_filename(filename: str) -> str:
    """파일명으로 사용할 수 없는 특수문자를 제거하거나 언더스코어로 대체합니다."""
    # Obsidian에서 지원되지 않는 파일명 문자 제거 (예: \ / : * ? " < > |)
    cleaned = re.sub(r'[\/\\\:\*\?\"<>\|]', '_', filename)
    # 공백이나 연속된 특수 문자 정돈
    cleaned = re.sub(r'\s+', ' ', cleaned).strip()
    return cleaned if cleaned else "untitled_note"

def export_to_obsidian(vault_path: str, title: str, content: str, tags: Optional[List[str]] = None) -> Dict[str, Any]:
    """주어진 Obsidian Vault 경로에 Markdown 노트를 생성합니다.
    
    Args:
        vault_path (str): Obsidian Vault 로컬 경로
        title (str): 노트 제목 (파일명으로 활용)
        content (str): 마크다운 본문 내용
        tags (list): 노트에 추가할 태그 목록 (예: ['workspace', 'gmail', 'summary'])
    """
    if not vault_path or not os.path.exists(vault_path):
        return {
            "status": "error",
            "message": f"유효하지 않은 Obsidian Vault 경로입니다: {vault_path}"
        }
        
    safe_title = sanitize_filename(title)
    filename = f"{safe_title}.md"
    file_path = os.path.join(vault_path, filename)
    
    # 중복 파일이 있을 경우 접미사 부여 (예: 제목_1.md, 제목_2.md)
    counter = 1
    base_name = safe_title
    while os.path.exists(file_path):
        filename = f"{base_name}_{counter}.md"
        file_path = os.path.join(vault_path, filename)
        counter += 1

    # YAML Frontmatter 구성
    now_str = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    frontmatter = f"---\ntitle: {title}\ndate: {now_str}\n"
    if tags:
        # YAML list 형식으로 변환
        frontmatter += f"tags:\n"
        for t in tags:
            # 특수문자 제거 후 태그 형식화
            cleaned_tag = re.sub(r'[^\w\-_]', '', t)
            if cleaned_tag:
                frontmatter += f"  - {cleaned_tag}\n"
    frontmatter += "---\n\n"

    try:
        with open(file_path, "w", encoding="utf-8") as f:
            f.write(frontmatter)
            f.write(content)
        
        return {
            "status": "success",
            "message": "Obsidian 노트가 생성되었습니다.",
            "filepath": file_path,
            "filename": filename
        }
    except Exception as e:
        return {
            "status": "error",
            "message": f"파일 쓰기 실패: {str(e)}"
        }
