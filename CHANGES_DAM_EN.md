# Dam & Hydropower Station (eng-dam) - first CIVIL/ENERGY site written in English

From this site on, new content (tour text, labels, HUD hints) is in English.

## What was added
- `src/engineering/civil/dam/` - 2 x 25 MW hydropower station on a 300 x 210 m pad (world 3450, 724) inside the `eng-dam` fence. 10 parts:
  gate, reservoir (rock banks, waterfall inflow, trash boom), concrete gravity dam, spillway (5 radial gates, chute, stilling basin),
  downstream river + bridge, intake towers + penstocks, powerhouse (2 Francis units, crane, tailrace), transformers + 132 kV switchyard + line,
  control room, and a "forces on a gravity dam" model (thrust, weight, uplift arrows).
- Animation (uses `core/anim.ts`): rotor + runner spin, radial gates breathe, spillway/penstock/river/electricity flow dots, mist plumes, crane moves, control screens.
- 19-stop English voice tour (Y starts, `.` next, `,` back): `src/i18n/voice/dam.en.ts`, `dam/tourScript.ts`.
- Shared changes: `Narrator.speakText(text, voiceId, lang)` and `Infrastructure.narrationLang` ('bn' default), English TTS voice in `VoiceManager`,
  English HUD hint in `InfraManager`, pipe colour `penstock`, placement `dam` in `InfraSites.ts`, fence gate for `eng-dam` (south edge, x 3450).
- Test: `scripts/dam-test.ts` (part of `npm run test:infra`).

## Known / next
- `eng-zones-test` still reports 3 failures that exist in the original project (eng-campus overlaps army, eng-grid rail + open fence). The dam adds none.
- The dam crest is not reachable on foot or by car (no ramp yet); the tour camera shows it.
- Existing Bangla zone name for `eng-dam` in `bn.ts` is unchanged.
- Next: eng-grid (transmission/substation) to connect this plant and the thermal plant to the city.
