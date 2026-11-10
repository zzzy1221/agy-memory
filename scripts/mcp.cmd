@echo off
rem agy-memory MCP server launcher (Windows).
rem Antigravity spawns MCP servers with a possibly bare PATH, so resolve node first.
setlocal
set "NODE_EXE="
where node >nul 2>nul && set "NODE_EXE=node"
if not defined NODE_EXE if exist "%ProgramFiles%\nodejs\node.exe" set "NODE_EXE=%ProgramFiles%\nodejs\node.exe"
if not defined NODE_EXE if exist "%LOCALAPPDATA%\Programs\nodejs\node.exe" set "NODE_EXE=%LOCALAPPDATA%\Programs\nodejs\node.exe"
if not defined NODE_EXE exit /b 1
"%NODE_EXE%" "%~dp0server.js"
exit /b %errorlevel%
