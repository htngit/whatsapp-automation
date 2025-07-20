@echo off
echo Starting WhatsApp Automation Instalation by XalesIn...
echo.

echo Starting Backend Installation...
start "Backend Installation" cmd /k "cd backend && npm install"

echo Waiting for Backend Installation (this may take up to 10 minutes)...
timeout /t 600 /nobreak > nul

echo Starting Frontend Installation...
start "Frontend Installation" cmd /k "cd .. && cd frontend && npm install"

echo.
echo Front end and Backend Installed
echo Backend: http://localhost:3001
echo Frontend: http://localhost:3000
echo.
echo Press any key to exit...
pause > nul