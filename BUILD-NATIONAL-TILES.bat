@echo off
setlocal
cd /d "%~dp0"
echo BANGLADESH OPEN WORLD - STAGE 5 FULL NATIONAL GRID-V2 TILE BUILD
echo WARNING: This may take hours and produce many thousands of tile files plus large temporary data.
echo Do not put the raw PBF, DEM mosaic or full national tile directory in your GitHub source repository.
echo.
choice /M "Continue with FULL national build"
if errorlevel 2 exit /b 0
python --version >nul 2>&1
if errorlevel 1 (
  echo Install Python 3.11 or newer and enable Add Python to PATH.
  pause
  exit /b 1
)
python -m pip install -r tools\requirements-stage3.txt
if errorlevel 1 goto :failed
if not exist data\source\bangladesh-latest.osm.pbf (
  echo Missing OSM extract. Run DOWNLOAD-NATIONAL-DATA.ps1 first.
  pause
  exit /b 1
)
if not exist data\source\bangladesh.poly (
  echo Missing boundary file. Run DOWNLOAD-NATIONAL-DATA.ps1 first.
  pause
  exit /b 1
)
if not exist data\source\bangladesh-dem.tif (
  echo Missing DEM mosaic. Run MERGE-DEM-TILES.bat first.
  pause
  exit /b 1
)
python tools\build_national_tiles.py --osm-pbf data\source\bangladesh-latest.osm.pbf --country-poly data\source\bangladesh.poly --dem data\source\bangladesh-dem.tif --output-dir data\national-tiles-v2 --work-dir data\national-build-v2
if errorlevel 1 goto :failed
echo.
echo National data build finished. Running terrain seam audit...
python tools\audit_tile_seams.py --tiles data\national-tiles-v2 --report data\national-tiles-v2\seam-report.json
if errorlevel 1 goto :failed
echo.
echo National tile build and seam audit passed. Review the report, then upload tiles to a CORS-enabled static host/CDN.
pause
exit /b 0
:failed
echo.
echo National build or seam audit failed. Keep data\national-build-v2 for diagnostics. Old schema-v1 feature databases must be rebuilt if grid v2 changed.
pause
exit /b 1
