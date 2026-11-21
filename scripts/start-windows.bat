@echo off
REM Runs the server in this window. Close the window to stop it.
cd /d "%~dp0\.."
node --disable-warning=ExperimentalWarning server.js
pause
