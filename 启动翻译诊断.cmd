@echo off
cd /d "%~dp0"
call npm.cmd run dev:diagnostics
if errorlevel 1 pause
