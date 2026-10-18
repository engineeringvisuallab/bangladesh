# Static prototype tiles (schema/grid v2)

The viewer loads `data/tiles/<tile-key>.json` before attempting live fallback. Stage 5 grid v2 uses a fixed-reference equirectangular projection, so any tile produced by Stages 1–4 must be rebuilt.

For a single test tile, use `BUILD-DHAKA-TILE.bat`. To check neighboring edges, build at least two adjacent tiles or use the national offline compiler and run `tools/audit_tile_seams.py`. Do not commit a national tile collection to the app repository; use a static object host/CDN for full-country coverage.
