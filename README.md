# Bangladesh Open World — Stage 2: Static Tile Pipeline

This remains a **Three.js game-like 3D world**, not a Google Maps viewer. It creates terrain, road ribbons, water ribbons/areas and extruded building meshes in a perspective scene. WASD and mouse-look controls are retained.

## What changed in Stage 2

- The application now computes a deterministic ~3 km tile grid. The same latitude/longitude always resolves to the same tile key (for example `r122_c81`).
- At load time it tries `data/tiles/<tile-key>.json` first. If a static tile exists, terrain and OSM geometry are loaded from that file without calling live data APIs.
- If no static tile is present, it keeps the Stage 1 live API fallback for experimentation.
- Tile rebasing is aligned to the fixed grid, so movement streams to a neighboring tile instead of repeatedly reloading the same arbitrary center.
- Terrain uses 32 mesh segments per side by default, roughly 94 m sample spacing over 3 km, compatible with broad GLO-90 terrain visualization.
- `tools/build_tile.py` prebuilds one local static tile from Open-Meteo Elevation API and Overpass OSM data.

## Build a static tile on your PC

Python 3.10+ is recommended. The builder uses only Python standard-library modules; no pip install is required.

On Windows, you can double-click `BUILD-DHAKA-TILE.bat`. Or from the extracted project folder run:

```bash
python tools/build_tile.py --lat 23.8103 --lon 90.4125
```

That builds the fixed tile containing central Dhaka. To create a tile around another place, supply its coordinates, for example:

```bash
python tools/build_tile.py --lat 24.0023 --lon 90.4264
```

The script requests one tile (terrain elevation batches plus OSM geometry), then writes `data/tiles/r<row>_c<col>.json`. Validate the result with `python tools/validate_tile.py data/tiles/r<row>_c<col>.json`. Commit that file to GitHub with the app and reload that area; the browser should report `prebuilt static tile` instead of `live API`.

Optional switches:

- `--segments 32` (default; allowed 8–128; larger means more terrain samples and more API requests)
- `--skip-osm` (terrain-only build; road/building/water data will be empty)
- `--skip-elevation` (creates a zero-height placeholder, **not real terrain**; only for schema tests)
- `--output-dir PATH` (custom output directory)

## Publish with GitHub Pages

1. Upload the contents of this folder into your repository root, keeping `index.html` at the root.
2. Commit the `src/`, `tools/`, `data/`, `.nojekyll`, README, and stage plan files.
3. In repository Settings → Pages, use Deploy from a branch → `main` → `/(root)`.
4. Static tiles are fetched relative to `src/main.js`, so repository subpaths such as `https://USER.github.io/REPOSITORY/` are supported.

No npm build is needed. Three.js is imported from jsDelivr, so the viewer needs internet access even when the specific world data tile is prebuilt.

## Current limitations

This is not yet the whole-country dataset. A generated tile covers about 3 km × 3 km. OSM features may be omitted by the builder's per-class output caps or because the source data itself is incomplete. DEM is a broad 90 m product; it cannot represent every road embankment, culvert, small terrain form, or building footprint. Unknown building heights remain estimated. Browser/live services have not been verified from this build environment, so test a generated tile on your PC before treating it as accepted data.

For whole Bangladesh, next move to an **offline national pipeline** using a downloaded DEM and Geofabrik OSM PBF extract. Do not hammer public APIs or put a massive national data pack in a GitHub repository. See `STAGE-3-PLAN.md`.

## Attribution and licenses

- Map geometry: © OpenStreetMap contributors, ODbL — <https://www.openstreetmap.org/copyright>
- Elevation: Copernicus DEM GLO-90 via Open-Meteo Elevation API — <https://open-meteo.com/en/docs/elevation-api>. Review current usage terms before commercial/high-volume use.
- Three.js: MIT — <https://github.com/mrdoob/three.js>
