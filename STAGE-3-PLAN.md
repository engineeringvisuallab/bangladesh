# Stage 3 plan — authoritative Bangladesh data pipeline

Stage 2 provides an experimental vector-tile layer bounded to Bangladesh, an optional OSM 3D Buildings layer, and direct local OSM road/waterway/railway requests. That is a prototype path, not a verified national dataset.

## Stage 3 target

Create our own versioned, license-tracked Bangladesh datasets that we can render consistently even if a public tile or Overpass service is unavailable.

## Pipeline

1. Download the current Bangladesh OSM extract from Geofabrik: https://download.geofabrik.de/asia/bangladesh.html
2. Record extract timestamp, source URL, OSM attribution, and ODbL obligations in metadata. Keep the original PBF outside the GitHub Pages repository.
3. Extract separate layers: roads, railways, waterways, bridges, administrative boundaries, building footprints, and selected land-use/water polygons. Preserve OSM IDs and relevant tags.
4. Validate geometry, coordinate reference system (WGS84 / EPSG:4326 at interchange), geometry validity, duplicate IDs, and out-of-country features. Keep source facts separate from estimated attributes.
5. Split the dataset by geographic tile (for example, 0.1° cells or a standard XYZ tiling scheme). Simplify geometry at low zoom levels and retain more detail at higher zoom levels.
6. Convert large rendering datasets to MVT or 3D Tiles. Do not try to load one national GeoJSON file into the browser.
7. Host tiles on static/object storage/CDN with correct CORS and content types; test cache behaviour and missing tiles. Keep the viewer configuration separate from the data generation pipeline.
8. Generate buildings as 3D only when measured/known heights or levels are available. Unknown heights must remain unknown or be clearly marked as estimates.
9. Test several areas: Dhaka urban core, a rural district, the Padma/Jamuna river areas, the Sundarbans/coast, and the Chittagong Hill Tracts.

## Important limits

- OpenStreetMap coverage varies and does not certify that every road/building is mapped or current.
- DEM grids around 30 m cannot represent every road crown, building, drainage ditch, or small terrain feature.
- Photorealistic textures and per-building facade geometry require separately licensed imagery, survey, photogrammetry, or another authorized 3D source.
- A GitHub Pages repository should contain the viewer and small configuration/static files, not a multi-hundred-megabyte national source file or a complete giant 3D Tiles archive.
