@echo off
rem Always start the current build. The path is relative to this file, so a Chinese folder name cannot break it,
rem and ELECTRON_RUN_AS_NODE is cleared because a parent shell that sets it makes Electron run as plain Node.
set "ELECTRON_RUN_AS_NODE="
set "CODEBUDDY_NODE_RUN_AS_NODE="
cd /d "%~dp0"
if not exist "release\win-unpacked\Mark Bot.exe" (
  echo The current build is missing. Run: pnpm package:win
  pause
  exit /b 1
)
start "" "release\win-unpacked\Mark Bot.exe"
