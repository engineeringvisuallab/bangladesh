import * as THREE from 'three';
import { Kit, pick, rng, type BuiltBuilding } from './BuildingKit';

/**
 * VILLAGE COMPOUNDS (whole sites, not single buildings):
 *   - buildVillageBazaar: গ্রামের হাট-বাজার (plaza, বটগাছ, tin shop rows, haat shed, tarp stalls, market building, rickshaw/van)
 *   - buildBaganbari:     বাগানবাড়ি (veranda house, orchard, flower garden, pond + ghat, gazebo, cowshed, swing)
 */

const GLASS = 0x2f4f66;

// ---------- small shared props ----------

function wheelX(k: Kit, x: number, y: number, z: number, r: number, w: number, color = 0x2b2b2b): void {
  k.withMatrix(new THREE.Matrix4().makeTranslation(x, y, z).multiply(new THREE.Matrix4().makeRotationZ(Math.PI / 2)), () => {
    k.cyl(0, -w / 2, 0, r, r, w, color, 10);
  });
}

/** Cycle rickshaw, faces +Z. */
function rickshaw(k: Kit, x: number, z: number, ry: number, hood: number): void {
  k.local(x, 0, z, ry, () => {
    wheelX(k, -0.55, 0.35, -0.5, 0.35, 0.05);
    wheelX(k, 0.55, 0.35, -0.5, 0.35, 0.05);
    wheelX(k, 0, 0.3, 1.2, 0.3, 0.05);
    k.box(0, 0.5, -0.4, 1.0, 0.12, 1.2, 0x2f4f66);
    k.box(0, 0.62, -0.7, 0.9, 0.5, 0.2, hood);
    k.box(0, 0.62, 0.0, 0.9, 0.12, 0.45, 0xb02a2a);
    k.sphere(0, 1.15, -0.6, 0.62, hood, 0.7);
    k.box(0, 0.45, 0.6, 0.06, 0.06, 1.2, 0x333333);
    k.box(0, 0.95, 1.1, 0.7, 0.05, 0.05, 0x333333);
  });
}

/** Flat-bed van-gari (cargo rickshaw van) loaded with sacks. */
function vanGari(k: Kit, x: number, z: number, ry: number, load: number): void {
  k.local(x, 0, z, ry, () => {
    wheelX(k, -0.75, 0.33, -0.2, 0.33, 0.06);
    wheelX(k, 0.75, 0.33, -0.2, 0.33, 0.06);
    k.box(0, 0.5, -0.3, 1.5, 0.12, 2.4, 0x7a5a3a);
    for (let i = 0; i < 3; i++) k.box(-0.35 + (i % 2) * 0.7, 0.62, -1.0 + i * 0.7, 0.6, 0.45, 0.5, load);
    k.box(0, 0.62, -0.5, 0.6, 0.4, 0.5, 0xd8cfae);
    k.box(0, 0.7, 1.2, 0.7, 0.05, 0.4, 0x3a3a3a);
  });
}

/** Power pole with cross arm. */
function pole(k: Kit, x: number, z: number): void {
  k.cyl(x, 0, z, 0.14, 0.1, 8.0, 0x8d8b86, 8);
  k.box(x, 7.3, z, 2.4, 0.12, 0.12, 0x3b3b3b);
  for (const dx of [-1.0, 0, 1.0]) k.box(x + dx, 7.42, z, 0.08, 0.15, 0.08, 0xdddddd);
}

function sackPile(k: Kit, x: number, z: number, n: number, color: number): void {
  for (let i = 0; i < n; i++) k.box(x + (i % 3) * 0.55 - 0.55, 0.3 + Math.floor(i / 3) * 0.38, z + (i % 2) * 0.1, 0.5, 0.36, 0.38, color);
}

export function palm(k: Kit, x: number, z: number, h: number): void {
  k.cyl(x, 0, z, 0.2, 0.12, h, 0x7a6a50, 7);
  k.sphere(x, h, z, 0.3, 0x6b8a3a);
  for (let i = 0; i < 7; i++) {
    k.local(x, h, z, (i * Math.PI * 2) / 7, () => {
      k.withMatrix(new THREE.Matrix4().makeRotationZ(-0.5), () => k.box(1.3, 0, 0, 2.6, 0.06, 0.55, 0x3f7a35));
    });
  }
  k.cyl(x + 0.3, h - 0.5, z, 0.2, 0.2, 0.5, 0x8aa84a, 6);
}

function banana(k: Kit, x: number, z: number): void {
  k.cyl(x, 0, z, 0.12, 0.1, 2.4, 0x8aa84a, 6);
  for (let i = 0; i < 5; i++) {
    k.local(x, 2.3, z, (i * Math.PI * 2) / 5, () => {
      k.withMatrix(new THREE.Matrix4().makeRotationZ(-0.55), () => k.box(0.9, 0, 0, 1.8, 0.05, 0.6, 0x55a63c));
    });
  }
}

// ======================================================================
// VILLAGE BAZAAR
// ======================================================================

type ShopKind = 'grocery' | 'tea' | 'cloth' | 'sweets' | 'veg' | 'pharmacy' | 'tailor';
const SHOP_KINDS: ShopKind[] = ['grocery', 'tea', 'cloth', 'sweets', 'veg', 'pharmacy', 'tailor'];
const SIGN = [0xc0392b, 0x2f6f9f, 0x3b8a55, 0xd49a2a, 0x7a4a9a, 0x2a8a8a];

/** One shop, drawn in a local frame facing +Z; origin = shop centre. */
function shop(k: Kit, kind: ShopKind, w: number, d: number, pucca: boolean, seed: number): void {
  const wallC = pucca ? pick(seed, [0xe3d7c2, 0xe9d9a0, 0xcfe0c4, 0xe9c9c0]) : pick(seed, [0x9fb0b5, 0x6f9fb8, 0xb7a58a]);
  const roofC = pick(seed + 3, [0x8d9aa0, 0x9a5a3a, 0x7f8a8e]);
  k.box(0, 0, 0, w + 0.1, 0.3, d + 0.1, 0x9b8f84);
  // back + side walls (open front)
  k.box(0, 0.3, -d / 2 + 0.06, w, 2.7, 0.12, wallC);
  for (const s of [-1, 1]) k.box(s * (w / 2 - 0.06), 0.3, 0, 0.12, 2.7, d, wallC);
  // front pillars + beam, raised rolling shutter
  for (const s of [-1, 1]) k.box(s * (w / 2 - 0.12), 0.3, d / 2 - 0.12, 0.24, 2.9, 0.24, pucca ? 0xf1ede4 : 0x5a3f2a);
  k.box(0, 3.0, d / 2 - 0.12, w, 0.3, 0.3, pucca ? 0xf1ede4 : 0x5a3f2a);
  k.box(0, 2.55, d / 2 - 0.05, w - 0.5, 0.45, 0.14, 0x6a6f73);
  // sign board
  const sc = pick(seed + 7, SIGN);
  k.box(0, 3.35, d / 2 - 0.08, w - 0.3, 0.7, 0.1, sc);
  k.box(0, 3.5, d / 2 - 0.02, w - 1.2, 0.18, 0.04, 0xf4efe4);
  // roof: shed sloping to the front (low at +z)
  if (pucca) {
    k.box(0, 3.15, 0, w + 0.1, 0.2, d + 0.2, 0xa7a49c);
    k.parapet(0, 3.35, 0, w + 0.1, d + 0.2, 0.5, 0.14, wallC);
  } else {
    k.local(0, 3.2, 0, Math.PI / 2, () => k.shed(0, 0, 0, d + 1.0, w + 0.3, 0.15, 0.85, roofC));
  }
  // goods
  switch (kind) {
    case 'grocery':
      sackPile(k, -0.6, -1.2, 6, 0xd8cfae);
      sackPile(k, 0.9, -1.2, 5, 0xc9a56a);
      k.box(0, 0.3, 1.0, w - 0.8, 0.8, 0.7, 0x7a5a3a);
      for (let i = 0; i < 4; i++) k.cyl(-1.2 + i * 0.8, 1.1, 1.0, 0.18, 0.18, 0.3, [0xd9a63a, 0xb24a3a, 0x4a8a5a, 0xd8d8d0][i]!, 8);
      break;
    case 'tea':
      k.box(0, 0.3, 0.9, w - 1.0, 0.9, 0.7, 0x8a6a45);
      k.cyl(-0.8, 1.2, 0.9, 0.22, 0.2, 0.5, 0xb8c0c4, 8);
      k.cyl(0.0, 1.2, 0.9, 0.2, 0.2, 0.4, 0xc0392b, 8);
      for (let i = 0; i < 5; i++) k.box(-0.8 + i * 0.4, 2.0, d / 2 - 0.3, 0.12, 0.5, 0.12, 0xe3c33a); // hanging bananas
      k.box(0.2, 0, d / 2 + 0.7, 2.0, 0.45, 0.45, 0x7a5a3a); // bench outside
      k.box(1.1, 0, d / 2 + 1.5, 0.45, 0.45, 1.4, 0x7a5a3a);
      break;
    case 'cloth':
      for (let i = 0; i < 6; i++) k.box(-(w / 2 - 0.5) + i * ((w - 1.0) / 5), 1.0, d / 2 - 0.25, 0.55, 1.5, 0.05, [0xc0392b, 0x2f6f9f, 0xd49a2a, 0x3b8a55, 0x9a4a9a, 0xe9e6de][i]!);
      k.box(0, 0.3, 0.2, w - 1.4, 0.8, 0.8, 0xe9e6de);
      break;
    case 'sweets':
      k.glass(0, 1.0, 0.9, w - 1.2, 0.9, 0.7, 0x6a9bb5);
      k.box(0, 0.3, 0.9, w - 1.0, 0.75, 0.75, 0x7a5a3a);
      for (let i = 0; i < 5; i++) k.cyl(-1.4 + i * 0.7, 1.35, 0.9, 0.2, 0.2, 0.12, [0xe9a23a, 0xe9e6de, 0xc0392b, 0xd8a050, 0x8a4a2a][i]!, 8);
      k.cyl(0, 0.3, -1.2, 0.7, 0.6, 0.7, 0x2b2b2b, 10); // frying pan stand
      break;
    case 'veg':
      for (let i = 0; i < 4; i++) {
        k.box(-1.5 + i * 1.0, 0.3, 0.9, 0.85, 0.35, 0.8, 0x8a6a45);
        for (let j = 0; j < 3; j++) k.sphere(-1.7 + i * 1.0 + j * 0.25, 0.8, 0.9 + (j % 2) * 0.2, 0.15, [0xc0392b, 0x55a63c, 0xe9a23a, 0x7a4a9a][i]!);
      }
      break;
    case 'pharmacy':
      k.box(0, 0.3, 0.9, w - 0.8, 0.9, 0.6, 0xe9e6de);
      k.box(0, 1.2, -1.8, w - 0.6, 1.5, 0.35, 0xd6dde6);
      k.box(-w / 2 + 0.6, 3.35, d / 2 + 0.0, 0.5, 0.5, 0.08, 0x3b8a55);
      break;
    case 'tailor':
      k.box(-0.8, 0.3, 0.2, 1.2, 0.8, 0.7, 0x5a4a3a);
      k.box(-0.8, 1.1, 0.2, 0.6, 0.3, 0.4, 0x2b2b2b);
      k.box(1.0, 0.3, -1.4, 1.2, 1.4, 0.5, 0x8a6a45);
      break;
  }
}

/** Row of n shops, local frame facing +Z, centred on origin. */
function shopRow(k: Kit, n: number, w: number, d: number, pucca: boolean, seed: number): void {
  for (let i = 0; i < n; i++) {
    const kind = pick(seed + i * 5, SHOP_KINDS);
    k.local((i - (n - 1) / 2) * w, 0, 0, 0, () => shop(k, kind, w, d, pucca, seed + i));
  }
}

function tarpStall(k: Kit, x: number, z: number, color: number, goods: number, seed: number): void {
  const r = rng(seed);
  for (const dx of [-1.2, 1.2]) for (const dz of [-1.0, 1.0]) k.cyl(x + dx, 0, z + dz, 0.05, 0.05, 2.3, 0xc7b36a, 5);
  k.hip(x, 2.2, z, 3.2, 2.8, 0.7, color);
  k.box(x, 0.6, z, 2.2, 0.08, 1.4, 0x8a6a45);
  k.box(x - 0.9, 0, z, 0.1, 0.6, 1.2, 0x8a6a45);
  k.box(x + 0.9, 0, z, 0.1, 0.6, 1.2, 0x8a6a45);
  for (let i = 0; i < 9; i++) k.sphere(x - 0.9 + (i % 5) * 0.45, 0.78, z - 0.3 + Math.floor(i / 5) * 0.5 + r() * 0.1, 0.17, goods);
}

/** Banyan (বটগাছ) with a round masonry seat (চাতাল) around the trunk. */
function banyan(k: Kit, x: number, z: number): void {
  k.cyl(x, 0, z, 3.8, 3.8, 0.55, 0xb9a98a, 12);
  k.cyl(x, 0.55, z, 3.2, 3.2, 0.05, 0x9b8f7a, 12);
  k.cyl(x, 0, z, 1.0, 0.7, 5.0, 0x6b5a45, 9);
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * Math.PI * 2;
    k.cyl(x + Math.cos(a) * 1.5, 0, z + Math.sin(a) * 1.5, 0.28, 0.18, 4.2 + (i % 3) * 0.6, 0x6b5a45, 6);
  }
  const crown = [0x3f6f38, 0x4b7f3f, 0x386230];
  k.sphere(x, 8.0, z, 5.0, crown[0]!, 0.7);
  k.sphere(x + 3.8, 6.8, z + 1.5, 3.6, crown[1]!, 0.75);
  k.sphere(x - 3.6, 7.0, z - 1.5, 3.8, crown[2]!, 0.75);
  k.sphere(x + 0.8, 9.6, z - 3.0, 3.2, crown[1]!, 0.8);
  k.sphere(x - 0.6, 6.4, z + 3.6, 3.0, crown[0]!, 0.8);
  // aerial roots
  for (const [dx, dz] of [[3.8, 1.5], [-3.6, -1.5], [-0.6, 3.6], [0.8, -3.0]] as const) k.cyl(x + dx, 0, z + dz, 0.06, 0.06, 4.6, 0x6b5a45, 4);
}

/** গ্রামের হাট-বাজার. Plaza 64 x 48 m, front gate on +Z. */
export function buildVillageBazaar(seed = 0): BuiltBuilding {
  const k = new Kit();
  const W = 64, D = 48;
  // packed-earth plaza with a lighter walking lane
  k.box(0, 0, 0, W, 0.12, D, 0xb59a74);
  k.box(0, 0.12, 6, 8, 0.02, D - 4, 0xc4ab85);
  k.box(0, 0.12, 4, W - 8, 0.02, 7, 0xc4ab85);

  // back row of 7 tin-shed shops
  k.local(-14, 0.12, -19, 0, () => shopRow(k, 7, 4.6, 5.2, false, seed + 1));
  // two-storey brick market building (shops below, rooms / office above)
  k.local(10.5, 0.12, -18.5, 0, () => {
    const w = 13, d = 8, wall = 0xe3d7c2;
    k.box(0, 0, 0, w + 0.4, 0.3, d + 0.4, 0x9b8f84);
    k.box(0, 0.3, 0, w, 6.4, d, wall);
    k.box(0, 3.3, 0, w + 0.2, 0.2, d + 0.2, 0xf4efe4);
    for (let i = 0; i < 3; i++) {
      const x = -4.3 + i * 4.3;
      k.box(x, 0.3, d / 2 + 0.04, 3.4, 2.6, 0.1, 0x6a6f73);
      k.box(x, 3.5, d / 2 + 0.05, 1.3, 1.6, 0.06, 0x3f6b4a);
      k.glass(x, 3.6, d / 2 + 0.09, 1.0, 1.4, 0.04, GLASS);
    }
    k.balcony('front', 0, 0, w, d, 3.3, -w / 2 + 0.4, w / 2 - 0.4, 1.0, 0xf4efe4, 0x7a7a78);
    k.windowGrid('left', 0, 0, w, d, { y0: 0.3, floors: 2, cols: 2, ww: 1.1, wh: 1.3, sill: 0.9, glass: GLASS, frame: 0x3f6b4a });
    k.windowGrid('back', 0, 0, w, d, { y0: 0.3, floors: 2, cols: 3, ww: 1.1, wh: 1.3, sill: 0.9, glass: GLASS, frame: 0x3f6b4a });
    k.box(0, 6.7, 0, w + 0.3, 0.2, d + 0.3, 0xa7a49c);
    k.parapet(0, 6.9, 0, w + 0.3, d + 0.3, 0.9, 0.18, wall);
    k.box(0, 7.9, d / 2 - 0.1, 8.0, 1.3, 0.2, 0x2f5f8a);
    k.box(0, 8.1, d / 2 + 0.02, 6.8, 0.6, 0.04, 0xf4efe4);
    k.waterTank(-w / 2 + 1.8, 6.9, -1.5, 0.9);
  });
  // left row (4 tin-shed shops) facing the plaza
  k.local(-28.5, 0.12, 2, Math.PI / 2, () => shopRow(k, 5, 4.6, 5.0, false, seed + 20));
  // right row: 4 semi-pucca (concrete) shops
  k.local(28.5, 0.12, 2, -Math.PI / 2, () => shopRow(k, 5, 4.6, 5.0, true, seed + 40));

  // open haat shed (tin roof on bamboo / timber posts) with counters
  k.local(13, 0.12, 4, 0, () => {
    for (let ix = 0; ix < 5; ix++) for (let iz = 0; iz < 3; iz++) k.cyl(-8 + ix * 4, 0, -3.5 + iz * 3.5, 0.1, 0.09, 3.2, 0xb59f55, 6);
    k.local(0, 3.2, 0, Math.PI / 2, () => k.tinRoof(0, 0, 0, 10.5, 17.5, 1.6, 0x8d9aa0, 0xb6c0c4));
    for (let row = 0; row < 2; row++) {
      for (let i = 0; i < 4; i++) {
        const x = -7 + i * 4.3, z = -1.8 + row * 3.6;
        k.box(x, 0, z, 3.2, 0.8, 1.0, 0x8a6a45);
        const prod = [[0xc0392b, 0x55a63c, 0xe9a23a, 0x7a4a9a], [0xe9a23a, 0xd8cfae, 0x55a63c, 0xc0392b]][row]!;
        for (let j = 0; j < 7; j++) k.sphere(x - 1.2 + j * 0.4, 0.95, z + ((j % 2) - 0.5) * 0.3, 0.17, prod[(j + i) % 4]!);
      }
    }
    // fish tubs
    for (let i = 0; i < 3; i++) k.cyl(-7.5 + i * 1.1, 0, 3.3, 0.5, 0.45, 0.4, 0x2f6f9f, 8);
  });

  // banyan tree
  banyan(k, -6, 8);

  // tarp stalls on the plaza
  const tarp = [0xc0392b, 0x2f6f9f, 0xd49a2a, 0x3b8a55, 0xe9e6de, 0x9a4a9a];
  const goods = [0xe9a23a, 0xc0392b, 0x55a63c, 0xd8c43a, 0xa24a8a];
  [[-18, 13], [-12, 18], [2, 14], [4, 20], [-1, 5], [-14, -4], [20, 17], [22, -6]].forEach(([x, z], i) => tarpStall(k, x!, z!, pick(seed + i, tarp), pick(seed + i * 3, goods), seed + i));

  // vehicles
  rickshaw(k, -3, 21, 0.3, 0xc0392b);
  rickshaw(k, 6, 8, -2.4, 0x2f6f9f);
  rickshaw(k, -22, -9, 1.2, 0xd49a2a);
  vanGari(k, 18, 19, 0.5, 0xd8cfae);
  vanGari(k, -9, -7, 1.8, 0xc9a56a);
  vanGari(k, 24, 8, 0, 0xd8cfae);

  // entrance gate (arch board) at the front
  for (const s of [-1, 1]) {
    k.box(s * 6.5, 0, D / 2 - 1, 0.9, 5.2, 0.9, 0xe9e6de);
    k.box(s * 6.5, 5.2, D / 2 - 1, 1.2, 0.2, 1.2, 0xc0392b);
  }
  k.box(0, 4.4, D / 2 - 1, 13.0, 1.5, 0.35, 0x2f5f8a);
  k.box(0, 4.7, D / 2 - 0.8, 10.4, 0.75, 0.05, 0xf4efe4);
  // power poles
  for (const [x, z] of [[-26, 20], [26, 20], [-26, -12], [26, -12], [0, -3]] as const) pole(k, x, z);
  // trees at the edges
  for (const [x, z] of [[-30, 22], [30, 21], [-30, -22], [31, -22]] as const) k.tree(x, z, 8, 0x3f7a35);
  return k.finish(W, D, 12.5);
}

// ======================================================================
// BAGANBARI
// ======================================================================

function mangoTree(k: Kit, x: number, z: number, h: number, seed: number): void {
  const c = pick(seed, [0x3f7a35, 0x2f6a30, 0x4b8a3f]);
  k.cyl(x, 0, z, 0.3, 0.2, h * 0.5, 0x5a4330, 7);
  k.sphere(x, h * 0.78, z, h * 0.38, c, 0.85);
  k.sphere(x + h * 0.2, h * 0.62, z + h * 0.1, h * 0.26, c, 0.9);
  k.sphere(x - h * 0.18, h * 0.66, z - h * 0.1, h * 0.27, c, 0.9);
  // a few mangoes
  for (let i = 0; i < 3; i++) k.sphere(x + (i - 1) * 0.8, h * 0.52 - (i % 2) * 0.2, z + 1.4, 0.12, 0xe9c23a);
}

function flowerBed(k: Kit, x: number, z: number, w: number, d: number, colors: number[], seed: number): void {
  const r = rng(seed);
  k.box(x, 0, z, w, 0.22, d, 0x5a4330);
  k.box(x, 0.2, z, w - 0.3, 0.05, d - 0.3, 0x4f8a3a);
  const n = Math.round(w * d * 1.1);
  for (let i = 0; i < n; i++) {
    const fx = x + (r() - 0.5) * (w - 0.6), fz = z + (r() - 0.5) * (d - 0.6);
    k.sphere(fx, 0.5 + r() * 0.25, fz, 0.12, colors[i % colors.length]!);
  }
}

function gazebo(k: Kit, x: number, z: number): void {
  k.cyl(x, 0, z, 2.1, 2.1, 0.3, 0xe9e6de, 6);
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    k.cyl(x + Math.cos(a) * 1.8, 0.3, z + Math.sin(a) * 1.8, 0.1, 0.1, 2.6, 0xf4efe4, 6);
  }
  k.cyl(x, 2.9, z, 2.3, 2.3, 0.2, 0xe9e6de, 6);
  k.cyl(x, 3.1, z, 2.5, 0.2, 1.4, 0xa8452b, 6);
  k.sphere(x, 4.6, z, 0.18, 0xd9b44a);
  // bench
  k.box(x, 0.3, z, 1.8, 0.3, 0.5, 0x7a5a3a);
}

/** বাগানবাড়ি. Walled garden estate ~ 52 x 52 m, gate on +Z. */
export function buildBaganbari(seed = 0): BuiltBuilding {
  const k = new Kit();
  const W = 52, D = 52, cz = -2;
  const wall = pick(seed, [0xe8d9a8, 0xe6e1d4]);
  const trim = 0xf4efe4;

  // lawn ground
  k.box(0, 0, cz, W - 0.6, 0.08, D - 0.6, 0x74b05a);
  // brick path from the gate to the veranda
  k.box(0, 0.08, 11, 2.6, 0.04, 26, 0xb8654a);

  // ---------- main house ----------
  const hz = -8; // block centre z
  k.box(0, 0, hz + 1.6, 15.6, 1.0, 12.4, 0xcfc7b6); // plinth + veranda floor
  k.box(0, 1.0, hz, 14, 4.4, 8, wall);
  k.box(0, 1.0, hz, 14.15, 0.35, 8.15, trim);
  k.box(0, 5.05, hz, 14.15, 0.35, 8.15, trim);
  // front windows with green shutters, central door
  k.windowGrid('front', 0, hz, 14, 8, { y0: 1.0, floors: 1, cols: 5, ww: 1.1, wh: 2.2, sill: 0.7, glass: GLASS, frame: 0x3f6b4a, skip: (_f, c) => c === 2 });
  k.box(0, 1.0, hz + 4.04, 1.5, 2.8, 0.1, 0x5a3a24);
  k.box(0, 3.8, hz + 4.04, 1.5, 0.35, 0.1, 0x5a3a24);
  k.windowGrid('left', 0, hz, 14, 8, { y0: 1.0, floors: 1, cols: 2, ww: 1.1, wh: 2.2, sill: 0.7, glass: GLASS, frame: 0x3f6b4a });
  k.windowGrid('right', 0, hz, 14, 8, { y0: 1.0, floors: 1, cols: 2, ww: 1.1, wh: 2.2, sill: 0.7, glass: GLASS, frame: 0x3f6b4a });
  k.windowGrid('back', 0, hz, 14, 8, { y0: 1.0, floors: 1, cols: 5, ww: 1.1, wh: 2.2, sill: 0.7, glass: GLASS, frame: 0x3f6b4a });
  // veranda: columns, beam, balustrade, steps
  const vz = hz + 4 + 1.6;
  for (let i = 0; i < 7; i++) {
    const x = -6.6 + i * 2.2;
    k.cyl(x, 1.0, vz, 0.24, 0.2, 3.5, trim, 10);
    k.box(x, 4.5, vz, 0.6, 0.18, 0.6, trim);
    if (i < 6 && i !== 2 && i !== 3) k.box(x + 1.1, 1.0, vz, 2.0, 0.9, 0.12, trim);
  }
  k.box(0, 4.6, vz, 15.2, 0.4, 0.4, trim);
  for (let i = 0; i < 3; i++) k.box(0, i * 0.33, vz + 0.9 + (2 - i) * 0.4, 2.8, 0.33, 0.4, 0xcfc7b6);
  // roofs: hip over the block, lean-to over the veranda, dormer, chimney
  k.hip(0, 5.4, hz, 16.4, 10.4, 3.4, 0xa8452b);
  k.local(0, 4.55, vz - 0.9, Math.PI / 2, () => k.shed(0, 0, 0, 3.6, 15.6, 0.1, 0.95, 0xa8452b));
  k.box(5.2, 6.8, hz - 0.5, 0.9, 2.6, 0.9, 0xb8654a);
  k.box(5.2, 9.3, hz - 0.5, 1.2, 0.15, 1.2, 0x8d8b86);
  k.gable(0, 6.6, hz + 1.2, 3.4, 2.6, 1.7, 0xa8452b);
  k.box(0, 6.7, hz + 2.4, 1.2, 1.2, 0.1, trim);
  k.glass(0, 6.85, hz + 2.46, 0.8, 0.9, 0.04, GLASS);

  // kitchen block (tin roof) behind-right + chimney
  k.box(10.5, 0, hz - 2, 6, 3.0, 5, 0xd9c9a8);
  k.local(10.5, 3.0, hz - 2, Math.PI / 2, () => k.shed(0, 0, 0, 6.0, 6.6, 0.15, 1.0, 0x8d9aa0));
  k.cyl(11.8, 3.0, hz - 3.6, 0.25, 0.2, 2.2, 0xb0603a, 8);
  k.box(10.5, 0, hz + 0.54, 1.0, 2.1, 0.08, 0x5a3a24);

  // ---------- boundary ----------
  k.boundaryWall(0, cz, W, D, 0xd9ceb8, 0x8d8b86, 5.0, 1.5);
  k.box(-3.2, 0, cz + D / 2 - 0.1, 0.4, 3.0, 0.4, 0xd9ceb8);

  // ---------- orchard (left): 3 x 4 mango trees, a swing, guava ----------
  for (let ix = 0; ix < 3; ix++) for (let iz = 0; iz < 4; iz++) {
    mangoTree(k, -21 + ix * 5.6, -22 + iz * 6.6 + (ix % 2) * 1.5, 7.2 + ((ix + iz) % 3) * 0.8, seed + ix * 4 + iz);
  }
  // swing (ঝুলনা)
  k.cyl(-12.8, 0, 15.5, 0.08, 0.08, 3.4, 0x6b4a2f, 6);
  k.cyl(-10.8, 0, 15.5, 0.08, 0.08, 3.4, 0x6b4a2f, 6);
  k.box(-11.8, 3.3, 15.5, 2.3, 0.12, 0.12, 0x6b4a2f);
  k.box(-12.2, 1.0, 15.5, 0.03, 2.3, 0.03, 0xd8cfae);
  k.box(-11.4, 1.0, 15.5, 0.03, 2.3, 0.03, 0xd8cfae);
  k.box(-11.8, 0.9, 15.5, 1.0, 0.08, 0.35, 0x8a6a45);
  for (const [x, z] of [[-17, 12], [-22, 7], [-8, 18]] as const) k.tree(x, z, 5.2, 0x4f8a3a);

  // ---------- flower garden (right) ----------
  const cols = [[0xc0392b, 0xe9e6de], [0xe9c23a, 0xd8731e], [0xe56aa0, 0xe9e6de], [0x9a5ac0, 0xe9c23a]];
  for (let i = 0; i < 4; i++) flowerBed(k, 11.5 + (i % 2) * 8.5, 6 + Math.floor(i / 2) * 7, 6.4, 4.8, cols[i]!, seed + 11 + i);
  gazebo(k, 15.5, 13.5);
  // hedge rows
  k.box(15.5, 0, 1.2, 18, 0.9, 0.7, 0x2f6a30);
  k.box(15.5, 0, 17.6, 7, 0.9, 0.7, 0x2f6a30);
  // fruit + palms along the right wall
  for (let i = 0; i < 5; i++) palm(k, 23.2, -12 + i * 6.2, 8.0 + (i % 2) * 1.5);
  banana(k, 22, 18); banana(k, 21, 19.4); banana(k, 23, 19.6);
  // vegetable plots behind the kitchen
  for (let i = 0; i < 4; i++) {
    k.box(18 + (i % 2) * 3.4, 0.08, -14 + Math.floor(i / 2) * 3.4, 3.0, 0.22, 3.0, 0x5a4330);
    for (let j = 0; j < 4; j++) k.box(17.2 + (i % 2) * 3.4 + j * 0.55, 0.3, -14 + Math.floor(i / 2) * 3.4, 0.3, 0.3, 2.4, [0x55a63c, 0x3f8a3a, 0x6bb04a, 0x3f8a3a][j]!);
  }

  // ---------- pond with ghat (back) ----------
  const px = -2, pz = -22;
  k.box(px, 0.08, pz, 20, 0.3, 10.5, 0x7a5a3a); // raised mud bank
  k.box(px, 0.34, pz, 18.6, 0.08, 9.1, 0x3f9ab8); // water
  for (let i = 0; i < 9; i++) k.cyl(px - 8 + ((i * 7) % 15) * 1.1, 0.4, pz - 3 + ((i * 5) % 7) * 0.9, 0.35, 0.35, 0.03, i % 3 === 0 ? 0xe56aa0 : 0x3f8a3a, 8);
  // ghat (steps down to the water, front of pond)
  for (let i = 0; i < 4; i++) k.box(px, 0.08, pz + 4.4 - i * 0.55, 5 - i * 0.2, 0.2 + (3 - i) * 0.1, 0.55, 0xe9e6de);
  for (const s of [-1, 1]) {
    k.box(px + s * 2.8, 0.08, pz + 5.6, 0.6, 1.4, 0.6, 0xe9e6de);
    k.box(px + s * 2.8, 1.48, pz + 5.6, 0.8, 0.1, 0.8, 0xc0392b);
  }
  // coconut palms on the pond bank
  for (const [dx, dz] of [[-9.0, -3.5], [-9.5, 1.5], [8.8, -3.0], [9.4, 2.4], [0, -5.9]] as const) palm(k, px + dx, pz + dz, 9 + ((dx * 3) % 2));
  // small bamboo bridge on the right of the pond
  for (let i = 0; i < 6; i++) k.cyl(px + 11 + i * 0.5, 0.0, pz - 1.0, 0.08, 0.08, 0.6 + (i < 3 ? i : 5 - i) * 0.1, 0xc7b36a, 5);

  // ---------- back-left: cowshed with hay, chicken coop, dovecote, well ----------
  k.box(-18, 0, -25.5, 8, 0.2, 5.0, 0x8a6a4a);
  for (const x of [-21.5, -14.5]) for (const z of [-27.5, -23.5]) k.cyl(x, 0.2, z, 0.1, 0.09, 2.4, 0xb59f55, 6);
  k.gable(-18, 2.5, -25.5, 5.8, 9.0, 1.6, 0xb8964a);
  k.box(-18, 0.2, -27.4, 7.6, 1.0, 0.1, 0xb59f55);
  k.box(-19.5, 0.2, -25.5, 1.0, 1.1, 0.5, 0x9b8f84); // trough
  k.box(-16.2, 0.2, -25.8, 0.9, 0.9, 1.8, 0xe9e6de); // cow body (simple)
  k.cyl(-12, 0, -26, 1.1, 1.1, 0.3, 0x8a6a2a, 10);
  k.cyl(-12, 0.3, -26, 1.2, 0.2, 2.2, 0xd0ac52, 10); // haystack
  k.box(-10, 0.4, -18, 1.8, 0.8, 1.2, 0x8a6a45); // chicken coop
  k.gable(-10, 1.2, -18, 2.2, 1.7, 0.6, 0x8d9aa0);
  k.cyl(-8, 0, -14, 0.1, 0.1, 3.2, 0x6b4a2f, 6); // dovecote on a pole
  k.box(-8, 3.2, -14, 1.0, 0.8, 1.0, 0xf4efe4);
  k.hip(-8, 4.0, -14, 1.3, 1.3, 0.6, 0xa8452b);
  // well ring + tube-well near the kitchen
  k.cyl(7.5, 0, -15.5, 0.8, 0.8, 0.8, 0xcfc7b6, 10);
  k.cyl(7.5, 0.8, -15.5, 0.82, 0.82, 0.12, 0xe9e6de, 10);
  k.cyl(14, 0, -9, 0.1, 0.1, 0.9, 0x3a4a52, 8);
  k.box(14, 0.9, -9, 0.14, 0.6, 0.14, 0x3a4a52);
  // garden benches by the house
  for (const x of [-9, 9]) k.box(x, 0, 2.0, 1.8, 0.45, 0.5, 0x7a5a3a);
  // front palms (betel nut) beside the gate path
  for (const [x, z] of [[-4.5, 14], [4.5, 14], [-4.5, 8], [4.5, 8]] as const) palm(k, x, z, 6.5);
  return k.finish(W, D, 11);
}
