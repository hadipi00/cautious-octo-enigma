@echo off
chcp 65001 >nul
title AIRDOM - LAN Multiplayer Server
echo ============================================
echo   AIRDOM - LAN Multiplayer Server (port 9090)
echo ============================================
echo.

cd /d "%~dp0server"

where node >nul 2>nul
if not %errorlevel%==0 (
  echo [!] Node.js not found. Install it from https://nodejs.org
  pause
  exit /b 1
)

if not exist node_modules (
  echo Installing ws package (one time) ...
  call npm install --no-audit --no-fund
)

echo.
echo LAN server is running on port 9090
echo Your friends should open:  http://YOUR-IP:8123   and enter your IP.
echo (To see your IP: open new cmd and type  ipconfig  )
echo Keep this window open. Close it to stop.
echo.
node server.js 9090
pause
