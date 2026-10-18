# Stage 3 national offline tile pipeline

## Inputs

1. Geofabrik `bangladesh-latest.osm.pbf`
2. Matching Geofabrik `bangladesh.poly` boundary outline
3. Copernicus DEM GLO-90 GeoTIFF tile mosaic covering Bangladesh

## Processing flow

1. Parse the `.poly` country outline and make candidate 3 km cells on the exact JS engine grid.
2. Select cells whose center or sampled national boundary intersects the outline.
3. Read the PBF with pyosmium and a disk-based sparse node-location index.
4. Filter road/highway, railway, waterway, closed natural-water and closed building ways.
5. Assign line features to every relevant 3 km tile traversed by sampled geometry; assign building footprints and water-area polygons to intersected boundary/interior cells.
6. Persist tile-feature rows to a temporary SQLite database instead of keeping all OSM features in RAM.
7. Sample the local DEM raster on each tile's 33 × 33 (default) height grid, then write the same JSON schema used by the browser.
8. Produce `manifest.json` with counts and no-data samples.

## Commands

```powershell
python -m pip install -r tools/requirements-stage3.txt
python tools/build_national_tiles.py --osm-pbf data/source/bangladesh-latest.osm.pbf --country-poly data/source/bangladesh.poly --dem data/source/bangladesh-dem.tif --output-dir data/national-tiles --work-dir data/national-build --dry-run
```

Pilot:

```powershell
python tools/build_national_tiles.py --osm-pbf data/source/bangladesh-latest.osm.pbf --country-poly data/source/bangladesh.poly --dem data/source/bangladesh-dem.tif --output-dir data/national-tiles --work-dir data/national-build --max-tiles 25
```

Nationwide: remove `--max-tiles 25` and run the same command. To reuse an intact feature database after a DEM sampling/output failure, add `--resume-features` **only if the PBF and country outline are unchanged**.

## Why tiles are not stored in GitHub

The source extract and derived geometry are large, and thousands of JSON files add unnecessary source-control history. GitHub Pages is used for the frontend. Host the generated tile directory on object storage/CDN and set `tileBaseUrl` in `config.js`. If the configured host is remote, it must allow CORS GET requests from the Pages origin.

## Current coverage gap

This is the first national tiling pipeline, not a complete photorealistic digital twin. It creates meshes from DEM and OSM way data, does not manufacture missing geometry, and does not include high-resolution aerial building textures. Relations, complex structures, vegetation, land-use surface textures and multi-LOD streaming remain future work.
