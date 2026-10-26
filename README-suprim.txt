EVCity Suprim update - only changed files (copy into your evcity folder, same paths)

src/vehicles/Vehicle.ts      flight/water/rail physics, deck landing fix, speed limits
src/vehicles/VehicleModel.ts logos, wings hidden in normal mode, drone arms rise above the body, no light cone
src/vehicles/VehicleSpec.ts  500 km/h engine, new SUPRIM_FLIGHT numbers
src/vehicles/RailLock.ts     NEW - rail tracks lookup
src/ui/SuprimHUD.ts          rail mode text, new key hints
src/core/Engine.ts           camera goes under water in submarine mode
scripts/suprim-test.ts, scripts/suprim-test2.ts   tests (npx tsx scripts/suprim-test2.ts)

Keys: N flight, W drone (28 m/s), Shift = aeroplane speed up to 500 km/h, Ctrl slow/speed brake,
Space up, X down, C dive, T float, hold A or D on the rails to leave them.
