@echo off
echo 🔧 Testing API Rate Limiter startup...

REM Set required environment variables
set NODE_ENV=development
set REDIS_ENABLED=false
set JWT_SECRET=test-secret-for-local-development-only
set HOST=0.0.0.0
set PORT=3000

echo 📋 Environment variables:
echo   NODE_ENV=%NODE_ENV%
echo   REDIS_ENABLED=%REDIS_ENABLED%
echo   JWT_SECRET=[HIDDEN]
echo   HOST=%HOST%
echo   PORT=%PORT%

echo.
echo 🚀 Starting application...

REM Start the application
node dist\index.js
