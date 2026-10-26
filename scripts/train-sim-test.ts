// STAGE 14 / Step 5a check - trains (headless; no three.js, no game classes):
//   * routing graph: nodes = station arrival ends, legs = station links (through) and terminal reversals; reversal ONLY at link-less ends;
//   * train geometry: finite, fits the loading gauge / the platform, pantograph touches the 25 kV contact wire, wheels on the 1435 mm gauge;
//   * every leg path: continuous, speed envelope obeys the braking rate and the zone limits, starts where the previous leg stopped (all pairs);
//   * a simulated fleet (2 h of game time): trains stay on the rails (independent measurement against the track lines), keep every speed limit,
//     stop at the platform centre, dwell 20-30 s, never reverse while moving, reverse only at terminals, visit several stations.
// Optional: npx tsx scripts/train-sim-test.ts 3600   -> simulated seconds (default 7200).
import { TerrainGenerator } from '../src/terrain/TerrainGenerator';
import { Config } from '../src/core/Config';
import { RAIL_DESIGN as D } from '../src/rail/RailPlan';
import type { RailEdge } from '../src/rail/RailNetwork';
import { RailGraph } from '../src/trains/RailGraph';
import { LegPath } from '../src/trains/TrackPath';
import { Train, TrainFleet } from '../src/trains/TrainSim';
import { BODY, buildCarMesh, PANTOGRAPH_TOP } from '../src/trains/TrainMesh';
import { CONSIST, RAIL_HEAD, STOP_FRONT_D, TRAIN, TRAIN_LENGTH } from '../src/trains/TrainConfig';

let bad = 0;
const fail = (m: string) => { bad++; console.log('FAIL', m); };
let t0 = Date.now();
const gen = new TerrainGenerator(Config.world.seed);
console.log(`terrain + roads + rail ${Date.now() - t0} ms`);
const rail = gen.rail;
const half = D.trackSpacing / 2;

/* ------------------------------------------------------------------ 1. graph */
console.log('\n== routing graph');
const graph = new RailGraph(rail);
console.log(`${graph.nodes.size} nodes (station arrival ends), ${[...graph.nodes.keys()].reduce((a, k) => a + graph.legsFrom(k).length, 0)} legs, terminal stations: ${graph.terminalStations().join(', ')}`);
if (graph.nodes.size !== rail.edges.length * 2) fail('node count is not 2 per line');
let reverseLegs = 0, throughLegs = 0;
for (const n of graph.nodes.values()) {
  const legs = graph.legsFrom(n.key);
  if (legs.length === 0) fail(`${n.key}: no way out`);
  const rev = legs.filter((l) => !l.via);
  reverseLegs += rev.length;
  throughLegs += legs.length - rev.length;
  if (rev.length && legs.length !== 1) fail(`${n.key}: reversal offered although the end has a link`);
  if (rev.length !== (graph.isTerminal(n.key) ? 1 : 0)) fail(`${n.key}: terminal flag and reversal leg disagree`);
  for (const l of legs) {
    if (l.via && !((l.via.a.edgeId === n.edgeId && l.via.a.end === n.end) || (l.via.b.edgeId === n.edgeId && l.via.b.end === n.end))) fail(`${l.key}: link does not touch the node`);
    if (l.via && l.via.station !== n.station) fail(`${l.key}: link of another station`);
    if (graph.nodes.get(l.to)!.station !== l.toStation) fail(`${l.key}: wrong destination station`);
  }
}
if (throughLegs !== rail.links.length * 2) fail(`through legs ${throughLegs} != 2 x ${rail.links.length} links (both directions)`);
console.log(`through legs ${throughLegs} (2 per link), reversal legs ${reverseLegs} (one per terminal end)`);
console.log('terminal ends:', [...graph.nodes.values()].filter((n) => graph.isTerminal(n.key)).map((n) => `${n.station}/${n.edgeId}`).join(', '));
const stationIds = rail.stations.map((s) => s.id);
for (const n of graph.nodes.values()) {
  const reach = graph.reachable(n.key);
  const st = new Set([...reach].map((k) => graph.nodes.get(k)!.station));
  console.log(`  from ${n.station.padEnd(17)} on ${n.edgeId.padEnd(15)} reaches ${String(st.size).padStart(1)} stations${st.size < stationIds.length ? ` (not: ${stationIds.filter((s) => !st.has(s)).join(', ')})` : ''}`);
}
{
  const show = (r: ReturnType<RailGraph['shortestRoute']>): string => (r ? r.map((l) => `${l.line.edgeId}${l.via ? '' : ' (reverse)'}`).join(' > ') : 'none');
  const r1 = graph.shortestRoute('south-1:b', 'port');
  console.log('route standing at south-interchange (arrived from central) -> port:', show(r1));
  if (!r1 || r1.length !== 1) fail('south-interchange -> port should be one leg through the link');
  const r2 = graph.shortestRoute('south-1:a', 'port');
  console.log('route standing at central (arrived from the south) -> port:', show(r2), '  (central has no link back to the south line: no turning back there)');
  if (!r2) fail('no route central -> port');
}

/* ------------------------------------------------------------------ 2. model */
console.log('\n== train geometry');
console.log(`consist: ${CONSIST.map((c) => c.kind).join(' + ')}, ${TRAIN_LENGTH.toFixed(1)} m long; stops with the centre at ${TRAIN.platformCentre} m from the line end (platform ${D.platform} m, from 12 to ${12 + D.platform} m)`);
if (STOP_FRONT_D < 12 || TRAIN.platformCentre + TRAIN_LENGTH / 2 > 12 + D.platform) fail('train does not fit the platform');
for (const kind of ['loco', 'coach', 'cab'] as const) {
  const m = buildCarMesh(kind);
  const nv = m.positions.length / 3;
  let lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < m.positions.length; i++) {
    if (!Number.isFinite(m.positions[i]) || !Number.isFinite(m.normals[i]) || !Number.isFinite(m.colors[i])) { fail(`${kind}: NaN`); break; }
    lo[i % 3] = Math.min(lo[i % 3], m.positions[i]);
    hi[i % 3] = Math.max(hi[i % 3], m.positions[i]);
  }
  for (let i = 0; i < m.indices.length; i++) if (m.indices[i] >= nv) { fail(`${kind}: index out of range`); break; }
  for (let i = 0; i < nv; i++) if (Math.abs(Math.hypot(m.normals[i * 3], m.normals[i * 3 + 1], m.normals[i * 3 + 2]) - 1) > 1e-4) { fail(`${kind}: normal not unit`); break; }
  const w = hi[2] - lo[2], len = hi[0] - lo[0];
  console.log(`  ${kind.padEnd(5)} ${nv} vertices, ${m.indices.length / 3} triangles, ${len.toFixed(1)} m long, ${w.toFixed(2)} m wide, y ${lo[1].toFixed(2)} .. ${hi[1].toFixed(2)} m above the rail head`);
  if (w > 3.1) fail(`${kind}: too wide (${w.toFixed(2)} m)`);
  if (lo[1] < -1e-6 || lo[1] > 0.05) fail(`${kind}: wheels do not stand on the rail head (lowest ${lo[1].toFixed(3)})`);
  const topWanted = kind === 'loco' ? PANTOGRAPH_TOP : BODY.coach.roof + 0.2;
  if (Math.abs(hi[1] - topWanted) > 0.02) fail(`${kind}: highest point ${hi[1].toFixed(2)} m, expected ${topWanted.toFixed(2)} m`);
  if (hi[1] + RAIL_HEAD > 6.6 - 0.5) fail(`${kind}: does not clear the tunnel opening (6.6 m high)`);
  // the rubber bellows (0.38 m) and the couplers (0.55 m) stand out of the body at the ends; the 0.8 m gap between two cars takes the bellows of both
  if (len > (kind === 'loco' ? BODY.loco.length : BODY.coach.length) + 1.2) fail(`${kind}: longer than its spec`);
}
if (Math.abs(PANTOGRAPH_TOP + RAIL_HEAD - D.contactHeight) > 1e-9) fail('pantograph top is not at the contact wire height');
console.log(`  pantograph collector top ${PANTOGRAPH_TOP.toFixed(2)} m over the rail head = contact wire ${D.contactHeight} m over the ballast - ${RAIL_HEAD} m rail head`);

/* ------------------------------------------------------------------ 3. leg paths */
console.log('\n== leg paths');
t0 = Date.now();
const legPaths = new Map<string, LegPath>();
const allLegs = [...graph.nodes.keys()].flatMap((k) => graph.legsFrom(k));
for (const l of allLegs) legPaths.set(l.key, new LegPath(rail, l));
console.log(`${allLegs.length} paths built in ${Date.now() - t0} ms`);
console.log('leg                                          km   samples  maxEnv km/h  min R   zones');
let worstTurn = 0, worstGap = 0;
for (const l of allLegs) {
  const p = legPaths.get(l.key)!;
  let maxEnv = 0, minR = Infinity;
  for (let i = 0; i < p.n; i++) {
    for (const a of [p.x[i], p.y[i], p.z[i], p.cum[i], p.env[i]]) if (!Number.isFinite(a)) { fail(`${l.key}: NaN in path`); break; }
    maxEnv = Math.max(maxEnv, p.env[i]);
    minR = Math.min(minR, p.radius[i]);
    if (i > 0) {
      const g = Math.hypot(p.x[i] - p.x[i - 1], p.z[i] - p.z[i - 1]);
      worstGap = Math.max(worstGap, g);
      if (g < 1e-6) fail(`${l.key}: duplicate path sample at ${i}`);
      if (p.env[i - 1] > Math.sqrt(p.env[i] * p.env[i] + 2 * TRAIN.serviceBrake * (p.cum[i] - p.cum[i - 1])) + 1e-6) fail(`${l.key}: envelope drops faster than the service braking at ${i}`);
    }
    if (i > 1) {
      const a1 = Math.atan2(p.z[i - 1] - p.z[i - 2], p.x[i - 1] - p.x[i - 2]), a2 = Math.atan2(p.z[i] - p.z[i - 1], p.x[i] - p.x[i - 1]);
      let d = Math.abs(a2 - a1);
      if (d > Math.PI) d = 2 * Math.PI - d;
      worstTurn = Math.max(worstTurn, d);
    }
  }
  console.log(`${l.key.padEnd(42)} ${(p.length / 1000).toFixed(2).padStart(5)} ${String(p.n).padStart(8)} ${(maxEnv * 3.6).toFixed(0).padStart(9)} ${minR.toFixed(0).padStart(7)}   ${p.zones.filter((z) => z.kind === 'link' || z.kind === 'crossover').map((z) => z.kind).join(',') || '-'}`);
  if (!(p.sStart > 0 && p.sStop > p.sStart + 50)) fail(`${l.key}: bad start/stop (${p.sStart.toFixed(1)}, ${p.sStop.toFixed(1)})`);
  if (p.env[p.n - 1] !== 0) fail(`${l.key}: envelope is not 0 at the end`);
  // the zone caps really cap the envelope
  for (let i = 0; i < p.n; i++) for (const z of p.zones) if ((z.kind === 'link' || z.kind === 'crossover') && p.cum[i] >= z.s0 && p.cum[i] <= z.s1 && p.env[i] > z.cap + 1e-9) { fail(`${l.key}: envelope above the ${z.kind} limit`); i = p.n; break; }
  // the stopping place is inside the station (train centre 100-230 m from the station centre)
  const st = rail.stationById(l.toStation)!;
  const c = { x: 0, y: 0, z: 0 };
  p.posAt(p.sStop - TRAIN_LENGTH / 2, c);
  const dc = Math.hypot(c.x - st.x, c.z - st.z);
  if (dc < 100 || dc > 230) fail(`${l.key}: stops ${dc.toFixed(0)} m from the centre of ${st.id}`);
}
console.log(`largest turn between two samples ${(worstTurn * 180 / Math.PI).toFixed(2)} deg, largest sample gap ${worstGap.toFixed(2)} m`);
// the 20 m line vertices of a 130 m curve already turn the polyline by 8.8 deg at once; a real kink would be far more
if (worstTurn > 10 * Math.PI / 180) fail('a path has a kink');
if (worstGap > TRAIN.sample + 0.6) fail('a path has a gap');

/* ------------------------------------------------------------------ 4. independent track lines */
interface Seg { x0: number; z0: number; x1: number; z1: number; y0: number; y1: number }
const trackSegs: Seg[] = [];
const centreSegs: Seg[] = [];
const edgesAll: RailEdge[] = [...rail.edges, ...rail.links.map((l) => l.edge)];
for (const e of edgesAll) {
  for (let i = 0; i < e.xs.length - 1; i++) {
    const dx = e.xs[i + 1] - e.xs[i], dz = e.zs[i + 1] - e.zs[i];
    const l = Math.hypot(dx, dz) || 1;
    const nx = -dz / l, nz = dx / l;
    centreSegs.push({ x0: e.xs[i], z0: e.zs[i], x1: e.xs[i + 1], z1: e.zs[i + 1], y0: e.design[i] + RAIL_HEAD, y1: e.design[i + 1] + RAIL_HEAD });
    for (const sd of [-1, 1]) trackSegs.push({ x0: e.xs[i] + nx * sd * half, z0: e.zs[i] + nz * sd * half, x1: e.xs[i + 1] + nx * sd * half, z1: e.zs[i + 1] + nz * sd * half, y0: e.design[i] + RAIL_HEAD, y1: e.design[i + 1] + RAIL_HEAD });
  }
}
const CELL = 40;
function makeGrid(segs: Seg[]): Map<string, number[]> {
  const g = new Map<string, number[]>();
  segs.forEach((s, k) => {
    const x0 = Math.min(s.x0, s.x1) - 6, x1 = Math.max(s.x0, s.x1) + 6, z0 = Math.min(s.z0, s.z1) - 6, z1 = Math.max(s.z0, s.z1) + 6;
    for (let cz = Math.floor(z0 / CELL); cz <= Math.floor(z1 / CELL); cz++) for (let cx = Math.floor(x0 / CELL); cx <= Math.floor(x1 / CELL); cx++) {
      const key = `${cx},${cz}`;
      if (!g.has(key)) g.set(key, []);
      g.get(key)!.push(k);
    }
  });
  return g;
}
const trackGrid = makeGrid(trackSegs), centreGrid = makeGrid(centreSegs);
/** Nearest line: distance and the height of that line at the nearest point. */
function nearest(segs: Seg[], grid: Map<string, number[]>, x: number, z: number): { d: number; y: number } {
  let best = { d: Infinity, y: NaN };
  for (const k of grid.get(`${Math.floor(x / CELL)},${Math.floor(z / CELL)}`) ?? []) {
    const s = segs[k];
    const vx = s.x1 - s.x0, vz = s.z1 - s.z0;
    const l2 = vx * vx + vz * vz || 1;
    const t = Math.max(0, Math.min(1, ((x - s.x0) * vx + (z - s.z0) * vz) / l2));
    const d = Math.hypot(x - (s.x0 + vx * t), z - (s.z0 + vz * t));
    if (d < best.d) best = { d, y: s.y0 + (s.y1 - s.y0) * t };
  }
  return best;
}
const linkSegs: Seg[][] = rail.links.map((l) => {
  const o: Seg[] = [];
  for (let i = 0; i < l.xs.length - 1; i++) o.push({ x0: l.xs[i], z0: l.zs[i], x1: l.xs[i + 1], z1: l.zs[i + 1], y0: 0, y1: 0 });
  return o;
});
function nearLink(x: number, z: number, reach: number): boolean {
  for (const o of linkSegs) for (const s of o) {
    const vx = s.x1 - s.x0, vz = s.z1 - s.z0;
    const l2 = vx * vx + vz * vz || 1;
    const t = Math.max(0, Math.min(1, ((x - s.x0) * vx + (z - s.z0) * vz) / l2));
    if (Math.hypot(x - (s.x0 + vx * t), z - (s.z0 + vz * t)) < reach) return true;
  }
  return false;
}

/* ------------------------------------------------------------------ 5. fleet */
const SIM = Number(process.argv[2]) > 0 ? Number(process.argv[2]) : 7200;
console.log(`\n== fleet: ${SIM} s of game time, step ${TRAIN.dt} s`);
const fleet = new TrainFleet(rail, { seed: 7, keepEvents: true });
const startAt = ['airport', 'sw-newtown', 'central', 'port', 'nw-town', 'north-hub', 'ring-south'];
const startKey = (s: string): string => (s === 'ring-south' ? 'ring-south:a' : graph.nodesAt(s)[0].key);
for (const s of startAt) fleet.spawn(startKey(s));
const n = CONSIST.length;
const snap = (tr: Train): number[] => {
  const out: number[] = [];
  const cp = { kind: 'coach', x: 0, y: 0, z: 0, fx: 0, fy: 0, fz: 0, flipped: false, bf: { x: 0, y: 0, z: 0 }, br: { x: 0, y: 0, z: 0 } } as Parameters<Train['carPose']>[1];
  for (let k = 0; k < n; k++) {
    tr.carPose(tr.reversed ? n - 1 - k : k, cp);
    // by physical end of the car (nose / tail): after a reversal the bogie in the direction of travel is the other one
    const nose = cp.flipped ? cp.br : cp.bf, tail = cp.flipped ? cp.bf : cp.br;
    out.push(nose.x, nose.y, nose.z, tail.x, tail.y, tail.z);
  }
  return out;
};
const stat = fleet.trains.map(() => ({
  maxV: 0, maxOver: -Infinity, maxAcc: 0, maxDec: 0, maxLat: 0, maxOff: 0, maxOffCross: 0, maxDy: 0, maxStopErr: 0, maxPlatErr: 0, maxJump: 0, flips: 0,
  linkOver: -Infinity, appOver: -Infinity, prevMove: null as null | { x: number; z: number }, visited: new Set<string>(), minSep: Infinity, stopsAtPlatform: 0,
}));
const cp = { kind: 'coach', x: 0, y: 0, z: 0, fx: 0, fy: 0, fz: 0, flipped: false, bf: { x: 0, y: 0, z: 0 }, br: { x: 0, y: 0, z: 0 } } as Parameters<Train['carPose']>[1];
const A = { x: 0, y: 0, z: 0 }, B = { x: 0, y: 0, z: 0 }, Cc = { x: 0, y: 0, z: 0 };
let checks = 0;
t0 = Date.now();
const steps = Math.round(SIM / TRAIN.dt);
let minSepGlobal = Infinity, closeCalls = 0;
for (let i = 0; i < steps; i++) {
  const tNow = (i + 1) * TRAIN.dt;
  fleet.time = tNow;
  for (let k = 0; k < fleet.trains.length; k++) {
    const tr = fleet.trains[k], S = stat[k];
    const stBefore = tr.state, vBefore = tr.v;
    const pre = stBefore === 'dwell' ? snap(tr) : null;
    tr.step(TRAIN.dt, tNow);
    const acc = (tr.v - vBefore) / TRAIN.dt;
    S.maxV = Math.max(S.maxV, tr.v);
    // (the step that ends in the stop snaps the last ~0.1 m/s to rest: not a braking rate)
    if (tr.state === 'run') {
      S.maxAcc = Math.max(S.maxAcc, acc);
      S.maxDec = Math.max(S.maxDec, -acc);
    }
    if (tr.v < -1e-9) fail(`train ${tr.id}: negative speed`);
    if (tr.state === 'run') S.maxOver = Math.max(S.maxOver, tr.v - tr.path.envAt(tr.s));
    if (tr.state === 'run' && tr.path.sStop - tr.s <= TRAIN.approachDist) S.appOver = Math.max(S.appOver, tr.v - TRAIN.approachSpeed);
    // departure: the new path must carry the train exactly where it stood
    if (stBefore === 'dwell' && tr.state === 'run') {
      const post = snap(tr);
      let j = 0;
      for (let q = 0; q < pre!.length; q += 3) j = Math.max(j, Math.hypot(pre![q] - post[q], pre![q + 1] - post[q + 1], pre![q + 2] - post[q + 2]));
      S.maxJump = Math.max(S.maxJump, j);
    }
    // arrival: centre of the train at the platform centre (measured on the line itself)
    if (stBefore === 'run' && tr.state === 'dwell') {
      const nd = graph.nodes.get(tr.node)!;
      const e = rail.edges.find((q) => q.id === nd.edgeId)!;
      const P = rail.pointAt(e, nd.end === 'a' ? TRAIN.platformCentre : e.length - TRAIN.platformCentre);
      tr.path.posAt(tr.s - TRAIN_LENGTH / 2, A);
      S.maxPlatErr = Math.max(S.maxPlatErr, Math.abs((A.x - P.x) * P.dx + (A.z - P.z) * P.dz));
      S.maxStopErr = Math.max(S.maxStopErr, Math.abs(tr.events[tr.events.length - 1].stopError ?? 0));
      S.stopsAtPlatform++;
      S.visited.add(nd.station);
    }
    // heavier checks twice a second
    if (i % 5 === 0) {
      checks++;
      const p = tr.path;
      if (tr.state === 'run' && tr.v > 0.1) {
        // never reverse while moving: the leading bogie keeps going the same way
        p.posAt(tr.s, A);
        if (S.prevMove) {
          const dx = A.x - S.prevMove.x, dz = A.z - S.prevMove.z;
          if (Math.hypot(dx, dz) > 0.5) {
            const prev = (S as any).prevDir as { x: number; z: number } | undefined;
            if (prev && dx * prev.x + dz * prev.z < 0) { S.flips++; fail(`train ${tr.id}: turned round while moving at t=${tNow.toFixed(0)} s`); }
            (S as any).prevDir = { x: dx, z: dz };
          }
        } else (S as any).prevDir = undefined;
        S.prevMove = { x: A.x, z: A.z };
        // sideways acceleration of the front and the rear bogie from the track shape (3-point circle, 20 m apart)
        for (const sb of [tr.s, tr.s - TRAIN_LENGTH + 4]) {
          if (sb - 20 < 0 || sb + 20 > p.length) continue;
          p.posAt(sb - 20, A); p.posAt(sb, B); p.posAt(sb + 20, Cc);
          const x1 = B.x - A.x, z1 = B.z - A.z, x2 = Cc.x - B.x, z2 = Cc.z - B.z;
          const cross = Math.abs(x1 * z2 - z1 * x2);
          if (cross > 1e-9) {
            const R = (Math.hypot(x1, z1) * Math.hypot(x2, z2) * Math.hypot(Cc.x - A.x, Cc.z - A.z)) / (2 * cross);
            S.maxLat = Math.max(S.maxLat, (tr.v * tr.v) / R);
          }
        }
        // link limit, measured against the link polylines themselves (any bogie of the train near a link)
        let onLink = false;
        for (let q = 0; q < n && !onLink; q++) { tr.carPose(q, cp); if (nearLink(cp.bf.x, cp.bf.z, 14) || nearLink(cp.br.x, cp.br.z, 14)) onLink = true; }
        if (onLink) S.linkOver = Math.max(S.linkOver, tr.v - TRAIN.linkSpeed);
      } else { S.prevMove = null; (S as any).prevDir = undefined; }
      if (tr.state === 'run' || tr.state === 'dwell') {
        // on the rails: every bogie against the track lines (+- 2.25 m from the centre lines), independent of the path code
        const crossing = tr.path.crossover && tr.state === 'run' && tr.path.zoneAt(tr.s)?.kind === 'crossover';
        for (let q = 0; q < n; q++) {
          tr.carPose(q, cp);
          for (const b of [cp.bf, cp.br]) {
            if (crossing) {
              const c = nearest(centreSegs, centreGrid, b.x, b.z);
              S.maxOffCross = Math.max(S.maxOffCross, Math.max(0, c.d - half));
            } else {
              const t = nearest(trackSegs, trackGrid, b.x, b.z);
              S.maxOff = Math.max(S.maxOff, t.d);
              S.maxDy = Math.max(S.maxDy, Math.abs(b.y - t.y));
            }
          }
        }
      }
    }
  }
  if (i % 10 === 0) {
    for (let a = 0; a < fleet.trains.length; a++) for (let b = a + 1; b < fleet.trains.length; b++) {
      const ta = fleet.trains[a], tb = fleet.trains[b];
      ta.path.posAt(ta.s, A); tb.path.posAt(tb.s, B);
      const d = Math.hypot(A.x - B.x, A.z - B.z);
      if (d < minSepGlobal) minSepGlobal = d;
      if (d < 60) closeCalls++;
    }
  }
}
const ms = Date.now() - t0;
console.log(`simulated ${steps} steps x ${fleet.trains.length} trains (with all checks) in ${ms} ms`);

console.log('\ntrain start            km    stops rev  stations  vmax  acc/dec   lat   off-track  dY    stop err  plat err  jump');
for (const tr of fleet.trains) {
  const S = stat[tr.id];
  const stations = new Set(tr.events.filter((e) => e.kind === 'arrive').map((e) => e.station));
  console.log(`${String(tr.id).padStart(2)} ${startAt[tr.id].padEnd(16)} ${(tr.odometer / 1000).toFixed(1).padStart(6)} ${String(tr.stops).padStart(5)} ${String(tr.reversals).padStart(3)} ${String(stations.size).padStart(6)}  ${(S.maxV * 3.6).toFixed(0).padStart(5)}  ${S.maxAcc.toFixed(2)}/${S.maxDec.toFixed(2)} ${S.maxLat.toFixed(2).padStart(6)}  ${S.maxOff.toFixed(3).padStart(8)}  ${S.maxDy.toFixed(3).padStart(5)}  ${S.maxStopErr.toFixed(3).padStart(7)}  ${S.maxPlatErr.toFixed(3).padStart(7)}  ${S.maxJump.toFixed(4)}`);
  // a train must visit at least 3 stations, or all it can reach (the ring-south pair is a closed shuttle: no link joins it to the network)
  const canReach = new Set([...graph.reachable(startKey(startAt[tr.id]))].map((k) => graph.nodes.get(k)!.station)).size;
  if (SIM >= 3600 && (stations.size < Math.min(3, canReach) || (canReach > 2 && stations.size < canReach - 2))) fail(`train ${tr.id}: visited only ${stations.size} of ${canReach} reachable stations`);
  if (tr.stops < Math.floor(SIM / 900)) fail(`train ${tr.id}: only ${tr.stops} stops`);
  if (S.maxV > TRAIN.maxSpeed + 1e-6) fail(`train ${tr.id}: over the line speed`);
  if (S.maxAcc > TRAIN.accel + 1e-6) fail(`train ${tr.id}: accelerates too hard`);
  if (S.maxDec > TRAIN.maxBrake + 1e-6) fail(`train ${tr.id}: brakes too hard`);
  if (S.maxOver > 0.3) fail(`train ${tr.id}: ${S.maxOver.toFixed(2)} m/s over the speed envelope`);
  if (S.appOver > 0.05) fail(`train ${tr.id}: ${S.appOver.toFixed(2)} m/s over the station approach limit`);
  if (S.linkOver > 0.1) fail(`train ${tr.id}: ${S.linkOver.toFixed(2)} m/s over the link limit (measured against the link lines)`);
  if (S.maxLat > TRAIN.latAccel * 1.25) fail(`train ${tr.id}: sideways acceleration ${S.maxLat.toFixed(2)} m/s2 (limit ${TRAIN.latAccel})`);
  if (S.maxOff > 0.35) fail(`train ${tr.id}: ${S.maxOff.toFixed(2)} m off the track lines`);
  if (S.maxOffCross > 0.35) fail(`train ${tr.id}: ${S.maxOffCross.toFixed(2)} m outside the double track while crossing over`);
  if (S.maxDy > 0.1) fail(`train ${tr.id}: ${S.maxDy.toFixed(2)} m off the rail height`);
  if (S.maxStopErr > 0.3) fail(`train ${tr.id}: stopped ${S.maxStopErr.toFixed(2)} m from the planned place`);
  if (S.maxPlatErr > 0.5) fail(`train ${tr.id}: train centre ${S.maxPlatErr.toFixed(2)} m from the platform centre`);
  if (S.maxJump > 0.05) fail(`train ${tr.id}: jumped ${S.maxJump.toFixed(3)} m when the next leg started`);
  // dwell times and reversals
  const ev = tr.events;
  for (let q = 0; q < ev.length; q++) {
    if (ev[q].kind === 'depart') {
      const arr = ev.slice(0, q).reverse().find((e) => e.kind === 'arrive');
      if (arr) {
        const dwell = ev[q].t - arr.t;
        if (dwell < TRAIN.dwellMin - 0.15 || dwell > TRAIN.dwellMax + 0.15) fail(`train ${tr.id}: dwell ${dwell.toFixed(1)} s at ${arr.station}`);
      }
    }
    if (ev[q].kind === 'reverse' && !graph.isTerminal(ev[q].node)) fail(`train ${tr.id}: reversed at ${ev[q].node}, which is not a terminal end`);
    if (ev[q].kind === 'arrive' && ev[q].stopError !== undefined && Math.abs(ev[q].stopError!) > 0.3) fail(`train ${tr.id}: stop error ${ev[q].stopError}`);
  }
}
const reversalsTotal = fleet.trains.reduce((a, t) => a + t.reversals, 0);
if (reversalsTotal === 0) fail('no train ever reversed (the terminals were not exercised)');
const seen = new Set(fleet.trains.flatMap((t) => t.events.filter((e) => e.kind === 'arrive').map((e) => e.station)));
console.log(`\nlargest distance outside the double track while crossing over (terminal reversals, ${reversalsTotal} of them): ${Math.max(...stat.map((q) => q.maxOffCross)).toFixed(3)} m`);
console.log(`stations visited by the fleet: ${seen.size} of ${stationIds.length} (${[...seen].join(', ')}); reversals ${reversalsTotal}, all at terminal ends; ${checks} sampled checks`);
if (SIM >= 3600 && seen.size < 3) fail('fleet visited fewer than 3 stations');
console.log(`(info) closest two trains: ${minSepGlobal.toFixed(0)} m apart; ${closeCalls} samples under 60 m. There are no signals yet (Step 6), trains do not look at each other.`);
const perStep = (ms / (steps * fleet.trains.length)) * 1000;
console.log(`(info) cost with all test checks: ${perStep.toFixed(1)} us per train step`);

// pure simulation cost without the checks: 6 trains, 10 simulated minutes, as the game loop would call it (60 fps)
{
  const f2 = new TrainFleet(rail, { seed: 3 });
  for (const s of startAt) f2.spawn(startKey(s));
  const frames = 60 * 600;
  const t1 = process.hrtime.bigint();
  for (let i = 0; i < frames; i++) f2.update(1 / 60);
  const per = Number(process.hrtime.bigint() - t1) / 1e6 / frames;
  console.log(`(info) fleet.update(1/60) with ${f2.trains.length} trains: ${(per * 1000).toFixed(1)} us per frame on average`);
}
if (bad) { console.log(`\n${bad} FAILURES`); process.exit(1); }
console.log('\nALL OK');
