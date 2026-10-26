// Headless Stage 7 tree-collision test (real Rapier): npx tsx scripts/tree-physics-test.ts
import * as THREE from 'three';
import { EventBus, type EngineEvents } from '../src/core/EventBus';
import { PhysicsWorld } from '../src/physics/PhysicsWorld';
import { FloatingOrigin } from '../src/world/FloatingOrigin';
import { TerrainGenerator } from '../src/terrain/TerrainGenerator';
import { CityPlan } from '../src/city/CityPlan';
import { TreePlacer } from '../src/vegetation/TreePlacement';
import { TreePhysics } from '../src/vegetation/TreePhysics';
import { TREE_KIND_COUNT, TREE_STRIDE } from '../src/vegetation/TreeTypes';
import { Config } from '../src/core/Config';
import { chunkKey, chunkOriginX, chunkOriginZ } from '../src/world/WorldGrid';

let fails = 0;
const ok = (c: boolean, m: string) => {
  console.log((c ? 'PASS ' : 'FAIL ') + m);
  if (!c) fails++;
};

const gen = new TerrainGenerator(Config.world.seed);
const placer = new TreePlacer(gen, new CityPlan(gen.sites), Config.world.seed);

// the chunk with the most trees in the middle of the world
let best = { cx: 10, cz: 10, n: -1, trees: placer.place(10, 10) };
for (let cz = 4; cz < 16; cz++) for (let cx = 4; cx < 16; cx++) {
  const t = placer.place(cx, cz);
  const n = t.reduce((a, d) => a + d.length / TREE_STRIDE, 0);
  if (n > best.n) best = { cx, cz, n, trees: t };
}
console.log(`densest chunk ${best.cx},${best.cz}: ${best.n} trees`);
ok(best.n > 100, 'there is a dense forest chunk to test with');

// flat list of world trees (x, y, z, scale) and an isolated one (no other tree within 8 m) near the chunk centre
const ox = chunkOriginX(best.cx), oz = chunkOriginZ(best.cz);
const all: { x: number; y: number; z: number; s: number; kind: number }[] = [];
for (let k = 0; k < TREE_KIND_COUNT; k++) {
  const d = best.trees[k];
  for (let o = 0; o < d.length; o += TREE_STRIDE) all.push({ x: ox + d[o], y: d[o + 1], z: oz + d[o + 2], s: d[o + 3], kind: k });
}
const isolated = all.filter((a) => all.every((b) => b === a || Math.hypot(a.x - b.x, a.z - b.z) > 8));
const target = (isolated.length ? isolated : all).sort((a, b) => Math.hypot(a.x - ox - 250, a.z - oz - 250) - Math.hypot(b.x - ox - 250, b.z - oz - 250))[0];
console.log(`target tree at ${target.x.toFixed(1)}, ${target.z.toFixed(1)} (kind ${target.kind}, scale ${target.s.toFixed(2)}, isolated ${isolated.length > 0})`);

const bus = new EventBus<EngineEvents>();
const physics = await PhysicsWorld.create(bus);
const root = new THREE.Group();
const origin = new FloatingOrigin(root, bus);
const treePhysics = new TreePhysics(physics, origin, bus);
const key = chunkKey(best.cx, best.cz);
const base = physics.colliderCount;

bus.emit('chunk:loaded', { key, cx: best.cx, cz: best.cz, lod: 0, vertsPerSide: 128, heights: new Float32Array(0), trees: best.trees });

// 1. far away: nothing; near: colliders appear (a few updates, build budget per tick)
treePhysics.update(1, target.x - 400, target.z);
ok(treePhysics.activeBodies === 0 && physics.colliderCount === base, 'player 400 m away: no tree colliders');
let t0 = performance.now();
let ticks = 0;
for (; ticks < 40; ticks++) {
  const before = treePhysics.activeBodies;
  treePhysics.update(0.25, target.x - 4, target.z);
  if (treePhysics.activeBodies === before) break;
}
const buildMs = performance.now() - t0;
ok(treePhysics.activeBodies > 0 && treePhysics.activeColliders > 0, `player near: ${treePhysics.activeBodies} bodies, ${treePhysics.activeColliders} trunk colliders after ${ticks} updates (${buildMs.toFixed(1)} ms total)`);
ok(physics.colliderCount - base === treePhysics.activeColliders, 'collider count in Rapier matches');
physics.step();

// 2. a ray at chest height straight at the trunk hits it, at distance - radius
const R = physics.RAPIER;
const ray = (px: number, py: number, pz: number, dx: number, dz: number, maxT: number) => {
  const len = Math.hypot(dx, dz);
  return physics.world.castRay(new R.Ray({ x: px - origin.origin.x, y: py, z: pz - origin.origin.z }, { x: dx / len, y: 0, z: dz / len }), maxT, true);
};
const dist = 4;
const hit = ray(target.x - dist, target.y + 1, target.z, 1, 0, 10);
const trunkR = { 0: 0.42, 1: 0.35, 2: 0.28, 3: 0.55, 4: 0.42, 5: 0.28 }[target.kind as 0 | 1 | 2 | 3 | 4 | 5]! * target.s;
ok(!!hit && Math.abs(hit.timeOfImpact - (dist - trunkR)) < 0.06, `ray hits the trunk at ${hit ? hit.timeOfImpact.toFixed(2) : 'none'} m (expected ${(dist - trunkR).toFixed(2)})`);
const above = ray(target.x - dist, target.y + 7, target.z, 1, 0, 10);
ok(!above, 'a ray 7 m above the ground passes (only trunks collide, not crowns)');

// 3. the real player controller is blocked by the trunk
{
  const body = physics.world.createRigidBody(R.RigidBodyDesc.kinematicPositionBased().setTranslation(target.x - 3 - origin.origin.x, target.y + 1.0, target.z - origin.origin.z));
  const col = physics.world.createCollider(R.ColliderDesc.capsule(0.55, 0.35), body);
  const ctl = physics.world.createCharacterController(0.02);
  ctl.setApplyImpulsesToDynamicBodies(false);
  physics.step();
  ctl.computeColliderMovement(col, { x: 6, y: 0, z: 0 });
  const mv = ctl.computedMovement();
  ok(mv.x < 6 - 2.0 && mv.x > 0, `character walking 6 m at the tree is stopped after ${mv.x.toFixed(2)} m`);
  physics.world.removeCharacterController(ctl);
  physics.world.removeRigidBody(body);
}

// 4. the floating origin moves: bodies are shifted with it, rays in the new local frame still hit
{
  const cam = new THREE.Object3D();
  cam.position.set(2500, 0, 0);
  origin.update(cam); // origin.x += 2500 -> 'origin:shift' -> PhysicsWorld shifts every body
  ok(origin.origin.x === 2500, 'origin shifted by 2500 m');
  physics.step();
  const h2 = ray(target.x - dist, target.y + 1, target.z, 1, 0, 10);
  ok(!!h2 && Math.abs(h2.timeOfImpact - (dist - trunkR)) < 0.06, 'after the origin shift the trunk is still where it should be');
}

// 5. walking away removes the colliders again (with hysteresis), nothing leaks
treePhysics.update(1, target.x, target.z);
const near = treePhysics.activeBodies;
treePhysics.update(1, target.x + Config.vegetation.collideKeep - 5, target.z);
ok(treePhysics.activeBodies > 0, 'inside the keep distance the colliders stay');
treePhysics.update(1, target.x + 450, target.z + 450);
ok(treePhysics.activeBodies === 0 && treePhysics.activeColliders === 0 && physics.colliderCount === base, `far away: all ${near} bodies removed, no collider left in Rapier`);

// 6. reload (LOD swap) and unload
bus.emit('chunk:loaded', { key, cx: best.cx, cz: best.cz, lod: 1, vertsPerSide: 64, heights: new Float32Array(0), trees: best.trees });
treePhysics.update(1, target.x, target.z);
ok(treePhysics.activeBodies > 0, 'reloaded chunk gets its colliders again');
bus.emit('chunk:unloaded', { key, cx: best.cx, cz: best.cz });
ok(treePhysics.activeBodies === 0 && physics.colliderCount === base, 'unloaded chunk: colliders gone');

// 7. worst case: standing in the middle of the densest forest, all squares within 80 m
treePhysics.dispose();
const tp2 = new TreePhysics(physics, origin, bus);
bus.emit('chunk:loaded', { key, cx: best.cx, cz: best.cz, lod: 0, vertsPerSide: 128, heights: new Float32Array(0), trees: best.trees });
t0 = performance.now();
for (let i = 0; i < 6; i++) tp2.update(0.25, ox + 250, oz + 250);
console.log(`forest centre: ${tp2.activeBodies} bodies, ${tp2.activeColliders} colliders, built in ${(performance.now() - t0).toFixed(1)} ms`);
ok(tp2.activeColliders < 2500, 'collider count near the player stays reasonable (< 2500)');
tp2.dispose();

console.log(fails ? `${fails} FAILED` : 'ALL OK');
process.exit(fails ? 1 : 0);
