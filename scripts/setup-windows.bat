@echo off
REM One-time setup: checks Node.js, shows the budgets (dashboards) and creates logins.
setlocal
cd /d "%~dp0\.."
where node >nul 2>nul || (echo Node.js is not installed. Install the LTS version from https://nodejs.org, then run this again. & pause & exit /b 1)
node -e "const [a,b]=process.versions.node.split('.').map(Number);process.exit(a>22||(a===22&&b>=13)?0:1)" || (echo Node.js 22.13 or newer is needed. Install the current LTS from https://nodejs.org. & pause & exit /b 1)
set N=node --disable-warning=ExperimentalWarning server.js
echo.
echo These budgets (dashboards) exist. The first column is the id you type below.
%N% budgets
echo.
set /p MORE=Create another budget first? (y/N) 
if /i "%MORE%"=="y" (
  set /p BID=Budget id ^(short, no spaces, e.g. alex^): 
  set /p BNAME=Budget name ^(e.g. Alex - Personal^): 
  call %N% add-budget %%BID%% %%BNAME%%
  %N% budgets
)
:login
echo.
set LOGIN=
set /p LOGIN=New login name (blank to finish): 
if "%LOGIN%"=="" goto done
set /p BOOKS=Budgets this login can see, comma separated (e.g. personal,shared): 
%N% add-user %LOGIN% %BOOKS%
goto login
:done
echo.
echo Done. Run scripts\start-windows.bat to start it, or scripts\install-autostart.ps1 to have it start with Windows.
pause
