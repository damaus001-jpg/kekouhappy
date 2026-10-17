@echo off
setlocal
chcp 65001 >nul
cd /d "%~dp0"
powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File "%~dp0tools\restore-production-environment.ps1" -InstallMissingSystemTools -StartDevelopment
set "RESTORE_EXIT_CODE=%ERRORLEVEL%"
echo.
if "%RESTORE_EXIT_CODE%"=="0" (
  echo 项目开发环境已安装并启动。
) else (
  echo 生产环境恢复失败，请查看上方错误和 .tmp\production-environment-restore-report.json。
)
pause
exit /b %RESTORE_EXIT_CODE%
