# Shob building model position-e boshano (position only)

`src/buildings/models`-er shob model ekhon game-e nijer jaygay ache. **Shudhu position**: terrain pad, collision, footpath nei (pore surface-er shathe merge korbe).
Thana (police station) age-r moto full prototype (pad + collision), `CHANGES_PROTO_BUILDING_BN.md` dekho.

## Kemon kaj kore
- Position `src/buildings/Placements.ts`-e (id, x, z, yaw, size, zone). Ekta building shorate shudhu oi line-er x/z/yaw bodlao.
- Table-ta `scripts/place-buildings.ts` banaiyechhe: shomotol jomi (<=3 m ucha-nichu; pahari/cliff/khamar-e beshi), main rasta/rail/pani/onno site-er upor na, building-er zone-er shathe mile (kuri-ghor village-e, tower metro-core-e, school campus-e, resort island-e ...), ekta onno-ta-r upor na.
- Building-er gate/samne nikote main rasta-r dike ghure thake (coast-gulo shagorer dike).
- Ground-er ucha-nichu dhakte ekta concrete plinth building-er niche ache (building nijer ground-slab-er shathe uthe thake). Surface merge-er shomoy plinth bad diye pad boshabe.
- Gach/pathor/ghash building-er upor jabe na (`placementContains`). Local street-e keepout dewa hoyni (rasta/rail plan bodle jay); solver age-i current street theke dure rekhechhe. Merge-er shomoy `placementKeepout` use korte paro.
- Model shudhu player 1100 m-er moddhe ashle toiri hoy, 1400 m-er baire hide hoy (performance).
- Minimap-e protita building-er jonno chhoto rongin dot (group onujayi: holud=abashik, komola=banijyik, nil=sorkari, firoza=shikkha, lal=shasthyo, shobuj=dhormiyo).

## Kothay ki (x east, z south; spawn = 0,0)

| Building | x | z | Zone |
|---|---|---|---|
| থানা (prototype, pad + collision shoho) | -72 | 50 | metro-core |
| মাটির ঘর (ছন/খড়ের চাল) (`mud-hut`) | -2300 | -1520 | village-west |
| বাঁশের ঘর (ছনের চাল) (`bamboo-hut`) | -2260 | -1560 | village-west |
| টিনশেড বাড়ি (`house-tin`) | -2180 | -1400 | village-west |
| আধা-পাকা বাড়ি (`house-semi-pucca`) | -2160 | -1460 | village-west |
| ইটের/পাকা বাড়ি (২ তলা) (`house-brick-2`) | -680 | 680 | sw-homes |
| ইটের/পাকা বাড়ি (৩ তলা) (`house-brick-3`) | 960 | 100 | east-homes |
| সারি বাড়ি (টাউনহাউস) (`row-house`) | 920 | 80 | east-homes |
| ভিলা / ডুপ্লেক্স (`villa`) | 660 | 700 | se-dense |
| ফ্ল্যাট বিল্ডিং (৬ তলা) (`apartment-mid`) | 220 | 20 | metro-core |
| বহুতল ফ্ল্যাট (১২ তলা) (`apartment-high`) | 300 | 80 | metro-core |
| আবাসিক টাওয়ার (২৮ তলা) (`tower-residential`) | 20 | -260 | metro-core |
| হোস্টেল / মেস (`dormitory`) | -1860 | -940 | nw-university |
| শ্রমিক কোয়ার্টার (`labor-quarters`) | -980 | 80 | west-homes |
| গ্রামের হাট-বাজার (`village-bazaar`) | 2920 | -900 | village-east |
| বাগানবাড়ি (`baganbari`) | 820 | 440 | central-lake |
| দোকান সারি (২ তলা) (`shop-row`) | 20 | 200 | metro-core |
| ফার্মেসি (`pharmacy`) | -20 | 140 | metro-core |
| রেস্টুরেন্ট (`restaurant`) | -200 | 220 | metro-core |
| পেট্রোল পাম্প (`petrol-pump`) | 800 | -540 | ne-business |
| ব্যাংক (`bank`) | 40 | 140 | metro-core |
| সুপারমার্কেট (`supermarket`) | -180 | 960 | south-bazaar |
| শপিং মল (`mall`) | -80 | 960 | south-bazaar |
| সিনেমা হল (`cinema`) | 120 | -280 | metro-core |
| অফিস ভবন (৮ তলা) (`office-mid`) | -200 | 160 | metro-core |
| অফিস টাওয়ার (৩০ তলা) (`office-tower`) | -280 | 80 | metro-core |
| হোটেল (৩-স্টার) (`hotel-3star`) | -260 | 940 | south-bazaar |
| পাঁচ তারা হোটেল (৫-স্টার) (`hotel-5star`) | -100 | 320 | metro-core |
| প্রাথমিক বিদ্যালয় (`primary-school`) | 940 | 20 | east-homes |
| উচ্চ বিদ্যালয় (`high-school`) | -1500 | -2380 | nw-campus |
| কলেজ (`college`) | -1440 | -2620 | nw-campus |
| বিশ্ববিদ্যালয় ভবন (`university-building`) | -1260 | -2500 | nw-campus |
| ইঞ্জিনিয়ারিং ল্যাব (`engineering-lab`) | -1340 | -2700 | nw-campus |
| হাসপাতাল (`hospital`) | 300 | -160 | metro-core |
| ক্লিনিক (`clinic`) | -720 | 640 | sw-homes |
| ডায়াগনস্টিক সেন্টার (`diagnostic`) | 760 | -620 | ne-business |
| মসজিদ (`mosque`) | 600 | 780 | se-dense |
| মন্দির (`temple`) | -940 | 280 | west-homes |
| গির্জা (`church`) | -540 | 820 | sw-homes |
| ঈদগাহ (`eidgah`) | -960 | 180 | west-homes |
| সমুদ্রের ওপর ভিলা (`overwater_villas`) | -580 | 4140 | island-beach |
| ক্লিফ-টপ ম্যানশন (`cliff_mansion`) | 900 | 2800 | south-beach |
| মেরিনা ইয়ট ক্লাব (`marina`) | -740 | 4540 | island-beach |
| বিচ রিসোর্ট (`beach_resort`) | -660 | 4400 | island-beach |
| ট্রপিক্যাল বিচ ভিলা (`tropical_villa`) | -2220 | 4080 | island-beach |
| বাতিঘর (`lighthouse`) | -2140 | 4160 | island-beach |
| গ্রামের খামার (উঁচু-নিচু জমি) (`village_farm`) | 1900 | -1320 | east-farms |
| পাহাড়ি ঢালের খামার (`hill_farm`) | -1220 | -1780 | center-hills |
| ইউনিয়ন পরিষদ কার্যালয় (`union_parishad`) | 2980 | -980 | village-east |
| উপজেলা পরিষদ কমপ্লেক্স (`upazila_complex`) | -2500 | -860 | west-farms |
| ফায়ার সার্ভিস স্টেশন (`fire_station`) | -180 | 80 | metro-core |
| ডাকঘর (`post_office`) | 280 | 0 | metro-core |
| জেলা জজ আদালত (`district_court`) | 160 | 300 | metro-core |
| জেলা প্রশাসকের কার্যালয় (`dc_office`) | -100 | 180 | metro-core |
| সিটি হল (`city_hall`) | 200 | 120 | metro-core |

## Test
`npm run test:placements` (ALL OK): shob model-er ekta spot, ghar-er upor main rasta/rail/pani/site nei, zone thik, overlap nei. Ager shob test ALL OK; `test:rail` ar `test:rail-links` original zip-eo ekii FAIL kore (amar change noy).
`npm run build` OK.
