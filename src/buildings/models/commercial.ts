import * as THREE from 'three';
import { FLOOR_H, Kit, pick, type BuiltBuilding, type Side } from './BuildingKit';

/**
 * COMMERCIAL: দোকান সারি, ফার্মেসি, রেস্টুরেন্ট, পেট্রোল পাম্প, ব্যাংক, সুপারমার্কেট, শপিং মল, সিনেমা হল,
 * অফিস ভবন, অফিস টাওয়ার, ৩-স্টার হোটেল, ৫-স্টার হোটেল.
 */

const GLASS = 0x2f4f66;
const GLASS_LIGHT = 0x4c7f9f;
const SIGN = [0xc0392b, 0x2f6f9f, 0x3b8a55, 0xd49a2a, 0x7a4a9a, 0x2a8a8a];

function car(k: Kit, x: number, z: number, ry: number, color: number): void {
  k.local(x, 0, z, ry, () => {
    k.box(0, 0.3, 0, 1.8, 0.65, 4.2, color);
    k.box(0, 0.95, -0.1, 1.6, 0.55, 2.2, GLASS);
    for (const sx of [-0.9, 0.9]) for (const sz of [-1.3, 1.3]) {
      k.withMatrix(new THREE.Matrix4().makeTranslation(sx, 0.32, sz).multiply(new THREE.Matrix4().makeRotationZ(Math.PI / 2)), () => k.cyl(0, -0.1, 0, 0.32, 0.32, 0.2, 0x222222, 8));
    }
  });
}

/** Parking lot (asphalt + marking lines) with a few cars. */
function parkingLot(k: Kit, cx: number, cz: number, w: number, d: number, seed: number): void {
  k.box(cx, 0, cz, w, 0.08, d, 0x4a4d52);
  const n = Math.floor(w / 3);
  for (let i = 0; i <= n; i++) k.box(cx - (n * 3) / 2 + i * 3, 0.08, cz, 0.12, 0.01, d - 1, 0xe9e6de);
  const cols = [0xb02a2a, 0xd9d9d6, 0x2f3b4a, 0x6a7a8a, 0xe9c23a, 0x3b6b52];
  for (let i = 0; i < n; i++) if ((i + seed) % 3 !== 0) car(k, cx - (n * 3) / 2 + 1.5 + i * 3, cz, 0, pick(seed + i, cols));
}

/** Glass curtain wall on one side: a glass band per floor + vertical mullions + slab edges. */
function curtainWall(k: Kit, side: Side, cx: number, cz: number, w: number, d: number, y0: number, floors: number, fh: number, glass: number, frame: number, bay = 3.0): void {
  k.onSide(side, cx, cz, w, d, (len, half) => {
    for (let f = 0; f < floors; f++) {
      k.glass(0, y0 + f * fh + 0.35, half + 0.04, len - 0.8, fh - 0.9, 0.05, glass);
      k.box(0, y0 + f * fh - 0.12, half + 0.08, len, 0.28, 0.2, frame);
    }
    const n = Math.max(2, Math.round(len / bay));
    for (let i = 0; i <= n; i++) k.box(-len / 2 + (len * i) / n, y0, half + 0.1, 0.3, floors * fh, 0.22, frame);
  });
}

// ---------------------------------------------------------------- small / medium

/** দোকান সারি: two-storey town shop block, 6 units, rolling shutters, signboards, upper flats. */
export function buildShopRow(seed = 0): BuiltBuilding {
  const k = new Kit();
  const n = 6, uw = 4.2, d = 10, W = n * uw;
  const wall = pick(seed, [0xe3d7c2, 0xdfe3d3, 0xe6d1c4]);
  k.box(0, 0, 0, W + 0.4, 0.3, d + 0.4, 0x9b8f84);
  k.box(0, 0.3, 0, W, 7.0, d, wall);
  k.box(0, 3.5, 0, W + 0.2, 0.22, d + 0.3, 0xf4efe4);
  for (let i = 0; i < n; i++) {
    const x = -W / 2 + uw * (i + 0.5);
    k.box(x, 0.3, d / 2 + 0.04, uw - 0.6, 2.7, 0.1, 0x6a6f73); // rolling shutter
    k.box(x, 3.0, d / 2 + 0.3, uw - 0.2, 0.75, 0.12, pick(seed + i, SIGN)); // signboard
    k.box(x, 3.18, d / 2 + 0.37, uw - 1.2, 0.2, 0.04, 0xf4efe4);
    k.glass(x, 4.5, d / 2 + 0.04, 1.4, 1.4, 0.05, GLASS);
    k.box(x, 4.4, d / 2 + 0.01, 1.6, 1.6, 0.05, 0xf4efe4);
    k.box(x, 6.0, d / 2 + 0.3, 2.2, 0.08, 0.6, 0xf4efe4);
    if (i % 2 === 0) k.balcony('front', 0, 0, W, d, 3.62, x - 1.6, x + 1.6, 0.9, 0xf4efe4, 0x7a7a78);
    k.box(x + uw / 2, 0.3, d / 2 + 0.06, 0.25, 7.0, 0.12, 0xcfc7b6);
  }
  k.box(0, 7.3, 0, W + 0.3, 0.2, d + 0.3, 0xa7a49c);
  k.parapet(0, 7.5, 0, W + 0.3, d + 0.3, 0.9, 0.18, wall);
  for (let i = 0; i < n; i += 2) k.waterTank(-W / 2 + uw * (i + 0.5), 7.5, -1, 0.8);
  return k.finish(W + 0.4, d + 1.4, 11);
}

/** ফার্মেসি: stand-alone drugstore, glass front, green cross on a roof sign. */
export function buildPharmacy(seed = 0): BuiltBuilding {
  const k = new Kit();
  const w = 8, d = 9;
  k.box(0, 0, 0, w + 0.6, 0.3, d + 0.6, 0x9b8f84);
  k.box(0, 0.3, 0, w, 3.6, d, pick(seed, [0xf4efe4, 0xe3efe6]));
  k.glass(0, 0.6, d / 2 + 0.04, w - 1.4, 2.3, 0.06, 0x6a9bb5);
  for (const x of [-w / 2 + 0.8, 0, w / 2 - 0.8]) k.box(x, 0.3, d / 2 + 0.07, 0.15, 2.8, 0.1, 0xf4efe4);
  k.box(0, 3.4, d / 2 + 0.55, w + 0.4, 0.25, 1.2, 0x3b8a55); // canopy
  k.box(0, 3.9, 0, w + 0.3, 0.2, d + 0.3, 0xa7a49c);
  k.parapet(0, 4.1, 0, w + 0.3, d + 0.3, 0.6, 0.15, 0xf4efe4);
  // green cross sign pylon
  k.box(w / 2 - 0.9, 4.1, d / 2 - 1.0, 0.2, 2.2, 0.2, 0x555a60);
  k.box(w / 2 - 0.9, 5.6, d / 2 - 1.0, 1.6, 0.5, 0.15, 0x3b8a55);
  k.box(w / 2 - 0.9, 5.05, d / 2 - 1.0, 0.5, 1.6, 0.15, 0x3b8a55);
  k.windowGrid('left', 0, 0, w, d, { y0: 0.3, floors: 1, cols: 2, ww: 1.2, wh: 1.2, sill: 1.2, glass: GLASS, frame: 0xf4efe4 });
  return k.finish(w + 0.6, d + 1.8, 7.5);
}

/** রেস্টুরেন্ট: glass dining hall with pitched roof, outdoor seating under umbrellas, small car park. */
export function buildRestaurant(seed = 0): BuiltBuilding {
  const k = new Kit();
  const w = 16, d = 12;
  const wall = pick(seed, [0xd9b48a, 0xc9d6c0, 0xe6d1c4]);
  k.box(0, 0, -2, w + 0.6, 0.3, d + 0.6, 0x9b8f84);
  k.box(0, 0.3, -2, w, 4.0, d, wall);
  k.glass(0, 0.7, -2 + d / 2 + 0.04, w - 3.0, 3.0, 0.06, 0x4c7f9f);
  for (let i = 0; i <= 5; i++) k.box(-(w - 3) / 2 + i * ((w - 3) / 5), 0.3, -2 + d / 2 + 0.07, 0.18, 3.4, 0.12, 0x30343a);
  k.local(0, 4.3, -2, Math.PI / 2, () => k.gable(0, 0, 0, d + 1.6, w + 1.6, 2.6, 0xa8452b));
  // sign
  k.box(0, 4.8, -2 + d / 2 + 0.2, 6.0, 1.0, 0.2, pick(seed, SIGN));
  k.box(0, 5.1, -2 + d / 2 + 0.32, 4.6, 0.3, 0.04, 0xf4efe4);
  // outdoor seating
  for (let i = 0; i < 6; i++) {
    const x = -6 + (i % 3) * 6, z = 7.5 + Math.floor(i / 3) * 4;
    k.cyl(x, 0, z, 0.05, 0.05, 2.3, 0x555a60, 5);
    k.hip(x, 2.2, z, 3.0, 3.0, 0.6, pick(seed + i, SIGN));
    k.cyl(x, 0.7, z, 0.6, 0.6, 0.06, 0xf4efe4, 8);
    for (const [dx, dz] of [[-0.9, 0], [0.9, 0], [0, -0.9], [0, 0.9]] as const) k.box(x + dx, 0, z + dz, 0.4, 0.5, 0.4, 0x7a5a3a);
  }
  k.box(0, 0, 8.5, w + 0.4, 0.06, 7.5, 0xb59a74);
  k.box(w / 2 + 0.2, 0.2, 7.5, 0.3, 1.0, 8.0, 0x6a6f73);
  car(k, w / 2 + 3.5, 6, 0, 0xb02a2a);
  car(k, w / 2 + 3.5, 11, 0, 0x2f3b4a);
  k.tree(-w / 2 - 1.6, 8, 4.5);
  return k.finish(w + 8, d + 14, 7);
}

/** পেট্রোল পাম্প: canopy on pillars, 3 pump islands with dispensers, kiosk, price pylon, a car. */
export function buildPetrolPump(seed = 0): BuiltBuilding {
  const k = new Kit();
  const brand = pick(seed, [0x2f6f9f, 0x3b8a55, 0xc0392b]);
  k.box(0, 0, 0, 30, 0.1, 24, 0x6a6d72);
  // canopy
  for (const x of [-6, 6]) for (const z of [-3, 3]) k.box(x, 0.1, z, 0.5, 5.2, 0.5, 0xe9e6de);
  k.box(0, 5.3, 0, 16, 0.5, 11, 0xe9e6de);
  k.box(0, 5.3, 5.55, 16.2, 0.55, 0.2, brand);
  k.box(0, 5.3, -5.55, 16.2, 0.55, 0.2, brand);
  // islands + dispensers
  for (const x of [-4, 0, 4]) {
    k.box(x, 0.1, 0, 1.2, 0.25, 5.0, 0xcfc7b6);
    for (const dz of [-1.2, 1.2]) {
      k.box(x, 0.35, dz, 0.7, 1.7, 0.45, 0xe9e6de);
      k.box(x, 1.5, dz, 0.74, 0.5, 0.5, brand);
      k.box(x + 0.4, 0.9, dz, 0.06, 0.06, 0.5, 0x222222);
    }
  }
  // kiosk
  k.box(-11, 0.1, -3, 6, 3.4, 5, 0xe9e6de);
  k.glass(-11, 0.9, -0.46, 4.6, 1.8, 0.05, GLASS_LIGHT);
  k.box(-11, 3.5, -3, 6.4, 0.25, 5.4, brand);
  // price pylon
  k.box(12, 0.1, 9, 0.5, 8.5, 0.5, 0x555a60);
  k.box(12, 6.5, 9, 2.4, 2.4, 0.4, brand);
  for (let i = 0; i < 3; i++) k.box(12, 6.7 + i * 0.7, 9.22, 1.8, 0.4, 0.06, 0xf4efe4);
  // storage tank covers + vent pipes
  for (let i = 0; i < 3; i++) k.cyl(9 - i * 2.2, 0.1, -9, 0.6, 0.6, 0.12, 0x555a60, 10);
  k.cyl(11, 0.1, -9, 0.06, 0.06, 4.0, 0x9a9a95, 5);
  car(k, 4, 2.5, 0, 0xd9d9d6);
  k.tree(-13, 9, 5);
  return k.finish(30, 24, 9);
}

/** ব্যাংক: classical two-storey bank: portico with 4 columns + pediment, steps, ATM booth, flag. */
export function buildBank(seed = 0): BuiltBuilding {
  const k = new Kit({ 0xe8dcc0: 'stone', 0xd9d4c8: 'stone', 0xf4efe4: 'stone', 0xe9e6de: 'stone' });
  const w = 20, d = 15, stone = pick(seed, [0xe8dcc0, 0xd9d4c8]);
  k.box(0, 0, 0, w + 1, 0.5, d + 1, 0x9b968c);
  k.box(0, 0.5, 0, w, 7.4, d, stone);
  k.box(0, 3.9, 0, w + 0.2, 0.25, d + 0.2, 0xf4efe4);
  k.windowGrid('front', 0, 0, w, d, { y0: 0.5, floors: 2, floorH: 3.7, cols: 6, ww: 1.3, wh: 2.2, sill: 0.8, glass: GLASS, frame: 0xf4efe4, skip: (f, c) => f === 0 && (c === 2 || c === 3) });
  k.windowGrid('left', 0, 0, w, d, { y0: 0.5, floors: 2, floorH: 3.7, cols: 4, ww: 1.3, wh: 2.2, sill: 0.8, glass: GLASS, frame: 0xf4efe4 });
  k.windowGrid('right', 0, 0, w, d, { y0: 0.5, floors: 2, floorH: 3.7, cols: 4, ww: 1.3, wh: 2.2, sill: 0.8, glass: GLASS, frame: 0xf4efe4 });
  k.windowGrid('back', 0, 0, w, d, { y0: 0.5, floors: 2, floorH: 3.7, cols: 6, ww: 1.3, wh: 2.2, sill: 0.8, glass: GLASS, frame: 0xf4efe4 });
  // portico
  k.box(0, 0.5, d / 2 + 2.2, 9.5, 0.4, 4.4, 0xcfc7b6);
  for (let i = 0; i < 4; i++) k.cyl(-3.6 + i * 2.4, 0.9, d / 2 + 3.4, 0.5, 0.45, 6.4, 0xf4efe4, 12);
  k.box(0, 7.3, d / 2 + 2.2, 10.2, 0.6, 4.8, 0xf4efe4);
  k.local(0, 7.9, d / 2 + 2.2, Math.PI / 2, () => k.gable(0, 0, 0, 4.8, 10.2, 1.8, 0xe9e6de));
  k.glass(0, 0.9, d / 2 + 0.05, 5.0, 3.3, 0.05, 0x3c6a86);
  for (let i = 0; i < 4; i++) k.box(0, 0.5, d / 2 + 4.4 + (3 - i) * 0.4, 9.5 - i * 0.2, 0.1 + (3 - i) * 0.1, 0.4, 0xcfc7b6);
  k.box(0, 7.9, 0, w + 0.3, 0.2, d + 0.3, 0xa7a49c);
  k.parapet(0, 8.1, 0, w + 0.3, d + 0.3, 0.8, 0.2, stone);
  // flag
  k.cyl(-w / 2 + 1.5, 8.1, d / 2 - 1.5, 0.06, 0.06, 6.0, 0xb7bcc2, 5);
  k.box(-w / 2 + 2.3, 12.0, d / 2 - 1.5, 1.6, 1.0, 0.04, 0x1a7a4a);
  k.sphere(-w / 2 + 2.3, 11.5, d / 2 - 1.46, 0.28, 0xd33a2c);
  // ATM booth
  k.box(w / 2 + 2.2, 0, d / 2 - 1, 2.2, 2.6, 2.2, 0x2f5f8a);
  k.glass(w / 2 + 2.2, 0.5, d / 2 + 0.12, 1.2, 1.6, 0.04, GLASS_LIGHT);
  k.box(w / 2 + 2.2, 2.6, d / 2 - 1, 2.4, 0.15, 2.4, 0xe9e6de);
  return k.finish(w + 6, d + 8.5, 13);
}

/** সুপারমার্কেট: wide single-storey box with glass entrance, big sign, car park, roof AC units. */
export function buildSupermarket(seed = 0): BuiltBuilding {
  const k = new Kit();
  const w = 32, d = 20, h = 6.5, brand = pick(seed, SIGN);
  k.box(0, 0, -6, w + 1, 0.3, d + 1, 0x9b968c);
  k.box(0, 0.3, -6, w, h, d, 0xe9e6de);
  k.box(0, 0.3, -6 + d / 2 + 0.06, w, 1.3, 0.12, brand);
  k.glass(-3, 0.9, -6 + d / 2 + 0.06, 12, 3.6, 0.08, 0x4c7f9f);
  k.box(-3, 0.3, -6 + d / 2 + 0.1, 0.2, 4.2, 0.1, 0x30343a);
  k.box(-3, 4.7, -6 + d / 2 + 1.4, 14, 0.3, 2.8, 0xe9e6de);
  k.box(-3, 4.5, -6 + d / 2 + 2.8, 14, 0.3, 0.1, brand);
  k.box(9.5, 3.4, -6 + d / 2 + 0.15, 11, 2.2, 0.2, brand);
  k.box(9.5, 3.9, -6 + d / 2 + 0.28, 8, 0.7, 0.04, 0xf4efe4);
  k.box(0, 0.3 + h, -6, w + 0.3, 0.25, d + 0.3, 0xa7a49c);
  k.parapet(0, 0.55 + h, -6, w + 0.3, d + 0.3, 0.7, 0.2, 0xe9e6de);
  for (let i = 0; i < 4; i++) k.box(-9 + i * 6, 0.55 + h, -9, 2.4, 1.3, 2.4, 0xb7bcc2);
  parkingLot(k, 0, 12.5, 32, 10, seed);
  // trolley shelter
  k.box(13, 0, 6.6, 4.5, 0.12, 1.4, 0x555a60);
  k.box(13, 1.6, 6.6, 4.8, 0.12, 1.8, brand);
  return k.finish(w + 1, 36, 8.5);
}

// ---------------------------------------------------------------- large

/** শপিং মল: 4-floor mall with glass atrium entrance, banner boards, rooftop parking, front car park. */
export function buildMall(seed = 0): BuiltBuilding {
  const k = new Kit();
  const w = 60, d = 40, fh = 5.0, floors = 4, body = pick(seed, [0xe3d7c2, 0xd8dde3]);
  const acc = pick(seed, [0xc0392b, 0x2f6f9f, 0x7a4a9a]);
  k.box(0, 0, -6, w + 1, 0.4, d + 1, 0x9b968c);
  k.box(0, 0.4, -6, w, floors * fh, d, body);
  for (let f = 1; f <= floors; f++) k.box(0, 0.4 + f * fh - 0.2, -6, w + 0.3, 0.4, d + 0.3, 0xf4efe4);
  // front: ribbon windows + atrium
  const zf = -6 + d / 2;
  for (let f = 0; f < floors; f++) {
    for (const s of [-1, 1]) {
      k.glass(s * 19, 0.4 + f * fh + 1.2, zf + 0.06, 20, 2.4, 0.06, GLASS);
    }
  }
  k.glass(0, 0.6, zf + 0.5, 14, floors * fh - 0.4, 0.2, 0x4c7f9f);
  for (let i = 0; i <= 7; i++) k.box(-7 + i * 2, 0.4, zf + 0.62, 0.22, floors * fh, 0.25, 0x30343a);
  for (let f = 1; f < floors; f++) k.box(0, 0.4 + f * fh, zf + 0.62, 14.2, 0.2, 0.3, 0x30343a);
  // canopy + big banner boards
  k.box(0, 5.0, zf + 3.3, 16, 0.3, 6.2, 0xe9e6de);
  for (const x of [-7, 7]) k.cyl(x, 0.4, zf + 6.0, 0.35, 0.35, 4.6, 0xe9e6de, 10);
  k.box(-24, 10.5, zf + 0.15, 9, 7.5, 0.2, acc);
  k.box(24, 10.5, zf + 0.15, 9, 7.5, 0.2, pick(seed + 2, SIGN));
  k.box(0, 0.4 + floors * fh + 0.2, zf + 0.1, 20, 3.0, 0.5, 0x30343a);
  k.box(0, 0.4 + floors * fh + 0.8, zf + 0.4, 15, 1.2, 0.06, 0xf4efe4);
  // sides
  for (const s of ['left', 'right', 'back'] as const) curtainWall(k, s, 0, -6, w, d, 0.4 + 1.2, floors, fh, GLASS, 0xcfc7b6, 8);
  // roof: parapet, parked cars, plant
  const top = 0.4 + floors * fh;
  k.box(0, top, -6, w + 0.3, 0.3, d + 0.3, 0xa7a49c);
  k.parapet(0, top + 0.3, -6, w + 0.3, d + 0.3, 1.0, 0.25, body);
  for (let i = 0; i < 6; i++) k.box(-20 + i * 8, top + 0.3, -20, 3.2, 1.8, 2.6, 0xb7bcc2);
  k.local(0, top + 0.3, 0, 0, () => { for (let i = 0; i < 8; i++) car(k, -21 + i * 6, -3, 0, pick(seed + i, [0xb02a2a, 0xd9d9d6, 0x2f3b4a, 0x6a7a8a])); });
  parkingLot(k, 0, 28, 48, 10, seed + 1);
  return k.finish(w + 1, d + 20, top + 3);
}

/** সিনেমা হল: windowless auditorium block, marquee entrance, poster boards, sign tower. */
export function buildCinema(seed = 0): BuiltBuilding {
  const k = new Kit();
  const w = 26, d = 30, body = pick(seed, [0xc9a56a, 0xb8c0c8, 0xd6a39a]);
  k.box(0, 0, 0, w + 1, 0.3, d + 1, 0x9b968c);
  k.box(0, 0.3, -4, w, 14, d - 8, body);
  k.box(0, 0.3, d / 2 - 4, w, 6.5, 8, 0xe9e6de); // lobby
  k.glass(0, 0.8, d / 2 + 0.06, w - 6, 3.2, 0.06, 0x4c7f9f);
  // marquee
  k.box(0, 4.2, d / 2 + 1.5, w - 4, 0.9, 3.4, 0xc0392b);
  for (let i = 0; i < 13; i++) k.box(-w / 2 + 2.4 + i * 1.7, 4.2, d / 2 + 3.25, 0.4, 0.4, 0.1, 0xf6d86a);
  k.box(0, 5.4, d / 2 + 0.2, w - 6, 3.4, 0.2, 0x2b3037);
  for (let i = 0; i < 4; i++) k.box(-8.6 + i * 5.8, 5.6, d / 2 + 0.34, 4.0, 3.0, 0.05, [0xc0392b, 0x2f6f9f, 0xd49a2a, 0x3b8a55][(i + seed) % 4]!);
  for (const x of [-w / 2 + 2, w / 2 - 2]) k.cyl(x, 0.3, d / 2 + 2.9, 0.3, 0.3, 3.9, 0xe9e6de, 8);
  // auditorium top + sign tower
  k.box(0, 14.3, -4, w + 0.3, 0.3, d - 7.7, 0xa7a49c);
  k.box(w / 2 - 2, 4.8, d / 2 - 2, 2.4, 14, 1.2, 0xd33a2c);
  k.box(w / 2 - 2, 10, d / 2 - 1.35, 1.9, 8, 0.06, 0xf4efe4);
  for (const x of [-w / 2 - 0.1, w / 2 + 0.1]) for (let i = 0; i < 4; i++) k.box(x, 2.0 + i * 3.0, -2, 0.1, 1.2, 1.2, 0x8d8b86);
  k.box(0, 14.6, -4, 8, 1.4, 6, 0xb7bcc2);
  return k.finish(w + 1, d + 5, 19);
}

/** অফিস ভবন: 8-floor concrete-frame office with ribbon glazing, lobby, and roof plant. */
export function buildOfficeMid(seed = 0): BuiltBuilding {
  const k = new Kit();
  const w = 26, d = 18, fh = 3.6, floors = 8, concrete = pick(seed, [0xd0cdc6, 0xc9ccd0]);
  k.box(0, 0, 0, w + 1, 0.4, d + 1, 0x9b968c);
  k.box(0, 0.4, 0, w, floors * fh + 0.6, d, concrete);
  for (const s of ['front', 'back', 'left', 'right'] as const) curtainWall(k, s, 0, 0, w, d, 1.2, floors, fh, GLASS, concrete === 0xd0cdc6 ? 0xeceae4 : 0xdfe2e6, 4.4);
  // glass lobby
  k.glass(0, 0.6, d / 2 + 0.06, 10, 4.4, 0.08, 0x4c7f9f);
  k.box(0, 4.9, d / 2 + 1.6, 12, 0.3, 3.4, 0xeceae4);
  for (const x of [-5.4, 5.4]) k.cyl(x, 0.4, d / 2 + 3.0, 0.3, 0.3, 4.5, 0xeceae4, 8);
  const top = 0.4 + floors * fh + 0.6;
  k.box(0, top, 0, w + 0.3, 0.3, d + 0.3, 0xa7a49c);
  k.parapet(0, top + 0.3, 0, w + 0.3, d + 0.3, 0.9, 0.2, concrete);
  k.box(-5, top + 0.3, -2, 8, 3.0, 7, 0xb7bcc2);
  for (let i = 0; i < 3; i++) k.box(5 + i * 3, top + 0.3, 3, 2.4, 1.4, 2.4, 0xb7bcc2);
  k.cyl(8, top + 0.3, -4, 0.06, 0.06, 7, 0x555a60, 5);
  k.box(0, top + 0.3, d / 2 - 0.35, 9, 1.6, 0.3, pick(seed, [0x2f5f8a, 0x3b6b52, 0x8a3f3a]));
  return k.finish(w + 1, d + 8, top + 4);
}

/** অফিস টাওয়ার: 30-storey glass curtain-wall tower, podium lobby, stepped crown with spire. */
export function buildOfficeTower(seed = 0): BuiltBuilding {
  const k = new Kit();
  const PW = 44, PD = 36, PH = 9;
  const glass = pick(seed, [0x2c5f7f, 0x3a6a82, 0x2f5f6a]);
  k.box(0, 0, 0, PW + 1, 0.4, PD + 1, 0x8d8b86);
  // podium: lobby with tall glass
  k.box(0, 0.4, 0, PW, PH, PD, 0xb8b4aa);
  for (const s of ['front', 'back', 'left', 'right'] as const) {
    k.onSide(s, 0, 0, PW, PD, (len, half) => {
      k.glass(0, 0.8, half + 0.05, len - 4, PH - 1.8, 0.08, 0x4c7f9f);
      for (let i = 0; i <= 10; i++) k.box(-len / 2 + 2 + ((len - 4) * i) / 10, 0.4, half + 0.1, 0.4, PH - 0.4, 0.3, 0xe9e6de);
    });
  }
  k.box(0, 0.4 + PH, 0, PW + 1.2, 0.5, PD + 1.2, 0xe9e6de);
  k.box(0, 6.5, PD / 2 + 4, 20, 0.4, 8, 0x30343a);
  for (const x of [-9, 9]) k.cyl(x, 0.4, PD / 2 + 7, 0.4, 0.4, 6.1, 0xe9e6de, 10);
  // tower shaft 24 floors, upper 6 floors narrower
  const fh = 3.8, y1 = 0.4 + PH + 0.5;
  const TW = 28, TD = 24;
  k.box(0, y1, 0, TW, 24 * fh, TD, glass);
  for (const s of ['front', 'back', 'left', 'right'] as const) curtainWall(k, s, 0, 0, TW, TD, y1 + 0.7, 24, fh, GLASS_LIGHT, 0xcfd5da, 3.5);
  const y2 = y1 + 24 * fh;
  k.box(0, y2, 0, TW - 6, 6 * fh, TD - 6, glass);
  for (const s of ['front', 'back', 'left', 'right'] as const) curtainWall(k, s, 0, 0, TW - 6, TD - 6, y2 + 0.7, 6, fh, GLASS_LIGHT, 0xcfd5da, 3.5);
  const y3 = y2 + 6 * fh;
  k.box(0, y3, 0, TW - 5.6, 0.4, TD - 5.6, 0xcfd5da);
  k.hip(0, y3 + 0.4, 0, TW - 9, TD - 9, 7, glass);
  k.cyl(0, y3 + 7.4, 0, 0.5, 0.08, 22, 0xb7bcc2, 8);
  k.sphere(0, y3 + 29.5, 0, 0.35, 0xd33a2c);
  return k.finish(PW + 1, PD + 9, y3 + 30);
}

// ---------------------------------------------------------------- hotels

/** ৩-স্টার হোটেল: 8-floor slab with a room balcony on every floor, porch, rooftop sign, small car park. */
export function buildHotel3(seed = 0): BuiltBuilding {
  const k = new Kit();
  const w = 38, d = 15, floors = 8, GF = 4.4, body = pick(seed, [0xe3d7c2, 0xe6d9c4, 0xddd6c6]);
  const acc = pick(seed, [0x8a3f3a, 0x2f5f8a, 0x3b6b52]);
  k.box(0, 0, 0, w + 1, 0.3, d + 1, 0x9b968c);
  k.box(0, 0.3, 0, w, GF, d, 0xcfc9bb);
  k.glass(0, 0.8, d / 2 + 0.06, 10, 3.2, 0.06, 0x4c7f9f);
  k.glass(-12, 0.8, d / 2 + 0.06, 8, 3.0, 0.06, GLASS);
  k.glass(12, 0.8, d / 2 + 0.06, 8, 3.0, 0.06, GLASS);
  k.box(0, 4.5, d / 2 + 2.2, 12, 0.3, 4.4, acc);
  for (const x of [-5.4, 5.4]) k.cyl(x, 0.3, d / 2 + 3.8, 0.28, 0.28, 4.3, 0xf4efe4, 8);
  const y0 = GF + 0.3, fl = floors - 1;
  k.box(0, y0, 0, w - 1, fl * FLOOR_H, d - 1, body);
  for (let f = 0; f <= fl; f++) k.box(0, y0 + f * FLOOR_H - 0.1, 0, w - 0.8, 0.22, d - 0.8, 0xf4efe4);
  k.box(w / 2 - 3, y0, 0, 4, fl * FLOOR_H, d - 0.4, acc);
  k.box(-w / 2 + 3, y0, 0, 4, fl * FLOOR_H, d - 0.4, acc);
  const g = { y0, floors: fl, ww: 1.5, wh: 1.4, sill: 0.95, glass: GLASS, frame: 0xf4efe4 };
  k.windowGrid('back', 0, 0, w - 1, d - 1, { ...g, cols: 12 });
  for (let f = 0; f < fl; f++) {
    for (let i = 0; i < 6; i++) {
      const x = -13.5 + i * 5.4;
      k.balcony('front', 0, 0, w - 1, d - 1, y0 + f * FLOOR_H, x - 1.8, x + 1.8, 1.2, 0xf4efe4, 0x6a9bb5, true);
      k.glass(x, y0 + f * FLOOR_H + 0.3, (d - 1) / 2 + 0.04, 3.0, 2.2, 0.05, GLASS);
    }
  }
  const top = y0 + fl * FLOOR_H;
  k.box(0, top, 0, w, 0.3, d, 0xa7a49c);
  k.parapet(0, top + 0.3, 0, w, d, 1.0, 0.2, body);
  k.box(0, top + 0.3, 2, 8, 2.6, 5, 0xb7bcc2);
  k.box(0, top + 1.0, d / 2 - 0.3, 14, 2.4, 0.3, acc);
  k.box(0, top + 1.5, d / 2 - 0.12, 11, 0.8, 0.05, 0xf4efe4);
  parkingLot(k, 0, d / 2 + 11.5, 30, 8, seed);
  return k.finish(w + 1, d + 17, top + 4);
}

/** ৫-স্টার হোটেল: resort-style: 22-floor glass-and-stone tower, two arcaded wings, porte-cochère with fountain, pool terrace, palms. */
export function buildHotel5(_seed = 0): BuiltBuilding {
  const k = new Kit({ 0xe8dcc0: 'stone', 0xf4efe4: 'stone', 0xb89a3a: 'metal', 0xd9b44a: 'plain' });
  const stone = 0xe8dcc0, gold = 0xd9b44a, glass = 0x2c5f7f;
  const W = 80, D = 70;
  // grounds
  k.box(0, 0, 0, W, 0.1, D, 0xcfc7b6);
  k.box(0, 0.1, 22, 30, 0.04, 26, 0xa8a49a); // forecourt paving
  // ---- tower (22 floors) ----
  const TW = 30, TD = 20, fh = 3.4, tf = 22;
  const y0 = 0.1;
  k.box(0, y0, -12, TW + 4, 8.0, TD + 4, stone); // base block
  k.box(0, y0 + 8.0, -12, TW + 4.6, 0.4, TD + 4.6, 0xf4efe4);
  k.box(0, y0 + 8.4, -12, TW, tf * fh, TD, stone);
  for (const s of ['front', 'back', 'left', 'right'] as const) {
    k.onSide(s, 0, -12, TW, TD, (len, half) => {
      for (let f = 0; f < tf; f++) {
        k.glass(0, y0 + 8.4 + f * fh + 0.5, half + 0.04, len - 5, fh - 1.3, 0.05, glass);
        k.box(0, y0 + 8.4 + f * fh - 0.1, half + 0.1, len, 0.22, 0.3, 0xf4efe4);
        // room balconies on the front/back with gold railings
        if (s === 'front' || s === 'back') k.box(0, y0 + 8.4 + f * fh + 0.2, half + 0.5, len - 4, 0.06, 0.06, gold);
      }
      for (const t of [-len / 2 + 1.0, len / 2 - 1.0]) k.box(t, y0 + 8.4, half + 0.6, 1.6, tf * fh, 1.4, stone);
    });
  }
  // stepped crown: gold-trim roof terrace restaurant + dome-ish crown
  const top = y0 + 8.4 + tf * fh;
  k.box(0, top, -12, TW + 1, 0.5, TD + 1, 0xf4efe4);
  k.box(0, top + 0.5, -12, TW - 6, 5.0, TD - 6, glass);
  k.box(0, top + 5.5, -12, TW - 4.5, 0.5, TD - 4.5, gold);
  k.hip(0, top + 6.0, -12, TW - 8, TD - 8, 6, 0xb89a3a);
  k.cyl(0, top + 12.0, -12, 0.3, 0.06, 14, 0xd9b44a, 8);
  // ---- low arcaded wings (5 floors) ----
  for (const s of [-1, 1]) {
    const wx = s * 28, wd = 16, ww = 26, wz = -4, wh = 5 * 3.2;
    k.box(wx, y0, wz, ww, wh, wd, stone);
    for (let f = 0; f <= 5; f++) k.box(wx, y0 + f * 3.2 - 0.1, wz, ww + 0.3, 0.22, wd + 0.3, 0xf4efe4);
    // arcade on the ground floor (columns) + glazed upper floors
    for (let i = 0; i < 7; i++) k.cyl(wx - ww / 2 + 1.8 + i * ((ww - 3.6) / 6), y0, wz + wd / 2 + 1.3, 0.3, 0.3, 3.1, 0xf4efe4, 10);
    k.box(wx, y0 + 3.1, wz + wd / 2 + 0.8, ww, 0.3, 2.2, 0xf4efe4);
    k.glass(wx, y0 + 0.6, wz + wd / 2 + 0.05, ww - 2, 2.2, 0.05, 0x4c7f9f);
    for (let f = 1; f < 5; f++) {
      k.glass(wx, y0 + f * 3.2 + 0.5, wz + wd / 2 + 0.05, ww - 3, 1.9, 0.05, glass);
      k.box(wx, y0 + f * 3.2 + 0.2, wz + wd / 2 + 0.7, ww - 2, 0.08, 0.08, gold);
    }
    k.box(wx, y0 + wh, wz, ww + 0.5, 0.3, wd + 0.5, 0xa7a49c);
    k.parapet(wx, y0 + wh + 0.3, wz, ww + 0.5, wd + 0.5, 0.8, 0.2, stone);
    k.hip(wx, y0 + wh + 0.3, wz, ww - 6, wd - 4, 3.4, 0xa8452b);
  }
  // ---- grand porte-cochère in front of the tower base ----
  k.box(0, y0 + 5.2, 4.0, 16, 0.5, 9, 0xf4efe4);
  k.box(0, y0 + 5.7, 4.0, 16.4, 0.3, 9.4, gold);
  for (const x of [-7, 7]) for (const z of [0.5, 8.0]) k.cyl(x, y0, z, 0.55, 0.5, 5.2, 0xf4efe4, 12);
  k.glass(0, y0 + 0.8, -1.9, 10, 4.2, 0.08, 0x4c7f9f);
  // circular drive with fountain
  k.cyl(0, 0.1, 22, 11, 11, 0.06, 0x6a6d72, 24);
  k.cyl(0, 0.16, 22, 5.4, 5.4, 0.3, 0xe9e6de, 24);
  k.cyl(0, 0.2, 22, 4.8, 4.8, 0.2, 0x4cb0d0, 24);
  k.cyl(0, 0.3, 22, 0.9, 0.5, 2.4, 0xf4efe4, 10);
  k.cyl(0, 2.7, 22, 1.8, 0.6, 0.4, 0xf4efe4, 12);
  k.cyl(0, 3.0, 22, 0.1, 0.1, 1.4, 0x9ad8ee, 6);
  car(k, 9.5, 20.5, 0.5, 0x1d1f24);
  car(k, -9, 24, 2.5, 0xf4efe4);
  // ---- pool terrace behind (back) ----
  const pz = -32;
  k.box(0, 0.1, pz, 36, 0.2, 14, 0xe9e6de);
  k.box(0, 0.25, pz, 30, 0.08, 8, 0x38a8cc);
  for (let i = 0; i < 8; i++) {
    const x = -14 + i * 4;
    k.box(x, 0.3, pz + 6.0, 1.2, 0.35, 2.0, 0xf4efe4);
  }
  for (let i = 0; i < 4; i++) {
    const x = -10 + i * 7;
    k.cyl(x, 0.3, pz - 5.2, 0.05, 0.05, 2.4, 0x555a60, 5);
    k.hip(x, 2.5, pz - 5.2, 3.4, 3.4, 0.7, [0xf4efe4, gold][i % 2]!);
  }
  // ---- gardens, palms, lawns ----
  for (const sx of [-1, 1]) {
    k.box(sx * 27, 0.1, 22, 20, 0.05, 20, 0x74b05a);
    for (let i = 0; i < 4; i++) k.box(sx * 27 + (i % 2 ? 4 : -4), 0.15, 16 + Math.floor(i / 2) * 8, 0.9, 0.9, 7, 0x2f6a30);
  }
  for (let i = 0; i < 7; i++) {
    const x = -34 + i * 11.3;
    for (const z of [30.5]) {
      k.cyl(x, 0.1, z, 0.28, 0.16, 8.4 + (i % 2) * 1.2, 0x7a6a50, 7);
      k.sphere(x, 8.6 + (i % 2) * 1.2, z, 0.35, 0x6b8a3a);
      for (let j = 0; j < 7; j++) {
        k.local(x, 8.6 + (i % 2) * 1.2, z, (j * Math.PI * 2) / 7, () => k.withMatrix(new THREE.Matrix4().makeRotationZ(-0.5), () => k.box(1.5, 0, 0, 3.0, 0.06, 0.6, 0x3f7a35)));
      }
    }
  }
  for (const [x, z] of [[-36, -18], [36, -18], [-36, -34], [36, -34], [-20, -32], [20, -32]] as const) k.tree(x, z, 7, 0x3f7a35);
  // gate pillars
  for (const s of [-1, 1]) {
    k.box(s * 6, 0.1, D / 2 - 0.5, 1.2, 4.5, 1.2, stone);
    k.box(s * 6, 4.6, D / 2 - 0.5, 1.6, 0.2, 1.6, gold);
  }
  return k.finish(W, D, top + 26);
}
