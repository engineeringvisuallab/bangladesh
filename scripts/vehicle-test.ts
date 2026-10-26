// Headless vehicle physics test (real Rapier, flat ground): npx tsx scripts/vehicle-test.ts
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
physics.world.createCollider(R.ColliderDesc.cuboid(2000, 0.5, 2000).setTranslation(0, -0.5, 0).setFriction(1));
const terrain = { heightAt: () => 0, roads: { surfaceAt: () => 1 }, sample: (_x: number, _z: number, o: { h: number; water: number; fx: number; fz: number }) => { o.h = 0; o.water = NaN; o.fx = 0; o.fz = 0; } } as never;
const deps = { physics, terrain, origin, scene, bus };

const none: DriveInput = { throttle: false, brake: false, steer: 0, handbrake: false };
function make(spec: VehicleSpec, x = 0, z = 0, yaw = 0): Vehicle {
  const v = new Vehicle(deps, spec, new THREE.Vector3(x, -groundY(spec) + 0.15, z), yaw);
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
const pos = (v: Vehicle) => v.body.translation();
const kmh = (v: Vehicle) => Math.abs(v.forwardSpeed) * 3.6;
function roll(v: Vehicle): number {
  const r = v.body.rotation();
  const q = new THREE.Quaternion(r.x, r.y, r.z, r.w);
  return Math.asin(Math.max(-1, Math.min(1, new THREE.Vector3(1, 0, 0).applyQuaternion(q).y)));
}

console.log('--- settle on flat ground ---');
for (const [id, spec] of Object.entries(SPECS)) {
  const v = make(spec, (Object.keys(SPECS).indexOf(id)) * 40, 0);
  run(v, 2.5, {});
  const y = pos(v).y;
  const want = -groundY(spec);
  console.log(`${id}: chassis height ${y.toFixed(2)} m (expected ~${want.toFixed(2)}), wheels on ground ${v.telemetry().wheelsOnGround}/${spec.wheels?.length ?? 4}, upY ${v.upY.toFixed(2)}`);
  ok(Math.abs(y - want) < 0.12 && v.upY > 0.98, `${id} sits on its wheels (suspension sag as designed), upright`);
}

console.log('--- acceleration / top speed / braking (straight, 60 s) ---');
const targets: Record<string, [number, number]> = { sedan: [100, 220], jeep: [80, 200], hypercar: [255, 290], evhypar: [245, 262], bike: [90, 150], rickshaw: [10, 18], auto: [35, 55], bus: [70, 110], tank: [40, 70] };
let lane = 5;
for (const [id, spec] of Object.entries(SPECS)) {
  const v = make(spec, lane * 60, -1900);
  lane++;
  let t20 = -1;
  run(v, 45, { throttle: true }, (t) => {
    if (t20 < 0 && kmh(v) >= 20) t20 = t;
  });
  const top = kmh(v);
  const x0 = pos(v);
  let braked = 0;
  run(v, 25, () => ({ brake: v.forwardSpeed > 0.8, handbrake: v.forwardSpeed <= 0.8 }), (t) => {
    if (v.forwardSpeed > 0.8) braked = t;
  });
  const x1 = pos(v);
  const dist = Math.hypot(x1.x - x0.x, x1.z - x0.z);
  const decel = top / 3.6 / Math.max(braked, 0.1);
  console.log(`${id}: 0-20 km/h ${t20 < 0 ? 'never' : t20.toFixed(1) + ' s'}, top ${top.toFixed(0)} km/h, braking ${dist.toFixed(0)} m in ${braked.toFixed(1)} s (${decel.toFixed(1)} m/s2), upright ${v.upY.toFixed(2)}, hp ${v.hp.toFixed(0)}`);
  if (!targets[id]) continue; // newer vehicles (hypercar, EV bikes ...) have no speed target yet
  const [lo, hi] = targets[id];
  ok(top >= lo && top <= hi, `${id} top speed in plausible range ${lo}-${hi} km/h`);
  ok(v.upY > 0.95 && !v.fallen && v.hp === 100, `${id} stays upright and undamaged while accelerating and braking`);
  ok(decel > 1.2, `${id} brakes`);
}

console.log('--- cornering ---');
for (const id of ['bike', 'rickshaw', 'auto', 'bus', 'sedan'] as const) {
  const spec = SPECS[id];
  const v = make(spec, 700 + Object.keys(SPECS).indexOf(id) * 80, -300);
  const sp = id === 'rickshaw' ? 3 : id === 'bus' ? 9 : 8;
  let maxRoll = 0;
  run(v, 25, (t) => ({ throttle: v.forwardSpeed < sp, brake: v.forwardSpeed > sp + 1, steer: t > 4 ? 0.6 : 0 }), () => {
    maxRoll = Math.max(maxRoll, Math.abs(roll(v)));
  });
  console.log(`${id}: circle at ${sp} m/s: max roll ${(maxRoll * 57.3).toFixed(0)} deg, upY ${v.upY.toFixed(2)}, fallen ${v.fallen}, speed ${kmh(v).toFixed(0)} km/h`);
  ok(v.upY > 0.7 && !v.fallen, `${id} corners without falling over`);
  if (id === 'bike') ok(maxRoll > 0.05, 'bike leans into the bend');
}

console.log('--- tank skid steering ---');
{
  const v = make(SPECS.tank, 1500, 0);
  run(v, 2, {});
  const q0 = v.body.rotation();
  let yaw0 = new THREE.Euler().setFromQuaternion(new THREE.Quaternion(q0.x, q0.y, q0.z, q0.w), 'YXZ').y;
  run(v, 4, { steer: 1 });
  const q1 = v.body.rotation();
  const yaw1 = new THREE.Euler().setFromQuaternion(new THREE.Quaternion(q1.x, q1.y, q1.z, q1.w), 'YXZ').y;
  const rate = (((yaw1 - yaw0) * 57.3) / 4);
  console.log(`tank pivot turn (steer left): ${rate.toFixed(0)} deg/s over 4 s`);
  ok(rate > 12 && rate < 120, 'tank turns on the spot, left = positive yaw');
  yaw0 = yaw1;
  run(v, 25, (t) => ({ throttle: true, steer: t > 10 ? -0.5 : 0 }));
  console.log(`tank driving + turning right: ${kmh(v).toFixed(0)} km/h, upY ${v.upY.toFixed(2)}`);
  ok(v.upY > 0.9, 'tank stays upright while driving and turning');
}

console.log('--- crash into a wall ---');
{
  physics.world.createCollider(R.ColliderDesc.cuboid(20, 3, 0.5).setTranslation(1850, 2, 100));
  for (const id of ['sedan', 'bus', 'bike', 'tank'] as const) {
    const spec = SPECS[id];
    const gap = id === 'tank' ? 160 : 120;
    const v = make(spec, 1850, 100 - gap, 0);
    let evt = '';
    let hit = false;
    run(v, 30, () => ({ throttle: !hit }), () => {
      if (v.hp < 100 || v.fallen) hit = true;
      for (const e of v.events.splice(0)) evt += ` ${e.type}${'lethal' in e ? '(lethal=' + e.lethal + ')' : ''}`;
    });
    console.log(`${id}: hp ${v.hp.toFixed(0)} state ${v.state} fallen ${v.fallen} events:${evt || ' none'}`);
    if (id === 'sedan') ok(v.hp < 85, 'sedan crashing into a wall at speed is damaged');
    if (id === 'sedan' || id === 'bus') ok(!evt.includes('explode'), `${id}: a crash alone never blows the vehicle up`);
    if (id === 'bike') ok(v.fallen, 'bike falls over when it hits a wall');
    if (id === 'tank') ok(v.hp > 90, 'tank is hardly scratched by a wall');
  }
}

console.log('--- light bump ---');
{
  physics.world.createCollider(R.ColliderDesc.cuboid(20, 3, 0.5).setTranslation(1950, 2, 100));
  const v = make(SPECS.sedan, 1950, 100 - 40, 0);
  run(v, 12, () => ({ throttle: kmh(v) < 14 })); // creeps into the wall at ~14 km/h
  console.log(`sedan light bump: hp ${v.hp.toFixed(0)} state ${v.state}`);
  ok(v.hp === 100 && v.state === 'ok', 'a light bump (~14 km/h) does no damage');
}

console.log('--- bullets ---');
for (const id of ['sedan', 'jeep', 'bus', 'bike', 'rickshaw', 'auto'] as const) {
  const v = make(SPECS[id], -400, -400 - Object.keys(SPECS).indexOf(id) * 30);
  let n = 0;
  while (v.state === 'ok' && n < 100) {
    v.shot(24, true);
    n++;
  }
  console.log(`${id}: burning after ${n} rifle bullets`);
  ok(n >= 27 && n <= 48, `${id} catches fire only after about 30-45 bullets`);
}
{
  const v = make(SPECS.tank, -600, -400);
  for (let i = 0; i < 20; i++) v.shot(24, true);
  ok(v.state === 'ok' && v.hp > 90, 'tank shrugs off rifle bullets');
}

console.log(fails ? `\n${fails} FAILED` : '\nall vehicle tests passed');
process.exit(fails ? 1 : 0);
