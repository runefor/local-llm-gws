@echo off
title Local LLM GWS Runner
chcp 65001 > NUL

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
