// Headless motorbike physics test (real Rapier, flat ground): npx tsx scripts/bike-test.ts
import * as THREE from 'three';
import { EventBus, type EngineEvents } from '../src/core/EventBus';
import { PhysicsWorld } from '../src/physics/PhysicsWorld';
import { FloatingOrigin } from '../src/world/FloatingOrigin';
import { Vehicle, type DriveInput } from '../src/vehicles/Vehicle';
import { SPECS, groundY, type VehicleSpec } from '../src/vehicles/VehicleSpec';

let fails = 0;
const ok = (c: boolean, m: string) => {
  console.log((c ? 'PASS ' : 'FAIL ') + m);
  if (!c) fails++;
};
const bus = new EventBus<EngineEvents>();
const physics = await PhysicsWorld.create(bus);
const R = physics.RAPIER;
const origin = new FloatingOrigin(new THREE.Group(), bus);
const scene = new THREE.Scene();
physics.world.createCollider(R.ColliderDesc.cuboid(4000, 0.5, 4000).setTranslation(0, -0.5, 0).setFriction(1));
const terrain = { heightAt: () => 0, roads: { surfaceAt: () => 1 } } as never;
const deps = { physics, terrain, origin, scene, bus };
const none: DriveInput = { throttle: false, brake: false, steer: 0, handbrake: false };
let slot = 0;
function make(spec: VehicleSpec): Vehicle {
  const v = new Vehicle(deps, spec, new THREE.Vector3(slot++ * 60, -groundY(spec) + 0.15, 0), 0);
  v.setEnabled(true);
  return v;
}
const STEP = 1 / 60;
function run(v: Vehicle, sec: number, inp: Partial<DriveInput> | ((t: number) => Partial<DriveInput>), each?: (t: number) => void): void {
  const n = Math.round(sec / STEP);
  for (let i = 0; i < n; i++) {
    const t = i * STEP;
    const d = typeof inp === 'function' ? inp(t) : inp;
    v.fixedUpdate(STEP, { ...none, ...d });
    physics.step();
    v.afterStep();
    each?.(t);
  }
}
const kmh = (v: Vehicle) => Math.abs(v.forwardSpeed) * 3.6;
function euler(v: Vehicle) {
  const r = v.body.rotation();
  return new THREE.Euler().setFromQuaternion(new THREE.Quaternion(r.x, r.y, r.z, r.w), 'YXZ');
}
function roll(v: Vehicle): number {
  const r = v.body.rotation();
  const q = new THREE.Quaternion(r.x, r.y, r.z, r.w);
  return Math.asin(Math.max(-1, Math.min(1, new THREE.Vector3(1, 0, 0).applyQuaternion(q).y)));
}
const deg = (x: number) => (x * 57.2958).toFixed(1);
const spec = SPECS.bike;

console.log('--- settle ---');
{
  const v = make(spec);
  run(v, 3, {});
  console.log(`upright ${v.upY.toFixed(3)}, wheels on ground ${v.telemetry().wheelsOnGround}, chassis y ${v.body.translation().y.toFixed(3)} (want ${(-groundY(spec)).toFixed(3)})`);
  ok(v.upY > 0.99 && v.telemetry().wheelsOnGround === 2, 'bike stands upright on two wheels');
}

console.log('--- acceleration, wheelie, braking (stoppie) ---');
{
  const v = make(spec);
  let maxPitch = 0;
  let t60 = 0;
  let top = 0;
  run(v, 25, { throttle: true }, (t) => {
    if (!t60 && kmh(v) >= 60) t60 = t;
    top = Math.max(top, kmh(v));
    maxPitch = Math.max(maxPitch, Math.abs(euler(v).x));
  });
  console.log(`0-60 km/h ${t60.toFixed(1)} s, top ${top.toFixed(0)} km/h, max pitch ${deg(maxPitch)} deg (wheelie), upY ${v.upY.toFixed(2)}`);
  ok(v.upY > 0.95 && !v.fallen, 'full throttle: stays up');
  ok(maxPitch < 0.35, 'no big wheelie at full throttle');
  let pitchB = 0;
  const v0 = kmh(v);
  const x0 = v.body.translation().z;
  let tb = 0;
  run(v, 8, () => ({ brake: kmh(v) > 1 }), (t) => {
    pitchB = Math.max(pitchB, Math.abs(euler(v).x));
    if (kmh(v) > 3) tb = t;
  });
  const dist = Math.abs(v.body.translation().z - x0);
  console.log(`braking from ${v0.toFixed(0)} km/h: ${dist.toFixed(0)} m in ${tb.toFixed(1)} s (${(v0 / 3.6 / tb).toFixed(1)} m/s2), max pitch ${deg(pitchB)} deg (stoppie), upY ${v.upY.toFixed(2)}, fallen ${v.fallen}`);
  ok(!v.fallen && pitchB < 0.4, 'hard braking: no flip, no fall');
}

console.log('--- steady circles: lean must match tan(lean) = v^2/(r g) ---');
for (const sp of [4, 8, 12, 16]) {
  const v = make(spec);
  const pts: THREE.Vector3[] = [];
  let maxRoll = 0;
  let avgRoll = 0;
  let nR = 0;
  run(v, 22, (t) => ({ throttle: v.forwardSpeed < sp, brake: v.forwardSpeed > sp + 1, steer: t > 4 ? 0.6 : 0 }), (t) => {
    if (t > 12) {
      const p = v.body.translation();
      pts.push(new THREE.Vector3(p.x, 0, p.z));
      avgRoll += Math.abs(roll(v));
      nR++;
    }
    maxRoll = Math.max(maxRoll, Math.abs(roll(v)));
  });
  avgRoll /= Math.max(1, nR);
  // radius: from mean distance to centroid
  const c = pts.reduce((a, p) => a.add(p), new THREE.Vector3()).multiplyScalar(1 / Math.max(1, pts.length));
  const r = pts.reduce((a, p) => a + p.distanceTo(c), 0) / Math.max(1, pts.length);
  const speed = Math.abs(v.forwardSpeed);
  const theo = Math.atan((speed * speed) / (r * 9.81));
  console.log(`${sp} m/s: radius ${r.toFixed(1)} m, speed ${speed.toFixed(1)} m/s, lean ${deg(avgRoll)} deg (physics says ${deg(theo)}), max ${deg(maxRoll)}, fallen ${v.fallen}`);
  ok(!v.fallen, `circle at ${sp} m/s: no fall`);
  ok(Math.abs(avgRoll - theo) < 0.12, `circle at ${sp} m/s: lean matches the physics`);
}

console.log('--- slalom ---');
{
  const v = make(spec);
  let maxRoll = 0;
  run(v, 20, (t) => ({ throttle: v.forwardSpeed < 14, brake: v.forwardSpeed > 15, steer: t > 4 ? Math.sign(Math.sin((t - 4) * 1.2)) * 0.8 : 0 }), () => {
    maxRoll = Math.max(maxRoll, Math.abs(roll(v)));
  });
  console.log(`slalom at 14 m/s: max lean ${deg(maxRoll)} deg, fallen ${v.fallen}, upY ${v.upY.toFixed(2)}`);
  ok(!v.fallen, 'slalom: no fall');
}

console.log('--- slow speed steering ---');
{
  const v = make(spec);
  run(v, 12, (t) => ({ throttle: v.forwardSpeed < 2, brake: v.forwardSpeed > 2.4, steer: t > 3 ? 1 : 0 }));
  console.log(`2 m/s full lock: upY ${v.upY.toFixed(2)}, fallen ${v.fallen}`);
  ok(!v.fallen && v.upY > 0.9, 'walking-pace full lock: stays up');
}

console.log('--- reverse, stop-and-go, rough start ---');
{
  const v = make(spec);
  run(v, 6, (t) => ({ brake: t > 1 }));
  console.log(`reverse for 5 s: speed ${(v.forwardSpeed * 3.6).toFixed(1)} km/h, upY ${v.upY.toFixed(2)}, fallen ${v.fallen}`);
  ok(!v.fallen && v.upY > 0.95, 'reversing keeps the bike up');
  const w = make(spec);
  run(w, 20, (t) => ({ throttle: Math.sin(t * 0.9) > -0.3, brake: Math.sin(t * 0.9) < -0.3, steer: Math.sin(t * 0.5) * 0.7 }));
  console.log(`stop-and-go with steering: upY ${w.upY.toFixed(2)}, fallen ${w.fallen}`);
  ok(!w.fallen, 'stop-and-go with steering: no fall');
  const h = make(spec);
  let hMax = 0;
  run(h, 14, (t) => ({ throttle: true, steer: t > 6 ? 0.25 : 0 }), () => { hMax = Math.max(hMax, Math.abs(roll(h))); });
  console.log(`top speed (${kmh(h).toFixed(0)} km/h) lane change: max lean ${deg(hMax)} deg, fallen ${h.fallen}`);
  ok(!h.fallen, 'full speed gentle bend: no fall');
}

console.log('--- fall + wreck ---');
{
  physics.world.createCollider(R.ColliderDesc.cuboid(20, 3, 0.5).setTranslation(slot * 60 + 4000, 2, 100));
  const v = new Vehicle(deps, spec, new THREE.Vector3(slot * 60 + 4000, -groundY(spec) + 0.15, 40), 0);
  v.setEnabled(true);
  let ev = '';
  run(v, 12, { throttle: true }, () => {
    for (const e of v.events.splice(0)) ev += ' ' + e.type;
  });
  console.log(`wall at speed: fallen ${v.fallen}, events${ev || ' none'}, upY ${v.upY.toFixed(2)}`);
  ok(v.fallen, 'hitting a wall throws the bike over');
}
console.log(fails ? `\n${fails} FAILED` : '\nall passed');
