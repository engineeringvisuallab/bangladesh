@echo off
setlocal
cd /d "%~dp0"
echo Bangladesh Open World - Stage 5 pilot build (nearest 25 grid-v2 tiles around Dhaka)
echo This tests your national source files without writing the whole country's tile set.
echo.
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
  echo Missing DEM mosaic. Download Copernicus DEM GeoTIFF tiles and run MERGE-DEM-TILES.bat first.
  pause
  exit /b 1
)
python tools\build_national_tiles.py --osm-pbf data\source\bangladesh-latest.osm.pbf --country-poly data\source\bangladesh.poly --dem data\source\bangladesh-dem.tif --output-dir data\pilot-tiles-v2 --work-dir data\national-build-v2 --max-tiles 25
if errorlevel 1 goto :failed
echo.
echo Pilot tiles created in data\pilot-tiles-v2. Running seam audit now...
python tools\audit_tile_seams.py --tiles data\pilot-tiles-v2 --report data\pilot-tiles-v2\seam-report.json
if errorlevel 1 goto :failed
echo.
echo Pilot build and seam audit passed. Inspect data\pilot-tiles-v2\seam-report.json before publishing.
echo For local test, set config.js tileBaseUrl to ./data/pilot-tiles-v2/ and keep the folder next to the app.
pause
exit /b 0
:failed
echo.
echo Pilot build or seam audit failed. Check missing data, grid-v2 schema, DEM coverage, dependencies and free disk space. The pilot output is separate from legacy tiles.
pause
exit /b 1
