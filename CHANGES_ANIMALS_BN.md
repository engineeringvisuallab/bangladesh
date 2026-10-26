# Shob dhoroner jibjontu (animals) + realistic shape

`src/animals` puro notun kore lekha hoyeche. Agey shudhu horin, bagh, singho, mach ar akasher pakhi chhilo. Ekhon **26 ta jati** ache, protita nijer jaygay (habitat), ar shape smooth lofted mesh (golagol ball/cylinder-er stup na).

## Kon animal kothay (Species.ts `HABITAT`)
| Jaygay | Animal |
|---|---|
| Khamar (farmland) | goru, mohish, chagol, bheda, ghora, murgi, kukur, khorgosh, hash (pukur-e), moyur |
| Gram (village) | goru, chagol, murgi, kukur, biral, hash, bheda, mohish (ghor-bari-r upor na) |
| Jongol (forest) | horin, bonno shukor, hati, bhaluk, moyur, khorgosh |
| Jolaboomi (wetland) | mohish, kumir, jalahosti, hash, horin, hati |
| Pahar (mountain) | pahari chagol, horin, bhaluk, bheda |
| Park | horin, khorgosh, hash, moyur |
| Safari park (L chap) | zebra, jiraf, hati, gonda, jalahosti, singho, chitabagh, horin |
| Shagor | dolphin pod (gobhir jole lafay) |
| Shob pani | mach (age-r moto) |
- Shikari: **bagh, singho, chitabagh, nekre, shiyal** (`hunts` list: bagh -> horin/shukor, singho -> zebra/horin, shiyal -> khorgosh/murgi ...). Stalk -> chase -> pounce -> khay, jhank palay.
- Shohor, shilpo-elaka, airport, port, engineering area, agro site, boshano building, rasta (spawn-e) -- ekhane jibjontu hoy na. Shagor-e shudhu dolphin.
- Player-er kache gele: goru/chagol shore jay, horin/zebra daure palay, jiraf/hati/gonda dhire shore jay, kumir/jalahosti pani-te nambe, murgi/hash chhute palay. Shikari player-ke attack kore na.

## Shape (AnimalModel.ts + Loft.ts)
- Body = smooth "loft": gobhir buk, soru komor, chowra pachha; ghar tapered; matha-e asol muzzle; pa-e uru/hnatu/khur (ba thaba, ba hati-r pad); lej, kan, shing, horin-er shakha-shing, hati-r dat + shur (3 ongsho-er, nore), jiraf-er lomba ghar + shing, singho-er keshor, zebra/ghora-r keshor, kumir-er pithe kanta.
- Pakhi (murgi, hash, moyur) alada model: dana, thot, jhuti, pa, moyur-er pekhom. Dolphin: lej-er chaka upor-nichu nore.
- Rong/texture: canvas-e aka (stripe, zebra, jiraf-er patch, chitabagh-er rosette, horin-er fota, goru-r patch, bheda-r lom, kumir-er shalka, pakhi-r pankho). Prottek jatir kichu rong-er variant (goru 4, kukur 4, ghora 4 ...).

## Notun/bodlano file (shob `src/animals`)
`AnimalManager.ts` (puro notun), `AnimalModel.ts` (puro notun), `AnimalRig.ts`, `AnimalExtra.ts` (pakhi, dolphin, mach), `AnimalSkins.ts`, `Loft.ts`, `Species.ts`, `index.ts`, `scripts/animals-test.ts`. Engine/onno kono file bodlay ni (`AnimalManager`-er public API ager moto).

## Performance
Ek shathe sorbochcho ~64 land animal + dolphin; 260 m-er baire hide + pose bondho; 480 m-er baire remove. Geometry species-wise shared.

## Test
`npm run test:animals` -- protita zone-e 6 minute simulation (kon animal ashe, building/shohor/pani-te ache kina, shikar hoy kina), dolphin, mach.
