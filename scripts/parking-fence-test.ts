// Runtime check of the EVLAB boundary fence (panels + colliders, open at the gate and at street crossings) and the two parking lots.
// npx tsx scripts/parking-fence-test.ts
import * as THREE from 'three';
import { Config } from '../src/core/Config';
import { TerrainGenerator } from '../src/terrain/TerrainGenerator';
import { EventBus, type EngineEvents } from '../src/core/EventBus';
import { PhysicsWorld } from '../src/physics/PhysicsWorld';
import { FloatingOrigin } from '../src/world/FloatingOrigin';

const ctxStub: any = new Proxy({ canvas: { width: 512, height: 128 } }, { get: (t: any, k) => (k in t ? t[k] : () => ({ width: 10 })), set: () => true });
(globalThis as any).location = { href: 'http://localhost/' };
(globalThis as any).document = { createElement: () => ({ width: 0, height: 0, getContext: () => ctxStub }) };
const { EVLabManager } = await import('../src/evlab/EVLabManager');
const { ParkingLots } = await import('../src/parking/ParkingLots');

let fails = 0;
const ok = (c: boolean, m: string) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) fails++; };
const bus = new EventBus<EngineEvents>();
const gen = new TerrainGenerator(Config.world.seed);
const physics = await PhysicsWorld.create(bus);
const root = new THREE.Group();
const origin = new FloatingOrigin(root, bus as any);

const lots = new ParkingLots({ root, terrain: gen });
let tris = 0, finite = true;
root.traverse((o) => { const m = o as THREE.Mesh; if (m.isMesh && m.geometry.getIndex()) { tris += m.geometry.getIndex()!.count / 3; const a = m.geometry.getAttribute('position'); for (let i = 0; i < a.array.length; i++) if (!Number.isFinite(a.array[i])) finite = false; } });
ok(finite && tris > 500, `parking lots: ${tris} triangles, all vertices finite`);

const before = physics.world.colliders.len();
const mgr = new EVLabManager({ root, physics, origin, terrain: gen, playerWorld: (o) => o.set(-280, 18, -100) });
const added = physics.world.colliders.len() - before;
const fence = root.children.filter((c) => c.name === 'EVLabBoundaryFence') as THREE.InstancedMesh[];
console.log('fence panels', fence[0]?.count, 'colliders added (campus + fence)', added);
ok(fence.length === 2 && fence[0].count > 300, `fence: ${fence[0]?.count} panels along the new boundary`);

// ray from the avenue (inside) to the F6 side through the gate gap must be free; a ray through the fence elsewhere must hit
physics.world.step();
const o = origin.origin;
const R = physics.RAPIER;
const ray = (x0: number, z0: number, x1: number, z1: number, y: number) => {
  const dx = x1 - x0, dz = z1 - z0, L = Math.hypot(dx, dz);
  const hit = physics.world.castRay(new R.Ray({ x: x0 - o.x, y, z: z0 - o.z }, { x: dx / L, y: 0, z: dz / L }), L, true);
  return hit ? hit.timeOfImpact : -1;
};
const y = gen.heightAt(-280, -19) + 1.5;
ok(ray(-280, -60, -280, -2, y) < 0 || ray(-280, -60, -280, -2, y) > 55, 'the gate gap: nothing blocks the avenue from the campus to F6');
const y2 = gen.heightAt(-250, -19) + 1.5;
const t2 = ray(-250, -60, -250, -2, y2);
ok(t2 > 0 && t2 < 55, `the fence blocks a walker 30 m from the gate (hit after ${t2.toFixed(1)} m)`);
const y3 = gen.heightAt(60, -300) + 1.5;
const t3 = ray(20, -300, 100, -300, y3);
ok(t3 > 0, 'the north boundary (along F4) is solid');

mgr.dispose();
lots.dispose();
ok(true, 'dispose runs clean');
console.log(fails ? `FAILED (${fails})` : 'ALL OK');
process.exit(fails ? 1 : 0);
