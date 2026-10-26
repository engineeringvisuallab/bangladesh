# EV Vehicle Factory (eng-vehicle) - merge into the updated project

NEW engineering area `eng-vehicle` (group mechanical), the 25th area.

- Area: x -500..100, z 2400..2750 (flat dry ground west of eng-grid; no public road crosses it, so the fence has no gaps). Gate: south edge, x = -129.
- Pad: 380 x 300 m at (-129, 2571), entrance on the south side. Registered as placement id `vehicle` in `InfraSites.ts`.
- Code: `src/engineering/mechanical/vehicle-factory/` (11 parts), narration `src/i18n/voice/vehicle.en.ts` (20 tour stops), test `scripts/vehicle-factory-test.ts` (`npm run test:vehicle-factory`).
- Process along the main line: coils -> blanking -> presses -> body shop (welding robots) -> pre-treatment/e-coat dips -> ovens -> spray booths -> battery + motor shops
  -> final assembly with the MARRIAGE (battery pack rises into the body) -> wheels, trim -> end-of-line tests -> vehicle yard -> car carrier.
  Plus design studio + wind tunnel, crash lab, test track + skid pad, parts warehouse.
- Moving cars/AGVs/trucks live in groups named `environment`, which the collider collector skips (no invisible walls).
- No change to the shared engineering core: the NarrationLang option and English voice selection already in the updated project are used as they are.

## Shared files touched (small additions; see vehicle-factory.patch)
- `src/city/EngineeringZones.ts`: area `eng-vehicle` + gate
- `src/engineering/InfraSites.ts`: id `'vehicle'` + one placement
- `src/engineering/index.ts`: import + `registerInfrastructure(vehicleDef)`
- `src/engineering/mechanical/index.ts`: export `vehicleDef`
- `src/i18n/bn.ts`: zone name for `eng-vehicle`
- `scripts/eng-zones-test.ts`: `vehicle` is not an obstacle for its own area
- `package.json`: `test:vehicle-factory`, and the factory test appended to `test:infra`

## Test status in the merged project
All engineering site tests pass (thermal, grid, mech, dam, chem, automation, renew, vehicle-factory). Pre-existing failures that are NOT from this merge (identical in the updated project):
`infra-test`: "a road touches the pad area" for grid, mech, chem, renew; `eng-zones-test`: eng-campus overlaps army, eng-grid railway + open fence.
Because `test:infra` stops at the first failing script, run `npm run test:vehicle-factory` on its own until those are fixed.
