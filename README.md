# Bangladesh 3D Digital Twin — Stage 2

A browser-based geospatial visualization prototype for Bangladesh using CesiumJS 1.146. Stage 2 adds a Bangladesh-bounded vector-tile layer, optional streaming OSM 3D Buildings, and richer local OSM overlays. This is still not a finished photorealistic model of every building in Bangladesh.

## Publish on GitHub Pages (static site)

This project is a plain static website: HTML, CSS, and JavaScript. It does not require Node.js, npm, a build command, or a backend to publish.

### Recommended: publish from the repository root

1. On GitHub, create a new repository, for example `bangladesh-3d-digital-twin`.
2. Extract the ZIP on your computer.
3. Open the extracted `bangladesh-3d-digital-twin` folder. Upload the **contents inside this folder** to the repository root—not the enclosing folder itself. The repository root must contain `index.html`, `css/`, `js/`, `data/`, `README.md`, and `.nojekyll`.
4. Commit the files to the `main` branch.
5. In the repository, open **Settings → Pages**.
6. Under **Build and deployment**, choose **Deploy from a branch**. Select branch `main` and folder `/(root)`, then click **Save**.
7. Wait for the Pages deployment to complete, then open the URL shown in **Settings → Pages**. It will usually look like `https://YOUR-USERNAME.github.io/YOUR-REPOSITORY/`.

All local CSS and JavaScript links in this project are relative, so they support a repository site path such as `/YOUR-REPOSITORY/`.

### Before sharing publicly

- The globe and imagery require an internet connection and externally hosted services. GitHub Pages hosts this app's files; it does not host the satellite imagery or national 3D datasets.
- Cesium ion World Terrain is optional and requires a client-side token. Use a token with suitable restrictions/permissions and usage limits; anything embedded in a browser app is visible to site visitors. Do not use a private server secret.
- Road/water overlays query public OpenStreetMap Overpass services around the current view only. This is a prototype feature and can fail when the public service is busy or rate-limited. It does not load all Bangladesh at once.
- Check provider terms, attribution, coverage, and quotas before using the site commercially or at high traffic.
- After every change, commit and push the updated files to GitHub. GitHub Pages will redeploy from the configured source.

## Stage 2 features

- Interactive 3D globe, satellite imagery, camera navigation, zoom, reset, and top-down controls.
- Optional Cesium ion World Terrain using a session-only token.
- **Bangladesh-wide vector tile layer:** CesiumJS `MVTDataProvider` streams vector tiles within a Bangladesh bounding rectangle from OpenFreeMap/OpenMapTiles. The provider is experimental in CesiumJS; browser/service compatibility must be tested after publishing. The data is generalized by map zoom and is not a survey-grade authority for road alignment.
- **OSM 3D Buildings:** optional Cesium ion-hosted global OSM Buildings layer. Coverage and detail depend on available source data; token and provider quotas/terms apply.
- **Local OSM road/waterway/railway overlay:** request a bounded area around the current map view from public Overpass services; radius is configurable (2/4/6 km). It can fail or be rate-limited, and is not a substitute for a hosted national dataset.
- GeoJSON import. Polygon features with `height`, `building:height`, or `building:levels` / `levels` properties can be extruded to 3D.
- Camera latitude, longitude, and altitude readout.

## Run locally on Windows

1. Extract `bangladesh-3d-digital-twin-stage-2.zip`.
2. Open the extracted `bangladesh-3d-digital-twin` folder in VS Code.
3. Recommended: install the **Live Server** extension, right-click `index.html`, then choose **Open with Live Server**.
4. Alternative: open PowerShell in this folder and run:

   ```powershell
   py -m http.server 8000
   ```

   Then open `http://localhost:8000` in Chrome or Edge.

Do not rely on opening `index.html` as a `file://` URL; CesiumJS workers and browser security rules work better through a local HTTP server.

## Enable elevation terrain (optional)

1. Create/sign into a Cesium ion account: https://ion.cesium.com/tokens
2. Create a token suitable for your app and restrict its permissions as appropriate.
3. In the app, click the gear icon (or the Terrain setup button), paste the token, and enable it. The page reloads and uses Cesium World Terrain.
4. The token is stored only in this browser tab's `sessionStorage`. It is still client-side data; don't paste a private server secret here. For deployment, use a suitably restricted public/client token.

Without a token, the globe and satellite imagery remain usable, but its terrain is an ellipsoid and is not real elevation terrain.

## GeoJSON import

Use valid GeoJSON (`FeatureCollection`, `Feature`, or supported geometry). Coordinates must be geographic longitude/latitude in WGS84 (EPSG:4326). To display building-like polygons in 3D, include numeric `height` (meters) or `building:levels` properties. Unspecified building heights are not invented.

## Important data / licensing notes

- The imagery endpoint is ArcGIS World Imagery. Review the provider's current terms, attribution, and licensing before production deployment.
- The national vector layer uses the OpenFreeMap public vector tile endpoint and OpenMapTiles schema. Its required attribution is shown in the application: `OpenFreeMap © OpenMapTiles Data from OpenStreetMap`. See https://openfreemap.org/quick_start/ and https://openfreemap.org/tos/. Confirm service terms and availability before production or high-traffic use.
- Road and waterway vectors queried from OpenStreetMap must retain appropriate attribution and comply with the ODbL. This prototype requests a small local area only when the user clicks the OSM button; it does not bulk-download the country.
- OpenStreetMap tile/data service policies: https://operations.osmfoundation.org/policies/tiles/ and https://www.openstreetmap.org/copyright
- CesiumJS official quickstart: https://cesium.com/learn/cesiumjs-learn/cesiumjs-quickstart/
- Cesium ion tokens: https://ion.cesium.com/tokens

## Next milestones

1. **Verify this Stage 2 build in a real browser.** Check the national vector layer near Dhaka, Sylhet, coastal Bangladesh, and the Chittagong Hill Tracts; inspect DevTools Network/Console if a service fails.
2. Download the Bangladesh OSM PBF extract from Geofabrik and process it on a capable local workstation/server into versioned road, railway, waterway, administrative boundary, and building datasets. Do not commit the entire raw PBF or huge generated output to GitHub Pages.
3. Obtain suitable nationwide elevation data and generate terrain tiles with consistent vertical reference and license compliance.
4. Create 3D Tiles from building footprints/heights, split spatially and by level of detail, and host them on object storage/CDN or Cesium ion rather than packing every tile into the GitHub repo.
5. Add data provenance, accuracy indicators, caching/CDN, mobile controls, and performance budgets.
6. Add photorealistic buildings/trees only where the license and source imagery support them. No-data areas should stay visibly lower-detail rather than be presented as verified real-world detail.

## Project structure

```text
bangladesh-3d-digital-twin/
  index.html
  css/style.css
  js/app.js
  data/README.md
  README.md
  STAGE-3-PLAN.md
```
