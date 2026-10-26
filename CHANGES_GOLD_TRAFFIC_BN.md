# Traffic signal (puro map) + Gold

## Traffic signal
- Map-er **shob junction**-e (123 ta: T ar 4-mukhi, local rasta-r T-o) signal bati ache. Bend-e (2 mukhi) kichu nei.
- AI gari shobai red-e stop line-e thame (`AIDriver` + `TrafficSignals.brakeLimit`). Player thamle kichu hoy na.
- Local rasta-r T-junction-e signal bondho korte: `src/traffic/TrafficSignals.ts`-e `SIGNAL_LOCAL_T = false`.

## Gold (shob number `src/economy/Gold.ts`-er `GoldConfig`-e)
- Shuru-te **10,000 Gold** (protibar notun game-e; browser-e save rakhte `persist: true`).
- Red light-e stop line par = **-10 Gold** (police case / wanted star nei).
- Accident = **500 Gold x gari-r dhoron** + **500 Gold protijon mrito manush-er jonno**.
  Gari-r dhoron (jar gari-te dhakka dile): bike 0.6, evbike 0.8, rickshaw 0.7, auto 0.9, sedan 1.0, jeep 1.2, bus 1.6, hypercar/evhypar 2.0, tank 2.5.
  Ekta dhakka/chapa-r ghotona (1.6 sec-er moddhe) = ekta fine. Ekshathe 2 ta gari + 2 jon mara gele duto gari-r multiplier jog hoy + 2 x 500.
  Shudhu manush chapa dile (gari-te dhakka na) = 500 + mrito x 500.
  Dewal / gach-e dhakka = fine nei. Parked gari-te onno gari dhakka dile player-er fine nei.
- Criminal (thug) mere felle = **+200 Gold**.
- Wanted star-er niyom age-r moto-i ache (ami bodlai ni); Gold fine tar shathe additional.
- Gold-er chip screen-er upor-er majhkhane; fine lal, uphar sobuj message.
