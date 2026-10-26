# Step 1: crash damage + blast physics

## Problem
A light bump could blow a vehicle up. Cause: damage was taken from a single 1/60 s physics step, so solver pops and contact
jitter were counted again and again, and when hp reached 0 any crash ended in an explosion.

## Vehicle.ts
- Crash window: one impact (~0.1 s) is measured as ONE net velocity change (delta-v), not per step.
- Under 5 m/s (~18 km/h) = no damage. Above it: 3 hp per extra m/s (8 m/s ~ 9 hp, 14 ~ 27, 22 ~ 51, 30 ~ 75), times `fragile`.
- A crash alone never takes hp below 8 and NEVER makes an explosion. Very hard hit + low hp: small chance of a fuel-leak fire.
  That fire burns 7-13 s (everybody gets out alive: new event `totaled`) and the car burns out black, no blast.
- Only bullets and blasts can make a vehicle explode (as before). Shooting a car that is already burning blows it up at once.
- Below 30 hp the engine goes into limp mode (power falls to 40 %).
- Its own explosion jump is a little smaller (max 4 m/s up).

## Explosions.ts
- Blast damage on vehicles falls off like real overpressure (power 1.6) instead of linearly.
- New `Vehicle.blastPush`: delta-v = 15 m/s x k^2 x (1250/mass)^(1/3) x (power/70)^(1/3), applied on the side facing the blast
  with `applyImpulseAtPoint`, so cars tip over and tumble, light vehicles (bikes) fly further, heavy ones (bus, tank) hardly move.
- Flash-only shots (tank muzzle, power 0) no longer push other vehicles.
- Flying debris has air drag (a = -k |v| v).

## VehicleManager.ts
- Handles the `totaled` event (occupants / player get out unhurt).

## Tests (scripts/vehicle-test.ts)
- New: light bump (~14 km/h) = hp stays 100; sedan / bus wall crash never gives an `explode` event.
  (Needs `npm install` first: `npm run test:vehicle` / your vehicle-test script. I could not run them here, no network.)
