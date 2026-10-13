@echo off
cd /d "%~dp0"
call npm.cmd run dev:assistant
if errorlevel 1 pause
