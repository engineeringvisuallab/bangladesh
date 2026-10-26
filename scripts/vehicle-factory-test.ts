// Vehicle factory: builds it like the game does, checks parts / tour / animation / colliders / fence gate / pad on the real terrain.
// Run: npx tsx scripts/vehicle-factory-test.ts
import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';
import { TerrainGenerator } from '../src/terrain/TerrainGenerator';
import { Config } from '../src/core/Config';
import { InfraManager } from '../src/engineering/InfraManager';
import { ENGINEERING_AREAS, ENGINEERING_GATES } from '../src/city/EngineeringZones';
import { buildFenceLayout, RoadHash } from '../src/city/EngineeringFence';

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
const site = g.infra.find((s) => s.id === 'vehicle')!;
ok(!!site, 'vehicle site exists');
const mgr = new InfraManager({
  root, physics: { RAPIER, world } as never, origin: origin as never, terrain: g,
  input: { wasPressed: (k: string) => { const r = pressed.has(k); pressed.delete(k); return r; } } as never,
  voice: { speakText: async (t: string) => { spoken.push(t); }, stop() {} }, container: { appendChild() {} } as never,
  playerWorld: (out) => out.set(site.x, 30, site.z + 200),
});
world.step();
const pl = mgr.plants.find((p) => p.site.id === 'vehicle')!;
root.updateMatrixWorld(true);
const area = ENGINEERING_AREAS.find((a) => a.id === 'eng-vehicle')!;

// 1) pad sits inside the area fence with margin
const R = site.rect;
ok(site.x + R.x0 > area.x0 + 20 && site.x + R.x1 < area.x1 - 20 && site.z + R.z0 > area.z0 + 20 && site.z + R.z1 < area.z1 - 20, 'pad is inside the engineering area with a 20 m margin');
console.log(`floorY ${site.floorY.toFixed(2)}`);
// 2) parts + tour
const ids = pl.infra.parts.map((p) => p.id);
console.log('parts:', ids.join(', '));
ok(pl.infra.tour.every((st) => !st.partId || ids.includes(st.partId)), 'every tour stop points to an existing part');
ok(pl.infra.tour.every((st) => st.text.length > 200), 'every stop has a narration text');
// 3) animation runs, stays finite, and moves things
const fx: THREE.InstancedMesh[] = [];
pl.infra.root.traverse((o) => { if (o instanceof THREE.InstancedMesh) fx.push(o); });
const snap = () => fx.map((f) => { const m4 = new THREE.Matrix4(); f.getMatrixAt(0, m4); return m4; });
const before = snap();
for (let i = 0; i < 120; i++) pl.infra.update!(1 / 60);
const after = snap();
ok(before.some((m4, i) => !m4.equals(after[i])), `rain moves (${fx.length} instanced meshes: cells, yard cars, pallets, rain)`);
// moving cars: the line car at the start must have travelled and changed stage
const car0 = (pl.infra.parts.find((p) => p.id === 'line')!.group.children[0] as THREE.Group).children[0];
const x0 = car0.position.x;
for (let i = 0; i < 600; i++) pl.infra.update!(1 / 60);
ok(Math.abs(car0.position.x - x0) > 5, 'cars travel along the line');
let finite = true;
pl.infra.root.traverse((o) => { if (![o.position.x, o.position.y, o.position.z, o.rotation.x, o.rotation.y, o.rotation.z, o.scale.x].every(Number.isFinite)) finite = false; });
ok(finite, 'all animated transforms stay finite');
// 4) part boxes are sane (moving effects are not counted)
const tmp = new THREE.Box3();
for (const p of pl.infra.parts) {
  const b = tmp.setFromObject(p.group);
  const sz = b.getSize(new THREE.Vector3());
  console.log(`  ${p.id.padEnd(10)} size ${sz.x.toFixed(0)} x ${sz.y.toFixed(0)} x ${sz.z.toFixed(0)}`);
}
// 5) colliders: rays from above find the plate and structures; cooling tower is solid
let plate = 0, struct = 0, miss = 0;
for (let lx = R.x0 + 3; lx < R.x1 - 3; lx += 9) for (let lz = R.z0 + 3; lz < R.z1 - 3; lz += 9) {
  const pt = { x: 0, z: 0 }; site.toWorld(lx, lz, pt);
  const hit = world.castRay(new RAPIER.Ray({ x: pt.x, y: site.floorY + 90, z: pt.z }, { x: 0, y: -1, z: 0 }), 200, true);
  if (!hit) { miss++; continue; }
  const y = site.floorY + 90 - hit.timeOfImpact;
  if (Math.abs(y - site.floorY) < 0.1) plate++; else struct++;
}
console.log(`rays: plate ${plate}, structures ${struct}, miss ${miss}`);
ok(plate > 200 && struct > 30 && miss < 5, 'plate and structures have colliders, nothing falls through');
const ct = { x: 0, z: 0 }; site.toWorld(-82, -60, ct);
const hitD = world.castRay(new RAPIER.Ray({ x: ct.x, y: site.floorY + 4, z: ct.z - 15 }, { x: 0, y: 0, z: 1 }), 40, true);
ok(!!hitD && hitD.timeOfImpact < 25, 'shop wall blocks a ray');
// 5b) English narration + labels
ok(pl.infra.narrationLang === 'en', 'vehicle narrates in English');
ok(pl.infra.tour.every((st) => /^[\x20-\x7E\u2019]+$/.test(st.text + st.titleBn)), 'tour text is plain English');
// 6) tour end to end
const cam = new THREE.PerspectiveCamera();
let tourOn = false;
mgr.onTour = (a) => { tourOn = a; };
pressed.add('KeyY'); mgr.update(1 / 60);
ok(mgr.touring && tourOn, 'Y starts the tour');
let nan = false;
const total = pl.tour.stops.length;
for (let i = 0; i < total; i++) {
  for (let f = 0; f < 60 * 5; f++) { mgr.update(1 / 60); mgr.applyCamera(1 / 60, cam); if (![cam.position.x, cam.position.y, cam.position.z, cam.quaternion.w].every(Number.isFinite)) nan = true; }
  pressed.add('Period'); mgr.update(1 / 60);
}
ok(!nan && !mgr.touring, `tour of ${total} stops runs and ends cleanly`);
ok(spoken.length >= total, `voice requested for every stop (${spoken.length}/${total})`);
// 7) fence gate: opening exists on the south edge, fence elsewhere
const lay = buildFenceLayout(area, new RoadHash([]));
const gate = ENGINEERING_GATES['eng-vehicle'];
const inOpening = lay.solid.filter((p) => Math.abs((p.az + p.bz) / 2 - area.z1) < 1 && Math.abs((p.ax + p.bx) / 2 - gate.at) < gate.width / 2 - 12);
ok(inOpening.length === 0, 'collider fence has an opening at the gate');
ok(lay.solid.length > 100, `rest of the fence is solid (${lay.solid.length} pieces)`);
console.log(bad ? `${bad} problem(s)` : 'ALL OK');
process.exit(bad ? 1 : 0);
