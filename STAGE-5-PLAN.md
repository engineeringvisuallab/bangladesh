# Stage 5: Seam-Aligned Streaming World

## Implemented in this package

1. Replace row-dependent longitude stepping with a fixed-reference grid (v2) shared by JavaScript and Python.
2. Rebuild tile generators to emit schema-v2 files, explicit `gridVersion`, consistent bounds, and per-sample no-data masks.
3. Reject older tile schema files instead of silently placing data on the wrong grid.
4. Add runtime edge reconciliation for resident neighbor tiles and average compatible border normals to reduce height/shading seams.
5. Fix the missing illustrative fallback-terrain helper so an elevation-service outage has an explicit fallback rather than a runtime `ReferenceError`.
6. Add `validate_tile.py`, `test_streaming_grid.py`, `audit_tile_seams.py`, and `test_seam_audit.py`.
7. Write an offline seam report before publishing a dataset.

## Required user-side validation

- Rebuild a small pilot using the new grid version. Stage 1–4 tile JSON cannot be reused because the projection/grid addressing changed.
- Open at least four adjacent tiles in the viewer and move across tile borders.
- Review the seam report. Any >5 m shared-edge discrepancy needs source review/rebuild. Values >20 m are not automatically blended by the runtime engine.
- Inspect the terrain source and no-data share in several tiles, especially coastal/island tiles.

## Next stage: Stage 6

Once the pilot grid passes, improve terrain quality without inventing detail: validate DEM CRS/vertical units and coverage; add a higher-resolution DEM layer for selected urban or hilly areas where licensed; store source resolution and nodata metadata in the manifest; and compare known checkpoints before expanding the nationwide build.
