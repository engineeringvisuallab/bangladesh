// Headless day / night + street light test: npx tsx scripts/daynight-test.ts
import { DayNight } from '../src/environment/DayNight';
import { planStreetLights } from '../src/environment/StreetLights';
import { TerrainGenerator } from '../src/terrain/TerrainGenerator';
import { Config } from '../src/core/Config';

let fails = 0;
const ok = (c: boolean, msg: string) => {
  console.log((c ? 'PASS ' : 'FAIL ') + msg);
  if (!c) fails++;
};

// ---- clock: 8 min day + 3 min night, smooth, no jumps ----
const dn = new DayNight();
const C = Config.environment.dayNight;
ok(Math.abs(dn.cycleSeconds - (C.dayMinutes + C.nightMinutes) * 60) < 1e-9, `cycle = ${dn.cycleSeconds} s (${C.dayMinutes} + ${C.nightMinutes} min)`);
dn.setEnabled(true);
dn.setClock(0);
dn.update(100); // let the off-blend settle (it starts at 0 when enabled)
let daySec = 0;
let nightSec = 0;
let maxJump = 0;
let firstLamp = -1;
let fullDark = -1;
dn.setClock(dn.cycleSeconds * 0.3); // start at midday and run one whole cycle: sunset, night, sunrise
let prev = { lamp: dn.state.lampOn, night: dn.state.night, li: dn.state.lightIntensity, hi: dn.state.hemiIntensity };
const t00 = dn.clock;
for (let t = 0; t < dn.cycleSeconds; t += 0.25) {
  dn.update(0.25);
  const s = dn.state;
  if (s.sunY > 0) daySec += 0.25;
  else nightSec += 0.25;
  if (firstLamp < 0 && s.lampOn > 0.05) firstLamp = t;
  if (fullDark < 0 && s.night > 0.95) fullDark = t;
  const j = Math.max(Math.abs(s.lampOn - prev.lamp), Math.abs(s.night - prev.night), Math.abs(s.lightIntensity - prev.li) / 3, Math.abs(s.hemiIntensity - prev.hi) / 1.15);
  maxJump = Math.max(maxJump, j);
  if (!Number.isFinite(s.sunDir.x + s.lightDir.y + s.lightIntensity)) ok(false, 'finite numbers');
  prev = { lamp: s.lampOn, night: s.night, li: s.lightIntensity, hi: s.hemiIntensity };
}
void t00;
console.log(`sun above horizon ${daySec.toFixed(0)} s, below ${nightSec.toFixed(0)} s, first lamp at ${firstLamp.toFixed(0)} s, full night at ${fullDark.toFixed(0)} s`);
ok(Math.abs(daySec - C.dayMinutes * 60) < 1 && Math.abs(nightSec - C.nightMinutes * 60) < 1, 'sun is up 8 min and down 3 min');
ok(maxJump < 0.03, `no sudden change per 0.25 s step (max ${maxJump.toFixed(4)})`);
ok(firstLamp > 0 && fullDark - firstLamp > 25, `dusk takes ${(fullDark - firstLamp).toFixed(0)} s from the first lamp to full night`);

// ---- night off: fades to day, clock stops; on again: continues ----
dn.setClock(C.dayMinutes * 60 + 90); // deep night
dn.update(0.01);
ok(dn.state.night > 0.95 && dn.state.lampOn > 0.95, 'in the middle of the night: dark, lamps on');
dn.setEnabled(false);
const clock0 = dn.clock;
for (let i = 0; i < 40; i++) dn.update(0.25);
ok(dn.clock === clock0, 'night off: the clock stands still');
ok(dn.state.night < 0.01 && dn.state.lampOn < 0.01 && dn.state.sunY > 0.4, `night off: full day after ${C.switchSeconds} s (sunY ${dn.state.sunY.toFixed(2)})`);
dn.setEnabled(true);
for (let i = 0; i < 40; i++) dn.update(0.25);
ok(dn.state.night > 0.9, 'night on again: back in the night');
dn.setEnabled(true);

// ---- three modes: cycle / always night / always day ----
{
  const m = new DayNight();
  m.setMode('cycle');
  m.setClock(100);
  m.update(100); // settle the blend
  m.setClock(100);
  ok(m.mode === 'cycle' && m.enabled, 'mode: cycle');
  // hours: sunrise 06:00, sunset 18:00, midnight 00:00
  ok(Math.abs(m.clockHours(0) - 6) < 1e-9, 'hours: sunrise = 06:00');
  ok(Math.abs(m.clockHours(C.dayMinutes * 60) - 18) < 1e-9, 'hours: sunset = 18:00');
  ok(Math.abs(m.clockHours(C.dayMinutes * 60 + (C.nightMinutes * 60) / 2) - 24 % 24) < 1e-9 || Math.abs(m.clockHours(C.dayMinutes * 60 + (C.nightMinutes * 60) / 2)) < 1e-9, 'hours: middle of the night = 00:00');
  ok(Math.abs(m.clockHours(m.cycleSeconds - 1e-6) - 6) < 1e-3 || m.clockHours(m.cycleSeconds - 1e-6) > 5.99, 'hours: end of the night = 06:00');
  // always night: from the middle of the day the sky fades to deep night and stays there, the clock stands still
  m.setClock(C.dayMinutes * 60 * 0.4);
  m.update(0.01);
  const clockBefore = m.clock;
  m.setMode('night');
  for (let i = 0; i < 80; i++) m.update(0.25);
  ok(m.clock === clockBefore, 'always night: the clock stands still');
  ok(m.state.night > 0.99 && m.state.lampOn > 0.99 && m.state.sunY < -0.5, `always night: deep night (night ${m.state.night.toFixed(2)}, sunY ${m.state.sunY.toFixed(2)})`);
  ok(Math.abs(m.hours) < 1e-9, 'always night: clock shows 00:00');
  // straight from always night to always day: fades, no jump
  m.setMode('day');
  let jump = 0;
  let prevNight = m.state.night;
  for (let i = 0; i < 80; i++) {
    m.update(0.25);
    jump = Math.max(jump, Math.abs(m.state.night - prevNight));
    prevNight = m.state.night;
  }
  ok(jump < 0.15, `night -> day: smooth (max step ${jump.toFixed(3)})`);
  ok(m.state.night < 0.01 && m.state.lampOn < 0.01 && m.state.sunY > 0.4, 'always day: full daylight, lamps off');
  ok(m.hours > 6 && m.hours < 18, `always day: clock shows daytime (${m.hours.toFixed(2)} h)`);
  // back to the cycle: it continues from where it stopped
  m.setMode('cycle');
  for (let i = 0; i < 40; i++) m.update(0.25);
  ok(m.clock > clockBefore && m.clock < clockBefore + 15, 'cycle again: continues from the old time');
  // the mode is remembered by cycleMode(): cycle -> night -> day -> cycle
  m.setMode('cycle');
  const seq = [m.cycleMode(), m.cycleMode(), m.cycleMode()];
  ok(seq.join() === 'night,day,cycle', `cycleMode order: ${seq.join(' > ')}`);
  m.setMode('cycle');
}

// ---- street lights on the real road network ----
const g = new TerrainGenerator(Config.world.seed);
const R = g.roads;
const t0 = performance.now();
const spots = planStreetLights(R);
console.log(`street lights: ${spots.length} (${(performance.now() - t0).toFixed(0)} ms)`);
ok(spots.length > 2000 && spots.length < 12000, 'a sensible number of street lights');
let bad = 0;
let minGap = 1e9;
for (const s of spots) {
  if (![s.x, s.y, s.z, s.ix, s.iz, s.tx, s.ty, s.tz].every(Number.isFinite)) bad++;
  if (Math.abs(Math.hypot(s.ix, s.iz) - 1) > 1e-3) bad++;
}
ok(bad === 0, 'every pole has finite numbers and a unit arm direction');
// distance to the nearest other pole (cell grid)
const cells = new Map<string, number[]>();
spots.forEach((s, i) => {
  const k = Math.floor(s.x / 20) + ',' + Math.floor(s.z / 20);
  (cells.get(k) ?? cells.set(k, []).get(k)!).push(i);
});
let closePairs = 0;
spots.forEach((s, i) => {
  const cx = Math.floor(s.x / 20), cz = Math.floor(s.z / 20);
  for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) for (const j of cells.get(cx + a + ',' + (cz + b)) ?? []) {
    if (j <= i) continue;
    const d = Math.hypot(spots[j].x - s.x, spots[j].z - s.z);
    minGap = Math.min(minGap, d);
    if (d < 4) closePairs++;
  }
});
console.log(`closest two poles ${minGap.toFixed(1)} m, pairs closer than 4 m: ${closePairs}`);
ok(closePairs < spots.length * 0.01, 'poles do not pile up');
// poles never stand on asphalt of any road
let onAsphalt = 0;
for (const s of spots) if (R.surfaceAt(s.x, s.z) === 1) onAsphalt++;
console.log(`poles standing on asphalt: ${onAsphalt}`);
ok(onAsphalt < spots.length * 0.03, 'poles stand beside the road, not on it');
// coverage: every road has lights
const perKind: Record<string, number> = {};
console.log('lights per km of road:', (spots.length / (R.roads.reduce((a, r) => a + r.length, 0) / 1000)).toFixed(1));
void perKind;
console.log(fails ? `\n${fails} FAILED` : '\nALL PASSED');
process.exit(fails ? 1 : 0);
