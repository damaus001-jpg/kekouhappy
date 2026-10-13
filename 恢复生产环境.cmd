@echo off
setlocal
chcp 65001 >nul
cd /d "%~dp0"
powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File "%~dp0tools\restore-production-environment.ps1" -InstallMissingSystemTools
set "RESTORE_EXIT_CODE=%ERRORLEVEL%"
echo.
if "%RESTORE_EXIT_CODE%"=="0" (
  echo 生产环境恢复流程已结束。
) else (
  echo 生产环境恢复失败，请查看上方错误和 .tmp\production-environment-restore-report.json。
)
pause
exit /b %RESTORE_EXIT_CODE%
