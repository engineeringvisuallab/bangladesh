// Headless City Library test: flat pad on the field south of the F7 road, no roads / trees / local streets on it, clear of the railway viaduct,
// the hall is built (books, furniture), the door is open, the walls and the roof are solid, the player is detected inside.
// npx tsx scripts/library-test.ts
import * as THREE from 'three';
import { Config } from '../src/core/Config';
import { TerrainGenerator } from '../src/terrain/TerrainGenerator';
import { LIBRARY_PLOT, LIBRARY_SIZE, LIBRARY_PATH, libraryKeepout } from '../src/library/LibrarySite';
import { TreePlacer } from '../src/vegetation/TreePlacement';
import { CityPlan } from '../src/city/CityPlan';
import { EventBus, type EngineEvents } from '../src/core/EventBus';
import { PhysicsWorld } from '../src/physics/PhysicsWorld';

// tiny canvas stub so CityLibrary can run without a browser (it paints floor / sign textures)
const ctxStub: any = new Proxy({ canvas: { width: 1024, height: 256 } }, { get: (t: any, k) => (k in t ? t[k] : () => ({ width: 10 })), set: () => true });
(globalThis as any).document = { createElement: () => ({ width: 0, height: 0, getContext: () => ctxStub }) };
const { LibraryManager } = await import('../src/library/LibraryManager');

let fails = 0;
const ok = (c: boolean, m: string) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) fails++; };

const gen = new TerrainGenerator(Config.world.seed);
const L = gen.library;
const P = LIBRARY_PLOT;
console.log('library at', L.x, L.z, 'floorY', L.floorY.toFixed(2));

// 1. flat pad under the whole plot
let mn = 1e9, mx = -1e9, cnt = 0;
for (let x = P.x0; x <= P.x1; x += 2) for (let z = P.z0; z <= P.z1; z += 2) { cnt++; const h = gen.heightAt(x, z); mn = Math.min(mn, h); mx = Math.max(mx, h); }
ok(mx - mn < 0.001, `terrain under the whole library plot (${cnt} samples) is perfectly flat (range ${(mx - mn).toFixed(4)} m)`);
ok(Math.abs(mx - (L.floorY - 0.03)) < 0.001, 'pad is 3 cm below the floor tiles');
const inside = (x: number, z: number) => x >= P.x0 && x <= P.x1 && z >= P.z0 && z <= P.z1;
ok(inside(L.x - LIBRARY_SIZE.W / 2 - 6, L.z - LIBRARY_SIZE.D / 2 - 6) && inside(L.x + LIBRARY_SIZE.W / 2 + 6, L.z + LIBRARY_SIZE.D / 2 + 6), 'the hall plus a 6 m apron lies inside the plot');

// 2. gentle blend, and the pad never touches a road
let maxSlope = 0;
for (let x = P.x0 - 20; x <= P.x1 + 20; x += 1) for (let z = P.z0 - 20; z <= P.z1 + 20; z += 1) {
  if (gen.roads.surfaceAt(x, z) !== 0 || gen.roads.surfaceAt(x + 1, z + 1) !== 0) continue;
  const h = gen.heightAt(x, z);
  maxSlope = Math.max(maxSlope, Math.abs(gen.heightAt(x + 1, z) - h), Math.abs(gen.heightAt(x, z + 1) - h));
}
ok(maxSlope < 0.25, `no steep step around the pad (max ${maxSlope.toFixed(3)} m per m)`);
let roadHits = 0;
for (let x = P.x0 - 2; x <= P.x1 + 2; x += 2) for (let z = P.z0 - 2; z <= P.z1 + 2; z += 2) if (gen.roads.surfaceAt(x, z) !== 0) roadHits++;
ok(roadHits === 0, `no road surface on the library plot (${roadHits} hits)`);
let roadPts = 0;
for (const r of gen.roads.roads) for (let i = 0; i < r.xs.length; i++) if (gen.library.near(r.xs[i], r.zs[i]) && gen.roads.surfaceAt(r.xs[i], r.zs[i]) !== 0) {
  // a road centreline point that is on the pad / skirt must have its own height back (the pad gives way to roads)
  if (Math.abs(gen.heightAt(r.xs[i], r.zs[i]) - r.ys[i]) > 0.02) roadPts++;
}
ok(roadPts === 0, 'roads keep their own height where they meet the pad skirt');

// 3. position: near the spawn, south of the F7 road, west of the viaduct
ok(Math.hypot(L.x, L.z) < 120, `close to the spawn crossing (${Math.hypot(L.x, L.z).toFixed(0)} m)`);
ok(L.x > 0 && L.z > 0, 'south-east of the spawn (south of F7, east of F5)');
const f7 = gen.roads.roads.find((r) => r.name === 'F7');
let roadDist = 1e9;
if (f7) for (let i = 0; i < f7.xs.length; i++) roadDist = Math.min(roadDist, Math.hypot(f7.xs[i] - L.x, f7.zs[i] - (L.z - LIBRARY_SIZE.D / 2)));
ok(roadDist < 60, `the door side is ${roadDist.toFixed(0)} m from the F7 road`);
// the footpath reaches the road edge
ok(gen.roads.surfaceAt(LIBRARY_PATH.x, LIBRARY_PATH.z0 - 4) !== 0, 'the footpath ends at the road');

// 4. clear of the railway (viaduct): its corridor and 8 m either side are never touched by the pad
let railNear = 0, railMin = 1e9;
for (const e of gen.rail.edges) for (let i = 0; i < e.xs.length; i++) {
  railMin = Math.min(railMin, Math.hypot(Math.max(P.x0 - e.xs[i], e.xs[i] - P.x1, 0), Math.max(P.z0 - e.zs[i], e.zs[i] - P.z1, 0)));
  for (const dx of [-8, 0, 8]) if (gen.library.near(e.xs[i] + dx, e.zs[i])) railNear++;
}
ok(railNear === 0, `the railway corridor is clear of the pad (${railMin.toFixed(0)} m from the plot)`);

// 5. no trees on the plot, no local streets
const plan = new CityPlan(gen.sites);
const trees = new TreePlacer(gen, plan, Config.world.seed);
let onPlot = 0, total = 0;
for (let cx = -2; cx <= 1; cx++) for (let cz = -2; cz <= 1; cz++) {
  const d = trees.place(cx, cz);
  const ox = cx * Config.world.chunkSize, oz = cz * Config.world.chunkSize;
  for (const arr of d) for (let i = 0; i + 2 < arr.length; i += 6) { total++; if (L.contains(arr[i] + ox, arr[i + 2] + oz)) onPlot++; }
}
console.log('trees checked:', total);
ok(onPlot === 0, 'no tree stands on the library plot');
ok(libraryKeepout(L.x, L.z) && libraryKeepout(P.x0 - 20, P.z0 - 20) && !libraryKeepout(P.x1 + 100, P.z1 + 100), 'local streets keep out of the plot + 30 m');
let streetPts = 0;
for (const r of gen.roads.roads) if (r.tier === 4) for (let i = 0; i < r.xs.length; i++) if (inside(r.xs[i], r.zs[i])) streetPts++;
ok(streetPts === 0, `no local street on the plot (${streetPts})`);

// 6. the manager: hall, colliders, door, roof, detection
const bus = new EventBus<EngineEvents>();
const physics = await PhysicsWorld.create(bus);
const root = new THREE.Group();
const player = new THREE.Vector3(0, gen.library.floorY + 1, 0);
let walking = true;
const mgr = new LibraryManager({
  root,
  physics,
  origin: { origin: new THREE.Vector3(0, 0, 0) } as any,
  terrain: gen,
  playerWorld: (out) => out.copy(player),
  onFoot: () => walking,
});
ok(mgr.library.bookCount > 8000, `${mgr.library.bookCount} books on the shelves`);
ok(mgr.library.colliders.length >= 20, `${mgr.library.colliders.length} furniture colliders`);
ok(root.children.includes(mgr.group), 'the hall is in the world');
ok(Math.abs(mgr.group.position.y - L.floorY) < 1e-9, 'the hall stands on the pad');

physics.world.step();
const R = physics.RAPIER;
const cast = (ox: number, oy: number, oz: number, dx: number, dy: number, dz: number, max: number): number | null => {
  const hit = physics.world.castRay(new R.Ray({ x: ox, y: oy, z: oz }, { x: dx, y: dy, z: dz }), max, true);
  return hit ? hit.timeOfImpact : null;
};
const y = L.floorY + 1.5;
// the door faces north (towards F7): local door (0, 16) -> world (L.x, L.z - 16)
const doorZ = L.z - LIBRARY_SIZE.D / 2;
const throughDoor = cast(L.x, y, doorZ - 10, 0, 0, 1, 100); // from the forecourt straight in through the door
ok(throughDoor !== null && throughDoor > 10 + LIBRARY_SIZE.D - 12, `the door is open: the ray goes ${throughDoor?.toFixed(1)} m in (up to the globe stand at the back)`);
const wallHit = cast(L.x - 10, y, doorZ - 10, 0, 0, 1, 100);
ok(wallHit !== null && Math.abs(wallHit - 10) < 1, `the front wall is solid beside the door (hit after ${wallHit?.toFixed(1)} m)`);
const sideHit = cast(L.x + LIBRARY_SIZE.W / 2 + 10, y, L.z, -1, 0, 0, 50);
ok(sideHit !== null && Math.abs(sideHit - 10) < 1, `the side wall is solid (hit after ${sideHit?.toFixed(1)} m)`);
const backHit = cast(L.x + 5, y, L.z + LIBRARY_SIZE.D / 2 + 10, 0, 0, -1, 50);
ok(backHit !== null && Math.abs(backHit - 10) < 1, `the back wall is solid (hit after ${backHit?.toFixed(1)} m)`);
const roofHit = cast(L.x + 8, L.floorY + 30, L.z + 4, 0, -1, 0, 60);
ok(roofHit !== null && Math.abs(roofHit - (30 - 9.4)) < 0.2, `the roof is solid (hit after ${roofHit?.toFixed(2)} m)`);
const floorHit = cast(L.x + 8, L.floorY + 1.5, L.z + 4, 0, -1, 0, 10);
ok(floorHit !== null && Math.abs(floorHit - 1.5) < 0.05, 'the floor slab top is at the floor tiles');

player.set(L.x + 3, L.floorY + 1, L.z + 3);
mgr.update(1);
ok(mgr.inside, 'a walking player in the hall is "inside"');
ok(typeof mgr.section === 'string' || mgr.section === null, `section label: ${mgr.section}`);
walking = false;
mgr.update(1);
ok(!mgr.inside, 'a player in a vehicle is not "inside"');
walking = true;
player.set(0, 1, 0);
mgr.update(1);
ok(!mgr.inside, 'a player at the spawn crossing is not inside');
ok(mgr.group.visible, 'the hall is visible from the spawn crossing');
player.set(5000, 1, 5000);
mgr.update(1);
ok(!mgr.group.visible, 'the hall is hidden when the player is very far away');

mgr.dispose();
ok(!root.children.includes(mgr.group), 'dispose removes the hall');

console.log(fails === 0 ? '\nALL PASS' : `\n${fails} FAILED`);
process.exit(fails === 0 ? 0 : 1);
