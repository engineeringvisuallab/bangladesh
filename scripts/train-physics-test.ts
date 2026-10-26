// STAGE 14 / Step 5B.2 check - train colliders, overlap check, minimap markers (headless: pure geometry, no Rapier / three.js):
//   * one box per car: size = the model, bottom / top at the designed height over the rail (ray-cast), quaternion = the axes, cars do not overlap each other;
//   * overlap with the player and with vehicles: exact thresholds (sideways, vertically), edge-triggered events, no hit on the other track, platform or beside the line;
//   * a moving train that runs into a person standing on its track: exactly one "begin" (even though the person passes the 0.8 m gaps between cars);
//   * the collider pose (interpolated by the fleet phase) moves smoothly every 1/60 s (Rapier derives the push velocity from it);
//   * which trains need colliders near the player (peak body count), hysteresis;
//   * minimap markers: position, heading, bounds;  CPU budget.
// Not covered (needs the browser / Rapier): the kinematic bodies themselves, how the player controller and vehicle wheels react to them.
import { TerrainGenerator } from '../src/terrain/TerrainGenerator';
import { Config } from '../src/core/Config';
import { RAIL_DESIGN as D } from '../src/rail/RailPlan';
import { TrainManager, TrainSelector, type TrainViewHost } from '../src/trains/TrainManager';
import { trainBoxes, rayBox, boxTop, BOX_BOTTOM, BOX_HALF_WIDTH, type TrainBox, type V3 } from '../src/trains/TrainBoxes';
import { TrainContacts, obbPenetration, playerObb, vehicleObb, type TrainEntity, type TrainHit } from '../src/trains/TrainOverlap';
import { buildCarMesh } from '../src/trains/TrainMesh';
import { CONSIST, RAIL_HEAD, TRAIN, TRAIN_LENGTH } from '../src/trains/TrainConfig';
import { PhysicsConfig } from '../src/physics/PhysicsConfig';

let bad = 0;
const fail = (m: string) => { bad++; console.log('FAIL', m); };
const gen = new TerrainGenerator(Config.world.seed);
const rail = gen.rail;
const noHost: TrainViewHost = { create: () => ({ update: () => {}, dispose: () => {} }) };
const P = { x: 0, y: 0, z: 0 };

/* independent track height: nearest track line (offset +-2.25 of the centre lines) */
interface Seg { x0: number; z0: number; x1: number; z1: number; y0: number; y1: number }
const segs: Seg[] = [];
for (const e of [...rail.edges, ...rail.links.map((l) => l.edge)]) {
  for (let i = 0; i < e.xs.length - 1; i++) {
    const dx = e.xs[i + 1] - e.xs[i], dz = e.zs[i + 1] - e.zs[i];
    const l = Math.hypot(dx, dz) || 1;
    for (const sd of [-1, 1]) segs.push({ x0: e.xs[i] - (dz / l) * sd * D.trackSpacing / 2, z0: e.zs[i] + (dx / l) * sd * D.trackSpacing / 2, x1: e.xs[i + 1] - (dz / l) * sd * D.trackSpacing / 2, z1: e.zs[i + 1] + (dx / l) * sd * D.trackSpacing / 2, y0: e.design[i] + RAIL_HEAD, y1: e.design[i + 1] + RAIL_HEAD });
  }
}
function trackY(x: number, z: number): number {
  let best = Infinity, y = NaN;
  for (const s of segs) {
    if (Math.abs(s.x0 - x) > 60 && Math.abs(s.x1 - x) > 60) continue;
    const vx = s.x1 - s.x0, vz = s.z1 - s.z0;
    const l2 = vx * vx + vz * vz || 1;
    const t = Math.max(0, Math.min(1, ((x - s.x0) * vx + (z - s.z0) * vz) / l2));
    const d = Math.hypot(x - (s.x0 + vx * t), z - (s.z0 + vz * t));
    if (d < best) { best = d; y = s.y0 + (s.y1 - s.y0) * t; }
  }
  return y;
}
const rot = (q: { x: number; y: number; z: number; w: number }, v: V3): V3 => {
  const ix = q.w * v[0] + q.y * v[2] - q.z * v[1], iy = q.w * v[1] + q.z * v[0] - q.x * v[2], iz = q.w * v[2] + q.x * v[1] - q.y * v[0], iw = -q.x * v[0] - q.y * v[1] - q.z * v[2];
  return [ix * q.w + iw * -q.x + iy * -q.z - iz * -q.y, iy * q.w + iw * -q.y + iz * -q.x - ix * -q.z, iz * q.w + iw * -q.z + ix * -q.y - iy * -q.x];
};

/* ------------------------------------------------------------------ 1. boxes */
console.log('== car boxes');
const mesh = { loco: buildCarMesh('loco'), coach: buildCarMesh('coach'), cab: buildCarMesh('cab') };
for (const kind of ['loco', 'coach', 'cab'] as const) {
  let lo = Infinity, hi = -Infinity, xmin = Infinity, xmax = -Infinity, zmax = 0;
  const m = mesh[kind];
  for (let i = 0; i < m.positions.length; i += 3) {
    if (m.positions[i + 1] > 4.3) continue; // the raised pantograph is above the box on purpose
    hi = Math.max(hi, m.positions[i + 1]);
    xmin = Math.min(xmin, m.positions[i]);
    xmax = Math.max(xmax, m.positions[i]);
    zmax = Math.max(zmax, Math.abs(m.positions[i + 2]));
    lo = Math.min(lo, m.positions[i + 1]);
  }
  const len = CONSIST.find((c) => c.kind === kind)!.length;
  console.log(`  ${kind.padEnd(5)} model body y ${lo.toFixed(2)}..${hi.toFixed(2)}, x ${xmin.toFixed(1)}..${xmax.toFixed(1)}, half width ${zmax.toFixed(3)}  ->  box y ${BOX_BOTTOM}..${boxTop(kind).toFixed(2)}, half length ${len / 2}, half width ${BOX_HALF_WIDTH}`);
  if (Math.abs(hi - boxTop(kind)) > 0.01) fail(`${kind}: box top ${boxTop(kind)} differs from the model ${hi.toFixed(2)}`);
  if (Math.abs(xmax - len / 2) > 0.01 || Math.abs(xmin + len / 2) > 0.01) fail(`${kind}: box length differs from the model`);
  if (zmax > BOX_HALF_WIDTH + 0.03) fail(`${kind}: model wider than its box`);
}
const mgr = new TrainManager(rail, noHost, { keepEvents: false });
let samples = 0, worstQ = 0, worstGap = 0, overlapSame = 0, worstTop = 0, worstSide = 0, worstFront = 0, standing = 0;
for (let sec = 0; sec < 3600; sec++) {
  for (let i = 0; i < 60; i++) mgr.fixedUpdate(1 / 60);
  if (sec % 5) continue;
  for (const t of mgr.trains) {
    const boxes = trainBoxes(t);
    samples++;
    boxes.forEach((b, k) => {
      const l = Math.hypot(b.q.x, b.q.y, b.q.z, b.q.w);
      worstQ = Math.max(worstQ, Math.abs(l - 1));
      for (const [axis, local] of [[b.ax, [1, 0, 0]], [b.ay, [0, 1, 0]], [b.az, [0, 0, 1]]] as const) {
        const r = rot(b.q, local as unknown as V3);
        worstQ = Math.max(worstQ, Math.hypot(r[0] - axis[0], r[1] - axis[1], r[2] - axis[2]));
      }
      const dots = [b.ax[0] * b.ay[0] + b.ax[1] * b.ay[1] + b.ax[2] * b.ay[2], b.ax[0] * b.az[0] + b.ax[1] * b.az[1] + b.ax[2] * b.az[2], b.ay[0] * b.az[0] + b.ay[1] * b.az[1] + b.ay[2] * b.az[2]];
      worstQ = Math.max(worstQ, ...dots.map(Math.abs));
      if (k > 0) {
        const a = boxes[k - 1];
        const gap = Math.hypot(a.x - b.x, a.z - b.z) - (a.hx + b.hx);
        worstGap = Math.max(worstGap, Math.abs(gap - 0.8));
        if (obbPenetration(a, b) > 0) overlapSame++;
      }
    });
    // ray-cast the boxes of a STANDING train on its platform: roof height and side faces against the designed track level
    if (t.state === 'dwell') {
      standing++;
      for (const b of boxes) {
        const ty = trackY(b.x, b.z);
        const hit = rayBox(b, b.x, b.y + 12, b.z, 0, -1, 0);
        if (hit === null) { fail('a vertical ray missed the car'); continue; }
        const roofY = b.y + 12 - hit;
        worstTop = Math.max(worstTop, Math.abs(roofY - (ty + boxTop(CONSIST[b.car].kind))));
        const side = rayBox(b, b.x + b.az[0] * 10, b.y, b.z + b.az[2] * 10, -b.az[0], -b.az[1], -b.az[2]);
        worstSide = Math.max(worstSide, Math.abs((side ?? 99) - (10 - BOX_HALF_WIDTH)));
        const front = rayBox(b, b.x + b.ax[0] * 30, b.y + b.ax[1] * 30, b.z + b.ax[2] * 30, -b.ax[0], -b.ax[1], -b.ax[2]);
        worstFront = Math.max(worstFront, Math.abs((front ?? 99) - (30 - b.hx)));
      }
    }
  }
}
console.log(`${samples} train samples (${standing} standing): axes / quaternion error ${worstQ.toExponential(1)}, car spacing error ${worstGap.toFixed(2)} m, same-train overlaps ${overlapSame}`);
console.log(`ray-cast on standing trains: roof height error vs the designed track level ${worstTop.toFixed(3)} m, side face ${worstSide.toFixed(4)} m, end face ${worstFront.toFixed(4)} m`);
if (worstQ > 1e-9) fail('quaternion / axes are not consistent');
if (worstGap > 0.5) fail(`cars are ${worstGap.toFixed(2)} m from their coupling distance`);
if (overlapSame) fail('boxes of one train overlap each other');
if (standing < 20) fail('too few standing trains were tested');
if (worstTop > 0.03) fail(`roof ray hit ${worstTop.toFixed(3)} m off the designed level`);
if (worstSide > 1e-6 || worstFront > 1e-6) fail('side / end ray distances are wrong');

/* ------------------------------------------------------------------ 2. overlap thresholds on a standing train */
console.log('\n== overlap with the player and vehicles (standing train)');
{
  const m = new TrainManager(rail, noHost);
  const t = m.trains.find((q) => q.state === 'dwell')!;
  const boxes = trainBoxes(t);
  const mid = boxes[2];
  const R = Config.player.radius, H = Config.player.height;
  const lat = (d: number): { x: number; z: number } => ({ x: mid.x + mid.az[0] * d, z: mid.z + mid.az[2] * d });
  const railY = mid.y - mid.hy - BOX_BOTTOM; // rail head level under the car (a standing train is flat enough)
  const pl = (d: number, feetY = railY): number => {
    const p = lat(d);
    return obbPenetration(mid, playerObb(p.x, feetY, p.z, R, H));
  };
  if (pl(0) <= 0) fail('a player in the middle of the car does not touch it');
  const edge = BOX_HALF_WIDTH + R; // 1.85: touching distance
  console.log(`  player: touches at ${(edge - 0.02).toFixed(2)} m from the car axis: ${pl(edge - 0.02) > 0}, at ${(edge + 0.02).toFixed(2)} m: ${pl(edge + 0.02) > 0}  (expected edge ${edge.toFixed(2)} m)`);
  if (pl(edge - 0.02) <= 0) fail('player just inside the side face does not touch');
  if (pl(edge + 0.02) > 0) fail('player just outside the side face touches');
  if (pl(D.trackSpacing) > 0) fail('player on the other track touches');
  if (pl(D.trackSpacing / 2 + 1.7 + 2.25 + 2.25) > 0) fail('player on the platform touches');
  const roofY = mid.y + mid.hy;
  if (pl(0, roofY + 0.05) > 0) fail('player standing on the roof touches (should rest on it)');
  if (pl(0, roofY - 0.1) <= 0) fail('player sunk into the roof does not touch');
  const half = { x: 0.9, y: 0.7, z: 2.2 };
  const veh = (d: number, across: boolean): number => {
    const p = lat(d);
    const f = across ? [mid.az[0], mid.az[2]] : [mid.ax[0], mid.ax[2]];
    return obbPenetration(mid, vehicleObb(p.x, railY + 0.9, p.z, f[0], f[1], half));
  };
  if (veh(0, true) <= 0) fail('a car across the track does not touch');
  const vEdge = BOX_HALF_WIDTH + half.x; // car parallel to the train: touching at 2.4 m
  console.log(`  vehicle parallel to the train: touches at ${(vEdge - 0.02).toFixed(2)} m: ${veh(vEdge - 0.02, false) > 0}, at ${(vEdge + 0.02).toFixed(2)} m: ${veh(vEdge + 0.02, false) > 0}  (expected edge ${vEdge.toFixed(2)} m)`);
  if (veh(vEdge - 0.02, false) <= 0) fail('vehicle just inside does not touch');
  if (veh(vEdge + 0.02, false) > 0) fail('vehicle just outside touches');
  if (veh(6, true) > 0) fail('a car 6 m beside the train touches');
}

/* ------------------------------------------------------------------ 3. a moving train runs into a person on the track */
console.log('\n== moving train, person on the track');
{
  const run = (lateral: number, label: string): { began: number; frames: number; gap: number; speed: number } => {
    const m = new TrainManager(rail, noHost);
    const t = m.trains[2];
    for (let i = 0; i < 60 * 600 && !(t.state === 'run' && t.v > 15); i++) m.fixedUpdate(1 / 60);
    const sAhead = t.s + 250;
    if (sAhead > t.path.sStop - 50) fail('test setup: not enough track ahead');
    t.path.posAt(sAhead, P);
    const q = { x: 0, y: 0, z: 0 };
    t.path.posAt(sAhead + 1, q);
    const dl = Math.hypot(q.x - P.x, q.z - P.z) || 1;
    const px = P.x + (-(q.z - P.z) / dl) * lateral, pz = P.z + ((q.x - P.x) / dl) * lateral;
    const ent: TrainEntity = { id: 'player', kind: 'player', obb: playerObb(px, P.y, pz, Config.player.radius, Config.player.height) };
    const hitsBegin: TrainHit[] = [];
    const c = new TrainContacts(m, (h) => hitsBegin.push(h));
    let frames = 0, gapAtBegin = NaN, speedAtBegin = NaN;
    for (let i = 0; i < 60 * 40; i++) {
      m.fixedUpdate(1 / 60);
      const was = c.began;
      const hits = c.check([ent]);
      if (hits.length) frames++;
      if (c.began > was) {
        const b0 = trainBoxes(t)[t.reversed ? CONSIST.length - 1 : 0];
        gapAtBegin = Math.hypot(b0.x - px, b0.z - pz) - b0.hx - Config.player.radius;
        speedAtBegin = t.v;
      }
    }
    console.log(`  ${label}: ${c.began} begin events, touching in ${frames} frames, gap to the front when it began ${gapAtBegin.toFixed(2)} m at ${(speedAtBegin * 3.6).toFixed(0)} km/h`);
    return { began: c.began, frames, gap: gapAtBegin, speed: speedAtBegin };
  };
  const a = run(0, 'person on the track        ');
  if (a.began !== 1) fail(`person on the track: ${a.began} begin events (expected exactly 1)`);
  if (!(a.gap < a.speed / 60 + 0.6 && a.gap > -(a.speed / 60) - 0.6)) fail(`begin came ${a.gap.toFixed(2)} m from the front (a step is ${(a.speed / 60).toFixed(2)} m)`);
  if (a.frames < 10) fail('contact lasted only a few frames');
  const b = run(D.trackSpacing, 'person on the other track  ');
  if (b.began !== 0) fail('the train touched a person on the other track');
  const c = run(BOX_HALF_WIDTH + Config.player.radius + 0.1, 'person 0.1 m outside the side');
  if (c.began !== 0) fail('the train touched a person just outside its side');
}

/* ------------------------------------------------------------------ 4. the collider pose is smooth */
console.log('\n== collider movement per 1/60 s (what Rapier derives the push velocity from)');
{
  const m = new TrainManager(rail, noHost);
  let worstV = 0, worstA = 0, last: number[][] | null = null, lastV: number[] | null = null, ticks = 0;
  for (let i = 0; i < 60 * 3600; i++) {
    m.fixedUpdate(1 / 60);
    const cur = m.trains.map((t) => { const b = trainBoxes(t)[2]; return [b.x, b.y, b.z]; });
    if (last) {
      const v = cur.map((c, k) => Math.hypot(c[0] - last![k][0], c[1] - last![k][1], c[2] - last![k][2]) * 60);
      m.trains.forEach((t, k) => {
        if (t.state === 'dwell' && v[k] > 0.01) worstV = Math.max(worstV, v[k]);
        if (t.state === 'run') worstV = Math.max(worstV, Math.abs(v[k] - t.v));
        if (lastV) worstA = Math.max(worstA, Math.abs(v[k] - lastV[k]) * 60);
      });
      lastV = v;
      ticks++;
    }
    last = cur;
  }
  console.log(`  ${ticks} ticks, 7 trains: speed seen by the physics differs from the train speed by at most ${worstV.toFixed(2)} m/s, largest acceleration step ${worstA.toFixed(1)} m/s2`);
  if (worstV > 0.6) fail(`collider speed jumps (${worstV.toFixed(2)} m/s away from the train speed)`);
  if (worstA > 25) fail(`collider acceleration spikes (${worstA.toFixed(1)} m/s2): the 10 Hz simulation step shows through`);
}

/* ------------------------------------------------------------------ 5. which trains need colliders */
console.log('\n== colliders near the player');
{
  const m = new TrainManager(rail, noHost);
  const radius = PhysicsConfig.activeRadius + TRAIN_LENGTH / 2;
  const sel = new TrainSelector(m, radius);
  const central = rail.stationById('central')!;
  let peak = 0, adds = 0, removes = 0;
  for (let i = 0; i < 60 * 7200; i++) {
    m.fixedUpdate(1 / 60);
    if (i % 12 === 0) {
      const r = sel.update(central.x, central.z);
      adds += r.add.length;
      removes += r.remove.length;
      peak = Math.max(peak, sel.activeIds.size);
    }
  }
  console.log(`  player at central for 2 h: peak ${peak} trains = ${peak * CONSIST.length} kinematic bodies, ${adds} created / ${removes} removed`);
  if (peak * CONSIST.length > 42) fail('more bodies than the whole fleet has');
  if (adds - removes !== sel.activeIds.size) fail('selector bookkeeping is wrong');
  const t = m.trains[0];
  const s2 = new TrainSelector(m, 300, 64);
  t.path.posAt(t.s, P);
  const at = (d: number): { add: number[]; remove: number[] } => {
    let lo = 0, hi = 3000;
    for (let i = 0; i < 40; i++) { const mid = (lo + hi) / 2; if (m.distanceTo(t, P.x + mid, P.z) < d) lo = mid; else hi = mid; }
    return s2.update(P.x + lo, P.z);
  };
  at(250);
  if (!s2.activeIds.has(t.id)) fail('train not selected inside the radius');
  at(340);
  if (!s2.activeIds.has(t.id)) fail('train dropped inside the hysteresis band');
  at(400);
  if (s2.activeIds.has(t.id)) fail('train kept beyond radius + hysteresis');
  at(340);
  if (s2.activeIds.has(t.id)) fail('train came back inside the band');
}

/* ------------------------------------------------------------------ 6. minimap markers */
console.log('\n== minimap markers');
{
  const m = new TrainManager(rail, noHost);
  let worstHead = 0, worstPos = 0, forward = 0, checked = 0, out = 0;
  for (let sec = 0; sec < 3600; sec++) {
    for (let i = 0; i < 60; i++) m.fixedUpdate(1 / 60);
    if (sec % 3) continue;
    const marks = m.markers();
    if (marks.length !== m.trains.length) fail('marker count differs from the train count');
    marks.forEach((mk, k) => {
      const t = m.trains[k];
      if (![mk.x, mk.z, mk.heading].every(Number.isFinite)) fail('marker has NaN');
      if (Math.abs(mk.x) > 5100 || Math.abs(mk.z) > 5100) out++;
      // reference from the collider boxes: the middle of the train = between the cars at path positions 2 and 3 (of 6); heading = from the rear one to the front one
      const boxes = trainBoxes(t);
      const pathOrder = (j: number): TrainBox => boxes[t.reversed ? CONSIST.length - 1 - j : j];
      const c2 = pathOrder(2), c3 = pathOrder(3);
      // box centres sit ~2 m above the car pose along the car's up axis: on a 2.5 % grade that shifts x / z by ~0.05 m
      const mid = { x: (c2.x + c3.x) / 2, z: (c2.z + c3.z) / 2 };
      worstPos = Math.max(worstPos, Math.hypot(mid.x - mk.x, mid.z - mk.z));
      const want = (((Math.atan2(c2.x - c3.x, -(c2.z - c3.z)) * 180) / Math.PI) + 360) % 360;
      let dh = Math.abs(want - mk.heading);
      if (dh > 180) dh = 360 - dh;
      worstHead = Math.max(worstHead, dh);
    });
    // then (all markers compared above, nothing moved yet) one tick on: every moving marker goes forward along its heading
    m.fixedUpdate(1 / 60);
    const next = m.markers();
    marks.forEach((mk, k) => {
      if (!mk.moving) return;
      const hx = Math.sin((mk.heading * Math.PI) / 180), hz = -Math.cos((mk.heading * Math.PI) / 180);
      checked++;
      if ((next[k].x - mk.x) * hx + (next[k].z - mk.z) * hz >= -1e-9) forward++;
    });
  }
  console.log(`  marker vs the car boxes: position at most ${worstPos.toFixed(3)} m, heading at most ${worstHead.toFixed(2)} deg apart; moving forward along its heading in ${forward}/${checked} samples; ${out} outside the map`);
  if (worstPos > 0.15) fail('marker is not at the middle of the train');
  if (worstHead > 0.1) fail('marker heading differs from the train direction');
  if (forward !== checked) fail('a marker points backwards');
  if (out) fail('marker outside the map');
}

/* ------------------------------------------------------------------ 7. budget */
console.log('\n== CPU budget per fixed step');
{
  const m = new TrainManager(rail, noHost, { show: 1e9, hide: 2e9 });
  const central = rail.stationById('central')!;
  const ents: TrainEntity[] = [];
  for (let i = 0; i < 30; i++) ents.push({ id: `vehicle-${i}`, kind: 'vehicle', obb: vehicleObb(central.x + i * 3, 0, central.z + i * 2, 1, 0, { x: 0.9, y: 0.7, z: 2.2 }) });
  ents.push({ id: 'player', kind: 'player', obb: playerObb(central.x, 0, central.z, 0.35, 1.8) });
  const c = new TrainContacts(m);
  const N = 60 * 600;
  let t0 = process.hrtime.bigint();
  for (let i = 0; i < N; i++) { m.fixedUpdate(1 / 60); for (const t of m.trains) trainBoxes(t); }
  const boxesUs = Number(process.hrtime.bigint() - t0) / 1e3 / N;
  t0 = process.hrtime.bigint();
  for (let i = 0; i < N; i++) { m.fixedUpdate(1 / 60); c.check(ents); }
  const contactUs = Number(process.hrtime.bigint() - t0) / 1e3 / N;
  const markUs = (() => { const a = process.hrtime.bigint(); for (let i = 0; i < N; i++) m.markers(); return Number(process.hrtime.bigint() - a) / 1e3 / N; })();
  console.log(`  collider poses for all 7 trains (worst case, TrainPhysics only does the near ones): ${boxesUs.toFixed(1)} us; overlap check, 31 entities: ${contactUs.toFixed(1)} us; minimap markers: ${markUs.toFixed(2)} us`);
  if (boxesUs > 100) fail('collider poses over 100 us');
  if (contactUs > 100) fail('overlap check over 100 us');
}

if (bad) { console.log(`\n${bad} FAILURES`); process.exit(1); }
console.log('\nALL OK');
