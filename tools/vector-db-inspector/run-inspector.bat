@echo off
title Vector DB Inspector Launcher
echo ===================================================
echo  Vector DB Inspector 시각화 도구 런처 (Port: 28732)
echo ===================================================

:: 배치 파일이 있는 위치로 명확히 이동 (/d 플래그로 드라이브 변경 대응)
cd /d "%~dp0"

:: 1. 백엔드 실행 (메인 프로젝트의 .venv 재활용으로 오류 최소화)
echo [1/2] 백엔드 Python 서버 기동 준비...

:: 상대경로(..\..)가 포함된 가상환경 경로를 완전한 윈도우 절대 경로로 정제합니다.
for %%i in ("%~dp0..\..\python-backend") do set MAIN_BACKEND_DIR=%%~fi
set MAIN_VENV=%MAIN_BACKEND_DIR%\.venv
set PYTHON_EXE=python

if exist "%MAIN_VENV%\Scripts\python.exe" (
    echo [정보] 메인 프로젝트의 가상환경(.venv)을 활용합니다.
    set PYTHON_EXE=%MAIN_VENV%\Scripts\python.exe
) else (
    echo [경고] 메인 프로젝트 가상환경을 찾지 못했습니다. 로컬 venv 생성을 시도합니다...
    cd /d "%~dp0backend"
    if not exist .venv (
        python -m venv .venv
    )
    if exist .venv\Scripts\python.exe (
        set PYTHON_EXE=%~dp0backend\.venv\Scripts\python.exe
        call .venv\Scripts\activate
        pip install -r requirements.txt
    )
)

echo [정보] 백엔드 API 서버를 별도 창에서 실행합니다... (Port 28731)
:: CMD 따옴표 오작동 문제를 해결하기 위해 안전한 문자열 포맷으로 호출합니다.
start "Inspector Backend" /D "%~dp0backend" cmd /k "%PYTHON_EXE% main.py"


:: 2. 프론트엔드 설치 및 실행
echo [2/2] 프론트엔드 NPM 의존성 패키지 설치...
cd /d "%~dp0frontend"
call npm install

echo [3/3] 브라우저 오픈 및 프론트엔드 Vite 서버 기동... (Port 28732)
start http://localhost:28732
call npm run dev


