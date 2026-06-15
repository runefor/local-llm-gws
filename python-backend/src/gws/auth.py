import os.path
from google.auth.transport.requests import Request
from google.oauth2.credentials import Credentials
from google_auth_oauthlib.flow import InstalledAppFlow
from config import config

# Gmail 및 Drive 읽기 전용 권한
SCOPES = [
    'https://www.googleapis.com/auth/gmail.readonly',
    'https://www.googleapis.com/auth/drive.readonly'
]

def get_credentials():
    """
    Google API 자격 증명을 로드하거나, 없으면 OAuth 인증 플로우를 시작합니다.
    """
    creds = None
    if os.path.exists(config.TOKEN_PATH):
        creds = Credentials.from_authorized_user_file(config.TOKEN_PATH, SCOPES)
    
    # 자격 증명이 유효하지 않으면 새로 발급
    if not creds or not creds.valid:
        if creds and creds.expired and creds.refresh_token:
            creds.refresh(Request())
        else:
            if not os.path.exists(config.CREDENTIALS_PATH):
                raise FileNotFoundError(f"OAuth 인증용 파일이 없습니다: {config.CREDENTIALS_PATH}")
            
            # 데스크톱 앱(포트 0 사용) 로컬 서버 플로우
            flow = InstalledAppFlow.from_client_secrets_file(
                config.CREDENTIALS_PATH, SCOPES)
            creds = flow.run_local_server(port=0)
            
        # 토큰을 포터블 data 폴더에 저장
        with open(config.TOKEN_PATH, 'w') as token:
            token.write(creds.to_json())
            
    return creds
