// Headless EVCity Suprim test (real Rapier): drive -> fly -> land -> drive into a lake -> float -> dive -> surface -> shore.
// Run: npx tsx scripts/suprim-test.ts
import * as THREE from 'three';
import { EventBus, type EngineEvents } from '../src/core/EventBus';
import { PhysicsWorld } from '../src/physics/PhysicsWorld';
import { FloatingOrigin } from '../src/world/FloatingOrigin';
import { Vehicle, type DriveInput } from '../src/vehicles/Vehicle';
import { SUPRIM, groundY } from '../src/vehicles/VehicleSpec';

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
// land: x < 300 (height 0); lake bed: x >= 300 (height -10, water level 0); shore ramp is not modelled (a step), the test drives over it in the air / floats in
// land x < 560, a 40 m shore ramp down to the lake bed (-10 m) at x = 600, lake bed beyond
physics.world.createCollider(R.ColliderDesc.cuboid(1000, 0.5, 2000).setTranslation(-440, -0.5, 0).setFriction(1));
physics.world.createCollider(R.ColliderDesc.cuboid(1500, 0.5, 2000).setTranslation(2100, -10.5, 0).setFriction(1));
const RAMP = Math.atan2(10, 40);
physics.world.createCollider(
  R.ColliderDesc.cuboid(Math.hypot(40, 10) / 2 + 0.3, 0.5, 2000)
    .setTranslation(580, -5 - 0.5 * Math.cos(RAMP), 0)
    .setRotation(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), -RAMP))
    .setFriction(1),
);
const LAKE_X = 560;
const hAt = (x: number) => (x >= 600 ? -10 : x <= 560 ? 0 : -((x - 560) / 40) * 10);
const terrain = {
  heightAt: (x: number) => hAt(x),
  roads: { surfaceAt: () => 1 },
  sample: (x: number, _z: number, out: { h: number; water: number; fx: number; fz: number }) => {
    out.h = hAt(x);
    out.water = x > LAKE_X ? 0 : NaN;
    out.fx = 0;
    out.fz = 0;
  },
} as never;
const deps = { physics, terrain, origin, scene, bus };
const none: DriveInput = { throttle: false, brake: false, steer: 0, handbrake: false };
const STEP = 1 / 60;
const spec = SUPRIM;
const v = new Vehicle(deps, spec, new THREE.Vector3(0, -groundY(spec) + 0.15, 0), Math.PI / 2); // faces +X (towards the lake)
v.setEnabled(true);
v.seatDriver('player');
function run(sec: number, inp: Partial<DriveInput> | ((t: number) => Partial<DriveInput>) = {}): void {
  const n = Math.round(sec / STEP);
  for (let i = 0; i < n; i++) {
    const d = typeof inp === 'function' ? inp(i * STEP) : inp;
    v.fixedUpdate(STEP, { ...none, ...d });
    physics.step();
    v.afterStep();
    v.tick(STEP);
  }
}
const p = () => v.body.translation();
const feet = () => p().y + groundY(spec);
const tel = () => v.telemetry();
const heading = () => { v.forwardVector(new THREE.Vector3()); const f = v.forwardVector(new THREE.Vector3()); return Math.atan2(f.x, f.z); };

console.log('--- 1. drive ---');
run(2.5);
ok(v.mode === 'drive' && v.upY > 0.98, 'starts in drive mode, upright on its wheels');
run(2.5, { throttle: true });
ok(p().x > 15 && tel().kmh > 25, `drives on the road (x=${p().x.toFixed(0)} m, ${tel().kmh.toFixed(0)} km/h)`);
run(5, { brake: true }); // (holding the brake after the stop would reverse, like every car in the game)
ok(tel().kmh < 30, `brakes hard (${tel().kmh.toFixed(1)} km/h, x=${p().x.toFixed(0)})`);

console.log('--- 2. flight mode ---');
v.body.setLinvel({ x: 0, y: 0, z: 0 }, true);
ok(v.toggleFlight() === null && v.mode === 'fly', 'N -> flight mode');
const x0 = p().x;
run(3, { throttle: true });
ok(Math.abs(p().x - x0) < 1 && tel().altitude < 0.6, `W on the ground in flight mode does nothing (moved ${(p().x - x0).toFixed(2)} m, alt ${tel().altitude.toFixed(2)})`);
run(0.01);
ok(v.wingAmt > 0.9, `wings are out (${v.wingAmt.toFixed(2)})`);
run(4, { up: true });
ok(tel().altitude > 25, `Space climbs (altitude ${tel().altitude.toFixed(1)} m)`);
const a1 = tel().altitude;
run(2);
ok(Math.abs(tel().altitude - a1) < 12, `holds height after Space is released (drone inertia) (${tel().altitude.toFixed(1)} m)`);
const xs = p().x;
run(4, { throttle: true });
ok(p().x - xs > 40 && tel().kmh > 90, `W flies forward (drone: the craft has to tilt first) (+${(p().x - xs).toFixed(0)} m, ${tel().kmh.toFixed(0)} km/h)`);
const h0 = heading();
run(2, { steer: 1 });
let dh = heading() - h0;
while (dh > Math.PI) dh -= 2 * Math.PI;
while (dh < -Math.PI) dh += 2 * Math.PI;
ok(dh < -0.5 || dh > 0.5, `A turns (heading changed ${(dh * 57.3).toFixed(0)} deg)`);
run(6, { throttle: true }); // no Shift: W alone must reach full speed
ok(tel().kmh > 300, `W alone (no Shift) reaches high speed (${tel().kmh.toFixed(0)} km/h)`);
{
  const tp = (v as unknown as { tiltP: number }).tiltP, tr = (v as unknown as { tiltR: number }).tiltR;
  ok(Math.abs(tp) < 0.02 && Math.abs(tr) < 0.02, `body stays level in the air (pitch ${tp.toFixed(3)}, roll ${tr.toFixed(3)})`);
}
run(3, { throttle: true, boost: true });
ok(tel().kmh > 140, `Shift boosts (${tel().kmh.toFixed(0)} km/h)`);
run(3, { throttle: true, slow: true });
ok(tel().kmh < 120, `Ctrl slows (${tel().kmh.toFixed(0)} km/h)`);
console.log('    position', p().x.toFixed(0), p().z.toFixed(0));

console.log('--- 3. land (N) ---');
v.body.setTranslation({ x: 100, y: p().y, z: 0 }, true); // keep the landing on dry land
ok(v.toggleFlight() === null && v.mode === 'land', 'N again -> landing');
for (let i = 0; i < 60 * 25 && v.mode === 'land'; i++) run(STEP);
ok(v.mode === 'drive', `lands and is back in drive mode (alt ${tel().altitude.toFixed(2)} m)`);
run(3);
ok(v.upY > 0.98 && Math.abs(feet()) < 0.25 && tel().wheelsOnGround >= 3, `stands on its wheels after landing (feet ${feet().toFixed(2)} m, wheels ${tel().wheelsOnGround}/4, upY ${v.upY.toFixed(2)})`);
ok(v.hp > 95, `landing is not a crash (hp ${v.hp.toFixed(0)})`);
// aim at the lake again: face +X
v.body.setTranslation({ x: 450, y: -groundY(spec) + 0.15, z: 0 }, true);
v.body.setRotation(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI / 2), true);
v.body.setLinvel({ x: 0, y: 0, z: 0 }, true);
run(2);

console.log('--- 4. water ---');
// take off from the road, fly over the lake, then come down on the water
v.toggleFlight();
run(4, { up: true });
run(14, { throttle: true, boost: true });
ok(p().x > LAKE_X + 20, `flew over the lake (x=${p().x.toFixed(0)})`);
run(1, { slow: true });
v.toggleFlight(); // land on the water
for (let i = 0; i < 60 * 40 && v.mode === 'land'; i++) run(STEP);
ok(v.mode === 'float', `landing over deep water -> float (mode ${v.mode})`);
run(3);
ok(Math.abs(p().y - (0 - 0.28 - ((spec.colliderY ?? 0) - spec.half.y))) < 1.3, // the hull rides the real sea swell
   `floats at the surface (centre y ${p().y.toFixed(2)})`);
const xf = p().x;
run(4, { throttle: true });
ok(Math.abs(p().x - xf) > 25 && tel().kmh > 40, `W moves on the water (${tel().kmh.toFixed(0)} km/h)`);
ok(v.toggleDive() === null && v.mode === 'dive', 'C -> dive (submarine)');
run(8);
ok(tel().depth > 3.5 && tel().depth < 7.5, `holds a cruising depth (${tel().depth.toFixed(1)} m)`);
run(3, { throttle: true });
ok(tel().kmh > 25 && v.mode === 'dive', `W moves under water (${tel().kmh.toFixed(0)} km/h)`);
run(6, { down: true });
ok(tel().depth > 7 && p().y + ((spec.colliderY ?? 0) - spec.half.y) > -10 + 0.5, `X dives deeper (${tel().depth.toFixed(1)} m) but not into the sea floor`);
run(10, { down: true });
ok(p().y + ((spec.colliderY ?? 0) - spec.half.y) > -10 + 0.8, 'keeps clear of the sea floor (10 m deep lake)');
run(4, { up: true });
ok(tel().depth < 6.5, `Space comes up (${tel().depth.toFixed(1)} m)`);
v.toggleDive(); // surface
run(8);
ok(v.mode === 'float', `C again -> surfaces and floats (mode ${v.mode})`);
v.toggleDive();
run(3);
v.requestFloat(); // T
run(8);
ok(v.mode === 'float', 'T -> back on the surface');
console.log('--- 5. back to shore ---');
v.body.setRotation(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), -Math.PI / 2), true); // face -X
v.body.setTranslation({ x: LAKE_X + 150, y: p().y, z: 0 }, true);
for (let i = 0; i < 60 * 40 && v.mode === 'float'; i++) run(STEP, { throttle: true });
console.log(`    x=${p().x.toFixed(0)} mode=${v.mode}`);
ok(v.mode === 'drive' && p().x < LAKE_X + 45, 'reaches the shore -> wheels take over (drive mode)');
run(4);
ok(v.upY > 0.95 && tel().wheelsOnGround >= 3, `stands on its wheels again (wheels ${tel().wheelsOnGround}/4)`);
console.log(fails === 0 ? '\nALL PASSED' : `\n${fails} FAILED`);
process.exit(fails === 0 ? 0 : 1);
