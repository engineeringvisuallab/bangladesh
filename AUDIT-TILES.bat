@echo off
setlocal
cd /d "%~dp0"
set "TILE_DIR=data\national-tiles-v2"
if not "%~1"=="" set "TILE_DIR=%~1"
echo Bangladesh Open World - Stage 5 grid-v2 terrain seam audit
echo Tile directory: %TILE_DIR%
echo.
python --version >nul 2>&1
if errorlevel 1 (
  echo Install Python 3.11 or newer and enable Add Python to PATH.
  pause
  exit /b 1
)
if not exist "%TILE_DIR%" (
  echo Missing tile directory. Build a pilot first or pass a path such as:
  echo AUDIT-TILES.bat data\pilot-tiles-v2
  pause
  exit /b 1
)
python tools\audit_tile_seams.py --tiles "%TILE_DIR%" --report "%TILE_DIR%\seam-report.json"
if errorlevel 1 goto :failed
echo.
echo Seam audit finished. Review "%TILE_DIR%\seam-report.json".
pause
exit /b 0
:failed
echo.
echo Seam audit reported invalid tile data or elevation mismatch. Review the report and rebuild/fix tiles.
pause
exit /b 1
