@echo off
setlocal
cd /d "%~dp0"
echo Bangladesh Open World - Build one static tile around Dhaka
echo.
python --version >nul 2>&1
if errorlevel 1 (
  echo Python was not found. Install Python 3.10 or newer from https://www.python.org/downloads/ and enable "Add Python to PATH".
  echo.
  pause
  exit /b 1
)
python tools\build_tile.py --lat 23.8103 --lon 90.4125
if errorlevel 1 (
  echo.
  echo Tile build failed. Check the internet connection and try again later.
) else (
  echo.
  echo Tile build finished. The new JSON is inside data\tiles\.
  echo Commit and push that file to GitHub to let the site use the static tile.
)
echo.
pause
