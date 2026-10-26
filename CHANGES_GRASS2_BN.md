# Step 3: lower grass + grass everywhere (distance rings, like the trees)

## Problem
- Tufts were far too tall (wild / seed grass reached 2+ m).
- Grass existed only within 46 m and shrank to nothing between 28 and 43 m, so it showed up only near the player ("only in front of you"),
  and when driving the tiles ahead were not ready yet.

## Height (GrassManager.ts, Config.vegetation.grass.heightScale = 0.35)
- Every tuft's height is multiplied by 0.35. Typical meadow now 0.1-0.3 m, tallest seed / wild grass ~0.8-0.9 m (was 2.2-2.6 m).

## Distance rings (Config.vegetation.grass.lods, radius 170 m, fade only at 140-168 m)
- Ring 0  (0-40 m):   every cell, full tuft models, all flowers.
- Ring 1  (40-80 m):  every 2nd cell, half the blades, tufts 1.4x wider, no flowers.
- Ring 2  (80-170 m): every 5th cell, quarter of the blades, tufts 2.2x wider, no flowers, no seed heads.
- Tuft positions of a coarse ring are a subset of the full tile (same random stream per cell), so nothing jumps when a tile changes ring.
  A tile changes ring with 12 % hysteresis (no flicker) and is swapped in the same frame (no gap).
- Total ~65k tufts around the player (about the same as before), but grass now reaches 170 m instead of 46 m.
- Workers: `GrassRequest` / `GrassResult` carry `stride`; `GrassPlacer.place(tx, tz, stride)` only visits every stride-th cell (far tiles are cheap).
- Tile meshes are built with a 4 ms time budget per frame (was exactly one tile per frame), maxInFlight 6.

## Tests
- scripts/grass-rock-test.ts: ring test (coarse tufts are a subset of the full tile, all 3 rings in use, tuft count < 200k). All OK. `vite build` OK.
