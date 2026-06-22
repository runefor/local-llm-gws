import re
import httpx

def _rich_text_chunks(content: str) -> list:
    text = content or ""
    if not text:
        return [{"type": "text", "text": {"content": ""}}]
    return [
        {"type": "text", "text": {"content": text[index:index + 1900]}}
        for index in range(0, len(text), 1900)
    ]

def replace_source_links(content: str, links: list[dict]) -> str:
    if not links:
        return content

    lines = [
        f"- [{link['evidence_id']}] {link['title']}: {link['target']}"
        for link in links
    ]
    section = "## 원문 링크\n" + "\n".join(lines)
    pattern = r"^## 원문 링크\s*\n.*?(?=^##\s+|\Z)"
    if re.search(pattern, content, flags=re.MULTILINE | re.DOTALL):
        return re.sub(pattern, section + "\n\n", content, flags=re.MULTILINE | re.DOTALL).rstrip()
    return content.rstrip() + "\n\n" + section

def parse_markdown_to_notion_blocks(markdown_text: str) -> list:
    """간단한 Markdown 텍스트를 Notion API 규격에 맞는 Block 리스트로 변환합니다."""
    blocks = []
    lines = markdown_text.split("\n")
    
    for line in lines:
        line_strip = line.strip()
        if not line_strip:
            continue
            
        def make_rich_text(content: str):
            return _rich_text_chunks(content)

        # Heading 1
        if line_strip.startswith("# "):
            blocks.append({
                "object": "block",
                "type": "heading_1",
                "heading_1": {
                    "rich_text": make_rich_text(line_strip[2:])
                }
            })
        # Heading 2
        elif line_strip.startswith("## "):
            blocks.append({
                "object": "block",
                "type": "heading_2",
                "heading_2": {
                    "rich_text": make_rich_text(line_strip[3:])
                }
            })
        # Heading 3
        elif line_strip.startswith("### "):
            blocks.append({
                "object": "block",
                "type": "heading_3",
                "heading_3": {
                    "rich_text": make_rich_text(line_strip[4:])
                }
            })
        # Quote/Callout
        elif line_strip.startswith("> "):
            blocks.append({
                "object": "block",
                "type": "quote",
                "quote": {
                    "rich_text": make_rich_text(line_strip[2:])
                }
            })
        # To-Do list
        elif line_strip.startswith("- [ ]") or line_strip.startswith("* [ ]"):
            blocks.append({
                "object": "block",
                "type": "to_do",
                "to_do": {
                    "rich_text": make_rich_text(line_strip[5:].strip()),
                    "checked": False
                }
            })
        elif line_strip.startswith("- [x]") or line_strip.startswith("* [x]"):
            blocks.append({
                "object": "block",
                "type": "to_do",
                "to_do": {
                    "rich_text": make_rich_text(line_strip[5:].strip()),
                    "checked": True
                }
            })
        # Bulleted List
        elif line_strip.startswith("- ") or line_strip.startswith("* "):
            blocks.append({
                "object": "block",
                "type": "bulleted_list_item",
                "bulleted_list_item": {
                    "rich_text": make_rich_text(line_strip[2:])
                }
            })
        # Numbered List
        elif re.match(r'^\d+\.\s+', line_strip):
            match = re.match(r'^(\d+)\.\s+(.*)', line_strip)
            if match:
                content = match.group(2)
                blocks.append({
                    "object": "block",
                    "type": "numbered_list_item",
                    "numbered_list_item": {
                        "rich_text": make_rich_text(content)
                    }
                })
        # Paragraph
        else:
            blocks.append({
                "object": "block",
                "type": "paragraph",
                "paragraph": {
                    "rich_text": make_rich_text(line_strip)
                }
            })
            
    return blocks

def export_to_notion(api_key: str, page_id: str, title: str, markdown_content: str) -> dict:
    """Notion API를 호출하여 지정한 page_id 하위에 제목과 요약 결과 블록을 추가합니다."""
    if not api_key:
        return {"status": "error", "message": "Notion API Key가 설정되지 않았습니다."}
    if not page_id:
        return {"status": "error", "message": "Notion Page ID가 설정되지 않았습니다."}

    # 대시가 포함되지 않은 UUID 형식의 page_id 교정
    formatted_page_id = page_id.strip().replace("-", "")
    if len(formatted_page_id) == 32:
        formatted_page_id = (
            f"{formatted_page_id[:8]}-{formatted_page_id[8:12]}-{formatted_page_id[12:16]}-"
            f"{formatted_page_id[16:20]}-{formatted_page_id[20:]}"
        )
    else:
        formatted_page_id = page_id.strip()

    headers = {
        "Authorization": f"Bearer {api_key.strip()}",
        "Notion-Version": "2022-06-28",
        "Content-Type": "application/json"
    }

    # 1단계: 제목을 아코디언(Toggle) 블록 등으로 생성하고 그 안에 내용을 채우거나, 구분선(divider)과 제목을 넣습니다.
    # 여기서는 구분선 + Heading 2 (제목) + 파싱된 하위 블록들을 덧붙이는 구조로 작성합니다.
    intro_blocks = [
        {
            "object": "block",
            "type": "divider",
            "divider": {}
        },
        {
            "object": "block",
            "type": "heading_2",
            "heading_2": {
                "rich_text": [{"type": "text", "text": {"content": f"📝 {title}"}}]
            }
        }
    ]

    body_blocks = parse_markdown_to_notion_blocks(markdown_content)
    all_blocks = intro_blocks + body_blocks

    url = f"https://api.notion.com/v1/blocks/{formatted_page_id}/children"

    try:
        # Notion API는 한 번에 최대 100개 블록만 추가할 수 있으므로 100개 단위로 청킹하여 전송
        chunk_size = 100
        for i in range(0, len(all_blocks), chunk_size):
            chunk = all_blocks[i:i + chunk_size]
            response = httpx.patch(url, headers=headers, json={"children": chunk}, timeout=15.0)
            if response.status_code != 200:
                return {
                    "status": "error", 
                    "message": f"Notion API 에러 ({response.status_code}): {response.text}"
                }
        
        return {
            "status": "success",
            "message": "Notion 페이지에 성공적으로 정리 내용을 추가했습니다."
        }
    except Exception as e:
        return {
            "status": "error",
            "message": f"Notion 전송 오류: {str(e)}"
        }

def export_to_notion_with_originals(api_key: str, page_id: str, title: str, markdown_content: str, originals: list[dict] | None = None) -> dict:
    """원문을 별도 하위 페이지로 만들고 LLM Wiki의 원문 링크를 그 페이지 URL로 연결합니다."""
    if not originals:
        return export_to_notion(api_key, page_id, title, markdown_content)
    if not api_key:
        return {"status": "error", "message": "Notion API Key가 설정되지 않았습니다."}
    if not page_id:
        return {"status": "error", "message": "Notion Page ID가 설정되지 않았습니다."}

    formatted_page_id = page_id.strip().replace("-", "")
    if len(formatted_page_id) == 32:
        formatted_page_id = (
            f"{formatted_page_id[:8]}-{formatted_page_id[8:12]}-{formatted_page_id[12:16]}-"
            f"{formatted_page_id[16:20]}-{formatted_page_id[20:]}"
        )
    else:
        formatted_page_id = page_id.strip()

    headers = {
        "Authorization": f"Bearer {api_key.strip()}",
        "Notion-Version": "2022-06-28",
        "Content-Type": "application/json"
    }

    links = []
    try:
        for original in originals:
            evidence_id = original.get("evidence_id", "")
            original_title = original.get("title", evidence_id or "원문")
            body = "\n".join(
                part for part in [
                    f"- 출처: {original.get('source_line', '')}" if original.get("source_line") else "",
                    f"- 원문 열기: {original.get('open_url', '')}" if original.get("open_url") else "",
                    "",
                    original.get("content", ""),
                ] if part != ""
            )
            body_blocks = parse_markdown_to_notion_blocks(body)
            page_response = httpx.post(
                "https://api.notion.com/v1/pages",
                headers=headers,
                json={
                    "parent": {"page_id": formatted_page_id},
                    "properties": {
                        "title": {
                            "title": [{"type": "text", "text": {"content": f"원문 - {original_title}"[:1900]}}]
                        }
                    },
                    "children": body_blocks[:100],
                },
                timeout=15.0,
            )
            if page_response.status_code != 200:
                return {"status": "error", "message": f"Notion 원문 페이지 생성 에러 ({page_response.status_code}): {page_response.text}"}
            data = page_response.json()
            original_page_id = data.get("id", "")
            if len(body_blocks) > 100 and original_page_id:
                children_url = f"https://api.notion.com/v1/blocks/{original_page_id}/children"
                for index in range(100, len(body_blocks), 100):
                    chunk_response = httpx.patch(children_url, headers=headers, json={"children": body_blocks[index:index + 100]}, timeout=15.0)
                    if chunk_response.status_code != 200:
                        return {"status": "error", "message": f"Notion 원문 본문 추가 에러 ({chunk_response.status_code}): {chunk_response.text}"}
            links.append({
                "evidence_id": evidence_id,
                "title": original_title,
                "target": data.get("url", ""),
            })

        return export_to_notion(api_key, formatted_page_id, title, replace_source_links(markdown_content, links))
    except Exception as e:
        return {"status": "error", "message": f"Notion 원문 저장 오류: {str(e)}"}
