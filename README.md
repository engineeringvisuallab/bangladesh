# EVWorld

Open-world driving game on **real Bangladesh geography**. Every city is a *region* placed on one national coordinate
grid, so cities can be added one by one and always land at the right place.

**Stage 1 (this version):** Bogura only - flat terrain, the Google Earth image draped on it as a reference map, free-fly camera
with a live coordinate read-out. No roads, no vehicles yet (see Roadmap).

## Run

```bash
npm install
npm run dev          # http://localhost:5173
npm run test:geo     # coordinate maths tests (no dependencies)
npm run typecheck
npm run build        # -> dist/
```

Controls: click = mouse look, `WASD` move, `Space/E` up, `C/Q` down, `Shift` fast, mouse wheel = speed,
`B` reference map on/off, `K` copy "lat, lon" of the camera (paste it into Google Earth / Maps to compare).

## Publish free on GitHub Pages

1. New GitHub repository, push this folder to branch `main`.
2. Repository -> Settings -> Pages -> Build and deployment -> Source: **GitHub Actions** (once).
3. Wait for the "Deploy to GitHub Pages" action; the game is at `https://<user>.github.io/<repo>/`.

(The workflow uses `npm install` because there is no lock file yet. After your first local `npm install`, commit
`package-lock.json`, then you can change the workflow to `npm ci`.)

## How coordinates work

- **One national projection** (`src/geo/Projection.ts`): UTM zone 45N extended over the whole country. The same grid
  Google Earth showed you (`732749.90 m E`, `2753306.84 m N`). Cities east of 90 E (Dhaka, Sylhet, Chattogram) would be
  in UTM zone 46; we deliberately do not switch zone, so all cities share one space (scale error <= 0.4 % at the far east).
- **Global 500 m tile grid** (`src/geo/Tiles.ts`): tile `(i, j)` = easting `i*500..`, northing `j*500..`. Terrain, roads,
  buildings later are all stored/streamed per tile, so a new city can never overlap or shift an old one.
- **Scene frame** (`src/geo/WorldFrame.ts`): metres, same convention as EVCity: `x` east, `y` up, `z` south
  (north = -z). Scene origin = a tile-grid point near the first city (keeps numbers small for float32 and for physics).
  `E = originE + x`, `N = originN - z`.
- **Region** = one folder `public/regions/<id>/` with `region.json` + a reference image. Its pixel <-> E/N mapping
  (`src/geo/GeoRef.ts`) is computed from ground control points (GCPs) listed in the json.

## Add a city (e.g. Rajshahi)

1. Make a Google Earth screenshot (north-up) with at least 2 coordinate pins visible (3+ is better).
2. Create `public/regions/rajshahi/` with `reference.jpg` and a `region.json` (copy Bogura's: id, name, image size, `gcps`
   = pixel position of each pin + its E/N, optional `checkpoints`).
3. Add `"rajshahi"` to `public/regions/index.json`.

Nothing else changes. Roads/buildings of that city later go in the same folder, in E/N metres.

## Georeferencing of Bogura - read this

`docs/georef-preview.jpg` shows the image with a 1 km grid computed from the two pins.

- **Checked:** the zone/projection (Bogura town lands at 24.850 N, 89.374 E), and the **x scale** (5.88 m/pixel; the image
  scale bar agrees).
- **Not yet checked:** the **y scale** (5.32 m/pixel) comes only from the two pins and is ~10 % smaller than x. That is
  unusual for a straight-down screenshot, so it may hide a tilt or a stretched image. Error would grow towards the
  north/south edges (up to a few hundred metres).
- **Fix (5 minutes):** in Google Earth click 2-3 more recognisable points spread over the image (e.g. the hospital pin,
  Kalitola Hat, a road junction in the far north), note their UTM coordinates and their pixel position in `Main_Map.jpg`, and
  add them to `gcps` in `region.json`. With 3+ points the fit is a full least-squares affine and reports residuals.
  The red pillars in the viewer (`checkpoints`) let you fly to a spot and compare the HUD coordinates with Google Earth.

## Terrain

No elevation data was available, so the ground is flat (`terrain.elevationM`). Everything asks the `Heightfield`
interface (`src/world/Heightfield.ts`) for ground height, so a real height-map (SRTM / Copernicus DEM 30 m, or a PNG)
plugs in later without touching the streamer or the vehicles. Bogura is on the Bangladesh floodplain, so flat is a fair start.

## Roadmap

1. **Stage 1b - vehicles:** port EVCity's vehicles (`src/vehicles`) with Rapier physics. They only need a small terrain
   interface (`heightAt`, `sample`, surface type), which `Heightfield` will provide. People/combat/rail hooks are left out.
2. **Stage 2 - roads:** polylines in E/N metres per region, rendered per tile (you supply the details).
3. Real height-map, water, then more cities.
