// Low-poly props for the working fields: combine harvester, power tiller, trolley, farmer, cow, pump, straw stack, sacks.
// Every model faces local +x (like AgroProps.makeTractor), origin on the ground. Materials are shared (one per colour) so hundreds of fields stay cheap.
import * as THREE from 'three';
import { makePerson } from '../mall/ProductModels';
import { makeDrone, makeTractor } from '../agro/AgroProps';

const MATS = new Map<string, THREE.MeshStandardMaterial>();
export function mat(color: number, rough = 0.7, metal = 0.1): THREE.MeshStandardMaterial {
  const k = `${color}:${rough}:${metal}`;
  let m = MATS.get(k);
  if (!m) { m = new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: metal }); MATS.set(k, m); }
  return m;
}
const GEOS = new Map<string, THREE.BufferGeometry>();
function geo<T extends THREE.BufferGeometry>(key: string, make: () => T): T {
  let g = GEOS.get(key);
  if (!g) { g = make(); GEOS.set(key, g); }
  return g as T;
}
const box = (w: number, h: number, d: number) => geo(`b${w},${h},${d}`, () => new THREE.BoxGeometry(w, h, d));
const cyl = (rt: number, rb: number, h: number, n = 12) => geo(`c${rt},${rb},${h},${n}`, () => new THREE.CylinderGeometry(rt, rb, h, n));

function part(g: THREE.Group, geometry: THREE.BufferGeometry, m: THREE.Material, x: number, y: number, z = 0, rx = 0, rz = 0): THREE.Mesh {
  const o = new THREE.Mesh(geometry, m);
  o.position.set(x, y, z); o.rotation.set(rx, 0, rz);
  g.add(o);
  return o;
}

/** Combine harvester (rice / wheat / maize): wide header with reel in front, glass cab, grain tank, big drive wheels. ~3 x 8 m. */
export function makeCombine(): THREE.Group {
  const g = new THREE.Group();
  const body = mat(0x2e7d32, 0.5, 0.3), yellow = mat(0xf2c200, 0.5, 0.2), tyre = mat(0x151515, 0.95, 0), glass = mat(0x1b2a38, 0.1, 0.7);
  part(g, box(5.2, 1.6, 2.6), body, -0.4, 1.9);
  part(g, box(2.0, 1.5, 2.2), glass, 1.4, 3.0);
  part(g, box(2.0, 0.12, 2.4), body, 1.4, 3.8);
  part(g, box(3.0, 1.3, 2.4), yellow, -2.4, 3.2); // grain tank
  part(g, cyl(0.22, 0.22, 2.4, 8), mat(0x777777, 0.4, 0.8), -3.9, 3.6, 0, 0, 0.9); // unloading auger
  part(g, box(1.2, 0.8, 4.4), mat(0x555a5f, 0.5, 0.5), 3.4, 1.0); // feeder
  part(g, box(0.5, 0.9, 5.2), yellow, 4.4, 0.8); // cutter bar header
  const reel = part(g, cyl(0.45, 0.45, 5.2, 10), mat(0xc0392b, 0.6, 0.1), 4.5, 1.9, 0, Math.PI / 2);
  reel.name = 'reel';
  for (const z of [-1.5, 1.5]) part(g, cyl(0.95, 0.95, 0.7, 20), tyre, 1.0, 0.95, z, Math.PI / 2);
  for (const z of [-1.2, 1.2]) part(g, cyl(0.6, 0.6, 0.5, 16), tyre, -3.0, 0.6, z, Math.PI / 2);
  return g;
}

/** Walking power tiller (the two-wheel "tractor" of Bangladesh): engine, one big rotary wheel set, handlebars. ~1 x 2.4 m. */
export function makeTiller(): THREE.Group {
  const g = new THREE.Group();
  const red = mat(0xc62828, 0.5, 0.3), steel = mat(0x8a929a, 0.4, 0.8), tyre = mat(0x151515, 0.95, 0);
  part(g, box(0.9, 0.6, 0.55), red, 0.25, 0.85);
  part(g, cyl(0.12, 0.12, 0.3, 8), steel, 0.5, 1.3);
  for (const z of [-0.45, 0.45]) part(g, cyl(0.42, 0.42, 0.2, 14), tyre, 0.0, 0.42, z, Math.PI / 2);
  part(g, box(1.3, 0.05, 0.06), steel, -0.7, 1.25, -0.28, 0, -0.3);
  part(g, box(1.3, 0.05, 0.06), steel, -0.7, 1.25, 0.28, 0, -0.3);
  const blades = part(g, cyl(0.3, 0.3, 0.9, 8), steel, -0.7, 0.3, 0, Math.PI / 2); blades.name = 'rotor';
  return g;
}

/** Tractor trolley (box trailer); `load` > 0 adds golden grain / straw on top. */
export function makeTrolley(load = 0): THREE.Group {
  const g = new THREE.Group(), tyre = mat(0x151515, 0.95, 0);
  part(g, box(3.6, 0.9, 1.9), mat(0x1565c0, 0.6, 0.3), 0, 1.0);
  for (const z of [-1.0, 1.0]) part(g, cyl(0.5, 0.5, 0.3, 14), tyre, 0.3, 0.5, z, Math.PI / 2);
  if (load > 0) part(g, box(3.3, 0.9 * load, 1.7), mat(0xd9b44a, 1, 0), 0, 1.45 + 0.45 * load - 0.45);
  return g;
}

/** Farmer: the shared person model + a wide straw hat. Faces +z. `bent` = bending forward from the hips (planting rice, weeding); the group's
 *  child named 'pivot' is what the animation bobs. */
export function makeFarmer(shirt: number, bent = false): THREE.Group {
  const g = new THREE.Group(), p = makePerson(shirt);
  part(p, geo('hat', () => new THREE.ConeGeometry(0.42, 0.22, 14)), mat(0xe2c36a, 1, 0), 0, 1.78);
  const pivot = new THREE.Group();
  pivot.name = 'pivot';
  pivot.position.y = 0.8;
  p.position.y = -0.8;
  pivot.add(p);
  if (bent) pivot.rotation.x = 0.95;
  g.add(pivot);
  return g;
}

export function makeCow(tint = 0): THREE.Group {
  const g = new THREE.Group();
  const white = mat(tint ? 0x8c5a3a : 0xf1ede2, 0.9, 0), dark = mat(tint ? 0x4a2f1c : 0x1a1a1a, 0.9, 0);
  part(g, box(1.5, 0.75, 0.65), white, 0, 0.95);
  part(g, box(0.4, 0.4, 0.42), white, 0.95, 1.2);
  part(g, box(0.2, 0.16, 0.44), mat(0xf4b6c2, 0.9, 0), 1.2, 1.1);
  part(g, box(0.5, 0.2, 0.67), dark, -0.2, 1.1);
  for (const x of [-0.6, 0.6]) for (const z of [-0.22, 0.22]) part(g, box(0.13, 0.6, 0.13), white, x, 0.3, z);
  return g;
}

/** Shallow tube-well pump set: small diesel engine on a frame + a pipe lying toward +x. */
export function makePump(): THREE.Group {
  const g = new THREE.Group();
  part(g, box(0.9, 0.55, 0.6), mat(0x1e88e5, 0.5, 0.3), 0, 0.5).name = 'engine';
  part(g, box(1.1, 0.12, 0.8), mat(0x444444, 0.8, 0.3), 0, 0.2);
  part(g, cyl(0.07, 0.07, 0.5, 8), mat(0x999999, 0.4, 0.8), 0.2, 0.95);
  part(g, cyl(0.1, 0.1, 5, 10), mat(0x2b2b2b, 0.9, 0.1), 3, 0.12, 0, 0, Math.PI / 2); // delivery pipe
  return g;
}

/** Straw stack (round, thatched cone) - after threshing. */
export function makeStraw(): THREE.Group {
  const g = new THREE.Group();
  part(g, cyl(1.5, 1.7, 1.6, 12), mat(0xcdb066, 1, 0), 0, 0.8);
  part(g, geo('strawcone', () => new THREE.ConeGeometry(1.55, 1.5, 12)), mat(0xbf9f50, 1, 0), 0, 2.3);
  return g;
}

/** A few rice / wheat sacks stacked on the bank. */
export function makeSacks(n = 5): THREE.Group {
  const g = new THREE.Group();
  for (let i = 0; i < n; i++) part(g, box(0.9, 0.5, 0.55), mat(i % 2 ? 0xe9e2c8 : 0xd8cfae, 1, 0), (i % 3) * 0.95 - 0.95, 0.25 + Math.floor(i / 3) * 0.5, 0);
  return g;
}

/** Harvest crate with produce (orange / red tint). */
export function makeCrate(color = 0xe53935): THREE.Group {
  const g = new THREE.Group();
  part(g, box(0.8, 0.35, 0.55), mat(0xb08850, 1, 0), 0, 0.18);
  part(g, box(0.7, 0.14, 0.45), mat(color, 0.8, 0), 0, 0.42);
  return g;
}

export { makeDrone, makeTractor };
