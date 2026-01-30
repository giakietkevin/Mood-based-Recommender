@echo off
echo ================================================================================
echo   CLEAN PROJECT - XOA FILES DU THUA
echo ================================================================================
echo.

echo Dang xoa cac file scripts that bai...

REM Download scripts that bai
del /f /q download_youtube_batch.py 2>nul
del /f /q download_fast.py 2>nul
del /f /q download_dataset.py 2>nul

REM Auto setup scripts that bai
del /f /q SETUP_AUTO.bat 2>nul
del /f /q setup_auto.sh 2>nul
del /f /q SETUP_QUICK.bat 2>nul

REM Requirements khong can
del /f /q requirements-dataset.txt 2>nul
del /f /q requirements-minimal.txt 2>nul

REM Guide files du thua
del /f /q FIX_YTDLP_ERROR.txt 2>nul
del /f /q DOWNLOAD_FAST_GUIDE.txt 2>nul
del /f /q YOUTUBE_UVR5_QUICK.txt 2>nul
del /f /q YOUTUBE_LINKS.txt 2>nul
del /f /q START_HERE.txt 2>nul
del /f /q FAST_DOWNLOAD.txt 2>nul
del /f /q SAFE_INSTALL.txt 2>nul
del /f /q QUICK_COMMANDS.txt 2>nul
del /f /q EXPANDED_SONGS_LIST.txt 2>nul
del /f /q PRO_QUALITY_GUIDE.txt 2>nul
del /f /q COMMANDS.txt 2>nul

REM Docs du thua
del /f /q OPTIMIZATION_GUIDE.md 2>nul
del /f /q CHANGELOG.md 2>nul
del /f /q WHATS_NEW.md 2>nul

REM Deployment guides du thua
del /f /q DEPLOY_GUIDE.md 2>nul
del /f /q DEPLOY_HUGGINGFACE.md 2>nul
del /f /q SETUP_COMPLETE.md 2>nul
del /f /q RVC_INTEGRATION.md 2>nul

REM Training guides chi tiet qua
del /f /q TRAIN_RVC_QUICK_START.md 2>nul
del /f /q DATASET_PREPARATION.md 2>nul
del /f /q DATASET_LINKS.md 2>nul
del /f /q COLAB_FIXES.md 2>nul

REM Gitignore, dockerignore
del /f /q .dockerignore 2>nul

REM Temp folders
rmdir /s /q downloads 2>nul
rmdir /s /q __pycache__ 2>nul
rmdir /s /q .pytest_cache 2>nul

echo.
echo ================================================================================
echo   DONE! FILES DA XOA!
echo ================================================================================
echo.
echo FILES CON LAI (CAN THIET):
echo   - main.py (APP chinh)
echo   - index.html (UI)
echo   - config.py (cau hinh)
echo   - requirements.txt (dependencies)
echo   - Dockerfile (deployment)
echo   - rvc_engine.py (singing voice)
echo   - setup_rvc.py (setup models)
echo   - RVC_TRAINING_COLAB.ipynb (training notebook)
echo   - MANUAL_DOWNLOAD_10_SONGS.txt (huong dan manual)
echo   - START_MANUAL.txt (quick start)
echo   - PROGRESS_CHECKLIST.txt (tien do)
echo   - README.md (project info)
echo   - beats/ (nhac nen)
echo   - models/ (RVC models)
echo.
echo PROJECT DA CLEAN! ✓
echo.
pause
