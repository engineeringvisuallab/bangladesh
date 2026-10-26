# ইঞ্জিনিয়ারিং এলাকা (শুধু এলাকা ও সীমানা, কোনো বিল্ডিং নেই)

মানচিত্রে ২৪টি ইঞ্জিনিয়ারিং শিক্ষা-এলাকা বসানো হয়েছে। প্রতিটির আছে আসল আয়তাকার সীমানা (বিমানবন্দর/সমুদ্রবন্দরের মতো)।
সাধারণ ভবন (আবাসিক ইত্যাদি) এর বাইরে, তাই সেগুলোর সীমানা নেই। আগে থেকে থাকা বিমানবন্দর, সমুদ্রবন্দর, রেল, কৃষি সাইট, মল, লাইব্রেরি, EV ল্যাব অপরিবর্তিত।

## ফাইল
- `src/city/EngineeringZones.ts`: সব এলাকার তথ্য (id, গ্রুপ, শাখা, সীমানা, মাটির ধরন)।
- `src/city/WorldZones.ts`: নতুন zone kind `engineering`; `getWorldZoneAt` এলাকার ভেতরের যেকোনো বিন্দুর জন্য এলাকাটি ফেরত দেয়।
- `src/i18n/bn.ts`: বাংলা নাম ও গ্রুপের নাম।
- `src/ui/Minimap.ts`: রঙিন সীমানা ও (জুম করলে) নাম।
- `src/core/Engine.ts`: এলাকায় ঢুকলে HUD-এ নাম ও গ্রুপের রং।
- `scripts/eng-zones-test.ts` (`npm run test:eng-zones`): সীমানা যাচাই।

## এলাকাগুলো
ক্যাম্পাস: eng-campus · সিভিল: eng-structures, eng-geotech, eng-transport, eng-dam · পরিবেশ: eng-waste (পানি শোধনাগার ও পয়ঃশোধনাগার main game-এ আগে থেকেই আছে: SWTP/STP, তাই আলাদা এলাকা নেই) ·
মেকানিক্যাল: eng-mech-works, eng-automation · ম্যাটেরিয়ালস: eng-steel, eng-textile · কেমিক্যাল/রিসোর্স: eng-chemical, eng-gasfield, eng-mining, eng-offshore ·
মেরিন: eng-shipyard · এয়ারোস্পেস: eng-aerospace · ইলেকট্রিক্যাল/এনার্জি: eng-thermal-power, eng-grid, eng-renewable, eng-nuclear ·
ইলেকট্রনিক্স/কম্পিউটার: eng-tech-park · অন্যান্য: eng-biomed, eng-fire-safety, eng-rural

## পরীক্ষা
`test:eng-zones` ও পুরোনো `test:zones` দুটোই ALL OK। যাচাই: কোনো এলাকা একে অপরের বা বিদ্যমান সাইটের সাথে মেলে না, রেল স্টেশন/লাইনের ভেতরে নেই,
মাটি এলাকার কাজের উপযোগী (শুকনো সমতল / উপকূল / হ্রদপাড় / সাগর / পাহাড়)।

## প্রোটোটাইপ সীমানা-বেড়া (গেটহীন)
প্রতিটি এলাকা একটি সাধারণ আয়তাকার বেড়া দিয়ে ঘেরা: ধূসর প্যানেল, গ্রুপের রঙের খুঁটি, ৪ কোণে লম্বা রঙিন খুঁটি। মাটির ঢাল অনুসরণ করে; হ্রদ/সাগরে পানির উপরিতল ধরে।
গেট নেই। শুধু যেখানে সরকারি রাস্তা বেড়া পার হয়েছে সেখানে বেড়া থামে, নইলে রাস্তা কেটে যেত। বেড়ায় Rapier collider আছে (খেলোয়াড়, গাড়ি, নৌকা ঢুকতে পারে না)।
- `src/city/EngineeringFence.ts`: বেড়ার layout (খাঁটি সংখ্যা, headless test করা যায়)। আকৃতি বদলাতে শুধু `buildFenceLayout` বদলাতে হবে।
- `src/zones/EngineeringBoundary.ts`: 3D বেড়া + collider। `ENGINEERING_BOUNDARY.solid = false` দিলে শুধু দেখার বেড়া হয়ে যাবে।
- `src/core/Engine.ts`: তৈরি, প্রতি ফ্রেমে দূরের বেড়া লুকানো, dispose।
