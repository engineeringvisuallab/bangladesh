# Mechanical Works (eng-mech-works) + everything in English

## 1. New: Mechanical Works  (src/engineering/mechanical/mech-works/)
Parts: Engine Test Cell, Mechanisms Hall, Machine Shop, Hydraulics Bay, Refrigeration Plant, Gate & Roads. 15-stop guided tour (Y to start).
- 4-stroke engine you can see inside: piston, connecting rod, crank, two cams and valves move for real; the gas colour and a 4-panel board show the stroke (intake / compression / power / exhaust); spark flash at the start of the power stroke.
- Mechanisms: gear train 12-30-18 (true speed ratios), belt drive 2:1, cam and follower with a LIVE displacement graph, four-bar linkage with its coupler curve, centrifugal governor (balls rise with speed).
- Machine shop: lathe (spinning chuck + moving carriage), milling machine, drill press, grinder with sparks, overhead crane.
- Hydraulics: Pascal's-law demonstrator (small piston moves 9x farther than the big one) and a four-column hydraulic press with gauge, power pack and oil flow.
- Refrigeration: compressor, condenser (fan + heat plume), expansion valve (frost), cold room with evaporator; pipes and dots are coloured by the state of the refrigerant.
- Site: pad 380 x 207 m in the flat north-west part of the area; gate faces the public road (east). Minimap mark: purple "M".

## 2. All engineering sites are now narrated and labelled in ENGLISH
Students of every level will use them, so every site text is English: SWTP, STP, Thermal Power Plant, Grid Substation, Mechanical Works.
- Narration: src/i18n/voice/*.en.ts  (the old Bangla files are replaced: delete src/i18n/voice/stp.bn.ts, swtp.bn.ts, thermal.bn.ts, grid.bn.ts from your project)
- Part names, tour step titles, floating labels, gate signs, site names and the HUD hints ("Press Y: guided voice tour", "Step 3/15 ... [ . next , back Y stop ]") are English.
- VoiceManager.speakText: English text is spoken with an English browser voice (en-US first), Bengali text still uses a Bengali voice. No other game text was touched.
- Code field names like nameBn / titleBn are unchanged (renaming them would touch the whole game); they now simply hold English text.

## Tests
`npm run test:infra` now also runs thermal-test, grid-test and mech-test. Also: eng-zones-test, placements-test.
