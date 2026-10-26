// Headless Stage 6 drive test (real Rapier): npx tsx scripts/drive-test.ts
import * as THREE from 'three';
import { EventBus, type EngineEvents } from '../src/core/EventBus';
import { PhysicsWorld } from '../src/physics/PhysicsWorld';
import { FloatingOrigin } from '../src/world/FloatingOrigin';
import { TerrainGenerator } from '../src/terrain/TerrainGenerator';
import { TerrainPhysics } from '../src/terrain/TerrainPhysics';
import { buildChunkMeshData } from '../src/terrain/TerrainMeshData';
import { BridgePhysics } from '../src/roads/BridgePhysics';
import { Vehicle } from '../src/vehicles/Vehicle';
import { SEDAN, JEEP } from '../src/vehicles/VehicleSpec';
import { Config } from '../src/core/Config';
import { worldToChunkCoord, chunkKey } from '../src/world/WorldGrid';

let fails = 0;
const ok = (c: boolean, m: string) => {
  console.log((c ? 'PASS ' : 'FAIL ') + m);
  if (!c) fails++;
};

const gen = new TerrainGenerator(Config.world.seed);
const R = gen.roads;

// ---- mesh data checks ----
let t0 = performance.now();
let withRoad = 0;
let bad = 0;
for (let cz = 0; cz < 20; cz++) {
  for (let cx = 0; cx < 20; cx++) {
    const m = buildChunkMeshData(gen, cx, cz, 32, 16, 0);
    if (m.road) {
      withRoad++;
      for (const a of [m.road.positions, m.road.info]) for (const v of a) if (!Number.isFinite(v)) bad++;
    }
    if (m.roadMask) for (const v of m.roadMask) if (!Number.isFinite(v) || v < 0 || v > 1.0001) bad++;
  }
}
console.log(`all 400 chunks meshed in ${(performance.now() - t0).toFixed(0)} ms, ${withRoad} chunks with road ribbons`);
ok(withRoad > 10 && bad === 0, 'road ribbons + masks are finite and in range');
t0 = performance.now();
const probe = (() => { const r = R.roads.find((q) => q.kind === 'highway')!; return worldToChunkCoord(r.xs[100], r.zs[100]); })();
buildChunkMeshData(gen, probe.cx, probe.cz, 128, 8, 0);
console.log('LOD0 road chunk build ms', (performance.now() - t0).toFixed(0));

// ---- physics world ----
const bus = new EventBus<EngineEvents>();
const physics = await PhysicsWorld.create(bus);
const root = new THREE.Group();
const scene = new THREE.Scene();
const origin = new FloatingOrigin(root, bus);
const tp = new TerrainPhysics(physics, origin, bus);
const loaded = new Set<string>();
const ensureChunks = (x: number, z: number) => {
  const { cx, cz } = worldToChunkCoord(x, z);
  for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
    const k = chunkKey(cx + dx, cz + dz);
    if (loaded.has(k)) continue;
    loaded.add(k);
    const m = buildChunkMeshData(gen, cx + dx, cz + dz, 128, 8, 0);
    bus.emit('chunk:loaded', { key: k, cx: cx + dx, cz: cz + dz, lod: 0, vertsPerSide: 128, heights: m.heights });
  }
};
const bp = new BridgePhysics(physics, origin, R.bridges, R.roads);

async function drive(spec: typeof SEDAN, label: string, bridgeId: number, targetKmh: number): Promise<void> {
  const b = R.bridges[bridgeId];
  const r = R.roads[b.roadId];
  const start = Math.max(0, b.i0 - 14);
  const end = Math.min(r.xs.length - 1, b.i1 + 14);
  const fwdDx = r.xs[start + 1] - r.xs[start];
  const fwdDz = r.zs[start + 1] - r.zs[start];
  const yaw = Math.atan2(fwdDx, fwdDz);
  ensureChunks(r.xs[start], r.zs[start]);
  // let colliders appear
  for (let i = 0; i < 30; i++) { tp.update(0.2, r.xs[start], r.zs[start]); bp.update(0.2, r.xs[start], r.zs[start]); }
  const v = new Vehicle({ physics, terrain: gen, origin, scene, bus }, spec, new THREE.Vector3(r.xs[start], r.ys[start] + 0.9, r.zs[start]), yaw);
  v.setEnabled(true);
  const body = (v as unknown as { body: { translation(): { x: number; y: number; z: number } } }).body;
  let idx = start;
  let maxLat = 0;
  let minAboveDeck = Infinity;
  let reached = false;
  let maxSpeed = 0;
  let onBridgeTicks = 0;
  for (let step = 0; step < 60 * 90 && !reached; step++) {
    const t = body.translation();
    const wx = t.x + origin.origin.x;
    const wz = t.z + origin.origin.z;
    if (step % 12 === 0) { ensureChunks(wx, wz); tp.update(0.2, wx, wz); bp.update(0.2, wx, wz); }
    // pure pursuit along the road centreline
    while (idx < end && Math.hypot(r.xs[idx] - wx, r.zs[idx] - wz) < 14) idx++;
    const tx = r.xs[idx] - wx;
    const tz = r.zs[idx] - wz;
    const f = { x: 0, z: 0 };
    const q = (v as unknown as { body: { rotation(): { x: number; y: number; z: number; w: number } } }).body.rotation();
    const fv = new THREE.Vector3(0, 0, 1).applyQuaternion(new THREE.Quaternion(q.x, q.y, q.z, q.w));
    f.x = fv.x; f.z = fv.z;
    const fl = Math.hypot(f.x, f.z) || 1;
    const cross = (f.x / fl) * tz - (f.z / fl) * tx;
    const steer = Math.max(-1, Math.min(1, (-cross / Math.hypot(tx, tz)) * 2.5));
    const sp = (v as unknown as { speed: number }).speed;
    const target = targetKmh / 3.6;
    v.fixedUpdate(1 / 60, { throttle: sp < target, brake: sp > target + 4, steer, handbrake: false });
    physics.step();
    v.afterStep();
    maxSpeed = Math.max(maxSpeed, sp);
    // lateral error to the centreline (nearest point)
    let best = Infinity;
    let by = 0;
    for (let k = Math.max(0, idx - 6); k <= Math.min(r.xs.length - 1, idx + 2); k++) {
      const d = Math.hypot(r.xs[k] - wx, r.zs[k] - wz);
      if (d < best) { best = d; by = r.ys[k]; }
    }
    maxLat = Math.max(maxLat, best);
    if (idx >= b.i0 && idx <= b.i1 && r.bridgeOf[Math.min(idx, r.xs.length - 1)] === b.id) {
      onBridgeTicks++;
      minAboveDeck = Math.min(minAboveDeck, t.y - by);
    }
    if (idx >= end && Math.hypot(r.xs[end] - wx, r.zs[end] - wz) < 16) reached = true;
    if (t.y < by - 3) break; // fell off
  }
  console.log(`${label}: bridge ${b.id} (${b.type}, ${b.spanM.toFixed(0)} m wet): max ${(maxSpeed * 3.6).toFixed(0)} km/h, max lateral ${maxLat.toFixed(1)} m, min height above deck ${minAboveDeck.toFixed(2)} m, ticks on bridge ${onBridgeTicks}`);
  ok(reached, `${label} drove over bridge ${b.id} to the far bank`);
  ok(minAboveDeck > -0.3, `${label} stayed on the deck (no fall-through)`);
}

await drive(SEDAN, 'sedan', 4, 60);
await drive(JEEP, 'jeep', 5, 50);

// grip: surface classification under the sedan on road vs off road
console.log('surface @road', R.surfaceAt(R.roads[R.roads.length - 1].xs[50], R.roads[R.roads.length - 1].zs[50]));
console.log(fails === 0 ? 'ALL OK' : `${fails} FAILED`);
process.exit(fails ? 1 : 0);
