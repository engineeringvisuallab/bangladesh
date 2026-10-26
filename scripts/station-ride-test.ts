// Station access + train ride check (real Rapier, headless): npx tsx scripts/station-ride-test.ts
//   * every stair: a person (same capsule + character controller settings as the Player) starting at the foot walks up the steps, over the landing
//     and onto the platform, and ends standing on the platform top;
//   * every platform: walking along the platform does not fall off / get stuck (50 m each way);
//   * boarding: for every passenger station a train that dwells there can be boarded from its platform (findBoardable) and the alight spot is on the platform.
import * as THREE from 'three';
import { EventBus, type EngineEvents } from '../src/core/EventBus';
import { PhysicsWorld } from '../src/physics/PhysicsWorld';
import { FloatingOrigin } from '../src/world/FloatingOrigin';
import { TerrainGenerator } from '../src/terrain/TerrainGenerator';
import { TerrainPhysics } from '../src/terrain/TerrainPhysics';
import { buildChunkMeshData } from '../src/terrain/TerrainMeshData';
import { RailPhysics } from '../src/rail/RailPhysics';
import { TunnelHoles } from '../src/rail/RailTunnel';
import { stationAccesses } from '../src/rail/StationAccess';
import { Config } from '../src/core/Config';
import { chunkKey, worldToChunkCoord } from '../src/world/WorldGrid';
import { TrainFleet } from '../src/trains/TrainSim';
import { alightSpot, findBoardable, pathIndex } from '../src/trains/TrainRide';
import { CONSIST } from '../src/trains/TrainConfig';

let bad = 0;
const fail = (m: string): void => {
  bad++;
  console.log('FAIL', m);
};
const gen = new TerrainGenerator(Config.world.seed);
const rail = gen.rail;
const groundAt = (x: number, z: number): number => gen.heightAt(x, z);
const accesses = stationAccesses(rail, groundAt);
console.log(`${accesses.length} station accesses at ${new Set(accesses.map((a) => a.station)).size} stations`);

const bus = new EventBus<EngineEvents>();
const physics = await PhysicsWorld.create(bus);
const R = physics.RAPIER;
const origin = new FloatingOrigin(new THREE.Group(), bus);
const tp = new TerrainPhysics(physics, origin, bus, new TunnelHoles(rail));
const rp = new RailPhysics(physics, origin, rail, groundAt);
const loaded = new Set<string>();
function focus(x: number, z: number): void {
  const a = worldToChunkCoord(x - 420, z - 420), b = worldToChunkCoord(x + 420, z + 420);
  for (let cz = a.cz; cz <= b.cz; cz++) {
    for (let cx = a.cx; cx <= b.cx; cx++) {
      const key = chunkKey(cx, cz);
      if (loaded.has(key)) continue;
      loaded.add(key);
      const m = buildChunkMeshData(gen, cx, cz, Config.lod.vertsPerSide[0], 16, 0);
      bus.emit('chunk:loaded', { key, cx, cz, lod: 0, vertsPerSide: Config.lod.vertsPerSide[0], heights: m.heights });
    }
  }
  tp.update(0.25, x, z);
  rp.update(0.25, x, z);
  physics.step();
}

const break_ = (): void => {};
const P = Config.player;
const HALF = P.height / 2;

/** A walker like the Player: kinematic capsule + Rapier character controller with the Player's settings. */
function walker(x: number, y: number, z: number): { step: (tx: number, tz: number, speed: number) => void; col: any; pos: () => { x: number; y: number; z: number }; grounded: () => boolean; remove: () => void } {
  const body = physics.world.createRigidBody(R.RigidBodyDesc.kinematicPositionBased().setTranslation(x, y + HALF, z));
  const col = physics.world.createCollider(R.ColliderDesc.capsule(HALF - P.radius, P.radius), body);
  const ctl = physics.world.createCharacterController(0.02);
  ctl.setUp({ x: 0, y: 1, z: 0 });
  ctl.setSlideEnabled(true);
  ctl.enableAutostep(P.stepHeight, 0.2, false);
  ctl.enableSnapToGround(0.5);
  ctl.setMaxSlopeClimbAngle((P.maxSlopeDeg * Math.PI) / 180);
  ctl.setMinSlopeSlideAngle(((P.maxSlopeDeg + 5) * Math.PI) / 180);
  let vy = 0;
  let grounded = false;
  const dt = 1 / 60;
  return {
    col,
    step(tx, tz, speed) {
      const t = body.translation();
      const dx = tx - t.x, dz = tz - t.z;
      const l = Math.hypot(dx, dz);
      const k = l > 1e-3 ? Math.min(speed * dt, l) / l : 0;
      vy = grounded ? 0 : Math.max(vy - 9.81 * dt, -40);
      ctl.computeColliderMovement(col, { x: dx * k, y: vy * dt, z: dz * k });
      const m = ctl.computedMovement();
      grounded = ctl.computedGrounded();
      body.setNextKinematicTranslation({ x: t.x + m.x, y: t.y + m.y, z: t.z + m.z });
      physics.step();
    },
    pos: () => {
      const t = body.translation();
      return { x: t.x, y: t.y - HALF, z: t.z };
    },
    grounded: () => grounded,
    remove: () => {
      physics.world.removeCharacterController(ctl);
      physics.world.removeRigidBody(body);
    },
  };
}

// --- 1. walk up every stair, then along the platform ---
for (const a of accesses.filter((q) => !process.env.ONLY || q.station === process.env.ONLY)) {
  focus(a.top.x, a.top.z);
  for (let i = 0; i < 3; i++) focus(a.top.x, a.top.z);
  const foot = a.foot;
  const w = walker(foot.x - origin.origin.x, groundAt(foot.x, foot.z) + 0.3, foot.z - origin.origin.z);
  for (let i = 0; i < 90; i++) w.step(foot.x - origin.origin.x, foot.z - origin.origin.z, 0); // settle on the ground
  const path = [...a.steps].reverse();
  let maxStuck = 0;
  for (const p of path) {
    let still = 0;
    for (let i = 0; i < 240; i++) {
      const before = w.pos();
      w.step(p.x - origin.origin.x, p.z - origin.origin.z, P.walk);
      const after = w.pos();
      if (Math.hypot(after.x - before.x, after.z - before.z) < 0.003) still++;
      if (Math.hypot(after.x - (p.x - origin.origin.x), after.z - (p.z - origin.origin.z)) < 0.25) break;
    }
    maxStuck = Math.max(maxStuck, still);
    if (process.env.DBG && still > 200) { const q = w.pos(); const dx = p.x - origin.origin.x - q.x, dz = p.z - origin.origin.z - q.z; const l = Math.hypot(dx, dz); for (const hh of [0.3, 1.0, 1.6]) { const h = physics.world.castRay(new R.Ray({ x: q.x, y: q.y + hh, z: q.z }, { x: dx / l, y: 0, z: dz / l }), 3, false, undefined, undefined, w.col); if (h) { const c = h.collider; const tr = c.translation(); const he = (c as any).halfExtents?.(); console.log('   BLOCK at h', hh, 'dist', h.timeOfImpact.toFixed(2), 'shape', c.shape.type, 'pos', (tr.x + origin.origin.x).toFixed(1), tr.y.toFixed(1), (tr.z + origin.origin.z).toFixed(1), 'half', he ? [he.x, he.y, he.z].map((v: number) => v.toFixed(2)).join(',') : '-'); } } break_(); }
    if (process.env.DBG) { const q = w.pos(); console.log('   wp', (p.x).toFixed(1), (p.z).toFixed(1), 'y', p.y.toFixed(2), '-> at', (q.x + origin.origin.x).toFixed(1), (q.z + origin.origin.z).toFixed(1), 'y', q.y.toFixed(2), 'stuck', still); }
  }
  // onto the platform: from the platform centre line (top) 1 m towards the track (the platform is 4.5 m wide)
  const inwardX = -a.ox, inwardZ = -a.oz;
  const tx0 = a.top.x + inwardX * 1.0, tz0 = a.top.z + inwardZ * 1.0;
  for (let i = 0; i < 360; i++) { w.step(tx0 - origin.origin.x, tz0 - origin.origin.z, P.walk); if (process.env.DBG && i % 30 === 0) { const q = w.pos(); console.log('   inward', i, (q.x + origin.origin.x).toFixed(2), q.y.toFixed(2), (q.z + origin.origin.z).toFixed(2), 'goal', tx0.toFixed(2), tz0.toFixed(2), 'top', a.top.x.toFixed(2), a.top.y.toFixed(2), a.top.z.toFixed(2)); } }
  // and 30 m along the platform each way (must not fall off or get stuck on a post)
  let alongOk = true;
  const stn = rail.stations.find((q) => q.id === a.station)!;
  const arr = stn.arrivals[a.arrival];
  const edge = rail.edges.find((q) => q.id === arr.edgeId)!;
  const pm = rail.pointAt(edge, arr.end === 'a' ? 12 + 75 : edge.length - 12 - 75);
  const alongTop = (a.top.x - pm.x) * a.tx + (a.top.z - pm.z) * a.tz;
  for (const dir of [1, -1]) {
    const reach = Math.min(30, 70 - dir * alongTop); // stay on the 150 m platform
    if (reach < 5) continue;
    const gx = tx0 + a.tx * dir * reach, gz = tz0 + a.tz * dir * reach;
    for (let i = 0; i < 600; i++) w.step(gx - origin.origin.x, gz - origin.origin.z, P.walk);
    const q = w.pos();
    if (Math.hypot(q.x + origin.origin.x - gx, q.z + origin.origin.z - gz) > 1.0 || Math.abs(q.y - a.top.y) > 0.35) {
      alongOk = false;
      const dx = gx - origin.origin.x - q.x, dz = gz - origin.origin.z - q.z, l = Math.hypot(dx, dz) || 1;
      console.log(`   stuck at (${(q.x + origin.origin.x).toFixed(1)}, ${q.y.toFixed(2)}, ${(q.z + origin.origin.z).toFixed(1)}) walking dir ${dir} toward (${gx.toFixed(1)}, ${gz.toFixed(1)})`);
      for (const hh of [0.3, 1.0]) { const h = physics.world.castRay(new R.Ray({ x: q.x, y: q.y + hh, z: q.z }, { x: dx / l, y: 0, z: dz / l }), 3, false, undefined, undefined, w.col); if (h) { const c = h.collider; const tr = c.translation(); const he = (c as any).halfExtents?.(); console.log('   BLOCK h', hh, 'dist', h.timeOfImpact.toFixed(2), 'shape', c.shape.type, 'pos', (tr.x + origin.origin.x).toFixed(1), tr.y.toFixed(1), (tr.z + origin.origin.z).toFixed(1), 'half', he ? [he.x, he.y, he.z].map((v: number) => v.toFixed(2)).join(',') : '-'); } }
    }
    for (let i = 0; i < 600; i++) w.step(tx0 - origin.origin.x, tz0 - origin.origin.z, P.walk);
  }
  if (!alongOk) fail(`${a.station} arrival ${a.arrival} side ${a.side}: cannot walk 30 m along the platform`);
  const e = w.pos();
  const dxy = Math.hypot(e.x + origin.origin.x - tx0, e.z + origin.origin.z - tz0);
  const dh = e.y - a.top.y;
  const ok = dxy < 0.6 && Math.abs(dh) < 0.35;
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${a.station} arrival ${a.arrival} side ${a.side}: ${a.steps.length} steps, rise ${(a.top.y - groundAt(foot.x, foot.z)).toFixed(1)} m; end ${dxy.toFixed(2)} m from the goal, ${dh.toFixed(2)} m from the platform top`);
  if (!ok) bad++;
  w.remove();
}

// --- 2. boarding ---
const fleet = new TrainFleet(rail, { seed: 1, signals: false });
const stationsWithAccess = new Set(accesses.map((a) => a.station));
let boardable = 0;
for (const t of fleet.trains.length ? fleet.trains : []) void t;
{
  // run the timetable and look at each train the moment it dwells at a passenger station
  const seen = new Set<string>();
  const { DEFAULT_TRAIN_START } = await import('../src/trains/TrainManager');
  for (const k of DEFAULT_TRAIN_START) fleet.spawn(k);
  for (let sec = 0; sec < 3 * 3600 && seen.size < stationsWithAccess.size; sec++) {
    for (let i = 0; i < 10; i++) fleet.update(0.1);
    for (const t of fleet.trains) {
      if (t.state !== 'dwell') continue;
      const st = t.station;
      if (!stationsWithAccess.has(st) || seen.has(st)) continue;
      seen.add(st);
      const car = 2;
      const spot = alightSpot(rail, fleet, groundAt, t, car);
      if (!spot) {
        fail(`${st}: no alight spot`);
        continue;
      }
      // a person standing at the alight spot (capsule centre 0.9 m above the platform top) next to the car can board
      const b = findBoardable(fleet.trains, spot.x, spot.y - 0.1 + HALF - 0.9 + 0.0, spot.z);
      const ok = !!b && b.train === t;
      console.log(`${ok ? 'ok  ' : 'FAIL'} ${st}: train ${t.id} dwells, alight spot (${spot.x.toFixed(0)}, ${spot.y.toFixed(1)}, ${spot.z.toFixed(0)}), boardable ${ok ? 'car ' + b!.car : 'no'}`);
      if (ok) boardable++;
      else bad++;
      void pathIndex;
      void CONSIST;
    }
  }
  for (const s of stationsWithAccess) if (!seen.has(s)) console.log(`(no train dwelt at ${s} in 3 h)`);
}
console.log(`${boardable} stations: boarding works`);
console.log(bad ? `\n${bad} FAILED` : '\nall station / ride checks passed');
process.exit(bad ? 1 : 0);
