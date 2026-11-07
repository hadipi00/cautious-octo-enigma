@echo off
chcp 65001 >nul
title AIRDOM - Browser Flight Sim
echo ============================================
echo   AIRDOM v3.1 "WARBIRD" - Browser Air Combat
echo ============================================
echo.

cd /d "%~dp0"

where node >nul 2>nul
if %errorlevel%==0 (
  echo [OK] Node.js found - starting dev server on port 8123 ...
  start "AIRDOM server" /min node server\dev-server.js 8123
  timeout /t 2 /nobreak >nul
  start http://localhost:8123
  goto :end
)

where python >nul 2>nul
if %errorlevel%==0 (
  echo [OK] Python found - starting http server on port 8123 ...
  start "AIRDOM server" /min python -m http.server 8123
  timeout /t 2 /nobreak >nul
  start http://localhost:8123
  goto :end
)

where py >nul 2>nul
if %errorlevel%==0 (
  echo [OK] Python launcher found - starting http server on port 8123 ...
  start "AIRDOM server" /min py -m http.server 8123
  timeout /t 2 /nobreak >nul
  start http://localhost:8123
  goto :end
)

echo [!] Neither Node.js nor Python was found.
echo     Install one of them and run this file again:
echo       - Node.js: https://nodejs.org  (recommended)
echo       - Python : https://python.org
echo.
pause
exit /b 1

:end
echo.
echo Game is running in your browser: http://localhost:8123
echo Keep this window open while playing. Close it to stop the server.
echo.
timeout /t 8 >nul
