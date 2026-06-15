@echo off
title Local LLM GWS Runner
chcp 65001 > NUL

echo ==================================================
echo  Local LLM Google Workspace Integrator 기동 중...
echo ==================================================

:: 1. 파이썬 백엔드 기동 (새 터미널 창에서 백그라운드로 실행)
echo [1/2] 파이썬 백엔드(FastAPI) 서버를 시작합니다...
cd python-backend
if exist .venv\Scripts\activate.bat (
    echo [.venv 가상환경 감지됨]
    start "GWS Python Backend" cmd /k "call .venv\Scripts\activate.bat && python main.py"
) else if exist venv\Scripts\activate.bat (
    echo [venv 가상환경 감지됨]
    start "GWS Python Backend" cmd /k "call venv\Scripts\activate.bat && python main.py"
) else (
    echo [가상환경 폴더가 없습니다. 글로벌 파이썬으로 실행합니다]
    start "GWS Python Backend" cmd /k "python main.py"
)

:: 원래 경로로 복귀
cd ..

:: 2. Tauri 프론트엔드 기동
echo.
echo [2/2] Tauri 프론트엔드 데스크톱 앱을 시작합니다...
echo.
npm run tauri dev

pause
