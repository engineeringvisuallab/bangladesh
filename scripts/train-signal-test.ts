// STAGE 15 / Step 6 check - block signals, station board (HUD text), Bangla announcements (headless: no three.js, no DOM, no audio):
//   1. block map: every sample of every leg path has a block; blocks are contiguous; the id at each sample matches an INDEPENDENT projection of the
//      sample onto the line / link centre line (so the blocks really lie where they say); blocks of a track are <= 1200 m; platform block = 450 m;
//   2. signal positions: one home + one starter signal per station end, beside their own track (2.8 m), facing the oncoming train;
//   3. simulation with signals (default fleet, 12 seeds x 1 h, plus a crowded stress fleet): per step - blocks held by exactly one train, a train's
//      body only on blocks it holds, the front never beyond a red signal, standing trains at rest; per second - INDEPENDENT touching measure (bodies
//      sampled every 10 m closer than 2.5 m) and oriented-box penetration both stay at 0 (the same fleet WITHOUT signals touches a lot: shown);
//   4. no deadlock in the default fleet (wait-for cycles), every train keeps making stops, waits end;
//   5. dwell: 20-30 s plus the time held on the platform; reversal only at terminals;
//   6. ETA of the station board vs the real arrival time; Bangla board text (Bangla digits only, station names from i18n);
//   7. announcements: right sentences and file ids (5 kinds x 8 stations), only near the player, minimum gap, a refused line does not use up the gap.
// Optional: npx tsx scripts/train-signal-test.ts 3600   -> simulated seconds per seed (default 3600).
import { TerrainGenerator } from '../src/terrain/TerrainGenerator';
import { Config } from '../src/core/Config';
import { type EndKey } from '../src/trains/RailGraph';
import { TrainFleet, type TrainNotice } from '../src/trains/TrainSim';
import { BLOCK, LegBlocks, lineBlockId, openBlocks, platformBlock } from '../src/trains/Signals';
import { HOME_BEFORE, MAST_OFFSET, STARTER_AHEAD, signalSpecs } from '../src/trains/SignalSpecs';
import { StationBoard, formatBoard } from '../src/trains/StationBoard';
import { TrainAnnouncer } from '../src/trains/TrainAnnouncer';
import { DEFAULT_TRAIN_START } from '../src/trains/TrainManager';
import { trainBoxes } from '../src/trains/TrainBoxes';
import { obbPenetration } from '../src/trains/TrainOverlap';
import { TRAIN, TRAIN_LENGTH } from '../src/trains/TrainConfig';
import { bn } from '../src/i18n';

let bad = 0;
const fail = (m: string) => { bad++; if (bad < 60) console.log('FAIL', m); };
const SECS = Number(process.argv[2] ?? 3600);
const t0 = Date.now();
const gen = new TerrainGenerator(Config.world.seed);
const rail = gen.rail;
console.log(`terrain + roads + rail ${Date.now() - t0} ms`);

/* ------------------------------------------------------------------ 1. block map */
console.log('\n== block map');
const sys0 = new TrainFleet(rail, { signals: true });
const graph = sys0.graph;
const sig0 = sys0.signals!;
{
  let samples = 0, projChecked = 0, throat = 0;
  const projectOnto = (xs: ArrayLike<number>, zs: ArrayLike<number>, cum: ArrayLike<number>, x: number, z: number) => {
    let bd = Infinity, bs = 0, tx = 0, tz = 0;
    for (let k = 0; k + 1 < xs.length; k++) {
      const ax = xs[k], az = zs[k], dx = xs[k + 1] - ax, dz = zs[k + 1] - az;
      const l2 = dx * dx + dz * dz || 1;
      const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / l2));
      const d = Math.hypot(ax + dx * t - x, az + dz * t - z);
      if (d < bd) { bd = d; bs = cum[k] + t * (cum[k + 1] - cum[k]); const l = Math.sqrt(l2); tx = dx / l; tz = dz / l; }
    }
    return { d: bd, s: bs, tx, tz };
  };
  let legs = 0;
  const t1 = Date.now();
  for (const n of graph.nodes.values()) for (const leg of graph.legsFrom(n.key)) {
    legs++;
    const path = sys0.pathFor(leg);
    const B = new LegBlocks(rail, path);
    const lab = leg.key;
    if (!B.ids[0].includes(platformBlock(n.edgeId, n.end))) fail(`${lab}: the first sample is not on the platform block of ${n.key}`);
    if (!B.ids[path.n - 1].includes(platformBlock(leg.line.edgeId, leg.line.arrive))) fail(`${lab}: the last sample is not on the platform block of ${leg.to}`);
    for (const [id, f] of B.first) {
      const l = B.last.get(id)!;
      for (let i = f; i <= l; i++) if (!B.ids[i].includes(id)) { fail(`${lab}: block ${id} is not contiguous (hole at sample ${i})`); break; }
    }
    for (let i = 0; i < path.n; i++) {
      samples++;
      const ids = B.ids[i];
      if (ids.length === 0) { fail(`${lab}: sample ${i} has no block`); continue; }
      const x = path.x[i], z = path.z[i];
      const iN = Math.min(path.n - 1, i + 1), iP = Math.max(0, i - 1);
      const mx = path.x[iN] - path.x[iP], mz = path.z[iN] - path.z[iP];
      for (const id of ids) {
        if (id.startsWith('S:')) {
          throat++;
          const st = id.slice(2);
          // a throat sample lies on a link of that station or on the last metres of a line end of it (crossover)
          let dl = Infinity;
          for (const lk of rail.links) if (lk.station === st) {
            const cum = new Float64Array(lk.xs.length);
            for (let k = 1; k < lk.xs.length; k++) cum[k] = cum[k - 1] + Math.hypot(lk.xs[k] - lk.xs[k - 1], lk.zs[k] - lk.zs[k - 1]);
            dl = Math.min(dl, projectOnto(lk.xs, lk.zs, cum, x, z).d);
          }
          // ... or on the first metres of the crossover of a terminal line end of that station (crossover ends 20 m after the last turnout)
          let dEnd = Infinity;
          for (const e2 of rail.edges) for (const end of ['a', 'b'] as const) if ((end === 'a' ? e2.from : e2.to) === st) {
            const k = end === 'a' ? 0 : e2.xs.length - 1;
            dEnd = Math.min(dEnd, Math.hypot(x - e2.xs[k], z - e2.zs[k]));
          }
          if (dl > 3.5 && !(dEnd <= 340 && !leg.via)) fail(`${lab} sample ${i}: throat ${id} but the point is ${dl.toFixed(1)} m from every link and ${dEnd.toFixed(0)} m from a line end of the station`);
          continue;
        }
        const [eid, dir, kk] = id.split(':');
        const e = rail.edges.find((q) => q.id === eid);
        if (!e) { fail(`${lab}: unknown block ${id}`); continue; }
        const pr = projectOnto(e.xs, e.zs, e.cum, x, z);
        projChecked++;
        if (pr.d > 3.6) { fail(`${lab} sample ${i}: block ${id} but the point is ${pr.d.toFixed(1)} m from that line`); continue; }
        const ab = dir === 'ab';
        // direction of travel against the line direction
        if (leg.via && Math.hypot(mx, mz) > 1e-6 && (mx * pr.tx + mz * pr.tz > 0) !== ab && Math.abs(mx * pr.tx + mz * pr.tz) > 0.5 * Math.hypot(mx, mz)) fail(`${lab} sample ${i}: block ${id} says ${dir} but the train drives the other way`);
        let ok = false;
        for (const dd of [-7, 0, 7]) {
          const s = Math.max(0, Math.min(e.length, pr.s + dd));
          if (lineBlockId(e.id, e.length, ab, ab ? s : e.length - s) === id) ok = true;
        }
        if (!ok) fail(`${lab} sample ${i}: block ${id} does not match the projected position (s = ${pr.s.toFixed(0)} of ${e.length.toFixed(0)})`);
        void kk;
      }
    }
  }
  console.log(`${legs} leg paths, ${samples} samples, ${projChecked} block labels checked against an independent projection, ${throat} throat labels (${Date.now() - t1} ms)`);
  // block lengths
  let nb = 0, longest = 0;
  for (const e of rail.edges) {
    const n = openBlocks(e.length);
    const len = e.length > BLOCK.endZone ? (e.length - BLOCK.endZone) / n : 0;
    nb += (n + 1) * 2;
    longest = Math.max(longest, len);
    if (len > BLOCK.target + 1e-6) fail(`${e.id}: open block ${len.toFixed(0)} m > ${BLOCK.target} m`);
    if (lineBlockId(e.id, e.length, true, e.length - 1) !== platformBlock(e.id, 'b')) fail(`${e.id}: platform block id`);
    if (lineBlockId(e.id, e.length, false, e.length - 1) !== platformBlock(e.id, 'a')) fail(`${e.id}: platform block id (ba)`);
    if (e.length > BLOCK.endZone + 50 && lineBlockId(e.id, e.length, true, e.length - BLOCK.endZone - 1) === platformBlock(e.id, 'b')) fail(`${e.id}: platform block starts too early`);
  }
  console.log(`${rail.edges.length} lines x 2 tracks = ${nb} track blocks (platform ${BLOCK.endZone} m, longest open block ${longest.toFixed(0)} m), ${rail.stations.length} station throats`);
}

/* ------------------------------------------------------------------ 2. signal positions */
console.log('\n== signal positions');
{
  const specs = signalSpecs(sys0);
  const homes = specs.filter((s) => s.kind === 'home'), starters = specs.filter((s) => s.kind === 'starter');
  console.log(`${homes.length} home + ${starters.length} starter signals for ${graph.nodes.size} station ends`);
  if (homes.length !== graph.nodes.size || starters.length !== graph.nodes.size) fail('not one home + one starter signal per station end');
  let maxOff = 0, minOff = Infinity, maxFace = 0;
  for (const s of specs) {
    const off = Math.hypot(s.x - s.trackX, s.z - s.trackZ);
    maxOff = Math.max(maxOff, off);
    minOff = Math.min(minOff, off);
    // the mast is on the LEFT of the direction of travel (outside the own track): (tz, -tx)
    const side = (s.x - s.trackX) * s.tz + (s.z - s.trackZ) * -s.tx;
    if (Math.abs(side - MAST_OFFSET) > 1e-6) fail(`${s.kind} ${s.node}: mast is not ${MAST_OFFSET} m to the left of its track (${side.toFixed(2)})`);
    // the lamp side (local +x after rotation.y = atan2(tz, -tx)) must point AGAINST the direction of travel
    const ry = Math.atan2(s.tz, -s.tx);
    const fx = Math.cos(ry), fz = -Math.sin(ry);
    maxFace = Math.max(maxFace, Math.abs(fx * s.tx + fz * s.tz + 1));
  }
  console.log(`mast distance from its rail ${minOff.toFixed(2)}..${maxOff.toFixed(2)} m, lamps face the oncoming train (worst error ${maxFace.toExponential(1)})`);
  if (maxFace > 1e-9) fail('lamps do not face the oncoming train');
  // a home signal stands HOME_BEFORE m before the platform block of its own track
  let worst = 0;
  for (const h of homes) {
    const leg = [...graph.nodes.values()].flatMap((n) => [...graph.legsFrom(n.key)]).find((l) => l.to === h.node)!;
    const path = sys0.pathFor(leg), B = sig0.blocksOf(path);
    const fi = B.first.get(platformBlock(h.edgeId, h.end))!;
    const p = { x: 0, y: 0, z: 0 };
    path.posAt(path.cum[fi] - HOME_BEFORE, p);
    worst = Math.max(worst, Math.hypot(p.x - h.trackX, p.z - h.trackZ));
    if (B.ids[Math.max(0, fi - 1)].includes(platformBlock(h.edgeId, h.end))) fail(`${h.node}: block before the platform block is the platform block`);
  }
  console.log(`home signals stand ${HOME_BEFORE} m before the platform block (position error ${worst.toExponential(1)} m); starters ${STARTER_AHEAD} m beyond the front of the standing train`);
}

/* ------------------------------------------------------------------ simulation helpers */
const P = { x: 0, y: 0, z: 0 };
interface RunStats {
  touchSec: number; penSec: number; deadlockSec: number; maxHold: number; minStops: number; redStops: number; departHolds: number; stepsChecked: number;
  violations: number; maxOverRed: number; deadlockTrains: number[] | null;
}
function bodyPoints(t: { path: { posAt: (s: number, o: typeof P) => typeof P }; s: number }, out: number[]): void {
  out.length = 0;
  for (let d = 0; d <= TRAIN_LENGTH; d += 10) { t.path.posAt(t.s - d, P); out.push(P.x, P.z); }
}

function simulate(label: string, seed: number, starts: readonly EndKey[], secs: number, signals: boolean, check: boolean): RunStats {
  const f = new TrainFleet(rail, { seed, signals, keepEvents: true });
  for (const k of starts) f.spawn(k);
  const st: RunStats = { touchSec: 0, penSec: 0, deadlockSec: 0, maxHold: 0, minStops: Infinity, redStops: 0, departHolds: 0, stepsChecked: 0, violations: 0, maxOverRed: 0, deadlockTrains: null };
  const pts = f.trains.map(() => [] as number[]);
  const sys = f.signals;
  const total = Math.round(secs * 10);
  const v = (m: string) => { st.violations++; fail(`${label}: ${m}`); };
  for (let step = 1; step <= total; step++) {
    f.update(TRAIN.dt);
    if (check && sys) {
      st.stepsChecked++;
      // ownership is a function: each held block has one owner, and the claim sets agree with it
      for (const t of f.trains) for (const b of sys.claimsOf(t.id)) if (sys.owner.get(b) !== t.id) v(`block ${b} in the claims of train ${t.id} but owned by ${sys.owner.get(b)}`);
      for (const [b, o] of sys.owner) if (!sys.claimsOf(o).has(b)) v(`block ${b} owned by ${o} without a claim`);
      for (const t of f.trains) {
        const B = sys.blocksOf(t.path);
        // the body lies on blocks the train holds
        const [i0] = B.range(t.s - TRAIN_LENGTH, t.s);
        for (let i = i0; i < t.path.n && t.path.cum[i] <= t.s; i++) for (const b of B.ids[i]) if (sys.owner.get(b) !== t.id) { v(`train ${t.id} body on block ${b} held by ${sys.owner.get(b)} (t=${f.time.toFixed(1)})`); i = t.path.n; break; }
        // never beyond a red signal
        if (t.state === 'run' && t.signalLimit !== Infinity) {
          const over = t.s - t.signalLimit;
          st.maxOverRed = Math.max(st.maxOverRed, over);
          if (over > 0.5) v(`train ${t.id} is ${over.toFixed(2)} m beyond the red signal (t=${f.time.toFixed(1)})`);
        }
        if (t.state === 'dwell' && t.v !== 0) v(`standing train ${t.id} has speed ${t.v}`);
      }
    }
    if (step % 10 === 0) {
      f.trains.forEach((t, k) => bodyPoints(t, pts[k]));
      let hit = false;
      for (let a = 0; a < f.trains.length && !hit; a++) for (let b = a + 1; b < f.trains.length && !hit; b++) {
        const A = pts[a], Bp = pts[b];
        for (let i = 0; i < A.length && !hit; i += 2) for (let j = 0; j < Bp.length; j += 2) if (Math.hypot(A[i] - Bp[j], A[i + 1] - Bp[j + 1]) < 2.5) { hit = true; break; }
      }
      if (hit) st.touchSec++;
      // oriented boxes of trains that are close
      let pen = false;
      for (let a = 0; a < f.trains.length && !pen; a++) for (let b = a + 1; b < f.trains.length && !pen; b++) {
        const A = pts[a], Bp = pts[b];
        if (Math.hypot(A[A.length - 2] - Bp[Bp.length - 2], A[A.length - 1] - Bp[Bp.length - 1]) > 400 && Math.hypot(A[0] - Bp[0], A[1] - Bp[1]) > 400) continue;
        const ba = trainBoxes(f.trains[a]), bb = trainBoxes(f.trains[b]);
        for (const x of ba) { for (const y of bb) if (obbPenetration(x, y) > 0.01) { pen = true; break; } if (pen) break; }
      }
      if (pen) st.penSec++;
      if (sys && step % 50 === 0) {
        const cyc = sys.findDeadlock(f.trains);
        if (cyc) { st.deadlockSec += 5; st.deadlockTrains = cyc; }
      }
    }
  }
  for (const t of f.trains) {
    st.maxHold = Math.max(st.maxHold, t.heldTime);
    st.minStops = Math.min(st.minStops, t.stops);
  }
  st.redStops = f.trains.reduce((a, t) => a + t.redStops, 0);
  st.departHolds = f.trains.reduce((a, t) => a + t.holds, 0);
  return st;
}

/* ------------------------------------------------------------------ 3. simulation with signals */
console.log('\n== default fleet (7 trains)');
const SEEDS = Array.from({ length: 12 }, (_, i) => i + 1);
let sumRed = 0, sumHold = 0, worstHold = 0, worstOver = 0, minStopsAll = Infinity, deadSeeds = 0;
let baselineTouch = 0;
for (const seed of SEEDS) {
  const s = simulate(`seed ${seed}`, seed, DEFAULT_TRAIN_START, SECS, true, true);
  const base = simulate(`seed ${seed} (no signals)`, seed, DEFAULT_TRAIN_START, SECS, false, false);
  baselineTouch += base.touchSec;
  sumRed += s.redStops; sumHold += s.departHolds; worstHold = Math.max(worstHold, s.maxHold); worstOver = Math.max(worstOver, s.maxOverRed); minStopsAll = Math.min(minStopsAll, s.minStops);
  if (s.deadlockSec) deadSeeds++;
  console.log(`seed ${String(seed).padStart(2)}: touching ${s.touchSec} s (without signals ${base.touchSec} s), box penetration ${s.penSec} s, red stops ${s.redStops}, held on platform ${s.departHolds}x (longest total ${s.maxHold.toFixed(0)} s per train), fewest stops per train ${s.minStops}, deadlock ${s.deadlockSec ? 'YES ' + s.deadlockTrains : 'no'}, ${s.stepsChecked} steps checked`);
  if (s.touchSec) fail(`seed ${seed}: trains touch for ${s.touchSec} s with signals`);
  if (s.penSec) fail(`seed ${seed}: oriented boxes of two trains overlap for ${s.penSec} s with signals`);
  if (s.deadlockSec) fail(`seed ${seed}: deadlock ${s.deadlockTrains}`);
  if (s.minStops < Math.floor(SECS / 300)) fail(`seed ${seed}: a train made only ${s.minStops} stops in ${SECS} s`);
}
console.log(`all seeds: red-signal stops ${sumRed}, platform holds ${sumHold}; without signals the same fleets touch ${baselineTouch} s in total; furthest beyond a red signal ${worstOver.toFixed(2)} m (limit has a ${BLOCK.stopMargin} m margin before the block)`);
if (sumRed + sumHold === 0) fail('no train ever met a red signal: the signals were never exercised');
if (baselineTouch === 0) fail('without signals nothing ever touches: the test cannot tell the signals work');

/* ------------------------------------------------------------------ stress */
console.log('\n== crowded fleet (every second station end holds a train)');
{
  const keys = [...graph.nodes.keys()];
  const start: EndKey[] = [];
  const usedStations = new Map<string, number>();
  for (const k of keys) {
    const n = graph.nodes.get(k)!;
    if ((usedStations.get(n.station) ?? 0) >= 2) continue;
    usedStations.set(n.station, (usedStations.get(n.station) ?? 0) + 1);
    start.push(k);
    if (start.length >= 14) break;
  }
  let dead = 0, red = 0, hold = 0;
  for (const seed of [1, 2, 3]) {
    const s = simulate(`stress ${seed}`, seed, start, Math.min(SECS, 3600), true, true);
    red += s.redStops; hold += s.departHolds; if (s.deadlockSec) dead++;
    console.log(`${start.length} trains, seed ${seed}: touching ${s.touchSec} s, box penetration ${s.penSec} s, red stops ${s.redStops}, platform holds ${s.departHolds}, fewest stops per train ${s.minStops}${s.deadlockSec ? `, DEADLOCK trains ${s.deadlockTrains}` : ''}`);
    if (s.touchSec || s.penSec) fail(`stress seed ${seed}: trains touch (${s.touchSec} s) / boxes overlap (${s.penSec} s)`);
  }
  console.log(`(info) stress: red stops ${red}, platform holds ${hold}, seeds with a wait cycle: ${dead} of 3 (a wait cycle is reported, never forced open: that would break one-train-per-block)`);
  if (red + hold < 10) fail('the crowded fleet hardly met any signal');
}

/* ------------------------------------------------------------------ 5. dwell and reversals */
console.log('\n== dwell, reversals');
{
  const f = new TrainFleet(rail, { seed: 18, signals: true, keepEvents: true });
  for (const k of DEFAULT_TRAIN_START) f.spawn(k);
  for (let i = 0; i < SECS * 10; i++) f.update(TRAIN.dt);
  let n = 0, extended = 0, maxWait = 0;
  const term = new Set(graph.terminalStations());
  for (const t of f.trains) {
    const ev = t.events;
    for (let q = 1; q < ev.length; q++) {
      if (ev[q].kind === 'depart' && ev[q - 1].kind === 'arrive') {
        const dwell = ev[q].t - ev[q - 1].t;
        n++;
        if (dwell < TRAIN.dwellMin - 0.15) fail(`train ${t.id}: dwell ${dwell.toFixed(1)} s at ${ev[q].station}`);
        if (dwell > TRAIN.dwellMax + 0.15) { extended++; maxWait = Math.max(maxWait, dwell - TRAIN.dwellMax); }
      }
      if (ev[q].kind === 'reverse' && !term.has(ev[q].station)) fail(`train ${t.id}: reversed at ${ev[q].station}, which is not a terminal`);
    }
  }
  console.log(`${n} dwells: none shorter than ${TRAIN.dwellMin} s; ${extended} longer than ${TRAIN.dwellMax} s because the route was not clear (longest wait ${maxWait.toFixed(0)} s beyond the normal dwell); reversals only at terminals`);
  // signals off: nothing changes (no signal system, no holds)
  const g = new TrainFleet(rail, { seed: 18, keepEvents: true });
  for (const k of DEFAULT_TRAIN_START) g.spawn(k);
  for (let i = 0; i < 20000; i++) g.update(TRAIN.dt);
  if (g.signals !== null || g.trains.some((t) => t.held || t.holds || t.redStops)) fail('signals off but a train was held');
  console.log('signals off: no signal system, no train is ever held (the Step 5a behaviour)');
}

/* ------------------------------------------------------------------ 6. ETA and board */
console.log('\n== station board');
{
  const f = new TrainFleet(rail, { seed: 18, signals: true, keepEvents: true });
  for (const k of DEFAULT_TRAIN_START) f.spawn(k);
  // after the first 5 s of every run leg remember the ETA, compare with the real arrival (legs that met a red signal are left out)
  const rec = new Map<number, { eta: number; t: number; red: number; limited: boolean }>();
  let n = 0, worst = 0, sumErr = 0, skipped = 0;
  f.listeners.push((nt: TrainNotice) => {
    if (nt.kind === 'arrive') {
      const r = rec.get(nt.train.id);
      if (r) {
        if (nt.train.redStops !== r.red || r.limited) skipped++;
        else { const err = Math.abs(nt.t - r.t - r.eta); n++; worst = Math.max(worst, err); sumErr += err; }
        rec.delete(nt.train.id);
      }
    }
  });
  const armed = new Set<number>();
  for (let step = 0; step < SECS * 10; step++) {
    f.update(TRAIN.dt);
    for (const t of f.trains) {
      if (t.state === 'dwell') armed.delete(t.id);
      else if (!armed.has(t.id) && t.v > 1) { armed.add(t.id); const e = t.etaArrive(); if (e !== null) rec.set(t.id, { eta: e, t: f.time, red: t.redStops, limited: false }); }
      else if (t.signalLimit !== Infinity) { const r = rec.get(t.id); if (r) r.limited = true; }
    }
  }
  console.log(`${n} ETA estimates (taken when the train is moving, signals not predicted): mean error ${(sumErr / Math.max(1, n)).toFixed(1)} s, worst ${worst.toFixed(1)} s; ${skipped} legs that met a red signal (stopped or only slowed) left out`);
  if (n < SECS / 60) fail(`only ${n} ETA samples`);
  if (worst > 6) fail(`ETA error up to ${worst.toFixed(1)} s without any red signal`);
  // board text
  const board = new StationBoard(f, rail);
  const central = rail.stations.find((s) => s.id === 'central')!;
  if (board.update(central.x, central.z) === null) fail('no board at the station centre');
  if (board.update(central.x + central.radius + 5000, central.z) !== null) fail('board far from every station');
  const asciiDigit = /[0-9]/;
  const hasBangla = /[\u0980-\u09FF]/;
  let boards = 0, nonEmpty = 0;
  const seen = new Set<string>();
  for (const st of rail.stations) for (let k = 0; k < 400; k++) {
    for (let q = 0; q < 50; q++) f.update(TRAIN.dt);
    const b = board.build(st.id);
    const txt = formatBoard(b);
    boards++;
    if (b.rows.length) nonEmpty++;
    for (const line of [txt.title, ...txt.lines, txt.signal]) {
      if (asciiDigit.test(line)) fail(`board text has a Latin digit: ${line}`);
      if (!hasBangla.test(line)) fail(`board text is not Bangla: ${line}`);
      seen.add(line.replace(/[০-৯]+/g, '#'));
    }
    if (txt.title !== bn.rail.station[st.id]) fail(`board title ${txt.title} is not the i18n name of ${st.id}`);
    if (b.green + b.red !== graph.nodesAt(st.id).length) fail(`${st.id}: ${b.green}+${b.red} home signals but ${graph.nodesAt(st.id).length} station ends`);
    if (b.rows.length > 3) fail('more than 3 rows');
  }
  console.log(`${boards} boards built (${nonEmpty} with trains), all Bangla, no Latin digits; sample lines:`);
  for (const l of [...seen].slice(0, 6)) console.log('   ', l);
}

/* ------------------------------------------------------------------ 7. announcements */
console.log('\n== announcements');
{
  // the sentences
  const keys = new Set<string>();
  const kinds: Array<[Pick<TrainNotice, 'kind' | 'station' | 'atPlatform'>['kind'], boolean | undefined]> = [['approach', undefined], ['arrive', undefined], ['depart', undefined], ['hold', true], ['hold', false]];
  for (const st of rail.stations) for (const [kind, ap] of kinds) {
    const a = TrainAnnouncer.compose({ kind, station: st.id, atPlatform: ap }, bn.rail.station[st.id]);
    if (!a) { fail(`no announcement for ${kind} at ${st.id}`); continue; }
    if (!a.text.includes(bn.rail.station[st.id])) fail(`${a.key}: the sentence does not name the station`);
    if (!/[\u0980-\u09FF]/.test(a.text) || /[A-Za-z0-9]/.test(a.text)) fail(`${a.key}: sentence is not pure Bangla: ${a.text}`);
    if (keys.has(a.key)) fail(`duplicate file id ${a.key}`);
    keys.add(a.key);
  }
  if (TrainAnnouncer.compose({ kind: 'clear', station: 'central' }, 'x') !== null || TrainAnnouncer.compose({ kind: 'reverse', station: 'central' }, 'x') !== null) fail('clear / reverse must not be announced');
  console.log(`${keys.size} announcement lines (5 kinds x ${rail.stations.length} stations), file ids like ${[...keys][0]}`);

  // behaviour: the player stands at a station, then far away, then the voice is busy
  const run = (px: number, pz: number, say: (k: string, t: string) => boolean | void, minGap = 10, secs = 3600) => {
    const f = new TrainFleet(rail, { seed: 18, signals: true });
    for (const k of DEFAULT_TRAIN_START) f.spawn(k);
    const ann = new TrainAnnouncer(f, rail, say, { minGap });
    ann.setPlayer(px, pz);
    for (let i = 0; i < secs * 10; i++) f.update(TRAIN.dt);
    return ann;
  };
  const central = rail.stations.find((s) => s.id === 'central')!;
  const heard: Array<{ k: string; t: string }> = [];
  const a1 = run(central.x, central.z, (k, t) => { heard.push({ k, t }); });
  console.log(`player at the central station, 1 h: ${a1.said.length} announcements (${[...new Set(a1.said.map((a) => a.kind))].join(', ')})`);
  if (a1.said.length < 5) fail('too few announcements at a busy station');
  if (!a1.said.every((a) => a.station === 'central' || a.station.length > 0)) fail('bad station');
  // only the station the player stands at (and its neighbourhood) is announced: every spoken station must be within hearing
  for (const a of a1.said) {
    const st = rail.stations.find((s) => s.id === a.station)!;
    if (Math.hypot(st.x - central.x, st.z - central.z) > st.radius + 600) fail(`announced ${a.station} although the player is ${Math.hypot(st.x - central.x, st.z - central.z).toFixed(0)} m away`);
  }
  const far = run(central.x + 20000, central.z + 20000, () => {});
  if (far.said.length !== 0) fail(`${far.said.length} announcements for a player 28 km away`);
  console.log('player 28 km away: 0 announcements');
  // minimum gap: the sim time of the lines must be >= minGap apart. (said has no time, so use a say() that reads the fleet time)
  {
    const f = new TrainFleet(rail, { seed: 18, signals: true });
    for (const k of DEFAULT_TRAIN_START) f.spawn(k);
    const times: number[] = [];
    const ann = new TrainAnnouncer(f, rail, () => { times.push(f.time); }, { minGap: 12 });
    ann.setPlayer(central.x, central.z);
    for (let i = 0; i < 36000; i++) f.update(TRAIN.dt);
    let minD = Infinity;
    for (let i = 1; i < times.length; i++) minD = Math.min(minD, times[i] - times[i - 1]);
    console.log(`minimum gap between two lines: ${minD.toFixed(1)} s (setting 12 s)`);
    if (minD < 11.9) fail(`announcements ${minD.toFixed(1)} s apart (< 12 s)`);
  }
  // a refused line (voice busy) does not use up the gap: the next notice may be spoken at once
  {
    let calls = 0;
    const b = run(central.x, central.z, () => { calls++; return calls % 2 === 0; }, 10, 3600);
    console.log(`voice that refuses every second line: ${calls} tries, ${b.said.length} spoken (refused lines are not counted)`);
    if (b.said.length === 0 || b.said.length >= calls) fail('refused lines were counted as spoken');
  }
}

console.log(`\nsetup + checks ${((Date.now() - t0) / 1000).toFixed(1)} s`);
console.log(bad === 0 ? '\nALL OK' : `\n${bad} FAILURES`);
process.exit(bad === 0 ? 0 : 1);
