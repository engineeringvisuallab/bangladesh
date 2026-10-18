# Bangladesh Open World — Stage 4: Streaming World Engine

This is a **Three.js 3D world**, not an embedded map viewer. Roads, railways, waterways, building footprints and terrain are rebuilt as three-dimensional scene geometry from geographic data. Stage 4 adds continuous multi-tile streaming and near/far building Level of Detail (LOD).

> **Honest status:** This ZIP contains the app and the data-processing tools, but does not contain the national Bangladesh GIS dataset or generated nationwide world tiles. Where a static tile is hosted, the app streams it from that tile store. If a tile is missing and live fallback is enabled, the prototype may request terrain and OSM geometry from public services. This is a functioning architecture prototype, not yet a complete photorealistic Bangladesh dataset.

## Stage 4 additions

- **100 m building detail radius:** each building switches between a detailed extruded footprint and a simpler box LOD based on camera distance. This is a visual LOD radius, not a guarantee that every building exists in the source data.
- **Look-ahead streaming:** the app estimates the tile ahead of the camera and starts loading it before the player reaches the tile boundary.
- **Multiple resident world tiles:** the renderer keeps surrounding 3 km tiles loaded instead of deleting the previous tile whenever the camera crosses a grid boundary.
- **Far-tile LOD:** neighboring tiles initially render terrain, major roads, rails, waterways and merged simple building blocks. When a tile becomes the current/look-ahead tile, it can be promoted to detailed geometry.
- **Memory cap:** the app keeps a bounded resident-tile cache and disposes distant tile geometry as needed.
- **Background movement:** loading a neighbouring tile does not globally freeze the camera. Only the initial entry or an explicit fast-travel action shows the full-screen loader.
- **Retry cooldown:** unavailable tiles are not requested repeatedly every animation frame.

## Run locally

1. Extract this ZIP.
2. Open the extracted project folder in VS Code.
3. Install the VS Code **Live Server** extension if it is not already installed.
4. Right-click `index.html` and choose **Open with Live Server**.
5. Click **ENTER THE WORLD**. The first tile is requested only when you enter.
6. Click the scene to capture the mouse. Use `W/A/S/D` to move, the mouse to look around, `Shift` to move quickly, `Space/C` to rise or descend in drone mode, and `F` to toggle ground-follow/drone mode. `Esc` releases the mouse.

Internet access is required for CDN libraries and any live data calls. Browser privacy, CORS, API availability, and public-service rate limits can affect live requests.

## Publish to GitHub Pages

This is a static HTML/CSS/JavaScript project and needs no npm build step. Upload the **contents** of this folder to the root of a GitHub repository, keeping `index.html` at the repository root. In **Settings → Pages**, select **Deploy from a branch**, then `main` and `/(root)`.

For a production-sized country dataset, publish only the app files to GitHub Pages. Host generated world tiles separately (for example on a static object store/CDN) and configure `config.js`:

```js
window.BDOW_CONFIG = {
  tileBaseUrl: "https://YOUR-TILE-HOST.example/bangladesh-tiles/",
  allowLiveFallback: false
};
```

The URL must end in `/`, serve files named like `r122_c81.json`, allow CORS from your Pages domain, and return `application/json`. Set `allowLiveFallback: true` only for small tests, not for a whole-country production run.

## Real dataset pipeline

The ZIP still includes Stage 3 tools and docs:

- `DOWNLOAD-NATIONAL-DATA.ps1`: gets the Geofabrik Bangladesh OSM extract and country boundary.
- `MERGE-DEM-TILES.bat`: combines locally downloaded DEM GeoTIFFs.
- `BUILD-PILOT-TILES.bat`: builds a small pilot around Dhaka.
- `BUILD-NATIONAL-TILES.bat`: compiles tiles across the country boundary.
- `tools/validate_tile.py`: validates the structure of a generated tile.

Read `DATA-PIPELINE.md` and `NATIONAL-DATA-SOURCES.md` before building. Download Copernicus DEM files from the official data source and check the current access terms. The national build can require many gigabytes of disk and may create thousands of tile files. Do not commit the raw PBF, DEM mosaic, working database/cache, or all national tiles to the web-app repository.

For a small trial, build one pilot area first and set `config.js` to the folder where those tiles live. Do not build all Bangladesh until the pilot is checked visually.

## Detail and geographic accuracy limits

- The `100 m` LOD setting controls building shape detail around the camera. It does not mean terrain height is surveyed at 100 m resolution.
- The default Stage 3 national profile uses a broad-resolution DEM (commonly GLO-90). A 90 m DEM cannot accurately represent every road camber, drain, embankment or small landform. Increasing mesh subdivisions without better source data only interpolates the same elevations.
- The current engine's world chunks are approximately **3 km × 3 km**; it is the data streamed in those chunks that is shown at different detail levels.
- Distant road geometry is simplified to major road classes; nearby/current tiles can show more local roads. Building data is limited to OpenStreetMap coverage, and unknown building heights remain estimates.
- This stage does **not** yet include a driving vehicle, character animation, collision physics, walkable interiors, complete tree cover, photogrammetric roofs, or verified 3D survey coverage for every part of Bangladesh.
- A tile can still pop in if the required data is not hosted or if a live service is slow. Smooth nationwide streaming depends on a generated and hosted tile dataset, not code alone.

## Validation performed

- JavaScript module syntax checked with Node.js.
- Python tool source compiled with `py_compile`.
- Tile-grid formula checked against the national tile builder.
- A live browser render was **not** verified in this environment; CDN/data requests and browser-network policy can prevent a full live test. Test the GitHub Pages build in a normal browser before treating it as released.

## Data attribution

- OpenStreetMap data: **© OpenStreetMap contributors**, ODbL — https://www.openstreetmap.org/copyright
- Copernicus DEM: review the exact collection/access terms — https://dataspace.copernicus.eu/explore-data/data-collections/copernicus-contributing-missions/collections-description/COP-DEM
- Three.js: MIT — https://github.com/mrdoob/three.js
