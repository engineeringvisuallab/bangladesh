// Stage 10B check (local streets): npx tsx scripts/local-roads-test.ts
//  - every local street is reachable from a freeway / arterial / collector (through junction pads)
//  - no overlapping asphalt, no street in water or on a bridge, widths as planned, gentle grades
//  - junction pads were built for every local junction (none skipped)
//  - AI cars can route through the grid
import { TerrainGenerator } from '../src/terrain/TerrainGenerator';
import { Config } from '../src/core/Config';
import { CityPlan } from '../src/city/CityPlan';
import { RoadGraph } from '../src/traffic/RoadGraph';
import { RouteBuilder } from '../src/traffic/Route';

let fails = 0;
const ok = (c: boolean, msg: string): void => {
  console.log((c ? 'PASS ' : 'FAIL ') + msg);
  if (!c) fails++;
};

const t0 = performance.now();
const g = new TerrainGenerator(Config.world.seed);
const R = g.roads;
const build = performance.now() - t0;
const plan = new CityPlan(TerrainGenerator.makeSites(Config.world.seed));
const local = R.roads.filter((r) => r.tier === 4);
console.log(`build ${build.toFixed(0)} ms, roads ${R.roads.length}, local streets ${local.length}, pads ${R.pads.length}, grid angle site0 ${(((R.localAngle.get(0) ?? 0) * 180) / Math.PI).toFixed(1)} deg`);
ok(Config.roads.activeTier === 4, 'activeTier = 4');
ok(local.length > 100, `local streets built (${local.length})`);

console.log('\narea            nodes streets   km   rejected[outside,water,road,bridge,grade]');
for (const s of R.localStats) console.log(`${s.areaId.padEnd(15)} ${String(s.nodes).padStart(4)} ${String(s.streets).padStart(6)} ${(s.lengthM / 1000).toFixed(2).padStart(5)}   ${s.rejected.join(',')}`);
console.log('');

// ---- street properties -------------------------------------------------------------------------------------
let badKind = 0;
let badWidth = 0;
let badArea = 0;
let steep = 0;
let maxGrade = 0;
for (const r of local) {
  if (r.kind !== 'local' || r.closed) badKind++;
  const mid = Math.floor(r.xs.length / 2);
  const a = plan.areaAt(r.xs[mid], r.zs[mid]);
  const own = R.localStats.find((s) => s.areaId === r.areaId);
  if (!own) badArea++;
  const grid = plan.areas.find((q) => q.id === r.areaId)?.grid;
  if (!grid || Math.abs(r.halfWidth - grid.halfWidth) > 1e-6 || r.lanes !== grid.lanes || r.speedKmh !== grid.speedKmh) badWidth++;
  void a;
  for (let i = 1; i < r.xs.length; i++) {
    const gr = Math.abs(r.ys[i] - r.ys[i - 1]) / Math.hypot(r.xs[i] - r.xs[i - 1], r.zs[i] - r.zs[i - 1]);
    maxGrade = Math.max(maxGrade, gr);
    if (gr > Config.city.localRoads.rampGrade) steep++;
  }
}
ok(badKind === 0, 'all local streets are tier 4, kind local, open splines');
ok(badArea === 0, 'every street belongs to an area of the plan');
ok(badWidth === 0, 'street width / lanes / speed come from the area grid');
ok(steep === 0, `no street steeper than ${(Config.city.localRoads.rampGrade * 100).toFixed(0)} % (max ${(maxGrade * 100).toFixed(1)} %)`);

// ---- water + bridges -------------------------------------------------------------------------------------
let wet = 0;
let onBridge = 0;
for (const r of local) {
  if (r.bridgeOf.some((b) => b >= 0)) onBridge++;
  for (let i = 0; i < r.xs.length; i++) {
    for (const off of [-1, 0, 1]) {
      const x = r.xs[i] + r.nx[i] * off * r.halfWidth;
      const z = r.zs[i] + r.nz[i] * off * r.halfWidth;
      const hh = g.heightAt(x, z);
      const sc = g.makeSample();
      g.sampleNatural(x, z, sc);
      if (!Number.isNaN(sc.water) && sc.h < sc.water + 0.2) wet++;
      if (hh < 1) wet++;
    }
  }
}
ok(wet === 0, `no street point in water (${wet})`);
ok(onBridge === 0, `no local street on a bridge (${onBridge})`);

// ---- overlap: asphalt of two roads that do not meet in a junction -------------------------------------------
const padOf = (x: number, z: number): boolean => R.pads.some((p) => Math.hypot(p.x - x, p.z - z) < p.rCore + 1);
let overlaps = 0;
const examples: string[] = [];
for (const r of local) {
  for (let i = 0; i < r.xs.length; i += 1) {
    const x = r.xs[i];
    const z = r.zs[i];
    if (padOf(x, z)) continue;
    for (const o of R.roads) {
      if (o === r) continue;
      let best = Infinity;
      for (let j = 0; j < o.xs.length; j++) {
        const d = Math.hypot(o.xs[j] - x, o.zs[j] - z);
        if (d < best) best = d;
      }
      if (best < (r.halfWidth + o.halfWidth) * 0.98 + 1.5) {
        // roads that meet at a pad end are allowed to be close to each other at their ends only; here no pad covers the spot
        overlaps++;
        if (examples.length < 5) examples.push(`${r.name} x ${o.name} at ${x.toFixed(0)},${z.toFixed(0)} d=${best.toFixed(1)}`);
      }
    }
  }
}
ok(overlaps === 0, `no overlapping asphalt outside junction pads (${overlaps}) ${examples.join('; ')}`);

// ---- junction pads ----------------------------------------------------------------------------------------
const skippedLocal = R.padSkipped.filter((m) => /\bL\d+/.test(m));
ok(skippedLocal.length === 0, `every local junction got an engineered pad (${skippedLocal.length} skipped) ${skippedLocal.slice(0, 3).join('; ')}`);
const padCount = (name: string): number => R.pads.filter((p) => p.arms.some((a) => R.roads[a.roadId].name === name)).length;
let noPad = 0;
for (const r of local) if (padCount(r.name) === 0) noPad++;
ok(noPad === 0, `every local street meets at least one pad (${noPad} without)`);

// ---- connectivity: roads connected through pads, BFS from the tier 1-3 network --------------------------------
const adj = new Map<number, Set<number>>();
const link = (a: number, b: number): void => {
  if (!adj.has(a)) adj.set(a, new Set());
  adj.get(a)!.add(b);
};
for (const p of R.pads) {
  const ids = [...new Set(p.arms.map((a) => a.roadId))];
  for (const a of ids) for (const b of ids) if (a !== b) link(a, b);
}
const seen = new Set<number>();
const queue: number[] = [];
for (const r of R.roads) if (r.tier <= 3) {
  seen.add(r.id);
  queue.push(r.id);
}
for (let q = 0; q < queue.length; q++) for (const n of adj.get(queue[q]) ?? []) if (!seen.has(n)) {
  seen.add(n);
  queue.push(n);
}
const lost = local.filter((r) => !seen.has(r.id));
ok(lost.length === 0, `every local street is reachable from a freeway / arterial / collector (${lost.length} cut off: ${lost.slice(0, 5).map((r) => r.name).join(',')})`);
let mainT = 0;
for (const r of local) for (const p of R.pads) if (p.arms.some((a) => a.roadId === r.id) && p.arms.some((a) => R.roads[a.roadId].tier <= 3)) mainT++;
ok(mainT >= 4, `local streets join tier 1-3 roads with T-junction pads (${mainT})`);
console.log(`street groups dropped (no connection possible): ${R.localDropped}`);

// ---- cars can route through the grid -----------------------------------------------------------------------
const graph = new RoadGraph(R);
let seed = 12345;
const rnd = (): number => {
  seed = (seed * 1664525 + 1013904223) >>> 0;
  return seed / 4294967296;
};
let inGrid = 0;
let leftGrid = 0;
let longRoutes = 0;
let bad = 0;
const N = 120;
for (let i = 0; i < N; i++) {
  const r = local[Math.floor(rnd() * local.length)];
  const rb = new RouteBuilder(graph, rnd, r.id, r.length * 0.5, rnd() < 0.5 ? 1 : -1, 0.9);
  rb.start();
  rb.fill(0, 1500);
  const used = new Set<number>([r.id, rb.roadId]);
  if (rb.pts.some((p) => ![p.x, p.z, p.y, p.vmax].every(Number.isFinite))) bad++;
  const len = rb.pts.length * 5;
  if (len > 500) longRoutes++;
  let hitLocal = 0;
  for (const p of rb.pts) {
    const a = plan.areaAt(p.x, p.z);
    if (a?.grid) hitLocal++;
  }
  if (hitLocal > 10) inGrid++;
  if (used.size > 1) leftGrid++;
}
ok(bad === 0, 'route points on local streets are finite');
ok(inGrid > N * 0.9, `routes starting on a local street drive on through the grid (${inGrid}/${N})`);
ok(leftGrid > N * 0.6, `cars take junctions between streets (${leftGrid}/${N})`);
ok(longRoutes > N * 0.5, `routes longer than 500 m exist on the grid (${longRoutes}/${N})`);

console.log(fails === 0 ? '\nALL OK' : `\n${fails} FAILED`);
process.exit(fails === 0 ? 0 : 1);
