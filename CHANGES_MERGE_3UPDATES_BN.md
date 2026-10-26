# ৩টি আপডেট মূল গেমে মার্জ (ড্যাম + কেমিক্যাল প্ল্যান্ট + খামার/গাড়ি)

মূল গেম (evcity.zip) ভিত্তি। কোনো পুরনো ফাইল সম্পূর্ণ ওভাররাইট করা হয়নি যেখানে মূল গেম বেশি নতুন (রেল, এক্সপ্রেসওয়ে, সী-এয়ারপোর্ট, গ্রিড, মেক-ওয়ার্কস, প্লেন)।

## ১) ড্যাম ও জলবিদ্যুৎ কেন্দ্র (evcity-dam.zip)
- নতুন: `src/engineering/civil/dam/*`, `src/i18n/voice/dam.en.ts`, `scripts/dam-test.ts`, `CHANGES_DAM_EN.md`
- রেজিস্ট্রি: `InfraSites.ts` (+`dam` 3450,724), `engineering/index.ts`, `civil/index.ts`, `core/types.ts` (`narrationLang`), `core/InfraTour.ts`, `core/materials.ts` (`penstock`), `InfraManager.ts` (ইংরেজি/বাংলা HUD হিন্ট), `EngineeringZones.ts` (`eng-dam` গেট)
- ড্যাম zip ছিল পুরনো স্ন্যাপশট (রেল/গ্রিড/মেক-ওয়ার্কস ছাড়া) — তাই শুধু ড্যামের নিজের অংশ নেওয়া হয়েছে, বাকি পুরনো ফাইল নয়।

## ২) কেমিক্যাল প্রসেস প্ল্যান্ট (evcity-chemical-plant.zip)
- নতুন: `src/engineering/chemical/*`, `src/i18n/voice/chem.en.ts`, `scripts/chem-test.ts`
- রেজিস্ট্রি: `InfraSites.ts` (+`chem` 2539,2242), `engineering/index.ts`, `core/types.ts` (`'chemical'` ক্যাটাগরি)

## ৩) খামার: আসল মানুষ ও গাড়ি (evcity-farm-thermal-final.zip)
- নতুন: `src/farm/FarmCrew.ts`, `FarmJobs.ts`, `scripts/farm-crew-test.ts`
- বদলানো: `FarmActors.ts`, `FarmManager.ts`, `people/*` (কাজের ভঙ্গি, `'work'` task), `VehicleSpec.ts` (+ট্রাক্টর/কম্বাইন/পিকআপ, `SPECS` এর শেষে), `VehicleModel.ts`, `Gold.ts`
- `Engine.ts`: খামার এখন people ও vehicles তৈরির **পরে** বানানো হয় (আগে ছিল আগে), N মেনুতে ৩টি গাড়ি, গাড়ির মাপ।
- তাপ কেন্দ্রের ফাইল নেওয়া হয়নি: মূল গেমেরটা বেশি নতুন (ইংরেজি টেক্সট, গ্রিড সহ)।

## টেস্ট
tsc ও vite build পাস। dam / chem / thermal / grid / mech / infra-runtime / farm / farm-crew টেস্ট পাস।
আগে থেকেই ব্যর্থ (মূল গেমেও একই): infra-test এর grid ও mech রোড-টাচ, eng-zones এর ৩টি, vehicle-test এর ১৩টি।
নতুন সতর্কতা: chem প্যাড মূল গেমের নতুন রোড থেকে ~৫ মিটার দূরে (infra-test এর ৪০ মিটার শর্তে grid/mech এর মতোই FAIL)।
