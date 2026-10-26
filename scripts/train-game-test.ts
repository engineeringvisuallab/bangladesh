// STAGE 14 / Step 5B.1 check - trains in the game loop (headless; fake view host, no three.js):
//   * views are created / removed by distance with hysteresis, no flicker, nothing left behind after dispose;
//   * the simulation does not depend on the views (same seed -> identical trains with the player near, far, or moving around);
//   * floating origin: the camera rides along a train for 1 h with the engine's re-centring rule; what the GPU sees (world - origin)
//     stays small, never jumps at a shift, and survives float32 rounding;
//   * budget: CPU per frame, peak number of visible trains / meshes / vertices.
// Not covered (needs a browser / three.js): the real TrainView matrices, draw calls, shadows.
// Optional: npx tsx scripts/train-game-test.ts scan   -> prints the same-track conflicts of seeds 1..30 (how the default seed was chosen).
import { TerrainGenerator } from '../src/terrain/TerrainGenerator';
import { Config } from '../src/core/Config';
import { TrainManager, DEFAULT_TRAIN_SEED, DEFAULT_TRAIN_START, type TrainViewHost, type TrainViewLike } from '../src/trains/TrainManager';
import { TrainFleet } from '../src/trains/TrainSim';
import { buildCarMesh } from '../src/trains/TrainMesh';
import { CONSIST, TRAIN_LENGTH } from '../src/trains/TrainConfig';

let bad = 0;
const fail = (m: string) => { bad++; console.log('FAIL', m); };
const gen = new TerrainGenerator(Config.world.seed);
const rail = gen.rail;
const P = { x: 0, y: 0, z: 0 };

/** Fake host that records what the manager does. */
class FakeHost implements TrainViewHost {
  live = new Set<number>();
  creates = 0;
  disposes = 0;
  updates = 0;
  dup = 0;
  create(t: { id: number }): TrainViewLike {
    if (this.live.has(t.id)) this.dup++;
    this.live.add(t.id);
    this.creates++;
    return { update: () => { this.updates++; }, dispose: () => { this.live.delete(t.id); this.disposes++; } };
  }
}

/** Number of seconds in which two trains touch (their bodies, sampled every 10 m, come within 2.5 m: same track or a crossing, not the neighbouring track 4.5 m away). */
function conflicts(seed: number, seconds: number, signals = false): number {
  const f = new TrainFleet(rail, { seed, signals });
  for (const k of DEFAULT_TRAIN_START) f.spawn(k);
  let n = 0;
  const pts = f.trains.map(() => [] as number[]);
  for (let sec = 0; sec < seconds; sec++) {
    for (let i = 0; i < 10; i++) f.update(0.1);
    f.trains.forEach((t, k) => {
      const a = pts[k];
      a.length = 0;
      for (let d = 0; d <= TRAIN_LENGTH; d += 10) { t.path.posAt(t.s - d, P); a.push(P.x, P.z); }
    });
    let hit = false;
    for (let a = 0; a < f.trains.length && !hit; a++) for (let b = a + 1; b < f.trains.length && !hit; b++) {
      for (let i = 0; i < pts[a].length && !hit; i += 2) for (let j = 0; j < pts[b].length; j += 2) if (Math.hypot(pts[a][i] - pts[b][j], pts[a][i + 1] - pts[b][j + 1]) < 2.5) { hit = true; break; }
    }
    if (hit) n++;
  }
  return n;
}

if (process.argv[2] === 'scan') {
  for (let s = 1; s <= 30; s++) console.log(`seed ${s}: ${conflicts(s, 7200)} s with trains touching in 2 h`);
  process.exit(0);
}

/* ---------------------------------------------------------------- 1. views: spawn / despawn */
console.log('== views by distance');
{
  const host = new FakeHost();
  const m = new TrainManager(rail, host);
  console.log(`${m.trains.length} trains; show < 2400 m, hide > 2700 m`);
  // player in the far corner: nothing visible
  m.update(-4900, 4900);
  if (m.visibleCount !== 0 && m.trains.every((t) => m.distanceTo(t, -4900, 4900) > 2400)) fail('views exist for trains that are far away');
  // player next to train 0
  const t0 = m.trains[0];
  t0.path.posAt(t0.s, P);
  m.update(P.x + 30, P.z);
  if (!m.hasView(0)) fail('no view for a train 30 m from the player');
  if (host.dup) fail('two views for one train');
  const c0 = host.creates;
  m.update(P.x + 30, P.z);
  if (host.creates !== c0) fail('a second view was made on the next frame');
  // hysteresis: between show and hide the view stays, beyond hide it goes, coming back below show makes it again
  // put the player so that the manager's own distance to train 0 is exactly d (bisection along a fixed direction away from the train)
  const dAt = (d: number): void => {
    let lo = 0, hi = 6000;
    for (let i = 0; i < 50; i++) {
      const mid = (lo + hi) / 2;
      if (m.distanceTo(t0, P.x + mid, P.z) < d) lo = mid; else hi = mid;
    }
    m.update(P.x + lo, P.z);
    if (Math.abs(m.distanceTo(t0, P.x + lo, P.z) - d) > 0.5) fail(`could not place the player ${d} m from the train`);
  };
  dAt(2550);
  if (!m.hasView(0)) fail('view removed inside the hysteresis band (2550 m)');
  dAt(2750);
  if (m.hasView(0)) fail('view kept beyond the hide distance (2750 m)');
  dAt(2550);
  if (m.hasView(0)) fail('view came back inside the hysteresis band (2550 m)');
  dAt(2350);
  if (!m.hasView(0)) fail('view not created again below the show distance (2350 m)');
  // the player walks over the whole map in a line: views are never duplicated and updates only go to visible trains
  const before = { c: host.creates, d: host.disposes };
  let peak = 0;
  for (let x = -5000; x <= 5000; x += 5) { m.fixedUpdate(1 / 60); m.update(x, 0); peak = Math.max(peak, m.visibleCount); }
  console.log(`walk across the map: ${host.creates - before.c} views created, ${host.disposes - before.d} removed, at most ${peak} visible at once`);
  if (host.dup) fail('duplicate views while walking');
  if (host.live.size !== m.visibleCount) fail('host and manager disagree about the live views');
  m.dispose();
  if (host.live.size !== 0) fail(`${host.live.size} views left after dispose`);
  if (host.creates !== host.disposes) fail('created and disposed views differ after dispose');
}

/* ---------------------------------------------------------------- 2. simulation independent of the views */
console.log('\n== simulation does not depend on the views');
{
  const hostA = new FakeHost(), hostB = new FakeHost();
  const A = new TrainManager(rail, hostA); // player always next to a train: many views
  const B = new TrainManager(rail, hostB); // player far away: no views
  const frames = 60 * 1800;
  for (let i = 0; i < frames; i++) {
    A.fixedUpdate(1 / 60);
    B.fixedUpdate(1 / 60);
    if (i % 3 === 0) {
      A.trains[i % A.trains.length].path.posAt(A.trains[i % A.trains.length].s, P);
      A.update(P.x, P.z);
      B.update(-4990, 4990);
    }
  }
  let worst = 0;
  for (let k = 0; k < A.trains.length; k++) worst = Math.max(worst, Math.abs(A.trains[k].s - B.trains[k].s), Math.abs(A.trains[k].odometer - B.trains[k].odometer), Math.abs(A.trains[k].v - B.trains[k].v));
  console.log(`30 min (A: the player jumps from train to train, so its views churn; B: no views at all) - views made ${hostA.creates} for A, ${hostB.creates} for B: largest difference between the two fleets ${worst}`);
  if (worst !== 0) fail('the fleet behaves differently depending on the views');
  if (hostB.creates !== 0) fail('views were made for the far player');
  if (hostA.creates === 0) fail('no views for the near player');
}

/* ---------------------------------------------------------------- 3. floating origin */
console.log('\n== floating origin (the camera rides along a train for 1 h)');
{
  // The engine's rule (src/world/FloatingOrigin.ts), replicated: re-centre x / z when the camera is farther than `threshold` from the scene origin.
  const T = Config.floatingOrigin.threshold;
  const origin = { x: 0, z: 0 };
  const host = new FakeHost();
  const m = new TrainManager(rail, host);
  const rider = m.trains[2];
  let shifts = 0, maxLocal = 0, maxF32 = 0, maxJump = 0, frames = 0;
  let prev: { wx: number; wz: number; lx: number; lz: number } | null = null;
  const cam = { x: 0, z: 0 };
  const lead = { x: 0, y: 0, z: 0 };
  for (let i = 0; i < 60 * 3600; i++) {
    m.fixedUpdate(1 / 60);
    if (i % 2) continue;
    frames++;
    // the camera sits at the middle of the rider train; world position in doubles
    rider.path.posAt(rider.s - TRAIN_LENGTH / 2, P);
    const wx = P.x, wz = P.z;
    // camera local = world - origin; engine rule
    cam.x = wx - origin.x;
    cam.z = wz - origin.z;
    let sx = 0, sz = 0;
    if (Math.abs(cam.x) > T || Math.abs(cam.z) > T) { sx = cam.x; sz = cam.z; origin.x += sx; origin.z += sz; cam.x -= sx; cam.z -= sz; shifts++; }
    m.update(wx, wz);
    // what the GPU gets for every car of every VISIBLE train: absolute position + root offset (-origin), computed in doubles, then float32
    for (const t of m.trains) {
      if (!m.hasView(t.id)) continue;
      for (let j = 0; j < CONSIST.length; j++) {
        const pose = t.carPose(j, { kind: 'coach', x: 0, y: 0, z: 0, fx: 0, fy: 0, fz: 0, flipped: false, bf: { x: 0, y: 0, z: 0 }, br: { x: 0, y: 0, z: 0 } });
        const lx = pose.x - origin.x, lz = pose.z - origin.z;
        maxLocal = Math.max(maxLocal, Math.abs(lx), Math.abs(lz));
        maxF32 = Math.max(maxF32, Math.abs(Math.fround(lx) - lx), Math.abs(Math.fround(lz) - lz));
      }
    }
    // continuity of the camera-relative position of the rider's middle: it must change only by the real movement, also in the frame of a shift
    t_: {
      const lx = wx - origin.x, lz = wz - origin.z;
      if (prev) {
        const dxw = wx - prev.wx, dzw = wz - prev.wz;
        const dxl = lx - prev.lx, dzl = lz - prev.lz;
        // local change = world change - shift (the shift is the origin move of this frame)
        maxJump = Math.max(maxJump, Math.abs(dxl - (dxw - sx)), Math.abs(dzl - (dzw - sz)));
      }
      prev = { wx, wz, lx, lz };
      break t_;
    }
  }
  console.log(`${frames} frames, ${shifts} origin shifts, farthest car from the scene origin ${maxLocal.toFixed(0)} m, float32 rounding error at most ${(maxF32 * 1000).toFixed(3)} mm, jump at a shift ${maxJump.toExponential(1)} m`);
  if (shifts < 3) fail(`the ride crossed only ${shifts} origin shifts: the test does not exercise the shift`);
  if (maxLocal > T + 2700 + 150) fail(`cars drawn ${maxLocal.toFixed(0)} m from the scene origin`);
  if (maxF32 > 0.001) fail(`float32 rounding ${maxF32} m > 1 mm`);
  if (maxJump > 1e-6) fail(`a train jumped ${maxJump} m at an origin shift`);
}

/* ---------------------------------------------------------------- 4. budget */
console.log('\n== budget');
{
  const loco = buildCarMesh('loco'), coach = buildCarMesh('coach'), cab = buildCarMesh('cab');
  const vertsPerTrain = [loco, coach, coach, coach, coach, cab].reduce((a, c) => a + c.positions.length / 3, 0);
  const trisPerTrain = [loco, coach, coach, coach, coach, cab].reduce((a, c) => a + c.indices.length / 3, 0);
  // the busiest place: the player at the central station for 2 h
  const host = new FakeHost();
  const m = new TrainManager(rail, host);
  const central = rail.stationById('central')!;
  let peak = 0;
  for (let i = 0; i < 60 * 7200; i++) {
    m.fixedUpdate(1 / 60);
    if (i % 6 === 0) { m.update(central.x, central.z); peak = Math.max(peak, m.visibleCount); }
  }
  console.log(`peak ${peak} visible trains at central = ${peak * CONSIST.length} meshes (draw calls), ${peak * vertsPerTrain} vertices, ${peak * trisPerTrain} triangles; one train = ${CONSIST.length} meshes, ${vertsPerTrain} vertices, ${trisPerTrain} triangles`);
  if (peak * CONSIST.length > 50) fail('more than 50 train draw calls at the busiest place');
  // the cars are detailed now (rounded roof, window frames, bogies, livery): ~41k vertices of outside per train; the saloon, windows and logo are only
  // drawn within 160 m of the camera (TrainView) and are not counted here. 300k is still small beside the railway chunk meshes (>150k vertices each).
  if (peak * vertsPerTrain > 300000) fail('more than 300k train vertices at the busiest place');
  const allVisible = m.trains.length * CONSIST.length;
  console.log(`worst case if every one of the ${m.trains.length} trains were in view: ${allVisible} meshes, ${m.trains.length * vertsPerTrain} vertices`);
  // CPU per frame: fixed update (60 Hz) + view update, as the engine calls them, 7 trains all visible
  const m2 = new TrainManager(rail, new FakeHost(), { show: 1e9, hide: 2e9 });
  const frames = 60 * 600;
  const t1 = process.hrtime.bigint();
  for (let i = 0; i < frames; i++) { m2.fixedUpdate(1 / 60); m2.update(0, 0); }
  const per = Number(process.hrtime.bigint() - t1) / 1e6 / frames;
  console.log(`CPU: fixedUpdate + update for ${m2.trains.length} trains, all with views: ${(per * 1000).toFixed(2)} us per frame (budget 50 us = 0.05 ms, 0.3 % of a 16.7 ms frame)`);
  if (per > 0.05) fail(`train CPU ${(per * 1000).toFixed(1)} us per frame is over the 50 us budget`);
}

/* ---------------------------------------------------------------- 5. interim conflicts */
{
  const n = conflicts(DEFAULT_TRAIN_SEED, 7200);
  const m = conflicts(DEFAULT_TRAIN_SEED, 7200, true);
  console.log(`\n(info) default fleet (seed ${DEFAULT_TRAIN_SEED}): trains touch each other in ${n} s of 7200 s without signals, ${m} s with the Step 6 signals (what the game uses)`);
  if (m !== 0) fail(`with signals the default fleet still touches for ${m} s`);
}
if (bad) { console.log(`\n${bad} FAILURES`); process.exit(1); }
console.log('\nALL OK');
