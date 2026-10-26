// Headless street test (real Rapier + real roads): mixed traffic (bike, rickshaw, auto, bus...), bus stops, shooting, explosions.
// npx tsx scripts/street-test.ts
import * as THREE from 'three';
import { EventBus, type EngineEvents } from '../src/core/EventBus';
import { PhysicsWorld } from '../src/physics/PhysicsWorld';
import { FloatingOrigin } from '../src/world/FloatingOrigin';
import { TerrainGenerator } from '../src/terrain/TerrainGenerator';
import { TerrainPhysics } from '../src/terrain/TerrainPhysics';
import { buildChunkMeshData } from '../src/terrain/TerrainMeshData';
import { BridgePhysics } from '../src/roads/BridgePhysics';
import { Config } from '../src/core/Config';
import { worldToChunkCoord, chunkKey } from '../src/world/WorldGrid';
import { RoadGraph } from '../src/traffic/RoadGraph';
import { BusStops } from '../src/traffic/BusStops';
import { PeopleManager } from '../src/people/PeopleManager';
import { VehicleManager } from '../src/vehicles/VehicleManager';
import { TrafficManager } from '../src/traffic/TrafficManager';
import { CombatEffects } from '../src/combat/CombatEffects';
import { Explosions } from '../src/combat/Explosions';
import { Wanted } from '../src/combat/Wanted';
import { BUS } from '../src/vehicles/VehicleSpec';

let fails = 0;
const ok = (c: boolean, m: string) => {
  console.log((c ? 'PASS ' : 'FAIL ') + m);
  if (!c) fails++;
};
const gen = new TerrainGenerator(Config.world.seed);
const R = gen.roads;
const graph = new RoadGraph(R);
const bus = new EventBus<EngineEvents>();
const physics = await PhysicsWorld.create(bus);
const scene = new THREE.Scene();
const origin = new FloatingOrigin(new THREE.Group(), bus);
const tp = new TerrainPhysics(physics, origin, bus);
const loaded = new Set<string>();
const ensure = (x: number, z: number) => {
  const { cx, cz } = worldToChunkCoord(x, z);
  for (let dz = -2; dz <= 2; dz++) for (let dx = -2; dx <= 2; dx++) {
    const k = chunkKey(cx + dx, cz + dz);
    if (loaded.has(k)) continue;
    loaded.add(k);
    const m = buildChunkMeshData(gen, cx + dx, cz + dz, 128, 8, 0);
    bus.emit('chunk:loaded', { key: k, cx: cx + dx, cz: cz + dz, lod: 0, vertsPerSide: 128, heights: m.heights });
  }
};
const bp = new BridgePhysics(physics, origin, R.bridges, R.roads);
const stops = new BusStops({ scene, origin, terrain: gen, graph, sites: gen.sites });
console.log('bus stops:', stops.stops.length);
ok(stops.stops.length > 40, 'bus stops exist along the city streets');

// focus: the city stop that is nearest to the spawn point
const st0 = [...stops.stops].sort((a, b) => Math.hypot(a.x, a.z) - Math.hypot(b.x, b.z))[0];
const focus = new THREE.Vector3(st0.x, st0.y, st0.z);
ensure(focus.x, focus.z);
for (let i = 0; i < 40; i++) {
  tp.update(0.2, focus.x, focus.z);
  bp.update(0.2, focus.x, focus.z);
}
const playerPos = focus.clone();
const fakePlayer = {
  active: true, ready: true, inVehicle: false, vel: new THREE.Vector3(),
  getWorldPosition: (o: THREE.Vector3) => o.copy(playerPos), setInVehicle: () => undefined, teleportTo: () => undefined,
};
const noop = () => undefined;
const ejected: unknown[] = [];
const vm = new VehicleManager({
  vehicle: { physics, terrain: gen, origin, scene, bus },
  terrainPhysics: tp,
  input: { isDown: () => false, wasPressed: () => false } as never,
  player: fakePlayer as never,
  orbit: { setTarget: noop } as never,
  hud: { hideMarker: noop, setMarker: noop } as never,
  vehicleHud: { show: noop, hide: noop, update: noop, toggleCurve: noop } as never,
  project: () => null,
  onDriverEjected: (p) => ejected.push(p),
});
const people = new PeopleManager({ scene, terrain: gen, origin, graph, vehicles: vm, player: fakePlayer as never });
const traffic = new TrafficManager({ graph, vehicles: vm, people, player: fakePlayer as never, terrainPhysics: tp, stops });
const effects = new CombatEffects(scene);
const explosions = new Explosions({ scene, origin, terrain: gen, people, vehicles: vm, effects, listener: (o) => o.copy(playerPos) });
vm.setFx(explosions);
vm.setPeople(people);
people.setCombat({ wanted: new Wanted(), effects, audio: { shot: noop, thud: noop } as never, playerWorld: (o) => o.copy(playerPos), playerHit: noop, blocked: () => false });

const kinds = new Map<string, number>();
const seen = new Set<unknown>();
let busStopsServed = 0;
let maxPax = 0;
const T = 150;
for (let i = 0; i < 60 * T; i++) {
  if (i % 2 === 0) {
    traffic.update(1 / 30, focus);
    people.update(1 / 30, focus);
    vm.update(1, focus, 1 / 30);
    explosions.update(1 / 30);
  }
  traffic.fixedUpdate(1 / 60);
  vm.fixedUpdate(1 / 60);
  physics.step();
  vm.afterStep();
  if (i % 120 === 0) {
    ensure(focus.x, focus.z);
    tp.update(0.2, focus.x, focus.z);
    bp.update(0.2, focus.x, focus.z);
  }
  for (const v of vm.vehicles) {
    if (!seen.has(v)) {
      seen.add(v);
      kinds.set(v.spec.id, (kinds.get(v.spec.id) ?? 0) + 1);
    }
    maxPax = Math.max(maxPax, v.passengers.length);
    if (v.ai) busStopsServed = Math.max(busStopsServed, v.ai.served.size);
  }
}
console.log('vehicle kinds seen:', [...kinds.entries()].map(([k, n]) => `${k}:${n}`).join(' '), '| max passengers', maxPax, '| most stops served by one bus', busStopsServed);
ok(kinds.size >= 4, 'traffic has several kinds of vehicle (bike / rickshaw / auto / bus / car)');
ok(maxPax >= 1, 'vehicles carry passengers');
let weird = 0;
for (const v of vm.vehicles) if (v.upY < 0.4 && v.state === 'ok') weird++;
ok(weird === 0, 'no vehicle is lying around by itself');

// ---- shooting a car until it blows up: the people inside die, the wreck stays, parts fly ----
{
  const cars = vm.vehicles.filter((v) => v.ai && v.spec.id === 'sedan' && v.enabled && v.occupants().length > 0);
  const target = cars[0];
  if (!target) ok(false, 'a sedan with people is available for the shooting test');
  else {
    const inside = target.occupants();
    for (let n = 0; n < 12; n++) target.shot(24, true);
    ok(target.state === 'burning', 'a sedan is burning after 10-12 bullets');
    for (let i = 0; i < 60 * 3; i++) {
      vm.update(1, focus, 1 / 60);
      explosions.update(1 / 60);
      traffic.fixedUpdate(1 / 60);
      vm.fixedUpdate(1 / 60);
      physics.step();
      vm.afterStep();
    }
    ok(target.state === 'wrecked', 'it blew up');
    ok(inside.every((p) => p.dead), `everybody inside died (${inside.length})`);
    ok(target.occupants().length === 0, 'their bodies are out of the car');
    const left = target.model.parts.filter((p) => p.obj.parent === target.model.root && p.stage !== 0).length;
    ok(left === 0, 'the car broke apart into flying pieces (only the shell is left)');
  }
}

// ---- a bus full of people hit by a shell-sized blast ----
{
  const spot = vm.vehicles.find((v) => v.enabled && v.spec.id !== 'bus')!;
  spot.physWorld(playerPos);
  const b = vm.spawn(BUS, new THREE.Vector3(playerPos.x, playerPos.y + 4, playerPos.z + 30), 0, people.createPerson());
  for (let i = 0; i < 4; i++) b.seatPassenger(people.createPerson());
  b.setEnabled(true);
  const at = new THREE.Vector3();
  b.physWorld(at);
  const before = people.onFoot.filter((p) => p.dead).length;
  explosions.explode(at, 11, 120, true);
  for (let i = 0; i < 60 * 3; i++) {
    vm.update(1, focus, 1 / 60);
    explosions.update(1 / 60);
    vm.fixedUpdate(1 / 60);
    physics.step();
    vm.afterStep();
  }
  ok(b.hp < 60 || b.state !== 'ok', `a shell-sized blast wrecks a bus (hp ${b.hp.toFixed(0)}, ${b.state})`);
  void before;
}

console.log(fails ? `${fails} FAILED` : 'ALL OK');
process.exit(fails ? 1 : 0);
