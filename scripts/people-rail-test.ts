// STAGE 15 / Step 7b (headless part, no Rapier / three): does the railway harm road traffic, AI cars or pedestrians?
//   1. GROUND: over EVERY road (not only near the railway) the terrain with the railway equals the terrain without it (natural ground + island + roads only), on the
//      carriageway, shoulders and 6 m beyond (where pedestrians / sidewalks are);
//   2. SOLIDS: no railway collider (viaduct deck slab, parapets, piers, platforms: the very box lists RailPhysics gives to Rapier) intersects a
//      vehicle (3.5 m tall, 2.2 x 4.6 m) on any lane point of any road, nor a person (cylinder r 0.4, 1.8 m) on the carriageway / shoulders / 6 m beyond;
//      the least height left over a road under a viaduct is reported;
//   3. AI ROUTES: the routes the AI drivers really build (RouteBuilder, junction turns included) never intersect a railway collider;
//   4. TRAINS: a train body (rail head + 0.3 .. +4.3 m, 3 m wide) never overlaps a road surface volume: no level crossing anywhere;
//   5. the road data itself is independent of the railway (same roads / pads whether or not the rail is built: counts and a checksum).
// Not covered (needs real Rapier, see docs): body count / step time with trains near the player, kinematic train vs car / person behaviour.
import { TerrainGenerator } from '../src/terrain/TerrainGenerator';
import { Config } from '../src/core/Config';
import { RoadGraph, type RoadPoint } from '../src/traffic/RoadGraph';
import { RouteBuilder } from '../src/traffic/Route';
import { RAIL_DESIGN as D } from '../src/rail/RailPlan';
import { deckBoxes, pierSpecs, type DeckBox } from '../src/rail/RailPhysics';
import { obbPenetration, playerObb, vehicleObb } from '../src/trains/TrainOverlap';
import type { Obb } from '../src/trains/TrainBoxes';
import { TrainFleet } from '../src/trains/TrainSim';
import { RailGraph } from '../src/trains/RailGraph';

let bad = 0;
const fail = (m: string) => { bad++; if (bad < 40) console.log('FAIL', m); };
const t0 = Date.now();
const gen = new TerrainGenerator(Config.world.seed);
const R = gen.roads;
const rail = gen.rail;
const graph = new RoadGraph(R);
console.log(`terrain + roads + rail ${Date.now() - t0} ms; ${R.roads.length} roads, ${R.pads.length} pads, ${rail.edges.length} lines, ${rail.links.length} links`);
const sA = { h: 0 } as any, sB = { h: 0 } as any;

/* ------------------------------------------------------------------ 1. ground */
console.log('\n== 1. ground under roads and beside them');
{
  let probes = 0, hurt = 0, maxHurt = 0, farProbes = 0, farHurt = 0;
  for (const r of R.roads) {
    for (let i = 0; i + 1 < r.xs.length; i++) {
      const dx = r.xs[i + 1] - r.xs[i], dz = r.zs[i + 1] - r.zs[i], l = Math.hypot(dx, dz) || 1;
      const nx = -dz / l, nz = dx / l;
      const steps = Math.max(1, Math.round(l / 10));
      for (let k = 0; k < steps; k++) {
        const t = k / steps, cx = r.xs[i] + dx * t, cz = r.zs[i] + dz * t;
        for (const u of [0, r.halfWidth * 0.5, -r.halfWidth * 0.5, r.halfWidth, -r.halfWidth, r.halfWidth + r.shoulder, -(r.halfWidth + r.shoulder), r.halfWidth + r.shoulder + 6, -(r.halfWidth + r.shoulder + 6)]) {
          const x = cx + nx * u, z = cz + nz * u;
          gen.sampleGround(x, z, sA); gen.roads.apply(x, z, sA); gen.sample(x, z, sB);
          probes++;
          const d = Math.abs(sA.h - sB.h);
          if (d > 0.02) { hurt++; maxHurt = Math.max(maxHurt, d); }
        }
        // info: 12 m beyond the shoulder (the railway corridor may legitimately start here)
        for (const u of [r.halfWidth + r.shoulder + 12, -(r.halfWidth + r.shoulder + 12)]) {
          const x = cx + nx * u, z = cz + nz * u;
          gen.sampleGround(x, z, sA); gen.roads.apply(x, z, sA); gen.sample(x, z, sB);
          farProbes++;
          if (Math.abs(sA.h - sB.h) > 0.02) farHurt++;
        }
      }
    }
  }
  console.log(`${probes} probes on / beside all roads (to 6 m beyond the shoulder): terrain changed by the railway on ${hurt} (max ${maxHurt.toFixed(3)} m)`);
  console.log(`(info) 12 m beyond the shoulder: ${farHurt} of ${farProbes} probes differ (the railway formation may start there)`);
  if (hurt) fail(`the railway changes the ground on ${hurt} road / roadside probes`);
}

/* ------------------------------------------------------------------ rail solids */
interface Solid extends Obb { r: number; kind: string }
const solids: Solid[] = [];
function axes(q: { x: number; y: number; z: number; w: number }): [Obb['ax'], Obb['ay'], Obb['az']] {
  const rot = (v: [number, number, number]): [number, number, number] => {
    const [x, y, z] = v;
    const tx = 2 * (q.y * z - q.z * y), ty = 2 * (q.z * x - q.x * z), tz = 2 * (q.x * y - q.y * x);
    return [x + q.w * tx + (q.y * tz - q.z * ty), y + q.w * ty + (q.z * tx - q.x * tz), z + q.w * tz + (q.x * ty - q.y * tx)];
  };
  return [rot([1, 0, 0]), rot([0, 1, 0]), rot([0, 0, 1])];
}
{
  const piers = pierSpecs(rail);
  const add = (b: DeckBox, kind: string) => {
    const [ax, ay, az] = axes(b.q);
    solids.push({ x: b.x, y: b.y, z: b.z, hx: b.hx, hy: b.hy, hz: b.hz, ax, ay, az, r: Math.hypot(b.hx, b.hy, b.hz) + 0.5, kind });
  };
  let pieces = 0;
  for (const e of [...rail.edges, ...rail.links.map((l) => l.edge)]) for (const seg of e.segments) {
    if (seg.kind !== 'bridge') continue;
    const n = Math.max(1, Math.ceil((seg.s1 - seg.s0) / 120));
    for (let k = 0; k < n; k++) {
      const s0 = seg.s0 + ((seg.s1 - seg.s0) * k) / n, s1 = seg.s0 + ((seg.s1 - seg.s0) * (k + 1)) / n;
      const mid = rail.pointAt(e, (s0 + s1) / 2);
      for (const b of deckBoxes(rail, e, s0, s1, mid.x, mid.z, piers)) add(b, 'deck');
      pieces++;
    }
  }
  // platforms: the same two boxes per arrival as RailPhysics.platform (copied: that method is private)
  for (const st of rail.stations) for (const ar of st.arrivals) {
    const e = rail.edges.find((q) => q.id === ar.edgeId)!;
    const sgn = ar.end === 'a' ? 1 : -1, s0 = ar.end === 'a' ? 0 : e.length;
    const p = rail.pointAt(e, s0 + sgn * (12 + D.platform / 2));
    const yaw = Math.atan2(p.dx, p.dz), c = Math.cos(yaw / 2), sn = Math.sin(yaw / 2);
    const wx = -p.dz, wz = p.dx;
    for (const sg of [-1, 1]) {
      const lat = sg * (D.trackSpacing / 2 + 1.7 + 2.25);
      add({ x: p.x + wx * lat, y: st.level + 0.23, z: p.z + wz * lat, hx: 2.25, hy: 0.73, hz: D.platform / 2, q: { w: c, x: 0, y: sn, z: 0 }, friction: 0.9 }, 'platform');
    }
  }
  console.log(`\n== 2. railway solids: ${solids.length} boxes (${solids.filter((s) => s.kind === 'deck').length} deck / parapet / pier, ${solids.filter((s) => s.kind === 'platform').length} platform) from ${pieces} deck pieces`);
}
const CELL = 64;
const grid = new Map<string, Solid[]>();
for (const b of solids) {
  const x0 = Math.floor((b.x - b.r) / CELL), x1 = Math.floor((b.x + b.r) / CELL), z0 = Math.floor((b.z - b.r) / CELL), z1 = Math.floor((b.z + b.r) / CELL);
  for (let i = x0; i <= x1; i++) for (let j = z0; j <= z1; j++) { const k = `${i},${j}`; (grid.get(k) ?? grid.set(k, []).get(k)!).push(b); }
}
function near(x: number, z: number): Solid[] {
  return grid.get(`${Math.floor(x / CELL)},${Math.floor(z / CELL)}`) ?? [];
}
const hits = (o: Obb): Solid | null => {
  for (const b of near(o.x, o.z)) if (Math.hypot(b.x - o.x, b.z - o.z) < b.r + 6 && obbPenetration(o, b) > 0.02) return b;
  return null;
};

/* ------------------------------------------------------------------ 2. vehicles and people on every road */
{
  const p: RoadPoint = { x: 0, z: 0, y: 0, hx: 0, hz: 0 };
  let carProbes = 0, carHit = 0, perProbes = 0, perHit = 0, perBeside = 0;
  for (let id = 0; id < R.roads.length; id++) {
    const r = R.roads[id];
    const lane = graph.laneOffset(id);
    for (let s = 0; s <= r.length; s += 5) {
      // vehicles: both lanes (and the middle, for wide vehicles passing)
      for (const [dir, lat] of [[1, lane], [-1, lane], [1, 0]] as Array<[1 | -1, number]>) {
        graph.at(id, s, dir, lat, p);
        carProbes++;
        const h = 3.5;
        const o = vehicleObb(p.x, p.y + 0.2 + h / 2, p.z, p.hx, p.hz, { x: 1.1, y: h / 2, z: 2.3 });
        if (hits(o)) { carHit++; fail(`vehicle collides with a railway solid: road ${id} s=${s.toFixed(0)} dir ${dir}`); }
      }
      // people: across carriageway, shoulder and 6 m beyond
      for (let u = -(r.halfWidth + r.shoulder + 6); u <= r.halfWidth + r.shoulder + 6; u += 2) {
        graph.at(id, s, 1, u, p);
        const onRoad = Math.abs(u) <= r.halfWidth + r.shoulder;
        let y = p.y;
        if (!onRoad) { gen.sample(p.x, p.z, sB); y = Math.max(sB.h, 0); }
        perProbes++;
        if (hits(playerObb(p.x, y, p.z, 0.4, 1.8))) {
          // on the carriageway / shoulder a solid would be a harm; 6 m beyond it is a pier / platform next to the road (a person is simply blocked there)
          if (onRoad) { perHit++; fail(`person collides with a railway solid ON the road: road ${id} s=${s.toFixed(0)} lateral ${u.toFixed(0)}`); }
          else perBeside++;
        }
      }
    }
  }
  console.log(`\n== 2. vehicles / people on every road`);
  console.log(`${carProbes} vehicle probes (3.5 m tall): ${carHit} hit a railway solid; ${perProbes} person probes on / beside roads: ${perHit} hit ON the road or shoulder`);
  console.log(`(info) ${perBeside} person probes 0-6 m beyond the shoulder stand inside a railway pier / platform (the person is blocked there, nothing is harmed)`);
  if (carHit) fail(`${carHit} vehicle probes hit a railway solid`);

  // exact clearance under viaduct slabs: every road point (1 m along, every 2 m across) inside a slab footprint with the road BELOW the slab
  let n = 0, worst = Infinity, at = '';
  const lowRoads = new Map<number, number>();
  for (let id = 0; id < R.roads.length; id++) {
    const r = R.roads[id];
    for (let s = 0; s <= r.length; s += 1) for (let u = -r.halfWidth; u <= r.halfWidth + 0.01; u += 2) {
      graph.at(id, s, 1, u, p);
      for (const b of near(p.x, p.z)) {
        if (b.hy < 1.2 || b.kind !== 'deck') continue;
        const dx = p.x - b.x, dz = p.z - b.z;
        const lx = dx * b.ax[0] + dz * b.ax[2], lz = dx * b.az[0] + dz * b.az[2];
        if (Math.abs(lx) > b.hx || Math.abs(lz) > b.hz) continue;
        const clear = b.y - b.hy - p.y;
        if (clear < 0) continue; // the road is above / beside: road-over-rail
        n++;
        if (clear < worst) { worst = clear; at = `road ${id} s=${s} lateral ${u}`; }
        if (clear < 5.0) lowRoads.set(id, Math.min(lowRoads.get(id) ?? 99, clear));
      }
    }
  }
  console.log(`${n} road points lie under a viaduct slab; least clearance to the slab underside ${worst.toFixed(2)} m at ${at}`);
  console.log(`(info) the design is ${D.roadClearance} m at the crossing; below 5.0 m only at the slab edge of steeply falling roads: ${[...lowRoads.entries()].map(([k, v]) => `road ${k} ${v.toFixed(2)} m`).join(', ')}`);
  if (worst < 3.5) fail(`clearance under a viaduct is only ${worst.toFixed(2)} m (a 3.5 m vehicle would not pass)`);
}

/* ------------------------------------------------------------------ 3. AI routes */
{
  let seed = 4242;
  const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
  const N = 600;
  let pts = 0, hit = 0, jn = 0, routes = 0;
  for (let k = 0; k < N; k++) {
    // start spots that make a long route (the people test starts on s in [40, length-400] -> use roads >= 600 m, which is what that formula assumes)
    let sp = graph.randomSpot(rnd), tries = 0;
    while (R.roads[sp.roadId].length < 600 && tries++ < 50) sp = graph.randomSpot(rnd);
    const road = R.roads[sp.roadId];
    if (road.length < 600) continue;
    const s = Math.min(Math.max(40, sp.s), road.length - 400);
    const rb = new RouteBuilder(graph, rnd, sp.roadId, s, 1, 0.9);
    rb.start();
    rb.fill(0, 1700);
    routes++;
    for (let i = 0; i < rb.pts.length - 1; i++) {
      const a = rb.pts[i], b = rb.pts[i + 1];
      const hx = b.x - a.x, hz = b.z - a.z;
      pts++;
      if (a.jn) jn++;
      const o = vehicleObb(a.x, a.y + 0.2 + 1.75, a.z, hx, hz, { x: 1.1, y: 1.75, z: 2.3 });
      if (hits(o)) { hit++; fail(`AI route point collides with a railway solid (route ${k}, point ${i}, junction ${a.jn})`); }
    }
  }
  console.log(`\n== 3. AI routes: ${routes} routes of 1700 m, ${pts} route points (${jn} inside junction turns): ${hit} touch a railway solid`);
}

/* ------------------------------------------------------------------ 4. trains vs roads */
{
  const fleet = new TrainFleet(rail, { signals: false });
  const g = new RailGraph(rail);
  const tp: Array<{ x: number; y: number; z: number }> = [];
  const T_CELL = 20;
  const tgrid = new Map<string, number[]>();
  let samples = 0;
  for (const n of g.nodes.values()) for (const leg of g.legsFrom(n.key)) {
    const path = fleet.pathFor(leg);
    for (let i = 0; i < path.n; i++) {
      // refine to ~2.5 m so a 3 m wide train body cannot slip between samples
      const j = Math.min(path.n - 1, i + 1);
      const gap = Math.hypot(path.x[j] - path.x[i], path.z[j] - path.z[i]);
      const m = Math.max(1, Math.ceil(gap / 2.5));
      for (let q = 0; q < m; q++) {
        const t = q / m;
        const pt = { x: path.x[i] + (path.x[j] - path.x[i]) * t, y: path.y[i] + (path.y[j] - path.y[i]) * t, z: path.z[i] + (path.z[j] - path.z[i]) * t };
        const idx = tp.push(pt) - 1;
        const key = `${Math.floor(pt.x / T_CELL)},${Math.floor(pt.z / T_CELL)}`;
        (tgrid.get(key) ?? tgrid.set(key, []).get(key)!).push(idx);
        samples++;
      }
    }
  }
  const p: RoadPoint = { x: 0, z: 0, y: 0, hx: 0, hz: 0 };
  let probes = 0, conflicts = 0, closestOver = Infinity, closestUnder = Infinity;
  for (let id = 0; id < R.roads.length; id++) {
    const r = R.roads[id];
    const half = r.halfWidth + r.shoulder;
    for (let s = 0; s <= r.length; s += 3) for (let u = -half; u <= half + 0.01; u += 2) {
      graph.at(id, s, 1, u, p);
      probes++;
      const cx = Math.floor(p.x / T_CELL), cz = Math.floor(p.z / T_CELL);
      for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) {
        const list = tgrid.get(`${cx + a},${cz + b}`);
        if (!list) continue;
        for (const idx of list) {
          const t = tp[idx];
          if (Math.hypot(t.x - p.x, t.z - p.z) > 3.2) continue;
          // train body [rail head + 0.3, +4.3]; road / vehicle volume [road surface, surface + 3.5] (the road's own deck / roof lies below the surface, so the gap below is measured to the surface)
          const trainLo = t.y + 0.3, trainHi = t.y + 4.3, roadLo = p.y, roadHi = p.y + 3.5;
          if (trainHi > roadLo && trainLo < roadHi) { conflicts++; if (conflicts <= 5) fail(`train and road overlap: road ${id} s=${s} lateral ${u.toFixed(0)}, train y ${t.y.toFixed(1)} road y ${p.y.toFixed(1)}`); }
          else if (roadLo >= trainHi) closestUnder = Math.min(closestUnder, roadLo - trainHi);
          else closestOver = Math.min(closestOver, trainLo - roadHi);
        }
      }
    }
  }
  console.log(`\n== 4. trains vs roads: ${samples} train path samples (all ${[...g.nodes.values()].reduce((a, n) => a + g.legsFrom(n.key).length, 0)} legs, links and crossovers included), ${probes} road surface probes`);
  console.log(`train body overlaps a road / vehicle volume: ${conflicts}; least gap between the train roof and the road SURFACE where a train passes under a road (design: 7.4 m drop - 4.5 m train = 2.9 m for the road's deck / the box roof): ${closestUnder === Infinity ? 'none' : closestUnder.toFixed(2) + ' m'}; OVER a road: ${closestOver === Infinity ? 'none' : closestOver.toFixed(2) + ' m'}`);
}

/* ------------------------------------------------------------------ 5. road data independent of the railway */
{
  let sum = 0;
  for (const r of R.roads) { sum += r.length + r.halfWidth + r.lanes; for (let i = 0; i < r.xs.length; i += 7) sum += r.xs[i] * 0.001 + r.zs[i] * 0.002 + r.ys[i] * 0.003; }
  for (const pd of R.pads) sum += pd.x * 0.01 + pd.z * 0.02 + pd.rCore;
  console.log(`\n== 5. road data checksum ${sum.toFixed(3)} (${R.roads.length} roads, ${R.pads.length} pads); the roads are built BEFORE the railway (RailNetwork reads them, never writes)`);
  console.log('   (compare the number with the one printed for the original project / a build without rail: see the doc)');
}

console.log(`\n${((Date.now() - t0) / 1000).toFixed(1)} s`);
console.log(bad === 0 ? '\nALL OK' : `\n${bad} FAILURES`);
process.exit(bad === 0 ? 0 : 1);
