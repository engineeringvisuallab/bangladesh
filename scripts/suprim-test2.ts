// Headless Suprim test 2 (real Rapier): 500 km/h road limit, landing on a raised deck (expressway), rail lock, speed limits in air / water, water drag.
// Run: npx tsx scripts/suprim-test2.ts
import * as THREE from 'three';
import { EventBus, type EngineEvents } from '../src/core/EventBus';
import { PhysicsWorld } from '../src/physics/PhysicsWorld';
import { FloatingOrigin } from '../src/world/FloatingOrigin';
import { Vehicle, type DriveInput } from '../src/vehicles/Vehicle';
import { SUPRIM, SUPRIM_FLIGHT, groundY } from '../src/vehicles/VehicleSpec';

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
// flat ground (y = 0) 40 km long along +X, a raised deck (y = 8, like an expressway on pillars) at x 2000..2400
physics.world.createCollider(R.ColliderDesc.cuboid(20000, 0.5, 400).setTranslation(10000, -0.5, 0).setFriction(1));
physics.world.createCollider(R.ColliderDesc.cuboid(200, 0.5, 20).setTranslation(2200, 7.5, 60).setFriction(1));
// a tiny rail network: one straight edge along +X at z = 200, ballast top at y = 0 - 0.21 so the rail head is at ground level
const N = 400;
const xs = new Float64Array(N), zs = new Float64Array(N).fill(200), design = new Float32Array(N).fill(-0.21);
const cum = new Float64Array(N);
for (let i = 0; i < N; i++) { xs[i] = 100 + i * 20; if (i > 0) cum[i] = cum[i - 1] + 20; }
const rail = { edges: [{ id: 'e1', xs, zs, design, cum, length: cum[N - 1] }] };
let waterX = Infinity;
const terrain = {
  heightAt: () => 0,
  rail,
  roads: { surfaceAt: () => 1 },
  sample: (x: number, _z: number, out: { h: number; water: number; fx: number; fz: number }) => {
    out.h = x > waterX ? -10 : 0;
    out.water = x > waterX ? 0 : NaN;
    out.fx = 0;
    out.fz = 0;
  },
} as never;
const deps = { physics, terrain, origin, scene, bus };
const none: DriveInput = { throttle: false, brake: false, steer: 0, handbrake: false };
const STEP = 1 / 60;
const spec = SUPRIM;
function make(x: number, z: number, y = 0, yaw = Math.PI / 2): Vehicle {
  const v = new Vehicle(deps, spec, new THREE.Vector3(x, y - groundY(spec) + 0.15, z), yaw);
  v.setEnabled(true);
  v.seatDriver('player');
  return v;
}
function run(v: Vehicle, sec: number, inp: Partial<DriveInput> | ((t: number) => Partial<DriveInput>) = {}): void {
  const n = Math.round(sec / STEP);
  for (let i = 0; i < n; i++) {
    const d = typeof inp === 'function' ? inp(i * STEP) : inp;
    v.fixedUpdate(STEP, { ...none, ...d });
    physics.step();
    v.afterStep();
    v.tick(STEP);
  }
}

console.log('--- A. road speed limit 500 km/h ---');
{
  const v = make(-3000 + 3000, 0);
  run(v, 2);
  let top = 0;
  run(v, 70, (t) => { top = Math.max(top, v.telemetry().kmh); return { throttle: true }; });
  console.log(`    top speed ${top.toFixed(0)} km/h, x=${v.body.translation().x.toFixed(0)} upY=${v.upY.toFixed(2)} mode=${v.mode}`);
  ok(top > 380, `reaches a very high road speed (${top.toFixed(0)} km/h)`);
  ok(top <= 502, `never above 500 km/h (${top.toFixed(0)} km/h)`);
  ok(v.state === 'ok', `stays undamaged at speed (hp ${v.hp})`);
  v.dispose();
}

console.log('--- B. landing on a raised deck (expressway) ---');
{
  const v = make(2200, 60, 8, Math.PI / 2);
  run(v, 2);
  ok(v.mode === 'drive', 'standing on the deck in drive mode');
  ok(v.toggleFlight() === null && v.mode === 'fly', 'N -> flight');
  run(v, 4, { up: true });
  const alt = v.telemetry().altitude;
  ok(alt > 14, `climbs off the deck (${alt.toFixed(0)} m)`);
  ok(v.toggleFlight() === null && v.mode === 'land', 'N -> landing');
  run(v, 25);
  ok(v.mode === 'drive', `lands on the DECK and is back in drive mode (mode ${v.mode}, y ${v.body.translation().y.toFixed(1)})`);
  run(v, 1.5);
  const x0 = v.body.translation().x;
  run(v, 4, { throttle: true });
  ok(v.body.translation().x - x0 > 15 && v.wheelsOnGround >= 3, `drives normally on the deck (+${(v.body.translation().x - x0).toFixed(0)} m)`);
  v.dispose();
}

console.log('--- C. rail lock ---');
{
  // car on the right-hand track (z = 200 + 2.25), nose along +X
  const v = make(300, 202.25, 0, Math.PI / 2);
  run(v, 1);
  run(v, 6, { throttle: true });
  ok(v.mode === 'rail', `locks on the rails when driving along them (mode ${v.mode})`);
  const z1 = v.body.translation().z + origin.origin.z;
  run(v, 25, { throttle: true });
  const t = v.body.translation();
  ok(Math.abs(t.z - 202.25) < 0.3, `stays on the track (z ${t.z.toFixed(2)})`);
  ok(v.telemetry().kmh > 150, `accelerates along the rails (${v.telemetry().kmh.toFixed(0)} km/h)`);
  void z1;
  run(v, 0.5, { steer: 1 });
  run(v, 0.5, { steer: 1 });
  ok(v.mode === 'drive', `A held -> leaves the rails (mode ${v.mode})`);
  v.dispose();
  const v2 = make(300, 202.25, 0, Math.PI / 2);
  run(v2, 1);
  run(v2, 4, { throttle: true });
  ok(v2.mode === 'rail', 'locks on again');
  ok(v2.toggleFlight() === null && v2.mode === 'fly', 'N on the rails -> flight (take-off from the track)');
  run(v2, 3, { up: true, throttle: true });
  ok(v2.telemetry().altitude > 10, `rises into the air (${v2.telemetry().altitude.toFixed(0)} m)`);
  v2.dispose();
  // a car crossing the rails at 90 degrees must NOT lock
  const v3 = make(500, 190, 0, 0); // nose +Z, towards the track from the side
  run(v3, 1);
  run(v3, 5, { throttle: true });
  ok(v3.mode === 'drive', 'driving across the rails does not lock');
  v3.dispose();
}

console.log('--- D. aeroplane regime + 500 km/h air limit ---');
{
  const v = make(100, 0, 0, Math.PI / 2);
  run(v, 1);
  v.toggleFlight();
  run(v, 3, { up: true });
  let top = 0;
  run(v, 40, (t) => { top = Math.max(top, v.telemetry().kmh); return { throttle: true, boost: true, up: t < 6 }; });
  const alt = v.telemetry().altitude;
  console.log(`    air top ${top.toFixed(0)} km/h alt ${alt.toFixed(0)} m wings ${v.wingAmt.toFixed(2)}`);
  ok(top > 380, `flies fast like an aeroplane (${top.toFixed(0)} km/h)`);
  ok(top <= 501, `air limit 500 km/h (${top.toFixed(0)} km/h)`);
  v.dispose();
}

console.log('--- E. water: 400 km/h limit, drag, wading ---');
{
  waterX = 3000;
  const v = make(2990, 0, 0, Math.PI / 2);
  run(v, 1);
  v.body.setTranslation({ x: 3100, y: 3, z: 0 }, true);
  v.body.setLinvel({ x: 0, y: 0, z: 0 }, true);
  v.toggleFlight();
  run(v, 1.5);
  v.toggleFlight(); // landing over water
  run(v, 40);
  ok(v.mode === 'float', `lands on the water and floats (mode ${v.mode})`);
  let top = 0;
  run(v, 40, () => { top = Math.max(top, v.telemetry().kmh); return { throttle: true, boost: true }; });
  console.log(`    water top ${top.toFixed(0)} km/h`);
  ok(top > 200, `fast on the water (${top.toFixed(0)} km/h)`);
  ok(top <= 401, `water limit 400 km/h (${top.toFixed(0)} km/h)`);
  v.dispose();
}

console.log(fails ? `\n${fails} FAILED` : '\nALL PASSED');
process.exit(fails ? 1 : 0);
