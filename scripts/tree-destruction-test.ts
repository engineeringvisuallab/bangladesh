// Headless felled-trees test (real Rapier + real tree data): npx tsx scripts/tree-destruction-test.ts
import * as THREE from 'three';
import { EventBus, type EngineEvents } from '../src/core/EventBus';
import { PhysicsWorld } from '../src/physics/PhysicsWorld';
import { FloatingOrigin } from '../src/world/FloatingOrigin';
import { TerrainGenerator } from '../src/terrain/TerrainGenerator';
import { CityPlan } from '../src/city/CityPlan';
import { TreePlacer } from '../src/vegetation/TreePlacement';
import { TreePhysics } from '../src/vegetation/TreePhysics';
import { TreeAssets } from '../src/vegetation/TreeAssets';
import { RockAssets } from '../src/vegetation/RockAssets';
import { TreeChunkBuilder } from '../src/vegetation/TreeChunkBuilder';
import { TreeDestruction } from '../src/vegetation/TreeDestruction';
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
let best = { cx: 10, cz: 10, n: -1, trees: placer.place(10, 10) };
for (let cz = 4; cz < 16; cz++) for (let cx = 4; cx < 16; cx++) {
  const t = placer.place(cx, cz);
  const n = t.reduce((a, d) => a + d.length / TREE_STRIDE, 0);
  if (n > best.n) best = { cx, cz, n, trees: t };
}
const ox = chunkOriginX(best.cx), oz = chunkOriginZ(best.cz);
const key = chunkKey(best.cx, best.cz);

const bus = new EventBus<EngineEvents>();
const physics = await PhysicsWorld.create(bus);
const origin = new FloatingOrigin(new THREE.Group(), bus);
const scene = new THREE.Scene();
const tp = new TreePhysics(physics, origin, bus);
const builder = new TreeChunkBuilder(new TreeAssets(), new RockAssets());
const td = new TreeDestruction({ scene, origin, bus, physics: tp });

const load = () => {
  const group = builder.build(best.trees, null, 0)!;
  scene.add(group);
  bus.emit('chunk:loaded', { key, cx: best.cx, cz: best.cz, lod: 0, vertsPerSide: 128, heights: new Float32Array(0), trees: best.trees });
  return group;
};
let group = load();
const visible = (g: THREE.Group) => {
  let n = 0;
  const m = new THREE.Matrix4();
  const p = new THREE.Vector3();
  const s = new THREE.Vector3();
  const q = new THREE.Quaternion();
  for (const c of g.children as THREE.InstancedMesh[]) for (let i = 0; i < c.count; i++) {
    c.getMatrixAt(i, m);
    if (Math.abs(m.elements[0]) + Math.abs(m.elements[5]) > 1e-6) n++;
  }
  return n;
};
const total = visible(group);
console.log(`chunk ${key}: ${total} trees`);

// centre of the densest part
let cxw = 0, czw = 0, cnt = 0;
for (let k = 0; k < TREE_KIND_COUNT; k++) {
  const d = best.trees[k];
  for (let o = 0; o < d.length; o += TREE_STRIDE) { cxw += ox + d[o]; czw += oz + d[o + 2]; cnt++; }
}
cxw /= cnt; czw /= cnt;
for (let i = 0; i < 40; i++) tp.update(0.25, cxw, czw);
const R = physics.RAPIER;
const collidersBefore = tp.activeColliders;
const rayHits = () => {
  let n = 0;
  for (let a = 0; a < 360; a += 3) {
    const dir = new THREE.Vector3(Math.cos(a / 57.3), 0, Math.sin(a / 57.3));
    const o = new THREE.Vector3(cxw - origin.origin.x, gen.heightAt(cxw, czw) + 1.5, czw - origin.origin.z);
    if (physics.world.castRay(new R.Ray(o, dir), 30, true)) n++;
  }
  return n;
};
physics.step();
const hitsBefore = rayHits();
console.log('bodies', tp.activeBodies, 'colliders', collidersBefore);

// 1) a blast flattens the trees around it
const felled = td.destroyInRadius(cxw, czw, 25, cxw, czw);
console.log(`blast r=25: ${felled} trees felled`);
ok(felled > 3, 'a blast fells the trees around it');
console.log('visible after', visible(group), 'expected', total - felled);
ok(visible(group) === total - felled, 'felled trees disappear from the forest mesh');
physics.step();
const hitsAfter = rayHits();
console.log(`rays hitting a trunk: ${hitsBefore} -> ${hitsAfter}`);
ok(hitsAfter < hitsBefore, 'their trunk colliders are gone');
ok(td.destroyInRadius(cxw, czw, 25, cxw, czw) === 0, 'a tree is felled only once');

// 2) after the chunk is rebuilt (LOD change / back again) they stay felled
group.removeFromParent();
group = load();
ok(visible(group) === total - felled, 'felled trees stay felled after the chunk is rebuilt');
for (let i = 0; i < 40; i++) tp.update(0.25, cxw + 0.1 * i, czw);
physics.step();
ok(rayHits() <= hitsAfter, 'and their colliders do not come back');

// 3) a tank-sized box fells a path
const f2 = td.destroyInBox(cxw + 40, czw, 1, 0, 40, 3);
console.log(`tank path (80 m x 6 m): ${f2} trees`);
ok(f2 >= 0, 'box query works');

// 4) falling trees animate and vanish
for (let i = 0; i < 60; i++) td.update(1 / 60);
let falling = 0;
for (const c of scene.children) if (c !== group) falling++;
ok(falling > 0, 'felled trees topple as separate objects');
for (let i = 0; i < 60 * 40; i++) td.update(1 / 60);
let left = 0;
for (const c of scene.children) if (c !== group) left++;
ok(left === 0, 'and are removed after a while');

console.log(fails ? `${fails} FAILED` : 'ALL OK');
process.exit(fails ? 1 : 0);
