# 구글 클라우드 플랫폼(GCP) OAuth 2.0 설정 가이드

이 문서는 Gmail 및 Google Drive API 연동에 필요한 Google OAuth 운영 절차만 다룹니다. 원본 OAuth JSON은 저장소, 문서, 별도 zip, 로그에 남기지 않습니다.

## 1. Google Cloud 프로젝트와 API

1. [Google Cloud Console](https://console.cloud.google.com/)에서 외부 베타용 프로젝트를 선택하거나 생성합니다.
2. **API 및 서비스 > 라이브러리**에서 다음 API를 활성화합니다.
   - Gmail API
   - Google Drive API

## 2. OAuth consent screen

1. **API 및 서비스 > OAuth 동의 화면**으로 이동합니다.
2. User Type은 외부 베타 기준 **External**을 선택합니다.
3. 앱 이름, 사용자 지원 이메일, 개발자 연락처를 입력합니다.
4. Gmail/Drive 읽기용 최소 scope만 등록합니다.
5. Publishing status가 Testing이면 **Test users**에 베타 tester 이메일을 추가합니다.

외부 베타 smoke는 allowlisted 실제 Google 계정 1개로 수행합니다. release ledger에는 계정 식별자를 redacted 형태로만 남깁니다.

## 3. Desktop OAuth client 생성

1. **API 및 서비스 > 사용자 인증 정보**로 이동합니다.
2. **사용자 인증 정보 만들기 > OAuth 클라이언트 ID**를 선택합니다.
3. Application type은 **Desktop app**을 선택합니다.
4. JSON을 안전한 로컬 경로에 다운로드합니다.

릴리스 빌더는 이 파일 경로만 환경 변수로 전달합니다.

```powershell
$env:GOOGLE_OAUTH_CLIENT_CONFIG_PATH="C:\secure\local-llm-gws\client_secrets.json"
npm run release:windows
```

릴리스 빌드 입력은 PyInstaller sidecar에 `client_secrets.json` 이름으로 포함됩니다. 사용자는 외부 베타 설치 후 JSON을 직접 배치하지 않습니다.

## 4. 개발자 override

개발 환경이나 override 검증이 필요할 때만 OAuth JSON을 데이터 루트에 둡니다.

```text
python-backend/data/client_secrets.json
```

설치본의 기본 데이터 루트는 다음 경로입니다.

```text
%LOCALAPPDATA%\local-llm-gws\data
```

`LOCAL_LLM_GWS_DATA_DIR`를 지정하면 데이터 루트가 바뀝니다. `<data>\client_secrets.json`이 존재하면 이 파일만 검증하고 사용합니다. 파일이 잘못되면 bundled JSON으로 fallback하지 않습니다.

## 5. 최초 로그인 확인

1. Tauri 앱에서 Google 연결을 실행합니다.
2. allowlisted test user로 로그인합니다.
3. 브라우저 callback 후 앱의 auth status가 true인지 확인합니다.
4. `token.json`이 현재 데이터 루트에 생성됐는지 확인합니다.

백엔드 callback 포트는 `18731`입니다.
