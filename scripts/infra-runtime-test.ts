// Builds the SWTP / STP exactly like the game does (InfraManager) with a real Rapier world and checks: pipes reach the river,
// colliders exist (rays hit the plate / walls / tank floors), the tour flies the camera to every stop without NaN and ends cleanly.
// Run: npx tsx scripts/infra-runtime-test.ts
import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';
import { TerrainGenerator } from '../src/terrain/TerrainGenerator';
import { Config } from '../src/core/Config';
import { InfraManager } from '../src/engineering/InfraManager';

const stubEl = (): Record<string, unknown> => ({ style: {}, appendChild() {}, remove() {}, textContent: '', getContext: () => null });
(globalThis as Record<string, unknown>).window = globalThis;
(globalThis as Record<string, unknown>).document = { createElement: stubEl };
let bad = 0;
const ok = (c: boolean, m: string): void => { console.log(c ? 'PASS' : 'FAIL', m); if (!c) bad++; };

await RAPIER.init();
const world = new RAPIER.World({ x: 0, y: -9.81, z: 0 });
const g = new TerrainGenerator(Config.world.seed);
const origin = { origin: new THREE.Vector3(), toLocal: (w: THREE.Vector3, out = new THREE.Vector3()) => out.set(w.x, w.y, w.z), toWorld: (l: THREE.Vector3, out = new THREE.Vector3()) => out.set(l.x, l.y, l.z) };
const pressed = new Set<string>();
const spoken: string[] = [];
const root = new THREE.Group();
const mgr = new InfraManager({
  root, physics: { RAPIER, world } as never, origin: origin as never, terrain: g,
  input: { wasPressed: (k: string) => { const r = pressed.has(k); pressed.delete(k); return r; } } as never,
  voice: { speakText: async (t: string) => { spoken.push(t); }, stop() {} }, container: { appendChild() {} } as never,
  playerWorld: (out) => out.set(-180, 20, 1000),
});
world.step();
const o = g.makeSample();
const pt = { x: 0, z: 0 };
for (const pl of mgr.plants) {
  const s = pl.site;
  if (s.riverSide === 'none') continue; // thermal plant: see thermal-test.ts
  console.log(`\n== ${s.id} floorY ${s.floorY.toFixed(2)} reach ${pl.riverReach} waterRel ${pl.waterRel.toFixed(2)}`);
  root.updateMatrixWorld(true);
  // 1) pipes reach the river: the lowest point of the river-side part, in world coordinates
  const part = pl.infra.parts.find((p) => p.id === (s.id === 'swtp' ? 'intake' : 'disinfection'))!;
  const box = new THREE.Box3().setFromObject(part.group);
  const corners: THREE.Vector3[] = [];
  const side = s.id === 'swtp' ? box.min.x : box.max.x;
  const tip = new THREE.Vector3(side + (s.id === 'swtp' ? 1.5 : -1.5), box.min.y, (box.min.z + box.max.z) / 2);
  void corners;
  // box is in world space already (root has the yaw); find the actual tip by searching meshes
  let tipW = new THREE.Vector3();
  let far = -1;
  part.group.traverse((m) => {
    if (m instanceof THREE.Mesh) { const b = new THREE.Box3().setFromObject(m); const c = b.getCenter(new THREE.Vector3()); const lx = c.clone(); const loc = new THREE.Vector3(); s.toLocal(lx.x, lx.z, pt); loc.set(pt.x, c.y, pt.z); const d = (s.id === 'swtp' ? -loc.x : loc.x); if (d > far) { far = d; tipW = c.clone(); } }
  });
  void tip;
  g.sample(tipW.x, tipW.z, o);
  const inWater = !Number.isNaN(o.water) && o.h < o.water - 0.1 && tipW.y < o.water;
  ok(inWater, `${s.id}: ${s.id === 'swtp' ? 'intake' : 'outfall'} end (${tipW.x.toFixed(0)}, ${tipW.z.toFixed(0)}) is under river water (water ${o.water.toFixed(2)}, pipe y ${tipW.y.toFixed(2)}, bed ${o.h.toFixed(2)})`);
  // 2) colliders: rays from above at a grid of points inside the pad
  let plate = 0, struct = 0, deep = 0, miss = 0;
  const R = s.rect;
  for (let lx = R.x0 + 3; lx < R.x1 - 3; lx += 9) for (let lz = R.z0 + 3; lz < R.z1 - 3; lz += 9) {
    s.toWorld(lx, lz, pt);
    const hit = world.castRay(new RAPIER.Ray({ x: pt.x, y: s.floorY + 60, z: pt.z }, { x: 0, y: -1, z: 0 }), 200, true);
    if (!hit) { miss++; continue; }
    const y = s.floorY + 60 - hit.timeOfImpact;
    if (Math.abs(y - s.floorY) < 0.1) plate++; else if (y > s.floorY + 0.1) struct++; else deep++;
  }
  console.log(`rays: plate ${plate}, on structures ${struct}, tank floors ${deep}, no hit ${miss}`);
  ok(plate > 100 && struct > 20 && deep > 5, `${s.id}: ground plate, structures and tank floors all have colliders`);
  ok(miss < 5, `${s.id}: nothing falls through the plant (misses ${miss})`);
  // 3) wall: ray along local +x at 1 m height through the middle of the east fence must hit
  s.toWorld(0, R.z0 + 20, pt);
  // fence on the north edge: shoot from inside to outside along local -z
  const dirL = new THREE.Vector3(0, 0, -1).applyAxisAngle(new THREE.Vector3(0, 1, 0), s.yaw);
  s.toWorld(5, R.z0 + 15, pt);
  const fh = world.castRay(new RAPIER.Ray({ x: pt.x, y: s.floorY + 1.2, z: pt.z }, { x: dirL.x, y: 0, z: dirL.z }), 60, true);
  ok(!!fh, `${s.id}: the boundary fence is solid (ray hit ${fh ? fh.timeOfImpact.toFixed(1) : '-'} m)`);
}

// 4) tour: start the nearest plant, run it through every stop with the real InfraTour
const cam = new THREE.PerspectiveCamera();
let tourState = false;
mgr.onTour = (a) => { tourState = a; };
pressed.add('KeyY');
mgr.update();
ok(mgr.touring && tourState, 'Y starts the tour');
const pl = mgr.plants.find((p) => p.tour.state === 'playing')!;
let nan = false, minD = 1e9, maxD = 0;
const total = pl.tour.stops.length;
for (let i = 0; i < total; i++) {
  for (let f = 0; f < 60 * 5; f++) { mgr.applyCamera(1 / 60, cam); if (![cam.position.x, cam.position.y, cam.position.z, cam.quaternion.w].every(Number.isFinite)) nan = true; }
  const d = Math.hypot(cam.position.x - pl.site.x, cam.position.z - pl.site.z); minD = Math.min(minD, d); maxD = Math.max(maxD, d);
  pressed.add('Period'); mgr.update();
}
ok(!nan, 'camera stays finite for the whole tour');
ok(!mgr.touring && !tourState, `tour ended after the last stop (camera was ${minD.toFixed(0)}-${maxD.toFixed(0)} m from the plant centre)`);
ok(spoken.length >= total, `a voice line was requested for every stop (${spoken.length}/${total})`);
console.log(bad ? `${bad} problem(s)` : 'ALL OK');
process.exit(bad ? 1 : 0);
