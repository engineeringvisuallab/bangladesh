// FIELD PROPS: the things around the work (the PEOPLE and VEHICLES are real game objects made by FarmCrew).
//   harvestHand   bundles of cut crop lying on the cut side
//   irrigate      diesel pump + pipe at the bank, water running in
//   spray         agricultural drone sweeping the field with a spray cone
//   pick          harvest crates on the bank
//   thresh        threshing machine, straw stack, sacks
//   haul          sacks waiting on the bank
//   graze         cows wandering on the stubble / fallow land
// Everything lives in the field's local frame (x along the rows, z across).
import * as THREE from 'three';
import { mulberry32 } from '../world/Seed';
import { Act, cropById } from './CropDefs';
import type { Field } from './FarmPlan';
import type { HeightGrid } from './FarmRenderer';
import { makeCow, makeCrate, makeDrone, makePump, makeSacks, makeStraw, mat } from './FarmProps';

export interface Actor { group: THREE.Group; tick(t: number): void }

/** Mark a mesh whose geometry (and material, if not shared) belongs to this field only: the manager frees it. */
const own = <T extends THREE.Mesh | THREE.InstancedMesh>(m: T): T => { m.userData.own = true; return m; };

export function buildActors(f: Field, grid: HeightGrid): Actor | null {
  const c = cropById(f.crop), rnd = mulberry32(f.seed ^ 0xa11ce), g = new THREE.Group(), ticks: ((t: number) => void)[] = [];
  const hw = f.w / 2, hd = f.d / 2;
  const gy = (x: number, z: number) => (f.level ? 0.05 : grid.at(x, z) + 0.08);
  const frontier = -hw + f.progress * f.w;
  const add = <T extends THREE.Object3D>(o: T, x: number, z: number, ry = 0, lift = 0): T => { o.position.set(x, gy(x, z) + lift, z); o.rotation.y = ry; g.add(o); return o; };
  const bank = (): number => -hw - 4.5; // the lane on the low side, outside the bund

  switch (f.act) {
    case Act.harvestCombine:
    case Act.harvestHand: {
      const bundles = own(new THREE.InstancedMesh(new THREE.BoxGeometry(1.1, 0.32, 0.38), mat(0xd9b44a, 1, 0), 18)), d = new THREE.Object3D();
      for (let i = 0; i < 18; i++) { const x = -hw + 2 + rnd() * Math.max(1, frontier + hw - 4), z = -hd + 3 + rnd() * (f.d - 6); d.position.set(x, gy(x, z) + 0.2, z); d.rotation.set(0, rnd() * 3, 0); d.updateMatrix(); bundles.setMatrixAt(i, d.matrix); }
      if (f.act === Act.harvestHand) g.add(bundles);
      break;
    }
    case Act.irrigate: {
      const p = makePump();
      add(p, bank() + 1.2, 0, 0);
      const eng = p.getObjectByName('engine');
      if (eng) ticks.push((t) => { eng.position.y = 0.5 + Math.sin(t * 38) * 0.012; });
      const stream = own(new THREE.Mesh(new THREE.PlaneGeometry(7, 1.1), new THREE.MeshStandardMaterial({ color: 0x6fb4d8, roughness: 0.1, transparent: true, opacity: 0.7 })));
      stream.rotation.x = -Math.PI / 2; add(stream, -hw - 1.5, 0, 0, 0.1);
      break;
    }
    case Act.spray: {
      const dr = makeDrone(); dr.scale.setScalar(1.6); g.add(dr);
      const cone = own(new THREE.Mesh(new THREE.ConeGeometry(3.2, 6, 14, 1, true), new THREE.MeshBasicMaterial({ color: 0xbfe9ff, transparent: true, opacity: 0.14, depthWrite: false, side: THREE.DoubleSide })));
      cone.rotation.x = Math.PI; cone.position.y = -3; dr.add(cone);
      const ph = rnd();
      ticks.push((t) => {
        const L = f.d - 10, k = (((t * 5) / L + ph) % 2 + 2) % 2, u = k < 1 ? k : 2 - k, z = -hd + 5 + u * L, x = Math.sin(t * 0.05 + ph * 6) * f.w * 0.32;
        dr.position.set(x, gy(x, z) + 7, z); dr.rotation.y = k < 1 ? 0 : Math.PI;
      });
      break;
    }
    case Act.pick:
      for (let i = 0; i < 3; i++) add(makeCrate(c.fruit || 0xe53935), -hw - 2.2, -6 + i * 3.2, rnd() * 3);
      break;
    case Act.thresh: {
      const mach = new THREE.Group();
      const b = own(new THREE.Mesh(new THREE.BoxGeometry(3.2, 1.5, 1.7), mat(0x558b2f, 0.6, 0.3))); b.position.y = 1.1; mach.add(b);
      const hopper = own(new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.7, 1.9), mat(0x444a50, 0.6, 0.4))); hopper.position.set(-0.8, 2.1, 0); mach.add(hopper);
      add(mach, bank() - 0.5, 4, 0); add(makeStraw(), bank() - 0.5, -9, 0); add(makeSacks(6), bank() + 2.5, 11, 0.3);
      break;
    }
    case Act.haul: add(makeSacks(8), bank() + 3.2, hd * 0.55, 0); break;
    case Act.graze: {
      const n = 3 + Math.floor(rnd() * 2);
      for (let i = 0; i < n; i++) {
        const cow = makeCow(i % 2), ph = rnd() * 6, x0 = (rnd() - 0.5) * f.w * 0.5, z0 = (rnd() - 0.5) * f.d * 0.5;
        g.add(cow);
        ticks.push((t) => {
          const a = t * 0.06 + ph, x = x0 + Math.sin(a) * 9, z = z0 + Math.cos(a * 1.3) * 7;
          cow.position.set(x, gy(x, z), z); cow.rotation.y = Math.atan2(Math.sin(a * 1.3) * 7 * 1.3, Math.cos(a) * 9); // heading of the path (front = +x)
        });
      }
      break;
    }
    default: break;
  }
  if (g.children.length === 0 && ticks.length === 0) return null;
  return { group: g, tick: (t) => { for (const fn of ticks) fn(t); } };
}
