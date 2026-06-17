import os.path
import threading
from google.auth.transport.requests import Request
from google.oauth2.credentials import Credentials
from google_auth_oauthlib.flow import Flow
from config import config

# Gmail 및 Drive 읽기 전용 권한
SCOPES = [
    'https://www.googleapis.com/auth/gmail.readonly',
    'https://www.googleapis.com/auth/drive.readonly'
]

# 진행 중인 OAuth 인증 Flow 인스턴스 및 락
_active_flow = None
_auth_lock = threading.Lock()

def get_credentials():
    """
    이미 저장된 token.json에서 자격 증명을 로드합니다.
    만료된 경우 백그라운드에서 갱신을 시도하며, 브라우저 동의 창을 새로 띄우지 않습니다.
    """
    if not os.path.exists(config.TOKEN_PATH):
        raise FileNotFoundError("인증 토큰(token.json)이 없습니다. 먼저 로그인을 완료해 주세요.")
        
    creds = Credentials.from_authorized_user_file(config.TOKEN_PATH, SCOPES)
    if not creds or not creds.valid:
        if creds and creds.expired and creds.refresh_token:
            creds.refresh(Request())
            with open(config.TOKEN_PATH, 'w') as token:
                token.write(creds.to_json())
        else:
            raise ValueError("자격 증명이 만료되었으며 갱신할 수 없습니다. 다시 로그인해 주세요.")
            
    return creds

def get_auth_url_and_start_server():
    """
    구글 OAuth 2.0 로그인 URL을 생성하고 flow 인스턴스를 저장합니다.
    """
    global _active_flow
    
    with _auth_lock:
        if not os.path.exists(config.CREDENTIALS_PATH):
            raise FileNotFoundError(f"OAuth 자격증명 파일이 없습니다: {config.CREDENTIALS_PATH}")
            
        # 백엔드 자체 포트(18731)를 콜백 엔드포인트로 설정
        flow = Flow.from_client_secrets_file(
            config.CREDENTIALS_PATH, 
            scopes=SCOPES,
            redirect_uri="http://localhost:18731/api/auth/callback"
        )
        
        # 브라우저 대기 전 인증 URL 획득
        auth_url, _ = flow.authorization_url(
            access_type='offline',
            prompt='consent',
            include_granted_scopes='true'
        )
        
        _active_flow = flow
        return auth_url

def is_authenticated():
    """
    브라우저 로그인 플로우를 띄우지 않고, 현재 로컬 토큰이 있고 유효한지만 검사합니다.
    """
    if not os.path.exists(config.TOKEN_PATH):
        return False
    try:
        creds = Credentials.from_authorized_user_file(config.TOKEN_PATH, SCOPES)
        if creds and creds.valid:
            return True
        if creds and creds.expired and creds.refresh_token:
            creds.refresh(Request())
            with open(config.TOKEN_PATH, 'w') as token:
                token.write(creds.to_json())
            return creds.valid
    except Exception:
        return False
    return False

