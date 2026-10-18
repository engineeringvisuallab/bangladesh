# Stage 2 — national data pipeline plan

The runtime prototype demonstrates rendering, but it must not be scaled to all Bangladesh by repeatedly calling public APIs. A nationwide product should use a deterministic, reproducible offline pipeline.

## Inputs

1. **Elevation** — Copernicus DEM GLO-90 for broad coverage; verify tile availability/terms for Bangladesh. Use a higher-resolution DEM where legitimately available.
2. **Vector geometry** — Bangladesh OSM `.osm.pbf` extract from Geofabrik. Filter roads, waterways, building footprints, bridges, railway and land-use.
3. **Optional land cover** — a licensed land-cover product (not random procedural color) for fields, forest, wetlands and urbanized areas.
4. **Optional detailed city assets** — surveyed/photogrammetric/municipal building heights and models when rights and accurate source data exist.

## Offline build steps

1. Clip/align the DEM and OSM vectors to a shared CRS and vertical datum; document sources and dates.
2. Process DEM into multi-resolution terrain tiles (coarse far away, fine nearby).
3. Convert vector roads to 3D ribbons with measured/tagged widths where available; flag inferred widths.
4. Convert waterways/water polygons and bridge decks into meshes. Do not assume all road crossings are bridges; verify tags/data.
5. Extrude building footprints using reported height/levels. Store uncertainty metadata for inferred heights.
6. Export assets as glTF/GLB or 3D Tiles; preserve original latitude/longitude for each tile and use a local origin at runtime to avoid float precision issues.
7. Publish tile files to static object storage/CDN and keep the GitHub Pages repository focused on the engine/client code.
8. Add content versioning, tile index, cache strategy, data provenance, OSM attribution, and a visual quality/accuracy audit by district.

## Acceptance tests for a future national build

- Random checkpoints along national and regional roads agree with the source coordinates within a documented tolerance.
- Elevation checkpoints and river/road crossings are inspected, with known DEM vertical limitations documented.
- Reported building heights are separated from estimated heights in metadata/UI.
- At least three LOD levels are available and browser memory remains bounded during cross-country traversal.
- All tiles load on GitHub Pages with correct MIME types/CORS; large geometry is hosted outside the Git repository if size is excessive.
