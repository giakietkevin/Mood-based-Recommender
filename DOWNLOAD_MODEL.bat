@echo off
title RVC Model Downloader - Singing Voice Setup
color 0A
cls

echo ================================================================================
echo   🎤 RVC MODEL DOWNLOADER - SINGING VOICE SETUP
echo ================================================================================
echo.
echo   This will download a pre-trained Vietnamese singing voice model
echo   Time needed: 5-10 minutes
echo   No training required!
echo.
echo ================================================================================
echo.

cd /d "%~dp0"

echo [1/3] Checking Python...
python --version >nul 2>&1
if errorlevel 1 (
    echo ❌ Python not found! Please install Python first.
    pause
    exit /b 1
)
echo   ✅ Python found!
echo.

echo [2/3] Installing dependencies...
pip install requests tqdm -q
if errorlevel 1 (
    echo ⚠️  Warning: Some dependencies failed, but continuing...
)
echo   ✅ Dependencies ready!
echo.

echo [3/3] Starting download...
echo.
echo ================================================================================
echo.

python download_rvc_model.py

echo.
echo ================================================================================
if not errorlevel 1 (
    echo   ✅ SETUP COMPLETE!
    echo.
    echo   Next steps:
    echo   1. Test locally: python main.py
    echo   2. Deploy to Hugging Face
    echo   3. Enjoy singing voice! 🎉
) else (
    echo   ⚠️  Download had issues
    echo.
    echo   Check DOWNLOAD_RVC_MODEL.txt for manual instructions
)
echo ================================================================================
echo.
pause
