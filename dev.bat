@echo off
echo Starting Private-Input Sealed-Bid Auction System in Development Mode...
echo.

echo Checking for Node.js...
node --version >nul 2>&1
if %errorlevel% neq 0 (
    echo Node.js is not installed. Please run setup.bat first.
    pause
    exit /b 1
)

echo Checking for nodemon...
npm list nodemon >nul 2>&1
if %errorlevel% neq 0 (
    echo Installing nodemon for development...
    npm install --save-dev nodemon
)

echo Starting development server with auto-reload on http://localhost:3000
echo Press Ctrl+C to stop the server
echo.

npx nodemon server.js
