# Bangladesh Open World — data pipeline notes

## Implemented in Stage 2

The app now uses a deterministic ~3 km geographic tile grid. It first attempts to load `data/tiles/<tile-key>.json`, a compact package containing a terrain height grid and OpenStreetMap way geometries. The browser can construct terrain, road ribbons, waterways and extruded buildings from that static input. If no local tile exists, the prototype falls back to live public APIs.

`tools/build_tile.py` is the pilot preprocessor. It requests one tile from Open-Meteo Elevation and OpenStreetMap Overpass, writes the exact schema consumed by `src/main.js`, and includes source-attribution metadata. `tools/validate_tile.py` checks the output structure.

## Required national pipeline (next stage)

Do not request thousands of tiles from shared public APIs. For a countrywide build, download the applicable licensed data first, then process it locally.

1. Elevation: download a suitable DEM dataset and document its licence, date, CRS, vertical datum and resolution.
2. Vector geometry: download the Bangladesh OSM `.osm.pbf` extract from Geofabrik.
3. Processing: use GDAL/PROJ plus an OSM PBF reader to clip and transform roads, waterways, railways, buildings, bridges and land-use layers.
4. Terrain: create a multiresolution DEM tile pyramid; broad LOD at distance and higher-resolution LOD near the camera.
5. Models: extrude building footprints from reported heights/levels; track inferred heights explicitly as estimates.
6. Output: write static per-tile payloads or glTF/3D Tiles, preserving WGS84 source coordinates, tile origin, provenance and dataset versions.
7. Hosting: keep the web client in GitHub Pages and host large nationwide data through object storage/CDN with CORS and cache headers.
8. QA: compare road/river/bridge checkpoints to source data and sample at least one tile in each district.

## Constraints

The current tile builder is a prototype and its Overpass output is capped by feature class. It is not a national data downloader, and a GLO-90 terrain grid cannot show every small embankment, road grade, culvert or roof detail. A full, accurate, every-building 3D Bangladesh requires much more source data and processing than the current prototype package contains.
