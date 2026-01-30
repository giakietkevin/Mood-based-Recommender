@echo off
echo ================================================================================
echo   PREPARING FILES FOR COLAB UPLOAD
echo ================================================================================
echo.

cd /d "%~dp0"

echo [1/3] Creating upload package...
if not exist "colab_upload" mkdir colab_upload

echo [2/3] Copying notebook...
copy "RVC_Training_Vietnamese_Singer.ipynb" "colab_upload\" >nul
echo   - Notebook copied!

echo [3/3] Zipping dataset...
powershell -Command "Compress-Archive -Path 'dataset\raw\*.wav' -DestinationPath 'colab_upload\vocals_dataset.zip' -Force"
echo   - Dataset zipped!

echo.
echo ================================================================================
echo   PACKAGE READY!
echo ================================================================================
echo.
echo Location: %~dp0colab_upload\
echo.
echo Files:
echo   1. RVC_Training_Vietnamese_Singer.ipynb (notebook)
echo   2. vocals_dataset.zip (12 vocals, ~550 MB)
echo.
echo NEXT STEPS:
echo   1. Open: https://colab.research.google.com/
echo   2. Upload: RVC_Training_Vietnamese_Singer.ipynb
echo   3. In Colab, upload: vocals_dataset.zip
echo   4. Click: Runtime - Run all
echo   5. Wait 5 hours
echo   6. Download model!
echo.
echo ================================================================================
echo Press any key to open Colab in browser...
pause >nul

start https://colab.research.google.com/

echo.
echo Opening colab_upload folder...
explorer "%~dp0colab_upload"

echo.
echo DONE! Follow steps above!
pause
