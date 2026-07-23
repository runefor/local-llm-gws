import html
from typing import Optional

from fastapi import APIRouter, Request
from fastapi.responses import HTMLResponse

from config import config

router = APIRouter()


def _html_error(title: str, message: str, status_code: int) -> HTMLResponse:
    safe_message = html.escape(str(message), quote=True)
    return HTMLResponse(
        content=f"<html><body><div style='text-align:center;margin-top:100px;font-family:sans-serif;'><h1>{title}</h1><p>{safe_message}</p></div></body></html>",
        status_code=status_code
    )


@router.get("/api/auth/status")
def auth_status():
    """현재 구글 API 로그인 상태를 반환합니다 (브라우저를 자동으로 띄우지 않음)"""
    try:
        from src.gws.auth import is_authenticated
        authenticated = is_authenticated()
        return {"authenticated": authenticated}
    except Exception as e:
        return {"authenticated": False, "error": str(e)}

@router.post("/api/auth/login")
def auth_login():
    """사용자가 직접 로그인할 수 있도록 구글 인증 URL을 반환하고 백그라운드 서버를 구동합니다."""
    try:
        from src.gws.auth import get_auth_url_and_start_server
        url = get_auth_url_and_start_server()
        return {"status": "pending", "url": url}
    except Exception as e:
        return {"status": "error", "message": str(e)}

@router.get("/api/auth/callback", response_class=HTMLResponse)
def auth_callback(request: Request):
    """구글 로그인 성공 후 리디렉션되는 콜백 엔드포인트입니다."""
    try:
        from src.gws.auth import _active_flow
        from config import config
        import os

        if not _active_flow:
            return _html_error("인증 실패", "만료되었거나 유효하지 않은 세션입니다. 다시 로그인해 주세요.", 400)

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
        return _html_error("인증 오류 발생", str(e), 500)

@router.get("/api/auth/notion/url")
def get_notion_auth_url():
    """노션 OAuth 인증 주소를 반환합니다."""
    from config import config
    client_id = config.NOTION_CLIENT_ID
    redirect_uri = config.NOTION_REDIRECT_URI
    if not client_id:
        return {"status": "error", "message": "NOTION_CLIENT_ID가 설정되지 않았습니다. 백엔드 .env 파일을 확인해 주세요."}
    
    url = f"https://api.notion.com/v1/oauth/authorize?client_id={client_id}&response_type=code&owner=user&redirect_uri={redirect_uri}"
    return {"status": "success", "url": url}

@router.get("/api/auth/notion/callback", response_class=HTMLResponse)
def notion_auth_callback(code: Optional[str] = None, error: Optional[str] = None):
    """노션 OAuth 인증 완료 후 호출되는 콜백입니다."""
    if error:
        return _html_error("인증 에러", error, 400)
    if not code:
        return _html_error("인증 실패", "code 파라미터가 누락되었습니다.", 400)
    
    import base64
    import httpx
    from config import config
    from src.settings import load_settings, save_settings
    
    client_id = config.NOTION_CLIENT_ID
    client_secret = config.NOTION_CLIENT_SECRET
    redirect_uri = config.NOTION_REDIRECT_URI
    
    if not client_id or not client_secret:
        return _html_error("서버 설정 에러", "Notion Client ID 또는 Client Secret 설정이 누락되었습니다.", 500)
        
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
            return _html_error("토큰 발급 실패", resp.text, 400)
            
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
        return _html_error("오류 발생", str(e), 500)

@router.get("/api/notion/pages")
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
