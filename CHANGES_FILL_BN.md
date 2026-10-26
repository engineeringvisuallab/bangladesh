# Step 1 - City Auto-Fill (Central Metropolis)

Ager 55 ta building jaygay ache, **kono change nei**. Tar pashe existing building model gulo-i bar bar boshiye shohor ghon kora hoyeche (shudhu Site 0, Central Metropolis).

## Ki hoyeche
- **372 ta notun building** `src/buildings/PlacementsFill.ts`-e (auto-generated).
- Model notun banano hoyni: ager 33 ta model (house, flat, tower, office, hotel, shop, school, hospital, mosque...) bar bar use hoyeche. Prottek building-er alada `seed` ache, tai rong/variant alada.
- Zone onujayi model: `CityPlan.ts`-er zone-er building list + floor range + density use hoyeche (CBD-te office/hotel/tower, flats-e apartment, homes-e house/row-house, bazaar-e shop-row ityadi).
- Rasta-r pashe sarie boshano (setback + gap + samne rasta-r dike mukh), tarpor block-er bhitore faka jayga bhora.
- Boshbe na: rasta, shoulder, rail, pani, mall/EVLab/library/airport/plant-er jayga, 2 m-er beshi ucha-nichu jomi, ager building-er upor, freeway-r 22 m-er moddhe.
- Boro institution (hospital, 5-star hotel, university ityadi) cap deya, jate ek model-ei shohor bhore na jay. Mall, city-hall, court, DC office, eidgah fill-e nei (game-er nijer ache).

## Game code-e ja bodlano hoyeche (shamanno)
- `Placements.ts`: `seed` field (optional) + `placementContains` fill building-ও dekhe (grid lookup, tai fast). Ager 55-er table ar test **ekdom ager moto**.
- `PlacedBuildings.ts`: seed use kore, fill building shudhu 1300 m-er moddhe toiri/dekha jay (ager 55 ta ager moto 2000 m), frame-e 5 ms porjonto build kore (ager shudhu 1 ta), plinth shudhu dorkar hole.
- Minimap-e fill building-er dot nei (khub bhir hoto). Ager 55-er dot ager moto.

## Kemon bodlate/abar banate hobe
```
npm run fill:city      # abar generate kore PlacementsFill.ts
npm run test:fill      # check: land, rasta, overlap, vegetation
npm run test:placements   # ager 55-er test (ekhono pass)
```
Density bodlate `scripts/fill-city.ts`-er upor-er tunable (`FILL_P`, `GAP`, `SETBACK`, `CAP`, `REGION_R`).

## Shimana (shotti kotha)
- **Rasta kom**, tai CBD-te ekhono ghon na. Ager rasta plan-e CBD-te shudhu 2x2 block, civic/education zone-e kono local rasta-i nei, tai segulo faka. Notun rasta chhara ghon hobe na.
- Ager building model gulo boro (tower 45x45 m). Chhoto-majhari tall building model nei, tai block-er majhe gap thake.
- Hajar hajar building-er jonno instancing/LOD lagbe (Step 2).
