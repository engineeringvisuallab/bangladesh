# Stage 5 real-data pipeline

## Coordinate/grid v2

`tools/world_grid.py` is the shared Python source of truth. The browser mirrors these constants in `src/main.js`:

- Tile size: 3,000 projected metres
- Grid origin: 20.5° N, 88.0° E
- Fixed longitude reference: 23.5° N
- Schema/grid version: 2

Using a fixed longitude step prevents north/south neighbors from shifting east-west as latitude changes. The projection is designed for visual/game-world consistency within Bangladesh; it is not an official cadastral projection and has small east-west scale distortion.

## Build pilot data

1. `DOWNLOAD-NATIONAL-DATA.ps1` downloads the Geofabrik Bangladesh OSM `.osm.pbf` and `.poly` boundary.
2. Download DEM GeoTIFF files for Bangladesh from the official Copernicus Data Space and put them in `data/source/dem_tiles/`.
3. Run `MERGE-DEM-TILES.bat` to create `data/source/bangladesh-dem.tif`.
4. Run `BUILD-PILOT-TILES.bat` to generate up to 25 tiles near Dhaka. Validate a sample with `python tools\validate_tile.py data\pilot-tiles-v2\r<row>_c<col>.json` after replacing the placeholder with an actual tile filename.
5. Run `AUDIT-TILES.bat data\pilot-tiles-v2` or `python tools\audit_tile_seams.py --tiles data\pilot-tiles-v2 --report data\pilot-tiles-v2\seam-report.json`. The full national output is `data\national-tiles-v2`; audit it with `AUDIT-TILES.bat` or the matching Python command.

The national compiler uses one local PBF + one local DEM mosaic; it does not query Overpass once per tile. The national dataset can take considerable memory, disk space and processing time.

## Seam audit

```powershell
python tools\audit_tile_seams.py --tiles data\pilot-tiles-v2 --report data\pilot-tiles-v2\seam-report.json
```

Default thresholds: warn above 1 m, fail above 5 m. The audit skips edge samples whose no-data mask is true. It validates adjacent terrain height samples only; it does not prove that OSM roads/buildings have complete coverage or that the visuals are photorealistic.

## Static hosting

Publish only web-app files to GitHub Pages. Host the compiled `r<row>_c<col>.json` tiles and `manifest.json` separately on a CORS-enabled static host/CDN. Point `config.js` `tileBaseUrl` at the tile directory. Set `allowLiveFallback: false` for production after the required tiles have been hosted and verified.

## Provenance

- OSM data should display attribution to © OpenStreetMap contributors and comply with ODbL.
- DEM data should retain its provider/source metadata and comply with applicable terms.
- Unknown/missing elevation values are marked in `terrain.nodataMask`; zeros used as storage placeholders are not reliable terrain measurements.
