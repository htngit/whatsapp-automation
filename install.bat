@echo off
echo Starting WhatsApp Automation Installation by XalesIn...
echo.

echo ========================================
echo Installing Backend Dependencies...
echo ========================================
cd backend
if not exist package.json (
    echo Error: Backend package.json not found!
    pause
    exit /b 1
)
npm install
if %errorlevel% neq 0 (
    echo Backend installation failed!
    pause
    exit /b 1
)
echo Backend installation completed successfully!
cd ..

echo.
echo ========================================
echo Installing Frontend Dependencies...
echo ========================================
cd frontend
if not exist package.json (
    echo Error: Frontend package.json not found!
    pause
    exit /b 1
)
npm install
if %errorlevel% neq 0 (
    echo Frontend installation failed!
    pause
    exit /b 1
)
echo Frontend installation completed successfully!
cd ..

echo.
echo ========================================
echo Installation Complete!
echo ========================================
echo Backend: http://localhost:3001
echo Frontend: http://localhost:3000
echo.
echo You can now run 'start-dev.bat' to start both servers.
echo.
echo Press any key to exit...
pause > nul