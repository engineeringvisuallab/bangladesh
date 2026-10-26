# Step 2: vehicles are much tougher (they no longer fall apart / blow up so easily)

## Problem
Parts fell off at a ~30 km/h bump, a car pushing against a wall lost ~10 hp every second (spring / solver jitter counted as a new
"crash" again and again), 10 bullets made a car burn and blow up, and a wrecked car always wanted to explode.

## Vehicle.ts
- Crash: nothing happens below 9 m/s (~32 km/h) net delta-v (was 5). Damage per m/s above that is 2 hp (was 3). Floor 15 hp (was 8).
  Parts break off later: stages at 55 % / 30 % / 12 % hp (was 75 / 50 / 28). A wheel only comes off in a really bad wreck.
- A crash can not remove more speed than the vehicle had (x1.6 for the bounce): a car that stands still against a wall is no longer
  damaged again and again.
- Bullets: every vehicle takes 3x more bullets (sedan ~30, bus / jeep ~45, tank unchanged). Blast damage x0.65.
- A vehicle shot to 0 hp now usually just BURNS for 7-13 s (everybody gets out alive, event `totaled`) and burns out black.
  Only 20 % of the time (or when ONE hit is a big blast, 60+ hp) it blows up. Shooting an already burning car: 20 % chance to blow up.
- Fuel-leak crash fire needs a harder hit (22 m/s) and hp below 20.
- Hanging parts wobble 3x less.

## scripts/vehicle-test.ts
- Bullet test expects 27-48 bullets. Wall / bump test walls moved to x = 1850 / 1950 (they were outside the 2000 m ground plane).
- Vehicles without a speed target (hypercar, evhypar, evbike) are skipped instead of crashing the script.
  (Old failures `evhypar sits on its wheels` and `bike stays upright` are not from this change.)
