@echo off
REM Double-click launcher for Koshel.
REM Just runs start.ps1 with bypassed execution policy.
cd /d "%~dp0"
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0start.ps1"
pause
