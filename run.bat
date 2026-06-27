@echo off
title Local LLM GWS Runner
chcp 65001 > NUL

echo ==================================================
echo  기존 좀비 프로세스 확인 및 정리 중...
echo ==================================================

:: 백엔드 포트 (18731) 정리
for /f "tokens=5" %%a in ('netstat -aon ^| findstr :18731 ^| findstr LISTENING') do (
    echo [Clean] 백엔드 포트(18731) 점유 프로세스 종료 (PID: %%a)
    taskkill /F /PID %%a >nul 2>&1
)

:: 프론트엔드 포트 (18732) 정리
for /f "tokens=5" %%a in ('netstat -aon ^| findstr :18732 ^| findstr LISTENING') do (
    echo [Clean] 프론트엔드 포트(18732) 점유 프로세스 종료 (PID: %%a)
    taskkill /F /PID %%a >nul 2>&1
)

echo ==================================================
echo  Local LLM Google Workspace Integrator 기동 중...
echo ==================================================

:: 1. Tauri 및 내장 파이썬 백엔드 기동
echo Tauri 데스크톱 앱 및 내장 백엔드를 시작합니다...

:: 2. Tauri 프론트엔드 기동
echo.
echo [2/2] Tauri 프론트엔드 데스크톱 앱을 시작합니다...
echo.
npm run tauri dev

pause
