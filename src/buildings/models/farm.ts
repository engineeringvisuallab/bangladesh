import * as THREE from 'three';
import { Kit, pick, rng, type BuiltBuilding } from './BuildingKit';
import { palm } from './village';

/**
 * VILLAGE FARMS (whole sites):
 *   - buildVillageFarm: গ্রামের খামার — undulating land: raised homestead ridge, mid terraces, low paddy plain, ponds, canal.
 *   - buildHillFarm:    পাহাড়ি ঢালের খামার — 6 stone-retained terraces up a hill, each with its own crop; stilt house on top.
 */

const SOIL = 0x6b4a32;
const GRASS = 0x74b05a;
const PADDY = 0x6bb04a;
const GOLD = 0xd9b44a;
const MUSTARD = 0xe3c53a;
const WATER = 0x4cb0d0;
const WATER_D = 0x3f9ab8;
const STONE = 0x8a867d;
const HAY = 0xc9a24a;
const DARKG = 0x2f6a30;
const MIDG = 0x3f7a35;
const BAMB = 0xb59f55;
const COW_B = 0x8c5a3a;
const COW_W = 0xf0ece0;
const ROAD = 0x9b8460;
const RED = 0xc0392b;

const OVER = {
  [SOIL]: 'earth', [GOLD]: 'thatch', [MUSTARD]: 'grass', [HAY]: 'thatch', [STONE]: 'stone', [ROAD]: 'earth',
  [COW_B]: 'plain', [COW_W]: 'plain', 0xe3d7c2: 'plaster', 0x6a3a8a: 'plain', 0xe0702a: 'plain', 0xd8d05a: 'plain',
} as const;

// ---------- primitives ----------

/** Wedge slope: high edge toward `dir` ('-z' back,'+z','-x','+x'); covers run x len, from hLow to hHigh above y0. */
function slope(k: Kit, cx: number, cz: number, dir: '-z' | '+z' | '-x' | '+x', run: number, len: number, hHigh: number, color: number, surface: 'grass' | 'earth' = 'grass', y0 = 0): void {
  const ry = dir === '-z' ? Math.PI / 2 : dir === '+z' ? -Math.PI / 2 : dir === '+x' ? 0 : Math.PI;
  k.withSurface(surface, () => k.local(cx, 0, cz, ry, () => k.shed(0, y0, 0, run, len, 0.02, hHigh, color)));
}

/** A planted plot: soil bed up to `top`, bund rim, then `fn(top)` to plant. */
function bed(k: Kit, cx: number, cz: number, w: number, d: number, top: number, rim = 0.35): void {
  k.box(cx, 0, cz, w, top, d, SOIL);
  const r = 0.7;
  k.box(cx, top, cz - d / 2 + r / 2, w, rim, r, SOIL);
  k.box(cx, top, cz + d / 2 - r / 2, w, rim, r, SOIL);
  k.box(cx - w / 2 + r / 2, top, cz, r, rim, d - 2 * r, SOIL);
  k.box(cx + w / 2 - r / 2, top, cz, r, rim, d - 2 * r, SOIL);
}

/** rows of crop running along x */
function rows(k: Kit, cx: number, cz: number, w: number, d: number, top: number, n: number, h: number, color: number, rowW = 0.5): void {
  const step = d / n;
  for (let i = 0; i < n; i++) k.box(cx, top, cz - d / 2 + step * (i + 0.5), w, h, rowW, color);
}

function paddy(k: Kit, cx: number, cz: number, w: number, d: number, top: number, stage: 0 | 1 | 2): void {
  bed(k, cx, cz, w, d, top);
  const iw = w - 1.6, id = d - 1.6;
  if (stage === 0) {
    k.box(cx, top, cz, iw, 0.2, id, WATER); // flooded, being transplanted
    for (let i = 0; i < 6; i++) for (let j = 0; j < Math.floor(iw / 2); j++) k.box(cx - iw / 2 + 1 + j * 2, top + 0.2, cz - id / 2 + 1 + i * (id - 2) / 5, 0.12, 0.35, 0.12, PADDY);
  } else if (stage === 1) {
    k.box(cx, top, cz, iw, 0.2, id, WATER);
    rows(k, cx, cz, iw, id, top + 0.1, 9, 0.7, PADDY, 0.6);
  } else {
    k.box(cx, top, cz, iw, 0.15, id, SOIL);
    rows(k, cx, cz, iw, id, top + 0.1, 9, 1.0, GOLD, 0.7);
  }
}

function bamboo(k: Kit, x: number, z: number, h = 9): void {
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * 6.28, r = 0.5 + (i % 2) * 0.35;
    const px = x + Math.cos(a) * r, pz = z + Math.sin(a) * r;
    k.cyl(px, 0, pz, 0.07, 0.04, h - (i % 3), 0xa5bf55, 5);
    k.sphere(px, h - (i % 3) - 0.6, pz, 0.7, MIDG, 1.5);
  }
}

function cow(k: Kit, x: number, y: number, z: number, ry: number, c: number): void {
  k.local(x, y, z, ry, () => {
    k.box(0, 0.6, 0, 0.7, 0.75, 1.6, c);
    k.box(0, 0.95, 0.95, 0.4, 0.5, 0.55, c);
    k.box(0, 1.2, 0.5, 0.3, 0.3, 0.3, c);
    k.box(-0.2, 1.4, 1.05, 0.06, 0.18, 0.06, 0xefe6cf);
    k.box(0.2, 1.4, 1.05, 0.06, 0.18, 0.06, 0xefe6cf);
    for (const sx of [-0.25, 0.25]) for (const sz of [-0.6, 0.6]) k.box(sx, 0, sz, 0.14, 0.62, 0.14, c);
  });
}

function haystack(k: Kit, x: number, y: number, z: number, s = 1): void {
  k.cyl(x, y, z, 1.5 * s, 1.5 * s, 1.4 * s, HAY, 10);
  k.cyl(x, y + 1.4 * s, z, 1.5 * s, 0.2, 1.8 * s, HAY, 10);
}

function mora(k: Kit, x: number, y: number, z: number): void {
  k.cyl(x, y, z, 1.4, 1.4, 0.4, SOIL, 10);
  k.cyl(x, y + 0.4, z, 1.2, 1.2, 2.2, 0xe3d7c2, 10);
  k.cyl(x, y + 2.6, z, 1.6, 0.15, 1.5, HAY, 10);
}

function tubewell(k: Kit, x: number, y: number, z: number): void {
  k.box(x, y, z, 1.6, 0.4, 1.6, 0xcfc7b6);
  k.cyl(x, y + 0.4, z, 0.1, 0.1, 1.1, 0x555a60, 6);
  k.box(x, y + 1.4, z + 0.2, 0.1, 0.1, 0.7, 0x555a60);
  k.box(x - 0.2, y + 1.4, z, 0.5, 0.06, 0.06, 0xd33a2c);
}

function scarecrow(k: Kit, x: number, y: number, z: number): void {
  k.cyl(x, y, z, 0.05, 0.05, 2.0, 0x7a5a3a, 5);
  k.box(x, y + 1.5, z, 1.4, 0.08, 0.08, 0x7a5a3a);
  k.box(x, y + 1.0, z, 0.4, 0.7, 0.2, RED);
  k.sphere(x, y + 2.1, z, 0.2, 0xe9d7a0);
  k.cyl(x, y + 2.2, z, 0.34, 0.2, 0.2, 0x5a3a24, 6);
}

/** Tin-roof village house, front +Z, origin centre-ground. */
function house(k: Kit, x: number, y: number, z: number, ry: number, w: number, d: number, wall: number, roof = 0x8d9aa0): void {
  k.local(x, y, z, ry, () => {
    k.box(0, 0, 0, w + 0.4, 0.7, d + 0.4, 0xcfc7b6);
    k.box(0, 0.7, 0, w, 2.6, d, wall);
    for (let i = 0; i < 3; i++) k.glass(-w / 3 + (i * w) / 3, 1.5, d / 2 + 0.04, 0.9, 1.0, 0.06, 0x2f4f66);
    k.box(0, 0.7, d / 2 + 0.04, 0.95, 2.0, 0.1, 0x5a3a24);
    k.tinRoof(0, 3.3, 0, w + 1.4, d + 1.6, 1.5, roof, 0x7f8a8e);
    k.box(0, 0.7, d / 2 + 1.4, w * 0.8, 0.1, 2.0, 0xcfc7b6); // veranda
    for (const sx of [-1, 1]) k.cyl(sx * (w * 0.4), 0.8, d / 2 + 2.2, 0.1, 0.1, 2.5, 0x5a3f2a, 5);
  });
}

function shedOpen(k: Kit, x: number, y: number, z: number, w: number, d: number, roof = HAY): void {
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) k.cyl(x + sx * (w / 2 - 0.2), y, z + sz * (d / 2 - 0.2), 0.12, 0.1, 2.4, 0x5a3f2a, 6);
  k.withSurface('thatch', () => k.local(x, y + 2.3, z, 0, () => k.hip(0, 0, 0, w + 1.2, d + 1.2, 1.3, roof)));
}

function fenceLine(k: Kit, x1: number, z1: number, x2: number, z2: number, y: number): void {
  const L = Math.hypot(x2 - x1, z2 - z1), n = Math.max(2, Math.round(L / 2));
  for (let i = 0; i <= n; i++) k.cyl(x1 + ((x2 - x1) * i) / n, y, z1 + ((z2 - z1) * i) / n, 0.05, 0.05, 1.1, 0x7a5a3a, 5);
  k.local(x1, y + 0.8, z1, Math.atan2(x2 - x1, z2 - z1), () => k.box(0, 0, L / 2, 0.05, 0.06, L, 0x7a5a3a));
  k.local(x1, y + 0.4, z1, Math.atan2(x2 - x1, z2 - z1), () => k.box(0, 0, L / 2, 0.05, 0.06, L, 0x7a5a3a));
}

function fruitTree(k: Kit, x: number, y: number, z: number, h: number, c: number): void {
  k.cyl(x, y, z, 0.25, 0.16, h * 0.5, 0x6b4a2f, 7);
  k.sphere(x, y + h * 0.72, z, h * 0.34, c, 0.85);
  k.sphere(x + h * 0.18, y + h * 0.58, z + 0.3, h * 0.24, c);
  k.sphere(x - h * 0.16, y + h * 0.6, z - 0.3, h * 0.22, c);
}

function bananaClump(k: Kit, x: number, y: number, z: number): void {
  for (let j = 0; j < 3; j++) {
    const px = x + (j - 1) * 0.5, pz = z + (j % 2) * 0.4;
    k.cyl(px, y, pz, 0.12, 0.1, 2.6 + j * 0.3, 0x8aa84a, 6);
    for (let i = 0; i < 5; i++) k.local(px, y + 2.5 + j * 0.3, pz, (i * Math.PI * 2) / 5, () => k.withMatrix(new THREE.Matrix4().makeRotationZ(-0.55), () => k.box(1.0, 0, 0, 2.0, 0.05, 0.7, 0x55a63c)));
  }
}

function trellis(k: Kit, cx: number, y: number, cz: number, w: number, d: number): void {
  for (let i = 0; i <= 4; i++) {
    k.cyl(cx - w / 2 + (w * i) / 4, y, cz - d / 2, 0.05, 0.05, 2.2, BAMB, 5);
    k.cyl(cx - w / 2 + (w * i) / 4, y, cz + d / 2, 0.05, 0.05, 2.2, BAMB, 5);
  }
  k.box(cx, y + 2.1, cz - d / 2, w, 0.05, 0.05, BAMB);
  k.box(cx, y + 2.1, cz + d / 2, w, 0.05, 0.05, BAMB);
  k.box(cx, y + 2.15, cz, w, 0.05, d, BAMB);
  k.box(cx, y + 1.5, cz, w - 0.5, 0.7, d - 0.6, 0x4f8a3a);
  for (let i = 0; i < 5; i++) k.cyl(cx - w / 2 + 1 + i * (w - 2) / 4, y + 1.2, cz + ((i * 7) % 3 - 1) * 0.8, 0.14, 0.1, 0.9, 0xb7d36a, 6);
}

// ======================================================================
// VILLAGE FARM — গ্রামের খামার (uneven land)
// ======================================================================

export function buildVillageFarm(seed = 0): BuiltBuilding {
  const k = new Kit(OVER);
  const W = 124, D = 108;
  const R = rng(seed + 11);
  const wallC = pick(seed, [0xe3d7c2, 0xe9d9a0]);
  const HI = 2.6, MID = 1.4, LO = 0.55;

  // base ground
  k.box(0, 0, 0, W, 0.15, D, GRASS);

  // ---------- HIGH ridge (homestead) z -52..-22 ----------
  k.box(0, 0, -37, W, HI, 30, SOIL);
  k.box(0, HI, -37, W - 1, 0.1, 29, GRASS);
  slope(k, 0, -19, '-z', 6, W, HI, GRASS, 'grass'); // front bank
  // MID terraces (left and right) z -16..14
  for (const s of [-1, 1]) {
    k.box(s * 46, 0, -1, 32, MID, 30, SOIL);
    k.box(s * 46, MID, -1, 31, 0.1, 29, GRASS);
    slope(k, s * 46, 17.5, '-z', 5, 32, MID, GRASS, 'grass');
    slope(k, s * 28.5, -1, s < 0 ? '-x' : '+x', 3, 30, MID, GRASS, 'grass');
  }

  // ---------- homestead (on ridge) ----------
  const y = HI;
  k.box(-4, y + 0.1, -36, 40, 0.05, 20, 0xb8a27a); // beaten-earth courtyard
  house(k, -10, y + 0.1, -40, 0, 11, 7, wallC);
  house(k, 6, y + 0.1, -41, 0, 8, 6, 0xe9d9a0, 0x9a5a3a);
  // kitchen hut (mud + thatch)
  k.box(18, y + 0.1, -38, 5, 2.2, 4, 0xd9c7a6);
  k.withSurface('thatch', () => k.hip(18, y + 2.3, -38, 6.4, 5.4, 1.6, HAY));
  k.cyl(20, y + 2.0, -39.5, 0.3, 0.3, 1.6, 0x6a6f73, 6);
  // cowshed with 3 cows + hay
  shedOpen(k, 30, y, -36, 11, 6);
  cow(k, 28, y, -36, 0, COW_B); cow(k, 30.4, y, -36, 0.2, COW_W); cow(k, 32.6, y, -36, -0.1, COW_B);
  k.box(30, y, -39.2, 10, 0.5, 0.5, 0x7a5a3a);
  haystack(k, 40, y, -34, 1); haystack(k, 44, y, -40, 1.2);
  // granaries, tubewell, drying paddy mat, scarecrow-free yard items
  mora(k, -26, y, -44); mora(k, -22, y, -46);
  tubewell(k, -2, y, -30);
  k.box(-14, y + 0.1, -29, 8, 0.06, 5, GOLD); // paddy drying
  k.box(-2, y + 0.1, -26, 5, 0.06, 4, MUSTARD);
  // chicken coop
  k.box(10, y, -29, 2.4, 0.7, 1.6, 0x8a6a45);
  k.box(10, y + 0.7, -29, 2.4, 0.9, 1.6, 0xb59f55);
  k.gable(10, y + 1.6, -29, 2.8, 2.0, 0.7, 0x8d9aa0);
  // bullock cart
  k.local(-30, y, -32, 0.5, () => {
    k.box(0, 0.7, 0, 1.6, 0.2, 3.0, 0x8a6a45);
    for (const s of [-1, 1]) k.withMatrix(new THREE.Matrix4().makeTranslation(s * 0.9, 0.7, 0.2).multiply(new THREE.Matrix4().makeRotationZ(Math.PI / 2)), () => k.cyl(0, -0.05, 0, 0.7, 0.7, 0.1, 0x5a3a24, 10));
    k.box(0, 0.8, 2.4, 0.12, 0.12, 2.2, 0x8a6a45);
    cow(k, 0, 0, 3.8, 0, COW_W);
  });
  // backyard trees + bamboo + palms on the ridge
  for (let x = -56; x <= 56; x += 8) { fruitTree(k, x + R() * 2, y, -50 + R() * 2, 8 + R() * 3, pick(Math.floor(x), [MIDG, 0x2f6a30, 0x4f8a3a])); }
  bamboo(k, -50, -36, 10); bamboo(k, -52, -28, 9); bamboo(k, 52, -28, 9);
  for (const x of [-42, 48, 54]) palm(k, x, -38, 10 + (x % 3));
  fenceLine(k, -56, -24, -36, -24, y); fenceLine(k, 14, -24, 56, -24, y);

  // ---------- left mid terrace: vegetables ----------
  const vm = MID;
  for (let i = 0; i < 4; i++) {
    const z = -12 + i * 6.5;
    k.box(-46, vm + 0.1, z, 26, 0.35, 4.5, SOIL);
    rows(k, -46, z, 25, 3.6, vm + 0.45, 3, 0.5, [0x55a63c, 0x6a3a8a, 0xd8d05a, 0xe0702a][i], 0.55);
  }
  trellis(k, -34, vm + 0.1, -12, 8, 3);
  trellis(k, -34, vm + 0.1, 0, 8, 3);
  // ---------- right mid terrace: orchard ----------
  for (let i = 0; i < 4; i++) for (let j = 0; j < 3; j++) {
    const px = 34 + i * 7.2 + (j % 2) * 2, pz = -10 + j * 8.5;
    if ((i + j) % 3 === 2) bananaClump(k, px, vm, pz); else fruitTree(k, px, vm, pz, 5.5 + R() * 1.5, (i + j) % 2 ? 0x3f7a35 : 0x4f8a3a);
  }
  k.box(46, vm + 0.1, 10, 26, 0.05, 2.5, 0xb8a27a);

  // ---------- LOW plain: 3x2 paddy plots, canal, pump ----------
  const stages: (0 | 1 | 2)[] = [2, 1, 0, 1, 2, 2];
  let n = 0;
  for (const z of [-5, 14]) for (const x of [-20, 0, 20]) { paddy(k, x, z, 18, 16, LO, stages[n++]); }
  k.box(0, LO, 4.5, 58, 0.5, 1.6, SOIL); // dividing path
  // canal along z=28 with pump house + pipe
  k.box(0, 0.15, 28, W, 0.2, 3.2, WATER_D);
  k.box(0, 0.15, 26.2, W, 0.6, 0.5, SOIL); k.box(0, 0.15, 29.8, W, 0.6, 0.5, SOIL);
  k.box(14, 0.5, 31.5, 3, 2.0, 2.4, 0xe3d7c2);
  k.tinRoof(14, 2.5, 31.5, 3.4, 3.0, 0.7, 0x8d9aa0, 0x7f8a8e);
  k.cyl(13, 0.4, 29.6, 0.18, 0.18, 1.4, 0x555a60, 6);
  scarecrow(k, -10, LO + 0.4, -5); scarecrow(k, 14, LO + 0.4, 14);
  // watch machan in the paddy
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) k.cyl(30 + sx * 1.2, LO, -2 + sz * 1.2, 0.1, 0.1, 3.0, BAMB, 5);
  k.box(30, LO + 3.0, -2, 3.2, 0.12, 3.2, BAMB);
  k.withSurface('thatch', () => k.hip(30, LO + 3.9, -2, 4.2, 4.2, 1.2, HAY));
  // bridge over canal
  k.box(-24, 0.9, 28, 3, 0.2, 5.2, 0x8a6a45);
  // ---------- front: fish pond, road, threshing yard ----------
  const px = -36, pz = 40;
  k.box(px, 0, pz, 28, 0.5, 18, SOIL);
  k.box(px, 0.5, pz, 25, 0.12, 15, WATER_D);
  for (let i = 0; i < 4; i++) k.box(px - 12.5 + 0.3, 0.1 + i * 0.12, pz + 4 - i * 0.0, 0.6, 0.12, 4 - i * 0.2, 0xcfc7b6); // ghat
  for (const [x, z] of [[-30, 38], [-40, 42], [-34, 44]] as const) k.box(x, 0.62, z, 0.8, 0.25, 0.5, 0xf0ece0); // ducks
  for (let i = 0; i < 5; i++) fruitTree(k, px - 12 + i * 6, 0.5, pz - 11, 6, MIDG);
  // road
  k.box(0, 0.15, 48.5, W, 0.1, 6, ROAD);
  for (let x = -56; x <= 56; x += 12) palm(k, x, 53, 9 + (Math.abs(x) % 3));
  // threshing yard + power tiller
  k.box(30, 0.15, 40, 22, 0.1, 14, 0xb8a27a);
  haystack(k, 22, 0.15, 36, 0.9); haystack(k, 38, 0.15, 36, 1.0);
  k.box(30, 0.15, 42, 6, 0.06, 4, GOLD);
  k.local(32, 0.15, 44, 0.3, () => { // power tiller
    k.box(0, 0.7, 0, 1.0, 0.7, 1.8, RED); k.box(0, 1.4, -0.2, 0.8, 0.4, 0.8, 0x2b343a);
    for (const s of [-1, 1]) k.withMatrix(new THREE.Matrix4().makeTranslation(s * 0.7, 0.55, 0.3).multiply(new THREE.Matrix4().makeRotationZ(Math.PI / 2)), () => k.cyl(0, -0.15, 0, 0.55, 0.55, 0.3, 0x2b2b2b, 10));
    k.box(0, 1.0, -1.4, 0.1, 0.1, 1.2, 0x333333);
  });
  // rickshaw-free: electric pole line along the road
  for (let x = -50; x <= 50; x += 25) { k.cyl(x, 0.15, 45.5, 0.1, 0.08, 7, 0x5a4a3a, 6); k.box(x, 7.0, 45.5, 2.0, 0.1, 0.1, 0x5a4a3a); }
  return k.finish(W, D, 14);
}

// ======================================================================
// HILL FARM — পাহাড়ি ঢালের খামার
// ======================================================================

export function buildHillFarm(seed = 0): BuiltBuilding {
  const k = new Kit(OVER);
  const W = 104, D = 112;
  const R = rng(seed + 5);
  const TH = 2.2, N = 6, DEP = 9, Z0 = 38; // terraces
  const top = (i: number) => 0.5 + TH * i; // i=0 valley
  const zf = (i: number) => Z0 - DEP * (i - 1); // front z of terrace i (i>=1)
  const wid = (i: number) => 92 - 4 * i;

  k.box(0, 0, 0, W, 0.15, D, GRASS);
  // valley paddy (2 plots) + stream along x
  k.box(0, 0, 49, 70, 0.5, 14, SOIL);
  paddy(k, -16, 49, 30, 12, 0.5, 2);
  paddy(k, 16, 49, 30, 12, 0.5, 1);
  for (const s of [-1, 1]) { k.box(s * 46, 0, 49, 14, 0.5, 14, GRASS); for (let i = 0; i < 2; i++) fruitTree(k, s * 46 + (i * 6 - 3), 0.5, 49, 6, MIDG); }
  k.box(0, 0.15, 56.5, W, 0.2, 3, WATER_D); // stream at the foot
  k.box(0, 0.15, 58.3, W, 0.5, 0.6, SOIL);

  // hill mass (terraces) with stone retaining walls
  const heightMax = top(N);
  for (let i = 1; i <= N; i++) {
    const zc = (zf(i) + (-56)) / 2, dd = zf(i) + 56;
    k.box(0, 0, zc, wid(i), top(i), dd, STONE);
  }
  // terrace tops (crop surface) & forested flanks
  for (let i = 1; i <= N; i++) {
    const t = top(i), z = zf(i) - DEP / 2, w = wid(i) - 3;
    k.box(0, t, z, w, 0.2, DEP - 0.8, SOIL);
    for (const s of [-1, 1]) {
      const fx = s * (wid(i) / 2 + 6), zc = zf(i) - DEP / 2;
      k.box(fx, 0, zc, 12 + 2 * (N - i), t + 0.8, DEP, SOIL);
      k.box(fx, t + 0.8, zc, 12 + 2 * (N - i), 0.12, DEP, GRASS);
      for (let j = 0; j < 2; j++) k.tree(fx + (j - 0.5) * 5 + (R() - 0.5) * 2, zc + (R() - 0.5) * 5, 5 + R() * 3 + i * 0.4, pick(i + j, [0x2f6a30, 0x3f7a35, 0x4f8a3a]));
    }
  }
  for (let j = 0; j < 4; j++) {
    k.box(0, 0, -56 + 3 * 0 - j * 0, wid(N) - 3 * j, top(N) - 2.2 * (j + 1), 4, STONE);
  }
  // summit forest platform
  k.box(0, heightMax, -34, wid(N) - 3, 0.2, 40, GRASS);

  // ---- terrace crops ----
  const tz = (i: number) => zf(i) - DEP / 2;
  const cw = (i: number) => wid(i) - 12;
  // T1 vegetables: cabbage + beans
  {
    const t = top(1) + 0.2, z = tz(1);
    rows(k, 0, z - 2.2, cw(1), 3.0, t, 4, 0.6, 0x6bb04a, 0.55);
    rows(k, 0, z + 2.2, cw(1), 3.0, t, 3, 0.5, 0xd8d05a, 0.55);
    trellis(k, -20, t, z, 8, 3); trellis(k, 20, t, z, 8, 3);
  }
  // T2 maize
  {
    const t = top(2) + 0.2, z = tz(2);
    for (let r = 0; r < 4; r++) for (let c = 0; c < Math.floor(cw(2) / 3); c++) {
      const x = -cw(2) / 2 + 1.5 + c * 3, zz = z - 3 + r * 2;
      k.cyl(x, t, zz, 0.08, 0.05, 2.4 + R() * 0.4, 0x6b9a4a, 5);
      k.box(x, t + 1.2, zz, 0.9, 0.05, 0.12, 0x55a63c);
      k.box(x, t + 1.8, zz, 0.12, 0.35, 0.12, MUSTARD);
    }
  }
  // T3 pineapple
  {
    const t = top(3) + 0.2, z = tz(3);
    for (let r = 0; r < 4; r++) for (let c = 0; c < Math.floor(cw(3) / 2.2); c++) {
      const x = -cw(3) / 2 + 1.1 + c * 2.2, zz = z - 3 + r * 2;
      k.box(x, t, zz, 0.9, 0.5, 0.9, DARKG);
      k.box(x, t + 0.5, zz, 0.45, 0.5, 0.45, 0xd9b44a);
      k.box(x, t + 1.0, zz, 0.7, 0.2, 0.15, 0x55a63c); k.box(x, t + 1.0, zz, 0.15, 0.2, 0.7, 0x55a63c);
    }
  }
  // T4 tea bushes + pickers' shed
  {
    const t = top(4) + 0.2, z = tz(4);
    for (let r = 0; r < 3; r++) for (let c = 0; c < 2; c++) {
      const x = c ? 8 + (cw(4) / 2 - 8) / 2 : -8 - (cw(4) / 2 - 8) / 2, ww = cw(4) / 2 - 8;
      k.box(x, t, z - 3 + r * 3, ww, 0.7, 1.2, DARKG);
      k.box(x, t + 0.7, z - 3 + r * 3, ww - 0.3, 0.25, 0.9, MIDG);
    }
    shedOpen(k, 0, t, z, 7, 4, 0x8d9aa0);
    for (let i = 0; i < 4; i++) k.box(-1.5 + i, t + 0.4, z, 0.7, 0.5, 0.6, COW_W); // leaf sacks
  }
  // T5 orange/lemon orchard
  {
    const t = top(5) + 0.2, z = tz(5);
    for (let c = 0; c < 8; c++) for (let r = 0; r < 2; r++) {
      const x = -cw(5) / 2 + 3 + c * ((cw(5) - 6) / 7), zz = z - 2 + r * 4;
      fruitTree(k, x, t, zz, 4.4, 0x4f8a3a);
      k.sphere(x + 0.6, t + 3.0, zz + 0.4, 0.22, 0xe0902a); k.sphere(x - 0.7, t + 2.6, zz - 0.3, 0.22, 0xe0902a);
    }
  }
  // T6 homestead: stilt house, tin house, granary, goats, tea-drying
  {
    const t = top(6) + 0.2, z = tz(6);
    // bamboo machan ghor on stilts (pahari style)
    k.local(-16, t, z - 0.5, 0, () => {
      for (const sx of [-2.6, 0, 2.6]) for (const sz of [-2.2, 0, 2.2]) k.cyl(sx, 0, sz, 0.14, 0.12, 2.0, BAMB, 6);
      k.box(0, 2.0, 0, 6.2, 0.2, 5.4, 0x8a6a45);
      k.box(0, 2.2, -0.4, 5.4, 2.2, 4.4, BAMB);
      k.glass(0, 3.0, 1.82, 1.2, 0.9, 0.06, 0x2f4f66);
      k.box(0, 2.2, 1.82, 0.9, 1.9, 0.1, 0x5a3a24);
      k.withSurface('thatch', () => k.hip(0, 4.3, -0.4, 7.8, 6.6, 2.4, HAY));
      for (let i = 0; i < 6; i++) k.box(0, 0.2 + i * 0.3, 3.1 + (5 - i) * 0.3 - 0.0 + 0.2, 1.4, 0.12, 0.4, 0x8a6a45); // ladder steps
      k.box(0, 2.2, 2.8, 6.2, 0.9, 0.08, 0x5a3f2a);
    });
    house(k, 0, t, z - 0.5, 0, 8, 6, 0xe3d7c2, 0x9a5a3a);
    mora(k, 14, t, z - 2); mora(k, 17, t, z + 1);
    shedOpen(k, 26, t, z, 8, 5);
    cow(k, 25, t, z, 0, COW_B); cow(k, 27, t, z, 0, COW_W);
    for (let i = 0; i < 3; i++) k.box(10 + i * 0.9, t, z + 3.5, 0.9, 0.7, 0.4, i === 1 ? COW_W : COW_B); // goats
    tubewell(k, -6, t, z + 3);
    k.box(-30, t, z + 2, 6, 0.06, 3.5, GOLD);
    fenceLine(k, -34, z + 4.2, 34, z + 4.2, t);
  }
  // summit forest
  for (let i = 0; i < 26; i++) {
    const x = (R() - 0.5) * (wid(N) - 8), zz = -14 - R() * 36;
    k.tree(x, zz, 7 + R() * 6, pick(i, [0x2f6a30, 0x3f7a35, 0x386230]));
    k.local(0, 0, 0, 0, () => 0);
  }
  for (const [x, z] of [[-30, -22], [30, -26], [10, -40]] as const) bamboo(k, x, z, 11);

  // ---- zig-zag stone steps ----
  const stepX = (i: number) => (i % 2 ? 30 : -30);
  for (let i = 1; i <= N; i++) {
    const x = stepX(i), prev = top(i - 1), cur = top(i);
    const n = Math.round((cur - prev) / 0.3);
    for (let j = 0; j < n; j++) k.box(x, 0, zf(i) + 1.6 - j * 0.45 + 0.0, 2.0, prev + (j + 1) * ((cur - prev) / n), 0.45, 0xcfc7b6);
  }
  // ---- stream cascade on the right flank: water ledges + spray + bamboo pipe ----
  for (let i = 1; i <= N; i++) {
    const t = top(i) + 0.2;
    k.box(42 - i * 0.6, t, zf(i) - 3, 4, 0.1, 5, WATER_D);
    k.box(42 - i * 0.6, t - 1.0, zf(i) + 1.0, 3.5, 1.0, 0.2, 0xe9f6fa);
  }
  k.withMatrix(new THREE.Matrix4().makeTranslation(33, top(3) + 1.3, zf(3) - 4).multiply(new THREE.Matrix4().makeRotationX(Math.PI / 2)), () => k.cyl(0, -6, 0, 0.18, 0.18, 12, BAMB, 6));
  for (const dz of [-8, -4, 0]) { k.cyl(33, top(3) + 0.2, zf(3) + dz - 4, 0.07, 0.07, 1.2, 0x7a5a3a, 5); }
  // valley road/path + trees
  for (let x = -50; x <= 50; x += 14) palm(k, x, 60, 9);
  return k.finish(W, D, heightMax + 12);
}
