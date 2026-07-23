@echo off
REM ============================================================
REM  Electron floating window launcher (double-click to run)
REM  - Equivalent to: npm start  (npm run build + electron-vite preview)
REM  - Close the window to exit cleanly (window-all-closed -> shutdown)
REM  - watcher + hover + drag/snap all active (production path)
REM ============================================================
cd /d "%~dp0"

where npm >nul 2>nul
if errorlevel 1 (
  echo [ERROR] Node.js / npm not found. Please install Node 20+ first.
  pause
  exit /b 1
)

echo Starting Electron floating window (first run may be slow, close window to exit)...
call npm start
echo.
echo App exited. Press any key to close this window.
pause >nul
