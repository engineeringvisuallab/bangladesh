# Automation Plant + Renewable Energy Park merge (main game base: evcity.zip)

## New (nothing overwritten)
- src/engineering/mechanical/automation/*   (Automation & Robotics Plant, id 'auto', Y tour 13 stops)
- src/engineering/renewable/*               (Renewable Energy Park, id 'renew', category 'energy')
- src/i18n/voice/automation.en.ts, src/i18n/voice/renew.en.ts
- scripts/automation-test.ts, scripts/renew-test.ts
- CHANGES_AUTOMATION.md

## Small edits to existing files (only added lines)
- src/engineering/InfraSites.ts            + 'auto' (2425,690) and 'renew' (-2438,-2781) placements
- src/engineering/index.ts                 + import / registerInfrastructure(autoDef, renewDef)
- src/engineering/mechanical/index.ts      + export autoDef
- src/engineering/core/types.ts            + InfraCategory 'energy'
- scripts/eng-zones-test.ts                + auto / renew excluded from the "obstacle" list (they stand inside their own area)
- package.json                             + automation-test, renew-test in test:infra (nothing removed)

## NOT taken (main game is newer / already has it)
- dam, chem, farm, thermal, grid files from the old zip snapshots (evcity-farm-thermal-final.zip is already merged in main; chem files in renewable zip are identical to main apart from line endings)
- types.ts / index.ts / package.json of the zips were old: only the new lines were taken, main's narrationLang, dam, chem, farm scripts etc. are kept

## Review correction
- both new plants get narrationLang: 'en' (English text; correct speech-time estimate and English HUD hint, same as dam)

## Test
tsc OK, vite build OK. automation / renew / chem / dam / mech / thermal / grid / infra-runtime tests: ALL OK.
Same failures as before in main: eng-zones (3), infra-test grid/mech/chem "road touches pad area".
New warning: renew pad is >= 15 m from the roads (not 40 m) -> same infra-test "road touches pad area" warning as chem/grid/mech.
