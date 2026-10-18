$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$sourceDir = Join-Path $root 'data\source'
New-Item -ItemType Directory -Force -Path $sourceDir | Out-Null
$downloads = @(
  @{ Url = 'https://download.geofabrik.de/asia/bangladesh-latest.osm.pbf'; Path = (Join-Path $sourceDir 'bangladesh-latest.osm.pbf') },
  @{ Url = 'https://download.geofabrik.de/asia/bangladesh.poly'; Path = (Join-Path $sourceDir 'bangladesh.poly') }
)
foreach ($item in $downloads) {
  if (Test-Path $item.Path) {
    Write-Host "Already exists, skipping: $($item.Path)"
    continue
  }
  Write-Host "Downloading $($item.Url)"
  Write-Host "Saving to $($item.Path)"
  Invoke-WebRequest -Uri $item.Url -OutFile $item.Path -UseBasicParsing
  if (!(Test-Path $item.Path) -or (Get-Item $item.Path).Length -lt 1000) {
    throw "Download appears incomplete: $($item.Path)"
  }
}
Write-Host ''
Write-Host 'OpenStreetMap national extract and boundary downloaded.'
Write-Host 'NEXT: Download Copernicus DEM GLO-90 GeoTIFF tiles covering Bangladesh from the official Copernicus Data Space, put them in data\source\dem_tiles, then run MERGE-DEM-TILES.bat.'
