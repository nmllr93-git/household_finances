@echo off
REM One-time setup: checks Node.js and creates the two logins.
cd /d "%~dp0\.."
where node >nul 2>nul || (echo Node.js is not installed. Install the LTS version from https://nodejs.org, then run this again. & pause & exit /b 1)
node -e "const [a,b]=process.versions.node.split('.').map(Number);process.exit(a>22||(a===22&&b>=13)?0:1)" || (echo Node.js 22.13 or newer is needed. Install the current LTS from https://nodejs.org. & pause & exit /b 1)
echo.
echo === Login for Nate (sees: Nate - Personal, Shared household) ===
node --disable-warning=ExperimentalWarning server.js add-user nate nate,shared
echo.
echo === Login for McKenna (sees: McKenna - Personal, Shared household) ===
node --disable-warning=ExperimentalWarning server.js add-user mckenna mckenna,shared
echo.
echo Done. Run scripts\start-windows.bat to start it, or scripts\install-autostart.ps1 to have it start with Windows.
pause
