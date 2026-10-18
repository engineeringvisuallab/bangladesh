# Stage 4 — Implemented Streaming World Engine

## Implemented in this package

1. Persistent set of resident world-tile records, keyed by the established 3 km national grid.
2. Geographic rebase on tile changes to keep camera coordinates near the current play area while preserving neighbouring tile transforms.
3. Camera-direction look-ahead requests for the next tile.
4. Static-only neighbor prefetch from the configured tile store, with small concurrency; it does not fire eight live API queries at once.
5. Near/far tile quality: current/look-ahead tiles can use all mapped roads and building LOD objects; distant tiles focus on terrain, major transport/water geometry and merged simplified building blocks.
6. Per-building LOD: detailed extruded footprints inside a 100 m camera distance, simpler blocks farther away.
7. Resident-tile cap and geometry disposal to bound memory.
8. Request de-duplication and retry cooldown for missing/failed tiles.
9. Movement continues during background tile requests; the full-screen loader is reserved for first entry and explicit fast travel.

## Verification status

- `node --check` passed on `src/main.js` (checked as an ES module).
- `python -m py_compile tools/*.py` passed.
- Static tile address calculations are aligned with `tools/build_national_tiles.py` for the same 3 km grid origin and row/column formulas.
- Full browser/data-source smoke test is still required after deploying to a normal browser, because external CDN, OSM and elevation requests were not verified end-to-end in this environment.

## Remaining engineering work

- Add a consistent, tested local-height interpolation strategy at adjacent tile borders to remove DEM seams.
- Build automated pilot screenshots/tests at Dhaka, rural Bangladesh, river regions and Chittagong Hill Tracts.
- Replace public-API-on-demand fallback with hosted nationwide static tiles for predictable streaming.
- Tune building limits and tile memory based on actual browser performance.
- Add local vegetation/land-cover data, collision, player/vehicle controls, and stronger terrain resolution where licensed data supports it.
- Improve 3D building accuracy from measured building heights and roof data instead of estimation.
