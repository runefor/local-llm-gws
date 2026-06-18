# 개발 및 배포 가이드: uv 활용법

본 문서는 Astral사의 초고속 파이썬 패키지/환경 관리 도구인 `uv`를 사용하여 로컬 개발 환경을 세팅하고 배포용 바이너리를 빌드하는 가이드입니다.

---

## 1. uv 설치

`uv`는 Rust로 작성되어 기존 `pip`나 `poetry` 대비 최대 10~100배 빠른 환경 구축 및 패키지 설치 속도를 자랑합니다.

### Windows (PowerShell)
```powershell
powershell -c "irm https://astral.sh/uv/install.ps1 | iex"
```

### macOS / Linux
```bash
curl -LsSf https://astral.sh/uv/install.sh | sh
```

### PIP를 통한 설치 (대안)
이미 시스템에 파이썬이 설치되어 있다면 pip로 설치할 수도 있습니다:
```bash
pip install uv
```

---

## 2. 개발 환경 구축 (Local Development)

백엔드 폴더(`python-backend/`) 내부에서 `uv` 가상환경을 생성하고 패키지를 설치합니다.

```bash
# 1. 백엔드 디렉토리로 이동
cd python-backend

# 2. uv 가상환경 (.venv) 생성
uv venv

# 3. requirements.txt에 명시된 패키지 초고속 설치
uv pip install -r requirements.txt
```
> [!NOTE]
> `uv`로 가상환경을 생성하면 백엔드 폴더에 `.venv/` 디렉토리가 생성됩니다. 
> Tauri (Rust) Spawner 코드는 개발 모드(`debug`) 구동 시 이 경로(`python-backend/.venv`)를 자동으로 탐색하여 파이썬 서버(`main.py`)를 백그라운드에서 실행합니다.

---

## 3. 배포용 바이너리 빌드 (PyInstaller + Tauri Sidecar)

사용자 PC에 파이썬이 전혀 깔려있지 않더라도 실행할 수 있는 독립 실행 파일로 배포하기 위해, `uv` 가상환경에서 `PyInstaller`를 사용해 백엔드를 빌드합니다.

### 3-A. PyInstaller 설치
```bash
cd python-backend
uv pip install pyinstaller
```

### 3-B. 단일 실행 파일로 컴파일
아래 명령어를 통해 파이썬 FastAPI 백엔드를 단일 실행 파일(`.exe` 등)로 컴파일합니다.

```bash
# Windows 기준 예시
uv run pyinstaller --onefile --name gws-backend main.py
```
* 빌드가 완료되면 `python-backend/dist/` 디렉토리에 `gws-backend.exe`(Windows) 또는 `gws-backend`(macOS) 파일이 생성됩니다.

저장소 루트의 자동화 스크립트를 사용하면 PyInstaller 설치, 백엔드 빌드, Tauri sidecar 파일명 복사를 한 번에 실행할 수 있습니다.
```powershell
npm run build:backend
```

### 3-C. Tauri Sidecar 적용
1. 생성된 바이너리를 `src-tauri/bin/` 디렉토리로 복사합니다.
2. Tauri 사이드카 요구 사양에 맞게 파일명에 target triple(플랫폼 식별자)을 추가해야 합니다.
   * 예 (Windows 64bit): `gws-backend-x86_64-pc-windows-msvc.exe`
   * 예 (macOS Apple Silicon): `gws-backend-aarch64-apple-darwin`
3. `src-tauri/tauri.conf.json`의 `bundle.externalBin` 설정을 통해 사이드카를 패키징합니다.

---

## 4. 백엔드 실행 방식 요약

| 모드 | 백엔드 실행 파일 경로 | 실행 메커니즘 |
| :--- | :--- | :--- |
| **개발 (Debug)** | `python-backend/.venv/Scripts/python.exe` | Rust `setup` 단계에서 직접 서브프로세스로 `main.py` 실행 및 라이프사이클 관리 |
| **배포 (Release)** | `src-tauri/bin/gws-backend-[target]` | Tauri Sidecar API를 사용해 번들링된 바이너리 실행 |
