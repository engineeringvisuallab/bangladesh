# Bangladesh Open World — Stage 1

This project is deliberately **not a Google Maps/Cesium map viewer**. It uses Three.js to create a perspective 3D scene and turns real-world data into scene geometry:

- Elevation samples are used to build a real terrain mesh from Copernicus DEM GLO-90, accessed through Open-Meteo's Elevation API.
- OpenStreetMap road ways become 3D road ribbons.
- OpenStreetMap waterways become 3D water ribbons and closed water polygons become water surfaces.
- OpenStreetMap building footprints become extruded 3D buildings. Reported `height`/`building:levels` values are used where available; unknown heights are estimates.
- A 3 km × 3 km scene tile is loaded around the player. The world recenters and streams a new tile as you travel, so the whole-country dataset is not loaded into RAM at once.
- WASD movement, mouse look, shift to move faster, Space/C to rise/descend, F to toggle ground-follow/drone mode, Tab to show/hide the controls, and a few fast-travel locations are included.

## Publish on GitHub Pages

1. Create a GitHub repository named `bangladesh-openworld` (or another name).
2. Upload the **contents** of this folder to the repository root. `index.html` must be at the root.
3. Go to **Settings → Pages**.
4. Choose **Deploy from a branch**, select `main`, choose `/(root)`, and Save.
5. Wait for GitHub Pages deployment, then open the URL shown by GitHub.

There is no npm build step. The page imports Three.js and its Sky addon from jsDelivr, so the browser must have internet access.

## First run

Click **ENTER THE WORLD**. The first tile fetches elevation data and OSM geometry. After it loads, click the 3D scene to capture the mouse.

- `W A S D` — move
- Mouse — look around
- `Shift` — fast movement
- `Space` / `C` — rise / descend in drone mode
- `F` — toggle ground-follow / drone mode
- `Tab` — toggle side panel
- `Esc` — release mouse
- Use the Fast travel selector to jump to another Bangladesh location

## Important limitations (honest status)

This is the first working architecture, not a completed photorealistic 3D Bangladesh. The loaded tile is local to the current player position. Features appear only if they are mapped in OpenStreetMap. The open elevation endpoint provides a 90 m DEM; the mesh is sampled more coarsely to keep initial loading manageable. This does not resolve road embankments, culverts, individual small landforms, detailed roof material, vegetation, or every building throughout the country. The terrain tint/texture is illustrative and is **not** a verified land-cover layer. Unknown building heights are approximate.

Open-Meteo's public API terms describe the free service as non-commercial. This demo is for prototyping/evaluation; before any public commercial launch or high-volume use, replace this runtime elevation sampling with a processed and hosted tile pipeline based on licensed elevation data (for example, Copernicus DEM) and use a suitable commercial/hosted data plan. Public Overpass servers are shared infrastructure; this code requests one small tile at a time and is not intended as a high-volume production backend.

## Licences / attribution

- Map geometry: © OpenStreetMap contributors, ODbL. See <https://www.openstreetmap.org/copyright>.
- Elevation: Copernicus DEM GLO-90 accessed via Open-Meteo. Open-Meteo asks users to credit Copernicus DEM and Open-Meteo; see <https://open-meteo.com/en/docs/elevation-api>.
- Three.js: MIT, <https://github.com/mrdoob/three.js>.

## Next stage

Stage 2 should replace runtime point-by-point elevation requests with a preprocessed Bangladesh DEM tile pyramid and a proper terrain LOD loader. It should also generate an offline national vector-to-3D-Tiles pipeline from a Geofabrik OSM extract, then stream building/road/water tiles from static hosting or object storage. The present browser-side OSM calls are proof-of-concept only.
