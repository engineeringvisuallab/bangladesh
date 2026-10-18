@echo off
setlocal
cd /d "%~dp0"
echo Bangladesh Open World - Merge DEM GeoTIFF tiles
echo.
python --version >nul 2>&1
if errorlevel 1 (
  echo Python 3.11 or newer is recommended. Install from https://www.python.org/downloads/ and enable Add Python to PATH.
  pause
  exit /b 1
)
python -m pip install -r tools\requirements-stage3.txt
if errorlevel 1 goto :failed
if not exist data\source\dem_tiles (
  mkdir data\source\dem_tiles
  echo Created data\source\dem_tiles.
  echo Download DEM GeoTIFF tiles from the official Copernicus Data Space and place them in that folder.
  echo Then run this file again.
  pause
  exit /b 0
)
python tools\merge_dem_tiles.py data\source\dem_tiles data\source\bangladesh-dem.tif
if errorlevel 1 goto :failed
echo.
echo DEM mosaic ready at data\source\bangladesh-dem.tif
pause
exit /b 0
:failed
echo.
echo DEM merge failed. Check the error above and verify all TIFF files share a CRS.
pause
exit /b 1
