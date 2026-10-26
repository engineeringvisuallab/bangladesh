// Headless expressway test (real terrain + real roads): npx tsx scripts/expressway-test.ts
import { TerrainGenerator } from '../src/terrain/TerrainGenerator';
import { Config } from '../src/core/Config';
import { ExpresswayNetwork } from '../src/expressway/ExpresswayNetwork';
import { XP } from '../src/expressway/ExpresswayPlan';
import { ARMY, SEAPORT } from '../src/city/WorldZones';
import { expresswayAvoid } from '../src/expressway/ExpresswayAvoid';

let fails = 0;
const ok = (c: boolean, msg: string) => {
  console.log((c ? 'PASS ' : 'FAIL ') + msg);
  if (!c) fails++;
};

const g = new TerrainGenerator(Config.world.seed);
let t = performance.now();
const net = new ExpresswayNetwork(g, g.roads.roads, expresswayAvoid());
console.log(`built in ${(performance.now() - t).toFixed(0)} ms: ${net.routes.length} routes, deck ${net.deckKm.toFixed(1)} km, ${net.piers.length} piers`);
for (const r of net.routes) {
  let worst = 0;
  for (let i = 1; i < r.ys.length; i++) worst = Math.max(worst, Math.abs(r.ys[i] - r.ys[i - 1]) / Math.hypot(r.xs[i] - r.xs[i - 1], r.zs[i] - r.zs[i - 1]));
  console.log(`${r.name.padEnd(20)} ${r.kind.padEnd(8)} ${r.length.toFixed(0).padStart(6)} m  max grade ${(worst * 100).toFixed(2)} %${r.landing ? `  lands ${r.landing.x.toFixed(0)},${r.landing.z.toFixed(0)}` : ''}`);
}
if (net.notes.length) console.log('notes:', net.notes);
if (net.issues.length) console.log('issues:', net.issues);

for (const r of net.routes.filter((r) => r.kind !== 'ramp')) {
  let worst = 0;
  for (let i = 1; i < r.ys.length; i++) worst = Math.max(worst, Math.abs(r.ys[i] - r.ys[i - 1]) / Math.hypot(r.xs[i] - r.xs[i - 1], r.zs[i] - r.zs[i - 1]));
  const lim = r.descend ? XP.endGrade : XP.maxGrade;
  ok(worst <= lim * 1.03, `${r.name}: grade ${(worst * 100).toFixed(2)} % <= ${(lim * 100).toFixed(1)} %`);
  let low = Infinity;
  // (the first / last 1.4 km of a dead end comes down to the ground on purpose)
  for (let i = 0; i < r.ys.length; i++) {
    const tail = !!r.descend && (r.cum[i] < 1400 || r.length - r.cum[i] < 1400);
    if (!tail) low = Math.min(low, r.ys[i] - r.ground[i]);
  }
  ok(low >= XP.clearance - 0.5, `${r.name}: deck stays >= ${XP.clearance - 0.5} m over the highest ground (lowest ${low.toFixed(1)} m)`);
}
for (const r of net.routes.filter((r) => r.kind === 'ramp')) {
  let worst = 0;
  for (let i = 1; i < r.ys.length; i++) worst = Math.max(worst, Math.abs(r.ys[i] - r.ys[i - 1]) / Math.hypot(r.xs[i] - r.xs[i - 1], r.zs[i] - r.zs[i - 1]));
  ok(worst <= XP.rampGrade * 1.08, `${r.name}: ramp grade ${(worst * 100).toFixed(2)} %`);
}
ok(net.routes.filter((r) => r.kind !== 'ramp').length === 3, 'exactly 3 flyovers');
ok(net.routes.every((r) => r.kind !== 'ramp'), 'no ramps (flyover ends come down to the ground)');
ok(net.interchanges.length === 6, '6 flyover ends (3 in the city, 3 in industrial / important areas)');
// how high is the deck above the ground? (a hill crossing would show as a huge number)
for (const r of net.routes.filter((r) => r.kind !== 'ramp')) {
  const clr = Array.from(r.ys, (y, i) => y - r.ground[i]).sort((a, b) => a - b);
  const p95 = clr[Math.floor(clr.length * 0.95)];
  console.log(`${r.name}: clearance median ${clr[clr.length >> 1].toFixed(0)} m, 95 % ${p95.toFixed(0)} m, max ${clr[clr.length - 1].toFixed(0)} m`);
  ok(p95 <= 30, `${r.name}: 95 % of the deck is at most 30 m over the ground`);
  ok(clr[clr.length - 1] <= 60, `${r.name}: nowhere more than 60 m over the ground`);
}
ok(net.issues.length === 0, `no build issues (${net.issues.length})`);

// the flyovers keep out of the army camp, and the area west of the port stays free for the future airport
let nearArmy = Infinity;
for (const ring of net.routes)
  for (let i = 0; i < ring.xs.length; i++) {
    const dx = Math.max(ARMY.x0 - ring.xs[i], 0, ring.xs[i] - ARMY.x1);
    const dz = Math.max(ARMY.z0 - ring.zs[i], 0, ring.zs[i] - ARMY.z1);
    nearArmy = Math.min(nearArmy, Math.hypot(dx, dz));
  }
ok(nearArmy > 80, `flyovers are ${nearArmy.toFixed(0)} m from the army camp (> 80 m)`);
let inPortWest = 0;
for (const r of net.routes.filter((r) => r.kind !== 'ramp'))
  for (let i = 0; i < r.xs.length; i++) if (r.xs[i] < SEAPORT.x0 && r.xs[i] > SEAPORT.x0 - 1500 && r.zs[i] > 2380) inPortWest++;
ok(inPortWest === 0, 'no expressway deck west of the port (future airport area is free)');
// determinism
const net2 = new ExpresswayNetwork(g, g.roads.roads, expresswayAvoid());
ok(net2.piers.length === net.piers.length && net2.routes[0].ys[100] === net.routes[0].ys[100], 'same result twice');
console.log(fails ? `${fails} FAILED` : 'all passed');
process.exit(fails ? 1 : 0);
