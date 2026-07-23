# 데스크톱 앱 배포 가이드라인 (Deployment Guide)

Windows 외부 베타 배포는 저장소 루트에서 `npm run release:windows` 한 명령으로 만든 NSIS 설치 파일만 기준으로 삼습니다. 별도 PyInstaller 명령이나 설치본 데이터 폴더 복사는 배포 절차가 아닙니다.

## 1. Windows 릴리스 빌드

필수 조건은 Windows x64, PowerShell 7(`pwsh`), Node/npm, Rust/MSVC, `uv`, 네트워크, 저장소 밖의 Google Desktop OAuth JSON입니다. 릴리스 빌더는 실제 JSON 내용을 로그나 문서에 남기지 말고 파일 경로만 환경 변수로 넘깁니다.

```powershell
$env:GOOGLE_OAUTH_CLIENT_CONFIG_PATH="C:\secure\local-llm-gws\client_secrets.json"
npm run release:windows
```

`npm run release:windows`는 다음 단계를 순서대로 실행합니다.

1. 필수 도구와 `GOOGLE_OAUTH_CLIENT_CONFIG_PATH` JSON 형식 사전 검사
2. `npm ci`
3. 고정된 llama.cpp Windows Vulkan 아카이브 준비와 SHA-256 검증
4. `npm run build:desktop` 실행
5. NSIS 설치 파일 경로, 크기, SHA-256 출력

빌드 결과는 `src-tauri/target/release/bundle/nsis/` 아래의 단일 `*-setup.exe` 파일입니다.

## 2. 런타임 데이터 위치

사용자 데이터는 Tauri 리소스 폴더나 PyInstaller 임시 폴더에 쓰지 않습니다.

| 항목 | 개발 기본값 | 설치본 기본값 | override |
| --- | --- | --- | --- |
| 앱 데이터 루트 | `python-backend/data` | `%LOCALAPPDATA%\local-llm-gws\data` | `LOCAL_LLM_GWS_DATA_DIR` |
| ChromaDB 벡터 DB | `<data>\vectordb` | `<data>\vectordb` | `LOCAL_LLM_GWS_CHROMA_DB_PATH` |
| Google 개발자 override | `<data>\client_secrets.json` | `<data>\client_secrets.json` | 데이터 루트 override와 함께 이동 |
| Google token | `<data>\token.json` | `<data>\token.json` | 데이터 루트 override와 함께 이동 |
| 사용자 설정 | `<data>\config.json` | `<data>\config.json` | 데이터 루트 override와 함께 이동 |
| GGUF 모델 | `<data>\models\*.gguf` | `<data>\models\*.gguf` | 데이터 루트 override와 함께 이동 |

`LOCAL_LLM_GWS_CHROMA_DB_PATH`는 데이터 루트와 독립적으로 벡터 DB만 옮길 때 사용합니다. 이 값을 지정하면 `<data>\vectordb`가 아니라 지정한 경로가 ChromaDB 위치가 됩니다.

Tauri `resource_dir`은 설치본에 포함된 `llama-server.exe`와 DLL 탐색용입니다. `client_secrets.json`, `token.json`, `config.json`, 모델, 벡터 DB를 저장하는 위치가 아닙니다.

앱 제거 후에도 데이터 루트는 남을 수 있습니다. `token.json`, 모델, 벡터 DB를 삭제하면 복구할 수 없으므로 필요한 데이터는 먼저 백업하고 사용자가 명시적으로 초기화할 때만 삭제합니다.

## 3. Google OAuth 빌드 입력과 운영

외부 베타 설치본은 release build input으로 받은 app-owned Desktop OAuth client JSON을 PyInstaller sidecar에 `client_secrets.json` 이름으로 포함합니다. 원본 JSON 파일은 저장소나 별도 zip, 메신저, 문서, 로그에 올리지 않습니다.

런타임 우선순위는 다음과 같습니다.

1. `<data>\client_secrets.json`이 있으면 개발자 override로 사용합니다. 파일이 잘못됐으면 bundled JSON으로 fallback하지 않고 실패합니다.
2. override가 없고 PyInstaller frozen 실행이면 bundle root의 `client_secrets.json`을 사용합니다.
3. 둘 다 없으면 개발 환경에서는 `<data>\client_secrets.json` 준비가 필요하다는 오류를 냅니다.

Google Cloud 운영 체크:

- OAuth consent screen은 External/Testing 상태로 둡니다.
- Gmail/Drive 최소 scope만 등록합니다.
- 베타 tester 이메일을 Test users allowlist에 추가합니다.
- 릴리스 전 허용된 실제 계정 1개로 로그인해 `/api/auth/status`가 true가 되는지 확인합니다.
- release ledger에는 project/client 식별자와 tester 계정을 redacted 형태로만 기록합니다.

## 4. Notion OAuth와 외부 베타 게이트

Notion redirect URL은 다음 포트만 사용합니다.

```text
http://localhost:18731/api/auth/notion/callback
```

외부 베타 전에는 Notion client secret 공유 이력을 확인합니다.

- 실제 secret이 `.env`, zip, 메신저, 화면 공유, 외부 backup 중 하나라도 나갔거나 확인 불가하면 `ROTATED`로 처리하고 provider에서 old secret을 revoke한 뒤 local untracked `.env`만 갱신합니다.
- 공유 이력이 없다고 확인되면 담당자, 일시, 확인 범위를 남기고 `N/A` attestation으로 처리합니다.
- 이 게이트는 코드만으로 완료 처리하지 않습니다.

## 5. 설치본 smoke

설치 파일 생성 후 아래 자동 smoke를 순서대로 실행합니다.

```powershell
powershell -ExecutionPolicy Bypass -File scripts\smoke_release_app.ps1
powershell -ExecutionPolicy Bypass -File scripts\smoke_installed_app.ps1
```

수동 확인이 필요하면 설치본을 실행한 뒤 다음만 확인합니다.

- 앱 창 제목이 `Local LLM GWS`로 보입니다.
- `http://127.0.0.1:18731/`가 `status: ok`를 반환합니다.
- 앱 종료 뒤 `gws-backend` 프로세스와 `18731` 리스너가 남지 않습니다.
- allowlisted Google test user로 로그인하고 `token.json`이 데이터 루트에 생성됩니다.
- Notion gate가 `ROTATED` 또는 `N/A`로 기록되어 있습니다.
