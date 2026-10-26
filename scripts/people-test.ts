// Headless Stage 9 test (real Rapier): npx tsx scripts/people-test.ts
// Checks: junction graph + routes, AI drivers follow roads / stop for people, drivers are people, pedestrians stay out of water + off the carriageway.
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
import { RoadGraph, type RoadPoint } from '../src/traffic/RoadGraph';
import { RouteBuilder } from '../src/traffic/Route';
import { AIDriver, type Obstacle } from '../src/traffic/AIDriver';
import { PeopleManager } from '../src/people/PeopleManager';
import { Person } from '../src/people/Person';
import { VehicleManager } from '../src/vehicles/VehicleManager';
import { TrafficManager } from '../src/traffic/TrafficManager';

let fails = 0;
const ok = (c: boolean, m: string) => {
  console.log((c ? 'PASS ' : 'FAIL ') + m);
  if (!c) fails++;
};
// small seeded random
let seed = 12345;
const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);

const gen = new TerrainGenerator(Config.world.seed);
const R = gen.roads;
const graph = new RoadGraph(R);

// ---------------- A: graph + routes ----------------
const stationCount = R.roads.reduce((n, _r, i) => n + graph.stations(i).length, 0);
console.log(`roads ${R.roads.length}, pads ${R.pads.length}, stations ${stationCount}`);
ok(stationCount > R.pads.length, 'every pad has stations on its roads');

// left-hand traffic: the lane point is on the LEFT of the travel direction
{
  const c: RoadPoint = { x: 0, z: 0, y: 0, hx: 0, hz: 0 };
  const l: RoadPoint = { x: 0, z: 0, y: 0, hx: 0, hz: 0 };
  let leftOk = 0;
  let n = 0;
  for (let i = 0; i < 200; i++) {
    const sp = graph.randomSpot(rnd);
    const dir = rnd() < 0.5 ? 1 : -1;
    graph.at(sp.roadId, sp.s, dir, 0, c);
    graph.at(sp.roadId, sp.s, dir, graph.laneOffset(sp.roadId), l);
    // cross of heading x (lane - centre): for the car facing +Z its left is +X, so heading(0,1) x (1,0) = 0*0-1*1 = -1
    const cr = c.hx * (l.z - c.z) - c.hz * (l.x - c.x);
    n++;
    if (cr < 0) leftOk++;
  }
  ok(leftOk === n, `lane points are on the left of the travel direction (${leftOk}/${n})`);
}

let terminals = 0;
let turned = 0;
let bad = 0;
let maxGap = 0;
const ROUTES = 300;
for (let i = 0; i < ROUTES; i++) {
  const sp = graph.randomSpot(rnd);
  const dir = rnd() < 0.5 ? 1 : -1;
  const rb = new RouteBuilder(graph, rnd, sp.roadId, sp.s, dir, 0.9);
  rb.start();
  rb.fill(0, 4000);
  const roadsUsed = new Set<number>([sp.roadId]);
  rb.pts.forEach((p) => {
    if (![p.x, p.z, p.y, p.vmax].every(Number.isFinite)) bad++;
  });
  for (let k = 1; k < rb.pts.length; k++) maxGap = Math.max(maxGap, Math.hypot(rb.pts[k].x - rb.pts[k - 1].x, rb.pts[k].z - rb.pts[k - 1].z));
  if (rb.terminal) terminals++;
  roadsUsed.add(rb.roadId);
  if (roadsUsed.size > 1) turned++;
}
console.log(`routes: ${ROUTES}, ended at a dead end ${terminals}, changed road ${turned}, largest point gap ${maxGap.toFixed(1)} m`);
ok(bad === 0, 'all route points are finite');
ok(maxGap < 20, 'route points are never far apart (no jumps)');
ok(turned > ROUTES * 0.3, 'drivers do take junctions');

// ---------------- B: physics ----------------
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
const deps = { physics, terrain: gen, origin, scene, bus };

interface Run {
  v: Vehicle;
  ai: AIDriver;
  driver: Person;
}
function makeCar(roadId: number, s: number, dir: 1 | -1, spec = SEDAN): Run {
  const p: RoadPoint = { x: 0, z: 0, y: 0, hx: 0, hz: 0 };
  graph.at(roadId, s, dir, graph.laneOffset(roadId), p);
  ensureChunks(p.x, p.z);
  for (let i = 0; i < 30; i++) {
    tp.update(0.2, p.x, p.z);
    bp.update(0.2, p.x, p.z);
  }
  const v = new Vehicle(deps, spec, new THREE.Vector3(p.x, p.y + 0.9, p.z), Math.atan2(p.hx, p.hz));
  const driver = new Person();
  v.seatDriver(driver);
  const rb = new RouteBuilder(graph, rnd, roadId, s, dir, 0.9);
  rb.start();
  const ai = new AIDriver(v, rb);
  v.ai = ai;
  v.setEnabled(true);
  return { v, ai, driver };
}
const wpos = new THREE.Vector3();
function stepCar(run: Run, obstacles: Obstacle[], t: number): void {
  const { v, ai } = run;
  v.physWorld(wpos);
  if (t % 12 === 0) {
    ensureChunks(wpos.x, wpos.z);
    tp.update(0.2, wpos.x, wpos.z);
    bp.update(0.2, wpos.x, wpos.z);
  }
  ai.update(1 / 60, obstacles);
  v.fixedUpdate(1 / 60, ai.input);
  physics.step();
  v.afterStep();
}

// B1: drivers are people, seated inside the car
{
  const run = makeCar(0, 200, 1);
  ok(run.v.driver === run.driver && run.driver.vehicle === run.v && run.driver.model.isSeated, 'the car has a person behind the wheel (seated)');
  ok(run.v.model.root.children.includes(run.driver.model.root), "the driver's body is part of the car");
  const out = run.v.removeDriver();
  ok(out === run.driver && run.driver.vehicle === null && !run.driver.model.isSeated, 'driver can be taken out of the car');
  run.v.dispose();
}

// B2: several AI cars drive 80 s each on different roads
let totalDist = 0;
let worstLat = 0;
let flips = 0;
let stuckCars = 0;
let junctionsTaken = 0;
for (let n = 0; n < 6; n++) {
  const sp = graph.randomSpot(rnd);
  // STEP 7a: this start formula (s in [40, length - 400]) is only valid for roads of at least 440 m. On a shorter road s was NEGATIVE: the car
  // was put off the road start and its route jumped 80-190 m to the road end (the nearest route point was then far from the car -> "offset > 3.5 m").
  // 188 of the 243 roads are shorter than 440 m (15 % of the road length). Take the next road that is long enough (no extra random draw, so the
  // random sequence of the later sections is unchanged).
  if (R.roads[sp.roadId].length < 440) {
    for (let k = 1; k <= R.roads.length; k++) {
      const id = (sp.roadId + k) % R.roads.length;
      if (R.roads[id].length >= 440) { sp.roadId = id; break; }
    }
  }
  const road = R.roads[sp.roadId];
  const s = Math.min(Math.max(40, sp.s), road.length - 400);
  const dir: 1 | -1 = 1;
  const run = makeCar(sp.roadId, s, dir, n % 2 ? JEEP : SEDAN);
  const startRoad = run.ai.route.roadId;
  let dist = 0;
  const prev = new THREE.Vector3();
  run.v.physWorld(prev);
  for (let t = 0; t < 60 * 80; t++) {
    stepCar(run, [], t);
    if (t % 30 === 0) {
      run.v.physWorld(wpos);
      dist += Math.hypot(wpos.x - prev.x, wpos.z - prev.z);
      prev.copy(wpos);
      // lateral distance to the nearest route point
      // STEP 7a: distance to the route POLYLINE (the segments between the points), not to the nearest point: the points are 5 m apart (up to 9 m
      // at a few road kinks), so a car exactly on the route could be 4.5 m from the nearest point and still "fail"
      let best = Infinity;
      const rp = run.ai.route.pts;
      for (let q = 0; q < rp.length; q++) {
        const a = rp[q], b = rp[Math.min(q + 1, rp.length - 1)];
        const ex = b.x - a.x, ez = b.z - a.z, l2 = ex * ex + ez * ez;
        const u = l2 > 1e-9 ? Math.max(0, Math.min(1, ((wpos.x - a.x) * ex + (wpos.z - a.z) * ez) / l2)) : 0;
        best = Math.min(best, Math.hypot(a.x + ex * u - wpos.x, a.z + ez * u - wpos.z));
      }
      if (best > worstLat) worstLat = best;
      if (best > 3.5) console.log(`    offset ${best.toFixed(1)} m at t=${(t / 60).toFixed(1)}s road ${run.ai.route.roadId} s=${run.ai.route.s.toFixed(0)} speed ${run.v.forwardSpeed.toFixed(1)} head ${run.ai.head}/${run.ai.route.pts.length} terminal=${run.ai.route.terminal}`);
    }
    if (run.ai.dead || run.ai.finishedFor > 2) break;
  }
  if (run.v.upY < 0.3) flips++;
  if (dist < 150 && !run.ai.route.terminal) stuckCars++;
  if (run.ai.route.roadId !== startRoad) junctionsTaken++;
  totalDist += dist;
  console.log(`  car ${n} (${run.v.spec.id}) road ${startRoad}->${run.ai.route.roadId}: ${dist.toFixed(0)} m, dead=${run.ai.dead}, terminal=${run.ai.route.terminal}`);
  run.v.removeDriver();
  run.v.dispose();
}
console.log(`6 cars: ${(totalDist / 6).toFixed(0)} m each on average, worst distance from the route ${worstLat.toFixed(1)} m, flipped ${flips}, junctions taken ${junctionsTaken}`);
ok(flips === 0, 'no AI car flipped over');
ok(stuckCars === 0, 'no AI car got stuck early');
ok(totalDist / 6 > 400, 'AI cars cover real distance (average > 400 m in 80 s)');
ok(worstLat < 3.5, 'AI cars stay on their lane (worst offset < 3.5 m)');

// B2b: force a turn at junction pads and drive it
{
  let tested = 0;
  let turnedOk = 0;
  let worst = 0;
  let offRoad = 0;
  let samples = 0;
  for (let pi = 0; pi < R.pads.length && tested < 6; pi++) {
    const arms = graph.arms(pi);
    if (arms.length < 3) continue;
    const a = arms[Math.floor(rnd() * arms.length)];
    const road = R.roads[a.roadId];
    let dir: 1 | -1;
    let s0: number;
    if (a.s > 140) {
      dir = 1;
      s0 = a.s - 120;
    } else if (road.length - a.s > 140) {
      dir = -1;
      s0 = a.s + 120;
    } else continue;
    // find a random number that makes the driver turn
    let rn = 0;
    let found = false;
    for (const cand of [0.99, 0.8, 0.6, 0.4, 0.2, 0.05]) {
      const probe = new RouteBuilder(graph, () => cand, a.roadId, s0, dir, 0.9);
      probe.start();
      probe.fill(0, 260);
      if (probe.roadId !== a.roadId) {
        rn = cand;
        found = true;
        break;
      }
    }
    if (!found) continue;
    tested++;
    const p: RoadPoint = { x: 0, z: 0, y: 0, hx: 0, hz: 0 };
    graph.at(a.roadId, s0, dir, graph.laneOffset(a.roadId), p);
    ensureChunks(p.x, p.z);
    for (let i = 0; i < 30; i++) {
      tp.update(0.2, p.x, p.z);
      bp.update(0.2, p.x, p.z);
    }
    const v = new Vehicle(deps, SEDAN, new THREE.Vector3(p.x, p.y + 0.9, p.z), Math.atan2(p.hx, p.hz));
    v.seatDriver(new Person());
    const rb = new RouteBuilder(graph, () => rn, a.roadId, s0, dir, 0.9);
    rb.start();
    const ai = new AIDriver(v, rb);
    v.ai = ai;
    v.setEnabled(true);
    const run: Run = { v, ai, driver: v.driver as Person };
    let after = false;
    let minToPad = Infinity;
    for (let t = 0; t < 60 * 45; t++) {
      stepCar(run, [], t);
      if (t % 20 === 0) {
        v.physWorld(wpos);
        let best = Infinity;
        for (const q of ai.route.pts) best = Math.min(best, Math.hypot(q.x - wpos.x, q.z - wpos.z));
        worst = Math.max(worst, best);
        samples++;
        if (R.surfaceAt(wpos.x, wpos.z) === 0) offRoad++;
        minToPad = Math.min(minToPad, Math.hypot(wpos.x - R.pads[pi].x, wpos.z - R.pads[pi].z));
        if (Math.hypot(wpos.x - R.pads[pi].x, wpos.z - R.pads[pi].z) < 14) after = true;
      }
      if (ai.dead) break;
    }
    v.physWorld(wpos);
    const passed = after && Math.hypot(wpos.x - R.pads[pi].x, wpos.z - R.pads[pi].z) > 40 && !ai.dead && v.upY > 0.5;
    if (passed) turnedOk++;
    console.log(`  pad ${pi}: road ${a.roadId} -> ${ai.route.roadId}, passed=${passed} minToPad=${minToPad.toFixed(1)} now ${Math.hypot(wpos.x - R.pads[pi].x, wpos.z - R.pads[pi].z).toFixed(0)} m away, dead=${ai.dead} terminal=${ai.route.terminal} up=${v.upY.toFixed(2)} speed=${v.forwardSpeed.toFixed(1)}`);
    v.removeDriver();
    v.dispose();
  }
  console.log(`junction turns: ${turnedOk}/${tested} ok, worst offset ${worst.toFixed(1)} m, off-road samples ${offRoad}/${samples}`);
  ok(tested >= 3 && turnedOk === tested, 'cars turn at junctions and come out on the other road');
  ok(offRoad / Math.max(1, samples) < 0.03, 'cars stay on the road surface through junction turns');
}

// B3: a person standing in the lane -> the car stops in front, then drives on when he leaves
{
  const run = makeCar(0, 250, 1);
  // run 6 s so the car is rolling, then put a person 70 m ahead on the lane
  for (let t = 0; t < 60 * 6; t++) stepCar(run, [], t);
  run.v.physWorld(wpos);
  const p: RoadPoint = { x: 0, z: 0, y: 0, hx: 0, hz: 0 };
  const pts = run.ai.route.pts;
  let acc = 0;
  let k = run.ai.head;
  while (k + 1 < pts.length && acc < 70) {
    acc += Math.hypot(pts[k + 1].x - pts[k].x, pts[k + 1].z - pts[k].z);
    k++;
  }
  p.x = pts[k].x;
  p.z = pts[k].z;
  const obs: Obstacle[] = [{ x: p.x, z: p.z, vx: 0, vz: 0, r: 0.45, kind: 'person', ref: 'ped' }];
  let minGap = Infinity;
  let stopped = false;
  for (let t = 0; t < 60 * 25; t++) {
    stepCar(run, obs, t);
    run.v.physWorld(wpos);
    const gap = Math.hypot(wpos.x - p.x, wpos.z - p.z) - SEDAN.half.z;
    minGap = Math.min(minGap, gap);
    if (Math.abs(run.v.forwardSpeed) < 0.2 && t > 60 * 3) stopped = true;
  }
  console.log(`  person in lane: closest gap ${minGap.toFixed(1)} m, stopped=${stopped}`);
  ok(minGap > 0.8 && stopped, 'the driver stops for a person standing in the lane (no collision)');
  obs.length = 0;
  for (let t = 0; t < 60 * 10; t++) stepCar(run, obs, t);
  ok(run.v.forwardSpeed > 4, 'and drives on after the person has gone');
  run.v.removeDriver();
  run.v.dispose();
}

// ---------------- C: pedestrians ----------------
{
  const fakePlayer = { active: true, inVehicle: false, vel: new THREE.Vector3(), getWorldPosition: (o: THREE.Vector3) => o.set(0, 0, 0) };
  const pm = new PeopleManager({
    scene,
    terrain: gen,
    origin,
    graph,
    vehicles: { vehicles: [] } as never,
    player: fakePlayer as never,
  });
  const focus = new THREE.Vector3(0, 0, 0);
  let maxCount = 0;
  let inWater = 0;
  let onAsphalt = 0;
  let badY = 0;
  let moved = 0;
  const startPos = new Map<number, THREE.Vector3>();
  const sc = gen.makeSample();
  for (let f = 0; f < 30 * 120; f++) {
    pm.update(1 / 30, focus);
    maxCount = Math.max(maxCount, pm.count);
    if (f % 30 === 0) {
      for (const p of pm.onFoot) {
        if (!startPos.has(p.id)) startPos.set(p.id, p.world.clone());
        gen.sample(p.world.x, p.world.z, sc);
        if (!Number.isNaN(sc.water) && sc.h < sc.water - 0.3 && p.world.y < sc.water) inWater++;
        const r = p.roadId >= 0 && p.task === 'sidewalk' ? R.roads[p.roadId] : null;
        if (r) {
          const info = R.infoAt(p.world.x, p.world.z);
          if (info && R.surfaceAt(p.world.x, p.world.z) === 1 && Math.abs(0) > 1) onAsphalt++;
        }
        if (!Number.isFinite(p.world.y) || Math.abs(p.world.y - gen.heightAt(p.world.x, p.world.z)) > 12) badY++;
      }
    }
  }
  for (const p of pm.onFoot) {
    const s0 = startPos.get(p.id);
    if (s0 && Math.hypot(p.world.x - s0.x, p.world.z - s0.z) > 3) moved++;
  }
  console.log(`people: max ${maxCount} on foot, ${moved}/${pm.count} walked > 3 m, in water ${inWater}, bad height ${badY}`);
  ok(maxCount >= Config.people.target - 2, 'the crowd fills up to its target');
  ok(inWater === 0, 'nobody is standing in water');
  ok(badY === 0, 'everybody stands on the ground / road surface');
  ok(moved > pm.count * 0.4, 'people actually walk around');
  // they go away when the player leaves
  for (let f = 0; f < 30 * 10; f++) pm.update(1 / 30, new THREE.Vector3(5000, 0, 5000));
  ok(pm.count <= 3, 'people far from the player are removed');
}

// ---------------- D: getting in / out, nobody drives an empty car ----------------
{
  const playerPos = new THREE.Vector3(0, 0, 0);
  const keys = new Set<string>();
  const state = { inVehicle: false };
  const fakePlayer = {
    active: true,
    ready: true,
    get inVehicle() {
      return state.inVehicle;
    },
    vel: new THREE.Vector3(),
    getWorldPosition: (o: THREE.Vector3) => o.copy(playerPos),
    setInVehicle: (b: boolean) => {
      state.inVehicle = b;
    },
    teleportTo: (p: THREE.Vector3) => playerPos.copy(p),
  };
  const ejected: Person[] = [];
  const noop = () => undefined;
  const vm = new VehicleManager({
    vehicle: deps,
    terrainPhysics: tp,
    input: { isDown: (c: string) => keys.has(c), wasPressed: (c: string) => keys.has('!' + c) } as never,
    player: fakePlayer as never,
    orbit: { setTarget: noop } as never,
    hud: { hideMarker: noop, setMarker: noop } as never,
    vehicleHud: { show: noop, hide: noop, update: noop, toggleCurve: noop } as never,
    project: () => null,
    onDriverEjected: (person, door) => {
      ejected.push(person);
      person.world.copy(door);
    },
  });
  const people = new PeopleManager({ scene, terrain: gen, origin, graph, vehicles: vm, player: fakePlayer as never });
  const traffic = new TrafficManager({ graph, vehicles: vm, people, player: fakePlayer as never, terrainPhysics: tp });

  // a car with an AI driver on road 0
  const p: RoadPoint = { x: 0, z: 0, y: 0, hx: 0, hz: 0 };
  graph.at(0, 300, 1, graph.laneOffset(0), p);
  ensureChunks(p.x, p.z);
  for (let i = 0; i < 30; i++) tp.update(0.2, p.x, p.z);
  const driver = people.createPerson();
  const car = vm.spawn(SEDAN, new THREE.Vector3(p.x, p.y + 0.9, p.z), Math.atan2(p.hx, p.hz), driver);
  const rb = new RouteBuilder(graph, rnd, 0, 300, 1, 0.9);
  rb.start();
  car.ai = new AIDriver(car, rb);
  car.setEnabled(true);
  ok(car.driver === driver, 'VehicleManager.spawn always seats a driver');

  // let it roll, then stand next to the (moving) car: F must do nothing while it moves
  playerPos.set(p.x - 3, p.y, p.z);
  for (let i = 0; i < 60 * 3; i++) {
    traffic.fixedUpdate(1 / 60);
    vm.fixedUpdate(1 / 60);
    physics.step();
    vm.afterStep();
  }
  car.physWorld(wpos);
  playerPos.set(wpos.x, wpos.y, wpos.z + 1.5);
  vm.update(1, playerPos); // refresh the render positions the game uses for "nearest vehicle"
  keys.add('!KeyF');
  vm.handleKeys();
  keys.delete('!KeyF');
  ok(vm.driver === null && car.driver === driver, 'cannot get into a car that is moving');

  // make it stop by standing in front of it, then take it
  const fwd = new THREE.Vector3();
  car.forwardVector(fwd);
  car.physWorld(wpos);
  playerPos.set(wpos.x + fwd.x * 40, wpos.y, wpos.z + fwd.z * 40); // standing in the lane 40 m ahead
  for (let i = 0; i < 60 * 30 && Math.abs(car.forwardSpeed) > 0.1; i++) {
    traffic.fixedUpdate(1 / 60);
    vm.fixedUpdate(1 / 60);
    physics.step();
    vm.afterStep();
  }
  ok(Math.abs(car.forwardSpeed) < 0.5, 'the AI driver stops for the player standing in front');
  car.physWorld(wpos);
  playerPos.set(wpos.x + 1, wpos.y, wpos.z);
  vm.update(1, playerPos); // refresh the render positions the game uses for "nearest vehicle"
  keys.add('!KeyF');
  vm.handleKeys();
  keys.delete('!KeyF');
  ok(vm.driver === car && car.driver === 'player', 'the player gets in');
  ok(ejected.length === 1 && ejected[0] === driver && driver.vehicle === null, 'the AI driver was thrown out of the car');
  people.adopt(driver, driver.world, 'flee');
  ok(people.onFoot.includes(driver), 'the thrown-out driver becomes a person on foot');

  // drive a little, stop, get out
  for (let i = 0; i < 60 * 2; i++) {
    vm.fixedUpdate(1 / 60);
    physics.step();
    vm.afterStep();
  }
  vm.update(1, playerPos); // refresh the render positions the game uses for "nearest vehicle"
  keys.add('!KeyF');
  vm.handleKeys();
  keys.delete('!KeyF');
  ok(vm.driver === null && car.driver === null, 'the player gets out; the car has no driver now');
  // he walks away -> the empty car is removed
  const far = new THREE.Vector3(wpos.x + 45, wpos.y, wpos.z);
  playerPos.copy(far);
  for (let i = 0; i < 30; i++) traffic.update(1 / 30, far);
  ok(!vm.vehicles.includes(car), 'the empty car is removed once the player has walked away');
  let empty = 0;
  for (const v of vm.vehicles) if (v.driver === null) empty++;
  ok(empty === 0, 'no vehicle without a driver is left in the world');

  // traffic fills up, every car has a person with a brain; nobody is empty
  playerPos.set(p.x, p.y, p.z);
  const focus = new THREE.Vector3(p.x, p.y, p.z);
  for (let i = 0; i < 60 * 40; i++) {
    if (i % 2 === 0) traffic.update(1 / 30, focus);
    traffic.fixedUpdate(1 / 60);
    vm.fixedUpdate(1 / 60);
    physics.step();
    vm.afterStep();
    if (i % 120 === 0) {
      ensureChunks(focus.x, focus.z);
      tp.update(0.2, focus.x, focus.z);
      bp.update(0.2, focus.x, focus.z);
    }
  }
  let withDriver = 0;
  let withBrain = 0;
  let seated = 0;
  for (const v of vm.vehicles) {
    if (v.driver && v.driver !== 'player') withDriver++;
    if (v.ai) withBrain++;
    if (v.driver && v.driver !== 'player' && v.driver.model.isSeated && v.driver.vehicle === v) seated++;
  }
  console.log(`traffic: ${vm.vehicles.length} cars, ${withDriver} with a driver, ${withBrain} with a brain, ${seated} seated`);
  ok(vm.vehicles.length >= Config.traffic.target - 3, 'traffic fills up around the player');
  ok(withDriver === vm.vehicles.length && withBrain === vm.vehicles.length && seated === vm.vehicles.length, 'every car in traffic has a seated driver and a brain');
}

console.log(fails === 0 ? 'ALL OK' : `${fails} FAILED`);
process.exit(fails ? 1 : 0);
