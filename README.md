# Bangladesh Open World — Stage 5: Seam-Aligned Streaming World

A browser-based Three.js world, not an embedded Google/3D map viewer. Geographic source data is rebuilt into Three.js terrain, road, rail, waterway and building geometry. Stage 5 fixes a real coordinate-grid problem from earlier versions and adds runtime edge reconciliation, shared terrain normals, a schema-versioned static tile format, and an offline edge audit.

> **Honest status:** This package includes code and a processing pipeline, not a complete Bangladesh dataset. No live Bangladesh GIS data was downloaded into this ZIP. National data must be downloaded and compiled on the user's PC before nationwide prebuilt streaming is available.

## Stage 5 changes

- **Fixed-reference coordinate grid v2:** every row uses one constant longitude step, which makes the projected edges of adjacent 3 km tiles line up. Earlier versions changed longitude spacing by latitude, which could offset north/south neighbors.
- **Runtime shared-edge reconciliation:** when a neighboring tile arrives, its edge heights are compared with the resident tile. Small valid-source differences (up to 20 m) are averaged; a valid sample can fill a no-data edge sample. Larger valid-source jumps are not hidden and produce a console warning.
- **Shared terrain normals:** where two loaded tile edges align, normals are averaged to reduce visible lighting seams.
- **No-data masks:** builders preserve which elevation samples came from missing/invalid source data. The renderer does not describe illustrative fallback terrain as measured elevation.
- **Offline seam checker:** `tools/audit_tile_seams.py` scans built tiles, compares shared elevation edges, writes a JSON report, and fails if a neighboring valid edge differs by more than 5 m.
- **Schema v2 required:** tile files produced by Stages 1–4 use the old grid/schema. Rebuild them with Stage 5 before using static tiles, otherwise the app rejects the old schema and may try the configured live fallback.
- **Fallback error fixed:** if elevation requests fail, an explicitly labelled illustrative terrain can be generated instead of calling an undefined helper.

## Run the viewer locally

1. Extract the project ZIP.
2. Open the folder in VS Code.
3. Start the `index.html` with VS Code Live Server.
4. Click **ENTER THE WORLD**.
5. Click the scene and use `W/A/S/D` to move, mouse to look, `Shift` to move quickly, `Space/C` to rise/descend in drone mode, `F` to toggle ground-follow/drone, and `Esc` to release the mouse.

Internet access is needed for Three.js from the CDN and for live fallback requests. For predictable streaming, prebuild and host static grid-v2 tiles.

## Prepare real data (recommended pilot first)

1. Use `DOWNLOAD-NATIONAL-DATA.ps1` to download the Bangladesh OSM extract and boundary.
2. Download Copernicus DEM GeoTIFF files covering the country under the current provider's terms, put them under `data/source/dem_tiles/`, and run `MERGE-DEM-TILES.bat`.
3. Run `BUILD-PILOT-TILES.bat` to compile a small set of tiles nearest Dhaka. This can take time and requires Python dependencies plus free disk space.
4. Review the pilot output in `data/pilot-tiles-v2/`. Validate an individual file with `python tools\validate_tile.py data\pilot-tiles-v2\r<row>_c<col>.json` (replace the row/column with a real filename).
5. Run `AUDIT-TILES.bat data\pilot-tiles-v2` or `python tools\audit_tile_seams.py --tiles data\pilot-tiles-v2 --report data\pilot-tiles-v2\seam-report.json`.
6. Fix any edge failures before producing a full national dataset.
7. Only after the pilot passes, run `BUILD-NATIONAL-TILES.bat`. The national output is `data/national-tiles-v2/`; audit it with `AUDIT-TILES.bat` or `python tools\audit_tile_seams.py --tiles data\national-tiles-v2 --report data\national-tiles-v2\seam-report.json`.

Do **not** build the whole country by making a public Overpass request for every tile. The national compiler reads one downloaded PBF and one local DEM mosaic.

## GitHub Pages and hosting

The frontend is a plain static HTML/CSS/JavaScript project and does not require an npm build. Upload the *contents* of this folder to the root of your GitHub repository, keeping `index.html` at the root. Publish from `main / (root)` in Settings → Pages.

For real nationwide streaming, do not put a huge national tile collection in the GitHub source repository. Host tile JSONs on a static object store/CDN with CORS enabled, then set `config.js`:

```js
window.BDOW_CONFIG = {
  tileBaseUrl: "https://YOUR-TILE-HOST.example/bangladesh-tiles/",
  allowLiveFallback: false
};
```

The base URL must end with `/`, serve `r<row>_c<col>.json` files, and permit browser requests from the GitHub Pages origin. Use `allowLiveFallback: true` only for small tests; it is not a substitute for a complete hosted national dataset.

## Grid and accuracy limitations

- Grid v2 uses a fixed-reference equirectangular projection at 23.5° N. It is consistent for adjacent tiles, but it is a local game-world projection—not a legal survey projection. The east-west distance scale varies by a few percent across Bangladesh.
- A 3 km tile with 33 × 33 samples is broad-resolution terrain (about 94 m sample spacing). It will not show every embankment, drain, road camber or small landform. Add higher-resolution DEM where licensed and available for a real improvement.
- The 100 m setting controls detailed building geometry radius, not terrain survey resolution or completeness of building data.
- OSM buildings/roads/railways/waterways vary in coverage. Unknown building heights are estimates. The current compiler processes OSM ways; it is not a complete photogrammetric model of every roof, tree, bridge or interior.
- Runtime edge blending only repairs small seams between resident tile samples. Discrepancies above 20 m are deliberately not concealed; the offline seam checker should be run before publishing.
- This remains an open-world visualization prototype, not a finished GTA/Forza-style game: car/character controllers, full collision physics, interiors, verified nationwide photogrammetry and finished day/night gameplay are not included.

## Checks run in this package

- Python syntax compilation for all tools.
- `tools/test_streaming_grid.py`: address round-trips plus exact east/west and north/south neighbor boundary coordinates.
- `tools/test_seam_audit.py`: synthetic 2×2 neighbor tiles pass, and an intentionally damaged 12 m edge is detected.
- JavaScript module syntax checked with Node.
- Live browser rendering/data download was **not** tested in this environment; run the viewer in your browser and verify tile/CORS/service behavior.

## Attribution

- OpenStreetMap: © OpenStreetMap contributors, ODbL — https://www.openstreetmap.org/copyright
- Copernicus DEM: review the collection and attribution terms — https://dataspace.copernicus.eu/explore-data/data-collections/copernicus-contributing-missions/collections-description/COP-DEM
- Three.js: MIT — https://github.com/mrdoob/three.js
