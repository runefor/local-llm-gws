# 개발 및 배포 가이드: uv 활용법

이 프로젝트는 Python 백엔드 개발 환경과 release sidecar 빌드에 `uv`를 사용합니다.

## 1. uv 설치

### Windows (PowerShell)

```powershell
powershell -c "irm https://astral.sh/uv/install.ps1 | iex"
```

### macOS / Linux

```bash
curl -LsSf https://astral.sh/uv/install.sh | sh
```

## 2. 개발 환경 구축

백엔드 폴더에서 가상환경을 만들고 의존성을 설치합니다.

```powershell
cd python-backend
uv venv
uv pip install -r requirements.txt
```

Tauri 개발 모드는 `python-backend/.venv/Scripts/python.exe`(Windows) 또는 `python-backend/.venv/bin/python`을 찾아 `main.py`를 실행합니다.

## 3. 백엔드 sidecar 빌드

개발 중 sidecar만 다시 만들 때는 저장소 루트에서 실행합니다.

```powershell
npm run build:backend
```

이 스크립트는 `uv`로 release requirements를 설치하고 `python-backend/gws-backend.spec`을 사용해 Tauri sidecar 파일명을 맞춥니다. 별도 PyInstaller 명령은 현재 배포 계약이 아닙니다.

## 4. Windows 릴리스 빌드

외부 베타 설치 파일은 저장소 루트에서 실행합니다.

```powershell
$env:GOOGLE_OAUTH_CLIENT_CONFIG_PATH="C:\secure\local-llm-gws\client_secrets.json"
npm run release:windows
```

`GOOGLE_OAUTH_CLIENT_CONFIG_PATH`는 app-owned Google Desktop OAuth client JSON 경로입니다. JSON 내용은 출력, 문서, Git, zip에 포함하지 않습니다.
