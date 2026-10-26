# বাংলা ভয়েস ফাইল

এখানে প্রতিটি ভয়েস লাইনের জন্য একটি ফাইল রাখো, নাম = লাইনের id:

    welcome.mp3   ->  src/i18n/bn.ts এর voice.welcome এর বাক্যটি পড়ে রেকর্ড করা

ফাইল থাকলে গেম সেটাই বাজাবে। না থাকলে ব্রাউজারের বাংলা TTS ভয়েস, আর তাও না থাকলে শুধু সাবটাইটেল দেখাবে।

## ট্যুরের ভয়েস ফাইল

ট্যুর সিস্টেমের লাইনগুলোর জন্যও একই নিয়মে ফাইল রাখা যায় (বাক্য: `src/i18n/bn.ts` এর `voice`):

    tourWaitBoth.mp3, tourWaitHeli.mp3, tourWaitCar.mp3, tourNoVehicle.mp3, tourNeedFoot.mp3,
    tourChoose.mp3, tourGoing.mp3, tourArrived.mp3, tourNoPad.mp3, tourNoRoute.mp3, tourCarStuck.mp3

## ট্রেন ও স্টেশন ঘোষণা (ধাপ ৬)

স্টেশনের পাশে থাকলে ট্রেন আসা/থামা/ছাড়া/সিগন্যালে আটকে থাকার ঘোষণা বাজে। প্রতিটি স্টেশনের জন্য আলাদা ফাইল (স্টেশন id: `central`, `south-interchange`, `port`, `east-works`, `north-hub`, `airport`, `nw-town`, `sw-newtown`):

    train-approach-<স্টেশন>.mp3   ট্রেন প্রবেশ করছে
    train-arrive-<স্টেশন>.mp3     ট্রেন থেমেছে
    train-depart-<স্টেশন>.mp3     ট্রেন ছাড়ছে
    train-hold-platform-<স্টেশন>.mp3   ছাড়ার সিগন্যাল লাল (প্ল্যাটফর্মে অপেক্ষা)
    train-hold-signal-<স্টেশন>.mp3     স্টেশনের আগে সিগন্যাল লাল

বাক্যগুলো `src/i18n/bn.ts` এর `trains.announce` (স্টেশনের নাম `rail.station` থেকে বসে)। ফাইল না থাকলে ব্রাউজারের বাংলা TTS, তাও না থাকলে শুধু সাবটাইটেল। ঘোষণা কখনো অন্য ভয়েস লাইন কেটে দেয় না।
