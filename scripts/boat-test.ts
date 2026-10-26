// Headless boat test (real Rapier): npx tsx scripts/boat-test.ts
// Checks: water spot search, floating at the Archimedes draft, acceleration / top speed, steering, braking,
// running aground at the shore, self-righting, and the cost of one fixed step.
import * as THREE from 'three';
import { EventBus, type EngineEvents } from '../src/core/EventBus';
import { PhysicsWorld } from '../src/physics/PhysicsWorld';
import { FloatingOrigin } from '../src/world/FloatingOrigin';
import { TerrainGenerator } from '../src/terrain/TerrainGenerator';
import { TerrainPhysics } from '../src/terrain/TerrainPhysics';
import { buildChunkMeshData } from '../src/terrain/TerrainMeshData';
import { Boat, type BoatInput } from '../src/boats/Boat';
import { findWaterSpot } from '../src/boats/BoatManager';
import { BOAT } from '../src/boats/BoatSpec';
import { Config } from '../src/core/Config';
import { worldToChunkCoord, chunkKey } from '../src/world/WorldGrid';

let fails = 0;
const ok = (c: boolean, m: string) => {
  console.log((c ? 'PASS ' : 'FAIL ') + m);
  if (!c) fails++;
};

const gen = new TerrainGenerator(Config.world.seed);

// ---- 1. water search ----
const spot = findWaterSpot(gen, 0, 0);
ok(!!spot, 'a deep water spot exists near the spawn point');
if (!spot) process.exit(1);
console.log(`nearest deep water to spawn: (${spot.x.toFixed(0)}, ${spot.z.toFixed(0)}), ${Math.hypot(spot.x, spot.z).toFixed(0)} m away, level ${spot.level.toFixed(2)}, yaw ${((spot.yaw * 180) / Math.PI).toFixed(0)} deg`);
const lake = gen.lakes.lakes.find((l) => !l.isPond);
console.log(lake ? `first lake: (${lake.x.toFixed(0)}, ${lake.z.toFixed(0)}) R ${lake.R.toFixed(0)}` : 'no lake on this seed');

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
  for (let dz = -2; dz <= 2; dz++) for (let dx = -2; dx <= 2; dx++) {
    const k = chunkKey(cx + dx, cz + dz);
    if (loaded.has(k)) continue;
    loaded.add(k);
    const m = buildChunkMeshData(gen, cx + dx, cz + dz, 128, 8, 0);
    bus.emit('chunk:loaded', { key: k, cx: cx + dx, cz: cz + dz, lod: 0, vertsPerSide: 128, heights: m.heights });
  }
};
ensureChunks(spot.x, spot.z);
for (let i = 0; i < 30; i++) tp.update(0.2, spot.x, spot.z);

const boat = new Boat({ physics, terrain: gen, origin, scene, bus }, new THREE.Vector3(spot.x, spot.level + 0.25, spot.z), spot.yaw);
boat.setEnabled(true);
const body = boat.body;
const sc = gen.makeSample();
const G = 9.81;
const idle: BoatInput = { throttle: 0, steer: 0, boost: false, anchor: false };

const step = (input: BoatInput | null, n: number, every = 0): void => {
  for (let i = 0; i < n; i++) {
    const t = body.translation();
    if (every && i % every === 0) {
      const wx = t.x + origin.origin.x;
      const wz = t.z + origin.origin.z;
      ensureChunks(wx, wz);
      tp.update(0.2, wx, wz);
    }
    boat.fixedUpdate(1 / 60, input);
    physics.step();
    boat.afterStep();
  }
};
const world = () => {
  const t = body.translation();
  return { x: t.x + origin.origin.x, y: t.y, z: t.z + origin.origin.z };
};
const level = () => {
  const w = world();
  gen.sample(w.x, w.z, sc);
  return sc.water;
};

// ---- 2. floating ----
step(idle, 60 * 8);
let w = world();
let tel = boat.telemetry();
const draft = BOAT.mass / (BOAT.waterDensity * BOAT.waterplaneArea);
const keelDepth = level() - (w.y + BOAT.keelY);
console.log(`floating: keel ${keelDepth.toFixed(3)} m below the surface (Archimedes: ${draft.toFixed(3)} m), buoyancy ${tel.buoyancy.toFixed(0)} N vs weight ${tel.weight.toFixed(0)} N, roll ${((tel.roll * 180) / Math.PI).toFixed(1)} deg, pitch ${((tel.pitch * 180) / Math.PI).toFixed(1)} deg`);
ok(Math.abs(keelDepth - draft) < 0.08, 'floats at the draft predicted by Archimedes');
ok(Math.abs(tel.buoyancy - tel.weight) / tel.weight < 0.05, 'buoyancy balances the weight');
ok(Math.abs(body.linvel().y) < 0.05, 'no bobbing left after 8 s');
ok(Math.abs(tel.roll) < 0.05 && Math.abs(tel.pitch) < 0.06, 'sits level');

// ---- move to open water for the speed / steering tests: the longest straight run of deep water ----
{
  const p = world();
  let best = { yaw: 0, run: 0, x: p.x, z: p.z };
  for (let sx = -3000; sx <= 3000; sx += 250) for (let sz = -3000; sz <= 3000; sz += 250) {
    gen.sample(p.x + sx, p.z + sz, sc);
    if (Number.isNaN(sc.water) || sc.water - sc.h < 2) continue;
    for (let k = 0; k < 16; k++) {
      const yaw = (k / 16) * Math.PI * 2;
      let run = 0;
      // three parallel lanes (centre and +-15 m) so a narrow sand bar cannot hide between samples
      outer: for (let d = 8; d < 2500; d += 8) {
        for (const lane of [0, -15, 15]) {
          const px = p.x + sx + Math.sin(yaw) * d + Math.cos(yaw) * lane;
          const pz = p.z + sz + Math.cos(yaw) * d - Math.sin(yaw) * lane;
          gen.sample(px, pz, sc);
          if (Number.isNaN(sc.water) || sc.water - sc.h < 3) break outer;
        }
        run = d;
      }
      if (run > best.run) best = { yaw, run, x: p.x + sx, z: p.z + sz };
    }
  }
  console.log(`open run: ${best.run} m of deep water from (${best.x.toFixed(0)}, ${best.z.toFixed(0)}) yaw ${((best.yaw * 180) / Math.PI).toFixed(0)}`);
  ok(best.run >= 500, 'there is at least 500 m of open water somewhere within 3 km of the first boat');
  const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), best.yaw);
  ensureChunks(best.x, best.z);
  for (let i = 0; i < 30; i++) tp.update(0.2, best.x, best.z);
  gen.sample(best.x, best.z, sc);
  body.setTranslation({ x: best.x - origin.origin.x, y: sc.water + 0.3, z: best.z - origin.origin.z }, true);
  body.setRotation({ x: q.x, y: q.y, z: q.z, w: q.w }, true);
  body.setLinvel({ x: 0, y: 0, z: 0 }, true);
  body.setAngvel({ x: 0, y: 0, z: 0 }, true);
  step(idle, 60 * 3, 12);
}

// ---- 3. throttle: acceleration and top speed ----
const full: BoatInput = { throttle: 1, steer: 0, boost: false, anchor: false };
let t5 = 0;
for (let s = 0; s < 18 * 60; s++) {
  step(full, 1, 12);
  if (!t5 && boat.telemetry().kmh > 50) t5 = s / 60;
}
tel = boat.telemetry();
console.log(`full throttle: top ${tel.kmh.toFixed(0)} km/h, 0-50 km/h in ${t5.toFixed(1)} s, thrust ${tel.thrust.toFixed(0)} N, drag ${tel.drag.toFixed(0)} N, pitch ${((tel.pitch * 180) / Math.PI).toFixed(1)} deg`);
ok(tel.kmh > 45 && tel.kmh < 75, 'top speed is plausible for a 45 kW runabout (45-75 km/h)');
ok(t5 > 0 && t5 < 15, 'reaches 50 km/h in under 15 s');
ok(Math.abs(tel.thrust - tel.drag) / Math.max(1, tel.thrust) < 0.15, 'thrust ~ drag at top speed');
ok(Math.abs(tel.roll) < 0.2, 'stays upright at full speed');

// ---- 4. steering at cruise ----
const h0 = tel.heading;
const left: BoatInput = { throttle: 0.6, steer: 1, boost: false, anchor: false };
step(left, 60 * 4, 12);
tel = boat.telemetry();
let dh = ((tel.heading - h0 + 540) % 360) - 180;
console.log(`steering left 4 s: heading changed ${dh.toFixed(0)} deg, speed ${tel.kmh.toFixed(0)} km/h, roll ${((tel.roll * 180) / Math.PI).toFixed(1)} deg`);
ok(dh < -40, 'turns left when steering left (heading decreases = anticlockwise)');
ok(Math.abs(tel.roll) < 0.6, 'heels a little but does not capsize in a hard turn');
step({ throttle: 0.6, steer: 0, boost: false, anchor: false }, 60 * 4, 12); // straighten out first (the left turn leaves yaw momentum)
const h1 = boat.telemetry().heading;
step({ throttle: 0.6, steer: -1, boost: false, anchor: false }, 60 * 4, 12);
tel = boat.telemetry();
dh = ((tel.heading - h1 + 540) % 360) - 180;
console.log(`steering right 4 s: heading changed ${dh.toFixed(0)} deg`);
ok(dh > 40, 'turns right when steering right (heading increases = clockwise)');

// ---- 5. braking ----
step({ throttle: 0, steer: 0, boost: false, anchor: true }, 60 * 5, 12);
tel = boat.telemetry();
console.log(`anchor brake 5 s: ${tel.kmh.toFixed(1)} km/h`);
ok(Math.abs(tel.kmh) < 8, 'anchor brake slows the boat down');

// ---- 6. reverse ----
step({ throttle: -1, steer: 0, boost: false, anchor: false }, 60 * 8, 12);
tel = boat.telemetry();
console.log(`reverse 8 s: ${tel.kmh.toFixed(1)} km/h`);
ok(tel.kmh < -3 && tel.kmh > -30, 'reverse moves the boat backwards, slowly (< 30 km/h)');

// ---- 7. runs aground at the shore (drive towards the nearest land) ----
{
  // find a land direction from the boat
  const p = world();
  let bestYaw = 0;
  let bestD = Infinity;
  for (let k = 0; k < 32; k++) {
    const yaw = (k / 32) * Math.PI * 2;
    for (let d = 10; d < 1500; d += 10) {
      gen.sample(p.x + Math.sin(yaw) * d, p.z + Math.cos(yaw) * d, sc);
      if (Number.isNaN(sc.water) || sc.h >= sc.water) { if (d < bestD) { bestD = d; bestYaw = yaw; } break; }
    }
  }
  console.log(`nearest shore ${bestD.toFixed(0)} m away`);
  if (bestD < 1500) {
    const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), bestYaw);
    body.setRotation({ x: q.x, y: q.y, z: q.z, w: q.w }, true);
    body.setAngvel({ x: 0, y: 0, z: 0 }, true);
    body.setLinvel({ x: 0, y: 0, z: 0 }, true);
    let minClear = Infinity;
    let stopped = 0;
    for (let s = 0; s < 60 * 120; s++) {
      step({ throttle: 1, steer: 0, boost: false, anchor: false }, 1, 12);
      const w2 = world();
      gen.sample(w2.x, w2.z, sc);
      minClear = Math.min(minClear, w2.y + BOAT.keelY - sc.h);
      if (boat.telemetry().kmh < 1 && s > 600) stopped++;
      if (stopped > 120) break;
    }
    tel = boat.telemetry();
    console.log(`aground: speed ${tel.kmh.toFixed(1)} km/h, min keel clearance over the bed ${minClear.toFixed(2)} m, aground flag ${tel.aground}, prop in water ${tel.propInWater}`);
    ok(minClear > -0.6, 'the hull never sinks through the shore / bed');
    ok(Math.abs(tel.kmh) < 3, 'comes to a halt at the shore');
  }
}

// ---- 8. self-righting ----
{
  const p = world();
  gen.sample(p.x, p.z, sc);
  body.setRotation({ x: 1, y: 0, z: 0, w: 0 }, true); // upside down
  body.setTranslation({ x: body.translation().x, y: (Number.isNaN(sc.water) ? sc.h : sc.water) + 1.0, z: body.translation().z }, true);
  body.setLinvel({ x: 0, y: 0, z: 0 }, true);
  body.setAngvel({ x: 0, y: 0, z: 0 }, true);
  step(idle, 60 * 12, 12);
  const r = body.rotation();
  const upY = new THREE.Vector3(0, 1, 0).applyQuaternion(new THREE.Quaternion(r.x, r.y, r.z, r.w)).y;
  console.log(`after capsize: up.y = ${upY.toFixed(2)}`);
  ok(upY > 0.5, 'a capsized boat rights itself (or at least no longer lies upside down)');
}

// ---- 9. cost ----
{
  const t0 = performance.now();
  const N = 600;
  for (let i = 0; i < N; i++) boat.fixedUpdate(1 / 60, idle);
  const ms = (performance.now() - t0) / N;
  console.log(`Boat.fixedUpdate: ${ms.toFixed(3)} ms per step`);
  ok(ms < 1.0, 'one boat costs under 1 ms per fixed step');
}

console.log(fails === 0 ? 'ALL OK' : `${fails} FAILED`);
process.exit(fails ? 1 : 0);
