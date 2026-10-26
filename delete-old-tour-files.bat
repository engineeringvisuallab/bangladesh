@echo off
cd /d "%~dp0"
del /q "src\tour\TourRoadPilot.ts" "src\tour\TourRoadPlanner.ts"
echo Old tour files deleted.
pause
