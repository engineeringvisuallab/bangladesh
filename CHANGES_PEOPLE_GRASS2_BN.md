# Step 4: grass 2x bigger + people with a real human shape

## Grass (2x bigger)
- `Config.vegetation.grass.heightScale` 0.35 -> **0.7** (2x taller: meadow ~0.2-0.6 m, tallest wild / seed grass ~1.8 m).
- New `Config.vegetation.grass.widthScale = 2` (2x wider tufts), used in `GrassManager.ts` (`w = sc * wide * ring.size * widthScale`).
- To tune: change those two numbers only (1 = the old size). LOD rings, density and fade distances are unchanged.

## People / player (real human shape instead of boxes)
- New `src/people/HumanBody.ts`: rounded torso + shoulders, neck, egg-shaped head with eyes, brows, nose, mouth, ears,
  short hair (optional chin beard), tapered arms with elbows and hands, thigh / knee / shin / shoe, belt.
- Headwear: cap with visor, safety helmet with brim + ridge, topi. Reflective vest stripes for the engineer / site workers.
- Same height (1.8 m), same joints (hips / shoulders) + new joints (knees, elbows) -> walking now bends the knees and elbows.
- All shapes are built once and shared (merged per colour slot): ~16 meshes and ~4k triangles per person, same material cache as before.
- `PersonModel.ts` (pedestrians, police, drivers in cars / boats) and `PlayerModel.ts` (the player) both use it.
  The gun is now held in the hand (forearm group) and follows the elbow.
- `Appearance.beard?: boolean` (optional; `randomAppearance` gives ~18 % of people a beard).

## Checks
- `tsc --noEmit` OK, `vite build` OK, `scripts/grass-rock-test.ts` ALL OK.
- `scripts/people-test.ts`: same result as before the change (26 PASS; the 4 FAIL / TrafficManager `areaAt` error were already there).
