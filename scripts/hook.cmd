@echo off
rem agy-memory hook launcher (Windows).
rem Antigravity runs hook commands via `cmd /c`, and PATH may not include node,
rem so resolve a concrete interpreter first.
setlocal
set "NODE_EXE="
where node >nul 2>nul && set "NODE_EXE=node"
if not defined NODE_EXE if exist "%ProgramFiles%\nodejs\node.exe" set "NODE_EXE=%ProgramFiles%\nodejs\node.exe"
if not defined NODE_EXE if exist "%LOCALAPPDATA%\Programs\nodejs\node.exe" set "NODE_EXE=%LOCALAPPDATA%\Programs\nodejs\node.exe"
if not defined NODE_EXE (
  echo {"injectSteps":[]}
  exit /b 0
)
"%NODE_EXE%" "%~dp0hook.js" %1
exit /b 0
