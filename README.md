# EVWorld

Open-world driving game on **real Bangladesh geography**. Every city is a *region* placed on one national coordinate
grid, so cities can be added one by one and always land at the right place.

**Stage 2 (this version):** Bogura. Real ground photo on flat terrain, **the airport (runway, taxiway, apron, access road) and the Bogura main road**
with asphalt grip, a free-fly camera with a live coordinate read-out, and **all EVCity vehicles** parked on the airport apron.

## Run

```bash
npm install
npm run dev          # http://localhost:5173
npm test             # coordinate + road tests (no dependencies, also run by the GitHub action)
npm run typecheck
npm run build        # -> dist/
```

Fly camera (you): click = mouse look, `WASD` move, `Space/E` up, `C/Q` down, `Shift` fast, wheel = speed.
Walk up to a vehicle (within 7 m) and press `F` to get in; `F` again (when stopped) to get out.
Driving: `W/S` gas+brake/reverse, `A/D` steer, `Space` handbrake, `E/Q` gear up/down, `G` auto/manual, `R` flip upright, `H` horn.
Suprim: `N` flight, `C` dive, `T` float, `Space/X` up/down. Everywhere: `B` reference map on/off, `K` copy "lat, lon" (paste into Google Earth).

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

## Georeferenced pictures ("references")

A region lists the pictures that cover it (`public/regions/<id>/region.json -> references`), each with its own control points (GCPs).
The originals live in `sources/<id>/` (not published). `tools/build_ground.py <id>` cuts them into one photo per 500 m tile
(`public/regions/<id>/ground/<i>_<j>.jpg`); where pictures overlap, the finest wins. Needs `pip install opencv-python numpy`.

- **airport photo** (1.278 m/px): the tick marks of its map frame were measured and fitted to UTM 45N, residual 0.05 m (checked again in `npm test`
  against three of the ticks). This is the accurate layer; roads are traced from it.
- **Google Earth screenshot** (5.82 m/px): the two coordinate pins in it **do not agree** with the airport photo (northing off by 170-460 m, easting fine), so
  they are not used. Instead the screenshot was registered to the airport photo by image correlation (`isotropic 5.82 m/px`; the same peak was found
  in a free fit). Runway thresholds agree within ~25 m. Far from the airport the error is unknown and grows: more georeferenced photos like the
  airport one (export with the lat/lon frame) will fix it - add them to `references`, run `build_ground.py`.
  `tools/clean_main_map.py` removes labels/pins from the screenshot first.

## Roads

`public/regions/<id>/roads.json`: centre lines in `[easting, northing]` metres + width + class (`highway`, `access`, `runway`, `taxiway`) and paved areas (`apron`).
`src/roads/RoadNetwork.ts` answers "asphalt or ground?" for the vehicle physics, `RoadMeshes.ts` draws them (markings are generated).
Bogura so far (first pass, traced from the airport photo with `tools/trace_bogura_roads.py`): main road 2.2 km (only the part inside the airport
photo), runway 1.34 km at bearing 119/299, one taxiway, the apron, the 470 m airport access road. To change a road, edit its pixel picks in the script
and run it (or edit `roads.json` directly).

## Add a city (e.g. Rajshahi)

1. A georeferenced picture (3+ control points, or the tick marks of a map frame) per area you have.
2. `sources/rajshahi/`, `public/regions/rajshahi/region.json` (copy Bogura's), `roads.json`; add `"rajshahi"` to `public/regions/index.json`.
3. `python tools/build_ground.py rajshahi`.

## Terrain

No elevation data was available, so the ground is flat (`terrain.elevationM`). Everything asks the `Heightfield`
interface (`src/world/Heightfield.ts`) for ground height, so a real height-map (SRTM / Copernicus DEM 30 m, or a PNG)
plugs in later without touching the streamer or the vehicles. Bogura is on the Bangladesh floodplain, so flat is a fair start.

## Where the vehicle code comes from

`src/vehicles`, `src/physics`, `src/people` (driver figure), `src/camera/OrbitCamera.ts`, `src/input` are **unchanged copies** from EVCity, so
they behave the same. The pieces EVCity has that Bogura does not (people AI, police, rail, vegetation, roads, UI) are replaced by small
stubs with the same shapes: `src/terrain`, `src/rail`, `src/traffic`, `src/people/Person.ts`, `src/vehicles/RailLock.ts`, trimmed `src/core/Config.ts`.
`src/game/DriveSystem.ts` is a slim replacement of EVCity's VehicleManager. `src/world/GroundTerrain.ts` + `GroundPhysics.ts` give the
vehicles flat ground now and real heights later (both read the `Heightfield`).

Not ported yet: walking player, HUD panels / vehicle menu, crash fire & explosions (`VehicleFx`), AI traffic, railway for Suprim.

## Roadmap

1. **More roads:** continue the main road east into the city (needs a georeferenced picture of that part), city streets, lane/junction details, per-tile streaming.
2. Real height-map, water, then more cities (+ floating origin when cities are far apart: set `Config.floatingOrigin.threshold`).
3. Walking player, vehicle menu, AI traffic as needed.
