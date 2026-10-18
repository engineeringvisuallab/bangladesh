> Historical Stage 3 notes. The current coordinate system and build pipeline were revised in Stage 5; use `README.md` and `DATA-PIPELINE.md` for current instructions.

# Stage 3 — Nationwide offline dataset build

Stage 2 introduces a fixed geographic tile grid and a local static tile format. The supplied `tools/build_tile.py` creates a single pilot tile from live public services so that static hosting can serve it repeatedly without requesting terrain/OSM data on each visit.

## Next engineering milestone

1. Download a licensed Bangladesh DEM source and the Geofabrik Bangladesh OSM `.osm.pbf` extract to local storage.
2. Build an offline processor using GDAL/PROJ and an OSM PBF reader; clip and tile the DEM and vector features in a deterministic national grid.
3. Produce 3 or more LODs, decimate far terrain, and preserve coordinate/provenance metadata.
4. Extend the engine to stream static local tiles and neighboring tiles without resetting camera movement.
5. Host the nationwide tile pack in object storage/CDN; keep GitHub Pages for HTML/JS/CSS only.
6. Quality-audit sample locations for every district. Report missing building heights separately from measured/reported heights.

## Important

Do not bulk-build the whole country by repeatedly hitting the public Open-Meteo or Overpass APIs. They are shared services, not a nationwide batch-processing backend. The one-tile builder is for prototyping and smoke tests. Production national processing should use downloaded source extracts and respect all licensing/attribution terms.
