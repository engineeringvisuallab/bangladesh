// Vehicle placement check: npx tsx scripts/vehicle-use-test.ts
//  - every vehicle has a `use` (road kinds + zones + weight); the table says what the player asked for
//  - on the real road network, AI routes of each vehicle never leave the road kinds / zones it belongs to
import { TerrainGenerator } from '../src/terrain/TerrainGenerator';
import { Config } from '../src/core/Config';
import { RoadGraph } from '../src/traffic/RoadGraph';
import { RouteBuilder } from '../src/traffic/Route';
import { SPECS, canUse, canUseRoad, canUsePlace } from '../src/vehicles';
import { CityPlan } from '../src/city/CityPlan';
import { getWorldZoneAt } from '../src/city/WorldZones';

let fails = 0;
const ok = (c: boolean, msg: string): void => {
  console.log((c ? 'PASS ' : 'FAIL ') + msg);
  if (!c) fails++;
};

// ---- the table ----  (road kind, world zone, city area)
for (const [id, sp] of Object.entries(SPECS)) ok(!!sp.use && sp.use.roads.length > 0, `${id} has a placement rule`);
const R_ = SPECS.rickshaw.use;
const A_ = SPECS.auto.use;
ok(R_.roads.length === 1 && R_.roads[0] === 'local', 'rickshaw: local streets only');
ok(!canUse(R_, 'arterial', 'residential', null) && !canUse(R_, 'highway', 'residential', null) && !canUse(R_, 'collector', 'residential', 'residential'), 'rickshaw: never on arterial / collector / freeway');
ok(canUse(R_, 'local', 'urban-core', 'residential') && canUse(R_, 'local', 'urban-core', 'commercial'), 'rickshaw: homes and bazaar streets yes');
ok(!canUse(R_, 'local', 'urban-core', 'industrial') && !canUse(R_, 'local', 'industrial', null), 'rickshaw: factory areas no');
ok(canUse(A_, 'local', 'urban-core', 'residential') && canUse(A_, 'collector', 'residential', null), 'CNG auto: residential streets and collectors');
ok(!canUse(A_, 'highway', 'residential', null) && !canUse(A_, 'arterial', 'residential', 'residential') && !canUse(A_, 'local', 'urban-core', 'industrial'), 'CNG auto: not on main roads, not in factories');
ok(!canUse(SPECS.bus.use, 'local', 'urban-core', 'residential') && canUse(SPECS.bus.use, 'arterial', 'urban-core', 'commercial'), 'bus: main roads, not residential lanes');
ok(!canUse(SPECS.bike.use, 'highway', 'urban-core', null), 'motorbike: not on the freeway');
ok(canUse(SPECS.sedan.use, 'highway', 'farmland', null) && canUse(SPECS.jeep.use, 'local', 'village', null), 'car / jeep: everywhere');
ok(SPECS.tank.use.weight === 0, 'tank: never in AI traffic');

// ---- real road network ----
const t0 = performance.now();
const g = new TerrainGenerator(Config.world.seed);
const graph = new RoadGraph(g.roads);
const plan = new CityPlan(g.sites);
const placeOf = (x: number, z: number) => ({ zone: getWorldZoneAt(x, z).kind, area: plan.areaAt(x, z)?.kind ?? null });
console.log(`network built in ${(performance.now() - t0).toFixed(0)} ms, ${graph.roads.length} roads`);
let seed = 12345;
const rnd = (): number => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);

for (const [id, s] of Object.entries(SPECS)) {
  if (s.use.weight <= 0) continue;
  let spawns = 0;
  let spots = 0;
  let badRoad = 0;
  let badZone = 0;
  let metres = 0;
  const kinds = new Map<string, number>();
  for (let i = 0; i < 1500 && spawns < 120; i++) {
    const spot = graph.randomSpotInRing((rnd() - 0.5) * 7000, (rnd() - 0.5) * 7000, 0, 700, rnd);
    if (!spot) continue;
    spots++;
    const road = graph.roads[spot.roadId];
    const p = { x: 0, z: 0, y: 0, hx: 0, hz: 0 };
    graph.at(spot.roadId, spot.s, 1, 0, p);
    const pl0 = placeOf(p.x, p.z);
    if (!canUse(s.use, road.kind, pl0.zone, pl0.area)) continue;
    spawns++;
    const rb = new RouteBuilder(graph, rnd, spot.roadId, spot.s, rnd() < 0.5 ? 1 : -1, 0.9, {
      roadOk: (k) => canUseRoad(s.use, k),
      placeOk: (x, z) => { const q = placeOf(x, z); return canUsePlace(s.use, q.zone, q.area); },
    });
    rb.start();
    let guard = 0;
    while (!rb.terminal && rb.pts.length < 500 && guard++ < 600) {
      rb.fill(rb.pts.length - 1, 30);
      const k = graph.roads[rb.roadId].kind;
      kinds.set(k, (kinds.get(k) ?? 0) + 1);
      if (!canUseRoad(s.use, k)) badRoad++;
    }
    // points in a junction curve (jn) and the first two points are skipped: they can straddle a border by a few metres
    rb.pts.forEach((q, i) => {
      if (q.jn || i < 2) return;
      const pl = placeOf(q.x, q.z);
      if (!canUsePlace(s.use, pl.zone, pl.area)) {
        badZone++;
        if (process.env.DIAG && badZone < 8) console.log('   bad pt', id, 'i', i, 'of', rb.pts.length, pl, 'prev', placeOf(rb.pts[i - 1].x, rb.pts[i - 1].z), 'jn prev', rb.pts[i - 1].jn, 'next', rb.pts[i + 1] ? placeOf(rb.pts[i + 1].x, rb.pts[i + 1].z) : null);
      }
    });
    metres += rb.pts.length * 5;
  }
  console.log(`  ${id.padEnd(9)} spawn spots ${spawns}/${spots}, avg route ${spawns ? (metres / spawns).toFixed(0) : 0} m, roads used: ${[...kinds].map(([k, n]) => `${k} ${n}`).join(', ')}`);
  ok(spawns > 0, `${id}: has places to appear on the real map`);
  ok(badRoad === 0 && badZone === 0, `${id}: routes stay on its road kinds and zones (bad road ${badRoad}, bad place ${badZone})`);
}

// control: without the rule a rickshaw wanders onto main roads, so the rule above really does something
{
  let main = 0;
  for (let i = 0; i < 300; i++) {
    const spot = graph.randomSpotInRing((rnd() - 0.5) * 7000, (rnd() - 0.5) * 7000, 0, 700, rnd);
    if (!spot || graph.roads[spot.roadId].kind !== 'local') continue;
    const rb = new RouteBuilder(graph, rnd, spot.roadId, spot.s, 1, 0.9);
    rb.start();
    let guard = 0;
    while (!rb.terminal && rb.pts.length < 500 && guard++ < 600) {
      rb.fill(rb.pts.length - 1, 30);
      if (graph.roads[rb.roadId].kind !== 'local') main++;
    }
  }
  ok(main > 0, `control: a driver WITHOUT the rule does reach main roads (${main} steps)`);
}
console.log(fails ? `\n${fails} FAILED` : '\nALL PASSED');
process.exit(fails ? 1 : 0);
