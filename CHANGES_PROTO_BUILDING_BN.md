# Prototype building: Thana (Police Station)

Game-e prothom building boshano holo: **thana (police station)**, batch8 model theke (`src/buildings/models`, `police_station`).

## Kothay
Spawn crossing (0,0) theke ~88 m **pochchim-dokkhin-e**: F6 rasta-r (pochchim-mukhi) dokkhin-e ar F5 rasta-r pochchim-e khola, shomotol, jolahin jaygaa.
Library-r thik ulto dike (library purbo-dokkhin-e). Zone: metro-core. Gate uttor-e, F6 rasta-r dike. Gate theke F6 porjonto footpath ache.
World position: x=-72, z=50, yaw=PI. Minimap-e nil box + sada tara; building-er plot-e dhukle HUD-te "থানা (প্রোটোটাইপ)".

## Ki ache
- Shomotol pad (terrain): puro plot (70 x 62 m) perfectly flat, 10 m dhal blend. Rasta-gulo nijer height-i rakhe.
- Plot-e gach / pathor / ghash / local street nei.
- Collision (prototype): boundary wall (gate khola), main station, lock-up, barracks, sentry box, 2 jeep, van, bike, 2 gach, flag pole, mast.
  Player/gari/helicopter dhukte pare na (gate diye dhukte pare). Bhitore ghor/room nei (model-ta compound-er bahire-r dikh-e), pore upgrade korle bhitor-o hobe.
- 900 m-er baire hide hoy (performance).

## File
- `src/buildings/models/*`: batch8 model gulo (textures shoho). `tools/*`: building-viewer, texture generator.
- `src/buildings/ProtoSite.ts`: position, plot, pad (number gulo shob ekhane; building shorate/boro korte shudhu ekhane bodlano).
- `src/buildings/BuildingManager.ts`: model boshano, collider, apron, footpath, hide/show.
- Jure deya hoyeche: `TerrainGenerator.ts`, `GrassPlacement.ts`, `RockPlacement.ts`, `TreePlacement.ts`, `LocalRoads.ts`, `Engine.ts`, `Minimap.ts`.
- Test: `npm run test:proto-building` (ALL OK). Ager test: zones, eng-zones, local-roads, trees, grass-rocks, city shob ALL OK; `npm run build` OK.

## Onno building boshate
`ProtoSite.ts`-e `PROTO_MODEL_ID` bodlao (registry-r id, max ~70 x 62 m) ar `BuildingManager.ts`-er BOXES/CYLS collider list bodlao.
