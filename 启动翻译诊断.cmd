@echo off
chcp 65001 >nul
cd /d "%~dp0"
call npm.cmd run dev:diagnostics
set "DIAGNOSTICS_EXIT_CODE=%ERRORLEVEL%"
if "%DIAGNOSTICS_EXIT_CODE%"=="20" (
  echo.
  echo 开发版已经在运行，请切换到已打开的窗口。
  pause
) else if not "%DIAGNOSTICS_EXIT_CODE%"=="0" pause
exit /b %DIAGNOSTICS_EXIT_CODE%
