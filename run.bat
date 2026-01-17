@echo off
echo 🎨 Building frontend...
cd frontend
call npm run build

if %ERRORLEVEL% NEQ 0 (
    echo ❌ Frontend build failed!
    exit /b 1
)

echo ✅ Frontend built successfully!
echo.
echo 🚀 Starting backend server...
cd ..\backend
cargo run
