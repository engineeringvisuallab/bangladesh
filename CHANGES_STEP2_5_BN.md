# Step 2 - 5 (Performance + CBD / Residential / Bazaar fill)

## Step 2: Performance (FillBuildings.ts)
- Notun `src/buildings/FillBuildings.ts`: 448 ta fill building ekhon **instancing + chunk LOD** diye ankano hoy.
- Prottek model-er 4 ta colour variant-i toiri hoy (`seed % 4`), ekbar toiri hoye sobai share kore (73 ta template, 448 building-er jonno).
- Model-er proti surface-mesh (brick, glass, plaster...) er jonno pura city-te **ekta** InstancedMesh. Draw call: ager ~2900 -> ekhon ~540 (CBD-r moddhe dariye dekhle).
- LOD (player theke 256 m chunk-er doori): 520 m-er moddhe full model, 1700 m porjonto simple box (chunk-e 1 draw call, camera-r baire hole skip), tar baire hidden. Border-e flicker na hoy tai hysteresis ache.
- Model gulo frame-e 4 ms kore dhire dhire toiri hoy (nearest age), tai city-te dhukle game atke na; toiri na howa porjonto box dekhay.
- Fill building-er model shadow **felbe na** (`FILL_CAST_SHADOW = false`): instanced mesh chunk-wise cull kora jay na, shadow pass-e sob abar ankte hoto. Shadow receive kore. Chaile `FillBuildings.ts`-e `true` kore dekho, FPS-er sathe milie.
- `PlacedBuildings.ts` (ager 55 ta) **ekdom ager moto** (shudhu `seed` use korar ek line), fill ar eta alada.
- Test: `npm run test:fill-runtime`.

## Step 3, 4, 5: CBD / Residential / Bazaar-shop strip (fill tuning)
- Prottek rasta-r spot-e boro model na boshle chhoto model try kore (ager ekbar try kore chhere dito).
- CBD: tall building (office/hotel/tower) beshi weight; residential flats zone: apartment block beshi; mixed (shop strip): shop-row/restaurant/bank/pharmacy beshi; dense zone-e building-er majhe gap kom.
- Ekhon 448 building (age 372), CBD 29, flats 54, bazaar 26, homes 48, shop strips ~41.

## Ja KORA HOYNI (karon ta korle game bhangto)
**Notun local rasta jog kora hoyni.** Ami CBD (110->80 m), flats, shops, homes-er block chhoto kore dekhlam:
- CBD ar flats-er block chhoto korle rasta test pass kore, kintu railway-plan sorey jay (`rail-plan-test`, `library-test` bhange: railway curve tight, library-r pashe railway).
- Shops ar homes-er block chhoto korle `local-roads-test` bhange (rasta overlap, 26-34 ta rasta main road theke kete jay).
- Tai sob **ager moto rakha** (CityPlan.ts ar LocalRoads.ts ekdom ager version-er moto). CBD-te ekhono mattro 2x2 block rasta.
- Ar NW quadrant (civic / education zone) puro EVLab campus-er keepout-er bhitore, tai oikhane rasta/building boshbe na.
- Rasta ghon korte hole railway plan ar rasta planner dutoi ekshathe bodlate hobe: eta alada boro kaj.

## Pre-existing test fail (ami toiri kori ni, ager zip-eo ache)
`road-test` (pad plane 0.19 m), `rail-plan-test` (earthworks), `rail-link-test`, `people-test`, `mall-test` (food zone), `street-test`. Segulo ager zip-e chalaleo fail kore.


# Step A - Notun chhoto-majhari building model (11 ta)
`src/buildings/models/compact.ts`: chhoto footprint (9-21 m), onek floor. Ager style/kit/surface-ei toiri. `fillRegistry.ts`-e register (ager `registry.ts` ekdom ager moto, tai `placements-test` ager moto pass kore).

| Model | Floor | Footprint (m) | Zone-e jay (cityId) |
|---|---|---|---|
| slim-tower-20 | 20 | 20x21 | CBD (office-tower) |
| slim-tower-30 | 30 | 21x22 | CBD (office-tower) |
| office-slim-12 | 12 | 21x20 | CBD (office-mid) |
| mixed-use-6 | 6 | 19x16 | CBD/mixed (office-mid) |
| hotel-boutique | 12 | 17x18 | CBD (hotel) |
| bank-compact | 3 | 16x18 | CBD/mixed (bank) |
| apt-slim-9 | 9 | 15x14 | flats (apartment-mid) |
| apt-slim-14 | 14 | 16x15 | flats (apartment-high) |
| townhouse-3 | 3 | 10x12 | homes (house-brick) |
| shop-house-3 | 3 | 13x12 | bazaar / shop strip (shop-row) |
| shop-house-4 | 4 | 11x11 | bazaar / shop strip (shop-row) |

Fill ekhon **571 building** (age 448): CBD 29 -> 50, flats 54 -> 71, bazaar 26 -> 46. CityPlan.ts bodlano hoyni: notun model gulo ager zone-er building list-er cityId-te boshe jay.
Draw call ~670 (ager 571 building ekshathe, ager style-e hole ~3700 lagto). `FILL_SIZES` (scripts/_sizes-data.ts), `MODELS` (scripts/fill-city.ts) ar `fillRegistry.ts` ek-i model-er tothyo, notun model jog korle tinta-i update korte hobe (`npm run test:fill-runtime` footprint mil ache kina check kore).

---
## Kivabe boshabe (evcity_1 version-er upor)
Ei zip-e **shudhu bodlano/notun file** ache. Tomar project folder-er upor overlay (copy + replace) koro, `.git`, save data, ar baki kono file chhuibe na. Tarpor `npm run test:fill` ar `npm run test:fill-runtime` chalaite paro.
Tomar day/night, street light, settings, HUD, vehicle, minimap-er kono file bodlano hoyni. `PlacedBuildings.ts`-e tomar `anchorOf` (lighthouse) rakha ache.
