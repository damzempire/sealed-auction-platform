@echo off
echo Setting up Private-Input Sealed-Bid Auction System...
echo.

echo Checking for Node.js installation...
node --version >nul 2>&1
if %errorlevel% neq 0 (
    echo Node.js is not installed. Please install Node.js first:
    echo 1. Download Node.js from https://nodejs.org/
    echo 2. Run the installer
    echo 3. Restart your terminal/command prompt
    echo 4. Run this script again
    echo.
    pause
    exit /b 1
)

echo Node.js is installed.
node --version

echo.
echo Installing project dependencies...
npm install

if %errorlevel% neq 0 (
    echo Failed to install dependencies. Please check your internet connection.
    pause
    exit /b 1
)

echo.
echo Dependencies installed successfully!
echo.
echo To start the auction system:
echo 1. Run: npm start
echo 2. Open your browser and go to: http://localhost:3000
echo.
echo For development with auto-reload:
echo Run: npm run dev
echo.
echo Project scaffolded successfully!
pause
