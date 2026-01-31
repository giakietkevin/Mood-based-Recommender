@echo off
echo ================================================================================
echo   COMMIT VOI CHI TEN GIAKIETKEVIN - KHONG CO CURSORAGENT
echo ================================================================================
echo.

cd /d "%~dp0"

echo [1/5] Checking git status...
echo.
git status --short
echo.

echo Files tren se duoc commit!
echo.
set /p MESSAGE="Nhap commit message: "

if "%MESSAGE%"=="" (
    echo [ERROR] Can nhap commit message!
    pause
    exit /b 1
)

echo.
echo [2/5] Staging files...
git add .

echo.
echo [3/5] Committing voi ten: vo pham gia kiet...
git commit -m "%MESSAGE%"

if errorlevel 1 (
    echo [ERROR] Commit failed!
    pause
    exit /b 1
)

echo.
echo [4/5] Pushing to GitHub...
git push origin main

if errorlevel 1 (
    echo [ERROR] GitHub push failed!
    pause
    exit /b 1
)

echo.
echo [5/5] Pushing to Hugging Face...
git push huggingface main --force

if errorlevel 1 (
    echo [WARNING] Hugging Face push failed (co the chua setup token)
)

echo.
echo ================================================================================
echo   DONE! COMMIT CHI CO TEN GIAKIETKEVIN!
echo ================================================================================
echo.
echo Xem commits:
git log -3 --oneline --format="%%h - %%s (%%an)"
echo.
echo ================================================================================
pause
