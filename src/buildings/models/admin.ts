import * as THREE from 'three';
import { FLOOR_H, Kit, pick, type BuiltBuilding } from './BuildingKit';
import { flagPole, shaheedMinar } from './education';
import { palm } from './village';

/**
 * ADMINISTRATIVE: ইউনিয়ন পরিষদ, উপজেলা পরিষদ, জেলা প্রশাসকের কার্যালয়, জেলা আদালত, থানা, ফায়ার স্টেশন, ডাকঘর, সিটি হল.
 */

const GLASS = 0x2f4f66;
const LAWN = 0x74b05a;
const CREAM = 0xe9d9a0;
const WHITE = 0xf4efe4;
const STONE = 0xcfc7b6;
const BRICK = 0xa5513a;
const ASPHALT = 0x3b3b3b;
const OVER = { 0xa7a49c: 'stone', 0x9b968c: 'stone' } as const;

// ---------- shared bits ----------

function wheel(k: Kit, x: number, y: number, z: number, r: number): void {
  k.withMatrix(new THREE.Matrix4().makeTranslation(x, y, z).multiply(new THREE.Matrix4().makeRotationZ(Math.PI / 2)), () => k.cyl(0, -0.15, 0, r, r, 0.3, 0x2b2b2b, 10));
}

/** Vehicle facing +Z. kind: jeep / van / truck */
function vehicle(k: Kit, x: number, z: number, ry: number, kind: 'jeep' | 'van' | 'truck' | 'ladder', body: number, stripe = 0xf4efe4): void {
  k.local(x, 0, z, ry, () => {
    const L = kind === 'truck' || kind === 'ladder' ? 8 : kind === 'van' ? 5.2 : 4.4;
    const Wd = kind === 'truck' || kind === 'ladder' ? 2.5 : 2.0;
    k.box(0, 0.45, 0, Wd, 1.0, L, body);
    k.box(0, 1.45, L * 0.2, Wd - 0.1, 1.0, L * 0.3, body);
    k.glass(0, 1.6, L * 0.2 + L * 0.15 + 0.02, Wd - 0.4, 0.6, 0.04, 0x24323b);
    if (kind === 'van' || kind === 'jeep') k.box(0, 1.45, -L * 0.15, Wd - 0.1, 1.0, L * 0.5, body);
    k.box(0, 0.95, 0, Wd + 0.02, 0.2, L - 0.1, stripe);
    for (const s of [-1, 1]) for (const zz of [-L * 0.32, L * 0.32]) wheel(k, s * (Wd / 2 - 0.05), 0.4, zz, 0.42);
    if (kind === 'ladder') { k.box(0, 2.1, -L * 0.15, 0.5, 0.15, L * 0.55, 0xb7bcc2); k.box(0, 2.35, -L * 0.15, 0.35, 0.15, L * 0.55, 0xb7bcc2); }
    if (kind === 'truck') { k.cyl(0, 1.5, -L * 0.2, 0.9, 0.9, L * 0.35, 0xb7bcc2, 10); }
    if (kind === 'jeep' || kind === 'van') k.box(0, 2.45, L * 0.2, 1.0, 0.18, 0.4, 0xd33a2c); // light bar
  });
}

function columnsRow(k: Kit, cx: number, cz: number, w: number, y0: number, h: number, n: number, color = WHITE, r = 0.35): void {
  for (let i = 0; i < n; i++) {
    const x = cx - w / 2 + (w * i) / (n - 1);
    k.cyl(x, y0, cz, r, r * 0.9, h, color, 10);
    k.box(x, y0 + h, cz, r * 2.4, 0.2, r * 2.4, color);
    k.box(x, y0, cz, r * 2.4, 0.2, r * 2.4, color);
  }
}

function lawnSite(k: Kit, W: number, D: number, wall: boolean): void {
  k.box(0, 0, 0, W, 0.06, D, LAWN);
  if (wall) k.boundaryWall(0, 0, W - 0.6, D - 0.6, 0xe9e6de, STONE, 6.0, 1.8);
}

function winRow(k: Kit, side: 'front' | 'back' | 'left' | 'right', cx: number, cz: number, w: number, d: number, y0: number, floors: number, cols: number, frame = WHITE, skip?: (f: number, c: number) => boolean): void {
  k.windowGrid(side, cx, cz, w, d, { y0, floors, cols, ww: 1.3, wh: 1.7, sill: 0.8, glass: GLASS, frame, skip });
}

// ======================================================================
// ইউনিয়ন পরিষদ ভবন
// ======================================================================

export function buildUnionParishad(seed = 0): BuiltBuilding {
  const k = new Kit(OVER);
  const W = 44, D = 40, wall = pick(seed, [CREAM, 0xd6e0c8]);
  lawnSite(k, W, D, true);
  k.box(0, 0.06, 12, 4, 0.04, 16, 0xb8654a); // path
  // main hall block
  const bz = -6, bw = 20, bd = 9;
  k.box(0, 0, bz, bw + 0.8, 0.6, bd + 0.8, STONE);
  k.box(0, 0.6, bz, bw, 3.6, bd, wall);
  k.box(0, 4.2, bz, bw + 0.6, 0.3, bd + 0.6, WHITE);
  winRow(k, 'front', 0, bz, bw, bd, 0.6, 1, 6, WHITE, (_f, c) => c === 2 || c === 3);
  winRow(k, 'back', 0, bz, bw, bd, 0.6, 1, 6);
  winRow(k, 'left', 0, bz, bw, bd, 0.6, 1, 2);
  winRow(k, 'right', 0, bz, bw, bd, 0.6, 1, 2);
  k.box(0, 0.6, bz + bd / 2 + 0.05, 2.2, 2.7, 0.1, 0x5a3a24);
  // porch with portico
  k.box(0, 0, bz + bd / 2 + 1.8, 9, 0.6, 3.6, STONE);
  columnsRow(k, 0, bz + bd / 2 + 3.2, 7, 0.6, 3.6, 4);
  k.box(0, 4.2, bz + bd / 2 + 1.8, 9, 0.3, 3.8, WHITE);
  k.gable(0, 4.5, bz + bd / 2 + 1.8, 9.2, 3.8, 1.5, 0xa8452b);
  k.box(0, 4.6, bz + bd / 2 + 3.74, 5.5, 1.0, 0.1, 0x1a7a4a); // sign board
  k.box(0, 4.8, bz + bd / 2 + 3.8, 4.8, 0.55, 0.05, WHITE);
  // roof: tin hip over the hall
  k.tinRoof(0, 4.5, bz, bd + 2.0, bw + 1.6, 2.0, 0x9a5a3a, 0x7f8a8e);
  // side office wing
  k.box(14, 0, bz + 1, 8, 0.4, 7, STONE);
  k.box(14, 0.4, bz + 1, 7.6, 3.2, 6.6, wall);
  winRow(k, 'front', 14, bz + 1, 7.6, 6.6, 0.4, 1, 3);
  k.hip(14, 3.6, bz + 1, 9, 8, 1.8, 0x9a5a3a);
  // tubewell, flagpole, notice board, bicycle stand
  flagPole(k, -12, 8, 10);
  k.box(10, 0, 8, 3.0, 0.2, 1.0, STONE);
  k.box(10, 0.2, 8, 3.0, 1.7, 0.12, 0x2f5f8a);
  k.cyl(-16, 0, 4, 0.1, 0.1, 1.2, 0x555a60, 6);
  for (const x of [-18, 18]) palm(k, x, 12, 9);
  for (const [x, z] of [[-17, -14], [17, -14], [-10, -15], [10, -15]] as const) k.tree(x, z, 6, 0x4b8a42);
  for (let i = 0; i < 4; i++) k.box(-14 + i * 1.2, 0, 14, 0.3, 1.0, 1.6, 0x3a4a52);
  return k.finish(W, D, 7);
}

// ======================================================================
// উপজেলা পরিষদ কমপ্লেক্স
// ======================================================================

export function buildUpazilaComplex(seed = 0): BuiltBuilding {
  const k = new Kit(OVER);
  const W = 90, D = 70, wall = pick(seed, [CREAM, 0xe9e6de]);
  lawnSite(k, W, D, true);
  k.box(0, 0.06, 8, 70, 0.04, 40, 0x7a7a78); // forecourt
  k.box(0, 0.06, 28, 6, 0.04, 14, 0x7a7a78);
  // main U-shaped 3-storey block: centre + two wings
  const fh = FLOOR_H + 0.4;
  const centre = (cx: number, cz: number, w: number, d: number, floors: number): void => {
    k.box(cx, 0, cz, w + 0.6, 0.6, d + 0.6, STONE);
    k.box(cx, 0.6, cz, w, floors * fh, d, wall);
    for (let f = 0; f <= floors; f++) k.box(cx, 0.6 + f * fh - 0.1, cz, w + 0.3, 0.2, d + 0.3, WHITE);
    winRow(k, 'front', cx, cz, w, d, 0.6, floors, Math.round(w / 3.6), BRICK);
    winRow(k, 'back', cx, cz, w, d, 0.6, floors, Math.round(w / 3.6));
    k.box(cx, 0.6 + floors * fh, cz, w + 0.6, 0.3, d + 0.6, WHITE);
  };
  centre(0, -18, 44, 12, 3);
  centre(-27, -4, 12, 28, 3);
  centre(27, -4, 12, 28, 3);
  winRow(k, 'left', -27, -4, 12, 28, 0.6, 3, 7);
  winRow(k, 'right', 27, -4, 12, 28, 0.6, 3, 7);
  winRow(k, 'right', -27, -4, 12, 28, 0.6, 3, 7);
  winRow(k, 'left', 27, -4, 12, 28, 0.6, 3, 7);
  // central portico + red-brick tower bay
  const top = 0.6 + 3 * fh;
  k.box(0, 0.6, -10.8, 12, 3 * fh, 2.0, BRICK);
  columnsRow(k, 0, -9.0, 10, 0.6, fh * 2, 5, WHITE, 0.4);
  k.box(0, 0.6 + fh * 2, -8.6, 12, 0.3, 3.2, WHITE);
  k.gable(0, top + 0.3, -16, 14, 12.4, 3.0, 0xa7a49c);
  k.box(0, top + 0.3, -10, 5.6, 1.1, 0.2, 0x1a7a4a);
  // roofs: flat with parapet, water tanks
  for (const [cx, cz, w, d] of [[-27, -4, 12, 28], [27, -4, 12, 28]] as const) { k.parapet(cx, top + 0.3, cz, w + 0.6, d + 0.6, 0.8, 0.2, WHITE); k.waterTank(cx, top + 0.3, cz - 8); }
  // courtyard features: shaheed minar, flagpole, fountain, lawn plots
  shaheedMinar(k, 0, -0.5);
  flagPole(k, -10, 6, 14);
  k.cyl(10, 0.06, 6, 2.6, 2.6, 0.5, STONE, 16);
  k.cyl(10, 0.56, 6, 2.2, 2.2, 0.08, 0x4cb0d0, 16);
  k.cyl(10, 0.5, 6, 0.3, 0.2, 1.4, STONE, 8);
  for (const s of [-1, 1]) { k.box(s * 18, 0.06, 4, 10, 0.2, 14, LAWN); for (let i = 0; i < 3; i++) k.tree(s * 18 + (i - 1) * 3, 6 + (i % 2) * 2, 5, 0x4b8a42); }
  // parking + cars
  vehicle(k, -34, 20, 0.3, 'jeep', 0xf4efe4, 0x2f5f8a);
  vehicle(k, 34, 20, -0.3, 'jeep', 0x1a3a5a);
  vehicle(k, 40, 14, 0, 'van', 0xe9e6de, 0x1a7a4a);
  // UNO residence & small ancillary (treasury) block at back-left
  k.box(-38, 0, -26, 10, 0.4, 9, STONE);
  k.box(-38, 0.4, -26, 9.6, 3.2, 8.6, 0xe3d7c2);
  winRow(k, 'front', -38, -26, 9.6, 8.6, 0.4, 1, 3);
  k.hip(-38, 3.6, -26, 11, 10, 2.0, 0x9a5a3a);
  for (const x of [-40, -20, 0, 20, 40]) palm(k, x, 32, 9);
  return k.finish(W, D, top + 4.5);
}

// ======================================================================
// জেলা প্রশাসকের কার্যালয় (DC office) — colonial
// ======================================================================

export function buildDCOffice(seed = 0): BuiltBuilding {
  const k = new Kit(OVER);
  const W = 96, D = 76, wall = pick(seed, [0xe9d9a0, 0xe3d7c2]);
  lawnSite(k, W, D, true);
  k.box(0, 0.06, 20, 8, 0.04, 36, 0x7a7a78);
  const fh = FLOOR_H + 0.5, floors = 3, bw = 56, bd = 14, bz = -16;
  k.box(0, 0, bz, bw + 1, 0.9, bd + 1, STONE);
  k.box(0, 0.9, bz, bw, floors * fh, bd, wall);
  for (let f = 0; f <= floors; f++) k.box(0, 0.9 + f * fh - 0.12, bz, bw + 0.4, 0.24, bd + 0.4, WHITE);
  winRow(k, 'front', 0, bz, bw, bd, 0.9, floors, 14, 0x3f6b4a, (_f, c) => c === 6 || c === 7);
  winRow(k, 'back', 0, bz, bw, bd, 0.9, floors, 14, 0x3f6b4a);
  winRow(k, 'left', 0, bz, bw, bd, 0.9, floors, 3, 0x3f6b4a);
  winRow(k, 'right', 0, bz, bw, bd, 0.9, floors, 3, 0x3f6b4a);
  const top = 0.9 + floors * fh;
  k.box(0, top, bz, bw + 1.2, 0.5, bd + 1.2, WHITE);
  // arcaded ground-floor veranda
  k.box(0, 0, bz + bd / 2 + 1.5, bw, 0.9, 3, STONE);
  for (let i = 0; i < 15; i++) {
    const x = -bw / 2 + 1.2 + i * ((bw - 2.4) / 14);
    k.cyl(x, 0.9, bz + bd / 2 + 2.7, 0.3, 0.3, fh - 0.4, WHITE, 8);
  }
  k.box(0, 0.9 + fh - 0.4, bz + bd / 2 + 2.7, bw, 0.4, 0.6, WHITE);
  // central portico, 4 big columns, pediment, clock-tower dome
  k.box(0, 0, bz + bd / 2 + 4.4, 16, 0.9, 5, STONE);
  for (let i = 0; i < 6; i++) k.cyl(-7 + i * 2.8, 0.9, bz + bd / 2 + 6.2, 0.55, 0.5, floors * fh - 0.8, WHITE, 12);
  k.box(0, 0.9 + floors * fh - 0.8, bz + bd / 2 + 4.4, 16, 0.8, 5, WHITE);
  k.gable(0, top - 0.0 + 0.5 - 0.0, bz + bd / 2 + 4.4, 17, 5.4, 3.4, WHITE);
  k.box(0, top - 0.6, bz + bd / 2 + 7.1, 7, 1.0, 0.1, 0x2f5f8a);
  // dome + cupola on central block
  k.box(0, top + 0.5, bz, 12, 4.0, bd - 2, wall);
  k.withSurface('plaster', () => k.dome(0, top + 4.5, bz, 5.2, 4.6, WHITE, 20));
  k.cyl(0, top + 9.1, bz, 0.8, 0.5, 1.4, WHITE, 8);
  k.cyl(0, top + 10.5, bz, 0.08, 0.04, 3, 0xb7bcc2, 5);
  winRow(k, 'front', 0, bz, 12, bd - 2, top + 0.5, 1, 3, WHITE);
  // hip roof tiles on wings
  for (const s of [-1, 1]) k.hip(s * 20, top + 0.5, bz, 24, bd + 2, 2.4, 0xa8452b);
  // flagpoles, lawns, fountain, cars, trees
  flagPole(k, -16, 6, 15);
  k.cyl(0, 0.06, 6, 3.6, 3.6, 0.6, STONE, 18);
  k.cyl(0, 0.66, 6, 3.2, 3.2, 0.08, 0x4cb0d0, 18);
  k.cyl(0, 0.6, 6, 0.3, 0.2, 1.8, STONE, 8);
  for (const s of [-1, 1]) for (let i = 0; i < 4; i++) { k.tree(s * (16 + (i % 2) * 8), 0 + i * 6, 6, 0x3f7a35); k.tree(s * 36, -2 + i * 7, 7, 0x2f6a30); }
  vehicle(k, -30, 24, 0.2, 'jeep', 0xf4efe4, 0x2f5f8a); vehicle(k, -26, 30, -0.1, 'jeep', 0x1a3a5a); vehicle(k, 30, 26, 0, 'van', 0xe9e6de, 0x1a7a4a);
  // circuit house (DC bungalow) at back-right
  k.box(34, 0, -32, 14, 0.5, 11, STONE);
  k.box(34, 0.5, -32, 13.2, 3.4, 10.2, 0xe3d7c2);
  winRow(k, 'front', 34, -32, 13.2, 10.2, 0.5, 1, 4, 0x3f6b4a);
  k.hip(34, 3.9, -32, 15, 12, 3.0, 0xa8452b);
  return k.finish(W, D, top + 14);
}

// ======================================================================
// জেলা আদালত ভবন
// ======================================================================

export function buildDistrictCourt(seed = 0): BuiltBuilding {
  const k = new Kit(OVER);
  const W = 80, D = 66;
  const wall = pick(seed, [0xe9e6de, 0xe6e1d4]);
  lawnSite(k, W, D, true);
  k.box(0, 0.06, 18, 10, 0.04, 30, 0x7a7a78);
  const fh = FLOOR_H + 0.6, floors = 4, bw = 44, bd = 20, bz = -14;
  k.box(0, 0, bz + 4, 56, 1.2, 12, STONE); // broad steps plinth
  for (let i = 0; i < 4; i++) k.box(0, 0, bz + bd / 2 + 3 + i * 0.5, 20 - i * 1.0, 0.3 * (4 - i), 0.5, STONE);
  k.box(0, 1.2, bz, bw, floors * fh, bd, wall);
  const top = 1.2 + floors * fh;
  // giant order of columns on the front
  const n = 8;
  for (let i = 0; i < n; i++) {
    const x = -16 + (32 * i) / (n - 1);
    k.cyl(x, 1.2, bz + bd / 2 + 1.8, 0.9, 0.8, (floors - 1) * fh + 1.5, WHITE, 14);
    k.box(x, 1.2, bz + bd / 2 + 1.8, 2.1, 0.4, 2.1, WHITE);
    k.box(x, 1.2 + (floors - 1) * fh + 1.5, bz + bd / 2 + 1.8, 2.3, 0.5, 2.3, WHITE);
  }
  k.box(0, 1.2 + (floors - 1) * fh + 2.0, bz + bd / 2 + 1.8, 36, 1.4, 3.2, WHITE); // entablature
  k.gable(0, 1.2 + (floors - 1) * fh + 3.4, bz + bd / 2 + 1.8, 36, 3.6, 4.0, WHITE); // pediment
  k.box(0, 1.2 + (floors - 1) * fh + 3.4, bz + bd / 2 + 3.62, 6, 0.9, 0.1, 0xd9b44a); // scales emblem plate
  winRow(k, 'front', 0, bz, bw, bd, 1.2, floors, 10, WHITE, (f, c) => (f > 0 && c > 2 && c < 7) || (f === 0 && c > 3 && c < 6));
  winRow(k, 'back', 0, bz, bw, bd, 1.2, floors, 10);
  winRow(k, 'left', 0, bz, bw, bd, 1.2, floors, 4);
  winRow(k, 'right', 0, bz, bw, bd, 1.2, floors, 4);
  // door recess behind columns
  k.box(0, 1.2, bz + bd / 2 + 0.06, 5, 4.4, 0.1, 0x5a3a24);
  // roof: flat with stone parapet + central dome
  k.box(0, top, bz, bw + 1, 0.5, bd + 1, WHITE);
  k.withSurface('plaster', () => k.dome(0, top + 0.5, bz - 2, 7, 6.5, WHITE, 24));
  k.cyl(0, top + 0.5, bz - 2, 7.4, 7.4, 1.6, WHITE, 24);
  k.cyl(0, top + 7.0, bz - 2, 1.1, 0.7, 2.2, WHITE, 10);
  k.sphere(0, top + 9.5, bz - 2, 0.5, 0xd9b44a);
  // side blocks (chambers)
  for (const s of [-1, 1]) {
    k.box(s * 32, 0, bz, 14, 0.6, 16, STONE);
    k.box(s * 32, 0.6, bz, 13.4, 3 * fh - 1.2, 15.4, wall);
    winRow(k, 'front', s * 32, bz, 13.4, 15.4, 0.6, 3, 3, WHITE);
    k.box(s * 32, 3 * fh - 0.6, bz, 14.6, 0.4, 16.6, WHITE);
  }
  // lawns, flag, statue of Justice on a plinth, prison-van, lawyers' chambers shed
  k.box(0, 0.06, 6, 2.4, 1.4, 2.4, STONE);
  k.box(0, 1.46, 6, 0.8, 2.4, 0.5, 0x2f4f66); k.sphere(0, 4.0, 6, 0.35, 0x2f4f66);
  k.box(-1.2, 3.1, 6, 2.4, 0.08, 0.08, 0xb7bcc2);
  flagPole(k, 14, 8, 14);
  for (const s of [-1, 1]) for (let i = 0; i < 3; i++) k.tree(s * (18 + (i % 2) * 6), 2 + i * 8, 6, 0x4b8a42);
  vehicle(k, -30, 20, 0.2, 'van', 0x2b3037, 0xf4efe4); vehicle(k, 30, 22, 0, 'jeep', 0xe9e6de, 0x2f5f8a);
  k.box(-32, 0, 22, 14, 2.8, 5, 0xe3d7c2);
  k.tinRoof(-32, 2.8, 22, 6.4, 15, 1.2, 0x8d9aa0, 0x7f8a8e);
  return k.finish(W, D, top + 11);
}

// ======================================================================
// থানা
// ======================================================================

export function buildPoliceStation(seed = 0): BuiltBuilding {
  const k = new Kit(OVER);
  const W = 54, D = 46;
  const wall = pick(seed, [0xe3d7c2, CREAM]);
  k.box(0, 0, 0, W, 0.06, D, 0x9b8f84);
  k.box(0, 0.06, 0, W - 2, 0.04, D - 2, 0x7a7a78);
  k.boundaryWall(0, 0, W - 0.6, D - 0.6, 0xe9e6de, STONE, 7.0, 2.6);
  for (let x = -W / 2 + 1; x < W / 2 - 1; x += 3) { k.box(x, 2.6, -D / 2 + 0.3, 0.06, 0.5, 0.06, 0x555a60); k.box(x, 2.6, D / 2 - 0.3, 0.06, 0.5, 0.06, 0x555a60); } // barbed wire
  // main station: 2 storeys, blue band
  const bw = 24, bd = 12, bz = -8, fh = FLOOR_H + 0.3;
  k.box(0, 0, bz, bw + 0.6, 0.5, bd + 0.6, STONE);
  k.box(0, 0.5, bz, bw, 2 * fh, bd, wall);
  k.box(0, 0.5 + fh - 0.15, bz, bw + 0.3, 0.3, bd + 0.3, 0x2f5f8a);
  k.box(0, 0.5 + 2 * fh, bz, bw + 0.8, 0.3, bd + 0.8, 0x2f5f8a);
  winRow(k, 'front', 0, bz, bw, bd, 0.5, 2, 6, WHITE, (f, c) => f === 0 && (c === 2 || c === 3));
  winRow(k, 'back', 0, bz, bw, bd, 0.5, 2, 6);
  winRow(k, 'left', 0, bz, bw, bd, 0.5, 2, 3);
  winRow(k, 'right', 0, bz, bw, bd, 0.5, 2, 3);
  k.box(0, 0.5, bz + bd / 2 + 0.06, 2.4, 2.6, 0.1, 0x2f5f8a);
  const top = 0.5 + 2 * fh + 0.3;
  k.parapet(0, top, bz, bw + 0.8, bd + 0.8, 0.7, 0.2, wall);
  // signboard + canopy
  k.box(0, 0.5 + fh - 1.3, bz + bd / 2 + 1.4, 8, 0.2, 2.6, 0x2f5f8a);
  for (const x of [-3.6, 3.6]) k.cyl(x, 0.5, bz + bd / 2 + 2.5, 0.12, 0.12, fh - 1.4, WHITE, 8);
  k.box(0, top + 0.7, bz + bd / 2 - 0.2, 12, 1.4, 0.2, 0x1a3a5a);
  k.box(0, top + 0.95, bz + bd / 2 - 0.08, 10.5, 0.7, 0.05, WHITE);
  // lockup block (bars in windows) at the back-right
  k.box(15, 0, -14, 10, 0.4, 8, STONE);
  k.box(15, 0.4, -14, 9.6, 3.0, 7.6, 0x9b968c);
  for (let i = 0; i < 3; i++) k.box(15 - 3 + i * 3, 1.8, -10.1, 1.0, 0.9, 0.08, 0x24323b);
  k.hip(15, 3.4, -14, 11, 9, 1.4, 0x6a6f73);
  // armoury / barracks wing
  k.box(-17, 0, -12, 10, 0.4, 14, STONE);
  k.box(-17, 0.4, -12, 9.6, 3.0, 13.6, wall);
  k.hip(-17, 3.4, -12, 11, 15, 1.6, 0x9a5a3a);
  // guard sentry box + flagpole + wireless mast
  k.box(-5, 0, 14, 1.8, 2.2, 1.8, 0x2f5f8a);
  k.hip(-5, 2.2, 14, 2.4, 2.4, 0.5, 0x1a3a5a);
  flagPole(k, 10, 10, 10);
  k.cyl(22, 0.06, -4, 0.15, 0.1, 14, 0xb7bcc2, 6);
  for (let i = 1; i < 6; i++) k.box(22, 2 * i, -4, 1.2 - i * 0.12, 0.05, 0.05, 0xb7bcc2);
  // vehicles: police jeeps, seized motorbikes, prison van
  vehicle(k, -14, 10, 0.4, 'jeep', 0x1a3a5a, 0x2f5f8a);
  vehicle(k, -4, 8, -0.2, 'jeep', 0x1a3a5a, 0xf4efe4);
  vehicle(k, 18, 12, 0.1, 'van', 0x2b3037, 0xf4efe4);
  for (let i = 0; i < 5; i++) { k.box(-22 + i * 1.0, 0.1, -20, 0.5, 0.9, 1.7, i % 2 ? 0x24323b : 0x7d3a2a); }
  k.tree(-24, 18, 6, 0x3f7a35); k.tree(24, -20, 6, 0x4b8a42);
  return k.finish(W, D, top + 2.5);
}

// ======================================================================
// ফায়ার সার্ভিস স্টেশন
// ======================================================================

export function buildFireStation(seed = 0): BuiltBuilding {
  const k = new Kit(OVER);
  const W = 54, D = 46;
  const wall = pick(seed, [0xe3d7c2, 0xe9e6de]);
  k.box(0, 0, 0, W, 0.06, D, 0x9b8f84);
  k.box(0, 0.06, 12, W, 0.04, 22, ASPHALT);
  k.box(0, 0.1, 21, W, 0.03, 0.4, 0xf4efe4);
  // engine bay block (3 roll-up doors)
  const bw = 30, bd = 14, bz = -4;
  k.box(0, 0, bz, bw + 0.6, 0.5, bd + 0.6, STONE);
  k.box(0, 0.5, bz, bw, 6.0, bd, wall);
  k.box(0, 0.5, bz, bw + 0.2, 0.7, bd + 0.2, 0xc0392b);
  for (let i = 0; i < 3; i++) {
    const x = -9.5 + i * 9.5;
    k.box(x, 0.5, bz + bd / 2 + 0.04, 6.4, 4.4, 0.12, 0xc0392b);
    for (let j = 0; j < 8; j++) k.box(x, 0.8 + j * 0.5, bz + bd / 2 + 0.12, 6.2, 0.06, 0.05, 0x8a2a20);
    k.box(x, 4.4, bz + bd / 2 + 0.14, 6.4, 0.5, 0.06, 0xf4efe4);
  }
  k.box(0, 6.5, bz, bw + 0.6, 0.35, bd + 0.6, 0xc0392b);
  k.box(0, 6.85, bz + bd / 2 - 0.1, 14, 1.4, 0.2, 0x1a3a5a);
  k.box(0, 7.1, bz + bd / 2 + 0.02, 12.5, 0.8, 0.05, WHITE);
  // crew quarters: 2-storey wing on the right
  const qx = 20.5;
  k.box(qx, 0, -4, 11, 0.5, 14.6, STONE);
  k.box(qx, 0.5, -4, 10.4, 7.4, 14, wall);
  winRow(k, 'front', qx, -4, 10.4, 14, 0.5, 2, 3);
  winRow(k, 'right', qx, -4, 10.4, 14, 0.5, 2, 3);
  k.box(qx, 7.9, -4, 11, 0.3, 14.6, 0xc0392b);
  // hose-drying tower
  k.box(-19, 0, -4, 6, 0.4, 6, STONE);
  k.box(-19, 0.4, -4, 5, 12.6, 5, 0xc0392b);
  for (let i = 0; i < 5; i++) k.box(-19, 2 + i * 2.2, -1.46, 1.0, 1.2, 0.08, 0x24323b);
  k.box(-19, 13.0, -4, 6.2, 0.4, 6.2, WHITE);
  k.hip(-19, 13.4, -4, 6.8, 6.8, 2.0, 0x6a6f73);
  k.cyl(-19, 15.4, -4, 0.07, 0.04, 3, 0xb7bcc2, 5);
  // rooftop beacon, water tanks
  k.waterTank(5, 6.85, -6, 1.0, 0x1d2530);
  k.cyl(-6, 6.85, -4, 0.3, 0.3, 1.0, 0xd33a2c, 8);
  // trucks out on the apron + one inside doorway
  vehicle(k, -9.5, 14, Math.PI, 'truck', 0xc0392b, 0xf4efe4);
  vehicle(k, 0, 15, Math.PI, 'ladder', 0xc0392b, 0xf4efe4);
  vehicle(k, 12, 14, Math.PI + 0.1, 'van', 0xc0392b, 0xf4efe4);
  // hydrant, flagpole, practice drill wall, pit
  for (const [x, z] of [[-24, 20], [24, 20]] as const) { k.cyl(x, 0.1, z, 0.2, 0.2, 0.8, 0xc0392b, 8); k.box(x, 0.7, z, 0.5, 0.15, 0.2, 0xc0392b); }
  flagPole(k, -22, 14, 9);
  k.box(14, 0.1, -17, 8, 5, 0.6, 0x9b968c);
  for (let i = 0; i < 4; i++) k.box(14 - 3 + i * 2, 1 + (i % 2) * 2, -16.6, 1.0, 1.0, 0.05, 0x24323b);
  k.box(0, 0.1, -17, 12, 0.1, 6, 0x4cb0d0);
  return k.finish(W, D, 17);
}

// ======================================================================
// ডাকঘর
// ======================================================================

export function buildPostOffice(seed = 0): BuiltBuilding {
  const k = new Kit(OVER);
  const W = 38, D = 34;
  const wall = pick(seed, [0xe9e6de, CREAM]);
  lawnSite(k, W, D, true);
  k.box(0, 0.06, 10, 3.2, 0.04, 10, 0xb8654a);
  const bw = 20, bd = 10, bz = -4, fh = FLOOR_H + 0.4;
  k.box(0, 0, bz, bw + 0.6, 0.6, bd + 0.6, STONE);
  k.box(0, 0.6, bz, bw, 2 * fh, bd, wall);
  k.box(0, 0.6 + fh - 0.12, bz, bw + 0.3, 0.24, bd + 0.3, 0xc0392b);
  k.box(0, 0.6 + 2 * fh, bz, bw + 0.8, 0.3, bd + 0.8, WHITE);
  winRow(k, 'front', 0, bz, bw, bd, 0.6, 2, 5, 0xc0392b, (f, c) => f === 0 && c === 2);
  winRow(k, 'back', 0, bz, bw, bd, 0.6, 2, 5);
  winRow(k, 'left', 0, bz, bw, bd, 0.6, 2, 2);
  winRow(k, 'right', 0, bz, bw, bd, 0.6, 2, 2);
  k.box(0, 0.6, bz + bd / 2 + 0.05, 2.2, 2.8, 0.1, 0x5a3a24);
  // arched porch with red columns
  k.box(0, 0, bz + bd / 2 + 1.6, 8, 0.6, 3.2, STONE);
  for (const x of [-3.2, 3.2]) k.cyl(x, 0.6, bz + bd / 2 + 2.6, 0.28, 0.25, fh - 0.2, WHITE, 10);
  k.box(0, 0.6 + fh - 0.2, bz + bd / 2 + 1.6, 8.4, 0.4, 3.4, 0xc0392b);
  k.box(0, 0.6 + fh + 0.2, bz + bd / 2 + 0.4, 6, 1.0, 0.1, 0xc0392b);
  k.box(0, 0.6 + fh + 0.45, bz + bd / 2 + 0.48, 5.2, 0.5, 0.05, WHITE);
  // roof (hip with tiles) + chimney + small clock turret
  k.hip(0, 0.6 + 2 * fh + 0.3, bz, bw + 1.6, bd + 1.6, 3.0, 0x9a5a3a);
  k.box(0, 0.6 + 2 * fh + 2.4, bz, 3.0, 3.2, 3.0, wall);
  k.hip(0, 0.6 + 2 * fh + 5.6, bz, 3.6, 3.6, 1.6, 0x9a5a3a);
  k.glass(0, 0.6 + 2 * fh + 3.2, bz + 1.52, 1.4, 1.4, 0.04, 0xf4efe4);
  k.cyl(0, 0.6 + 2 * fh + 7.2, bz, 0.06, 0.03, 1.6, 0xb7bcc2, 5);
  // red pillar boxes, bicycle rack, post van, sorting annex
  for (const [x, z] of [[-6, 7], [6, 7]] as const) {
    k.cyl(x, 0.06, z, 0.4, 0.4, 1.5, 0xc0392b, 12);
    k.sphere(x, 1.56, z, 0.4, 0xc0392b, 0.6);
    k.box(x, 1.0, z + 0.38, 0.5, 0.08, 0.04, 0x24323b);
  }
  vehicle(k, -12, 10, 0.3, 'van', 0xc0392b, 0xf4efe4);
  for (let i = 0; i < 5; i++) k.box(10 + i * 0.7, 0.06, 8, 0.1, 1.0, 1.5, 0x3a4a52);
  k.box(14, 0, -10, 8, 0.4, 8, STONE);
  k.box(14, 0.4, -10, 7.6, 3.2, 7.6, 0xe3d7c2);
  k.tinRoof(14, 3.6, -10, 9, 9.2, 1.4, 0x8d9aa0, 0x7f8a8e);
  k.box(14, 0.4, -6.1, 3.8, 2.6, 0.1, 0x6a6f73);
  flagPole(k, -12, 2, 10);
  for (const [x, z] of [[-15, -12], [-8, -13]] as const) k.tree(x, z, 6, 0x4b8a42);
  return k.finish(W, D, 0.6 + 2 * fh + 9);
}

// ======================================================================
// সিটি কর্পোরেশন ভবন (City Hall)
// ======================================================================

export function buildCityHall(seed = 0): BuiltBuilding {
  const k = new Kit(OVER);
  const W = 100, D = 84;
  const wall = pick(seed, [0xe9e6de, 0xf1eee6]);
  k.box(0, 0, 0, W, 0.06, D, 0x9b8f84);
  lawnSite(k, W, D, false);
  k.box(0, 0.06, 18, 90, 0.05, 36, 0xcfc7b6); // grand plaza
  k.box(0, 0.06, 40, 12, 0.04, 8, 0x7a7a78);
  const fh = FLOOR_H + 0.6, floors = 4, bw = 62, bd = 18, bz = -22;
  k.box(0, 0, bz, bw + 1, 1.2, bd + 1, 0xa7a49c);
  k.box(0, 1.2, bz, bw, floors * fh, bd, wall);
  const top = 1.2 + floors * fh;
  for (let f = 0; f <= floors; f++) k.box(0, 1.2 + f * fh - 0.1, bz, bw + 0.3, 0.2, bd + 0.3, 0xa7a49c);
  // glazed curtain bays between stone piers
  for (let i = 0; i <= 12; i++) k.box(-bw / 2 + 1 + i * ((bw - 2) / 12), 1.2, bz + bd / 2 + 0.2, 1.0, floors * fh, 0.5, wall);
  k.glass(0, 1.6, bz + bd / 2 + 0.1, bw - 3, floors * fh - 0.8, 0.1, GLASS);
  k.box(0, top, bz, bw + 1.2, 0.5, bd + 1.2, 0xa7a49c);
  // central clock tower
  const tw = 10, th = 20;
  k.box(0, 1.2, bz + bd / 2 + 2, tw + 2, floors * fh, 4, 0xa7a49c);
  k.box(0, top + 0.5, bz + 2, tw, th, tw, wall);
  for (const s of [-1, 1]) for (const e of [-1, 1]) k.box(s * tw / 2, top + 0.5, bz + 2 + e * tw / 2, 1.0, th, 1.0, 0xa7a49c);
  k.box(0, top + 0.5 + th, bz + 2, tw + 1.6, 0.8, tw + 1.6, 0xa7a49c);
  // clock faces on four sides
  for (const [dx, dz, ry] of [[0, tw / 2 + 0.05, 0], [0, -tw / 2 - 0.05, Math.PI], [tw / 2 + 0.05, 0, Math.PI / 2], [-tw / 2 - 0.05, 0, -Math.PI / 2]] as const)
    k.local(0, top + 0.5 + th - 4.0, bz + 2, ry, () => { k.withMatrix(new THREE.Matrix4().makeTranslation(dx * (ry % Math.PI ? 0 : 1) , 0, dz), () => 0); });
  for (const [x, z] of [[0, bz + 2 + tw / 2 + 0.06], [0, bz + 2 - tw / 2 - 0.06]] as const) { k.box(x, top + 0.5 + th - 6, z, 5, 5, 0.06, WHITE); k.box(x, top + 0.5 + th - 3.8, z + (z > bz + 2 ? 0.05 : -0.05), 0.2, 2.0, 0.04, 0x24323b); k.box(x + 0.6, top + 0.5 + th - 3.6, z + (z > bz + 2 ? 0.05 : -0.05), 1.4, 0.2, 0.04, 0x24323b); }
  for (const [x, z] of [[tw / 2 + 0.06, bz + 2], [-tw / 2 - 0.06, bz + 2]] as const) k.box(x, top + 0.5 + th - 6, z, 0.06, 5, 5, WHITE);
  // spire cap
  k.hip(0, top + 1.3 + th, bz + 2, tw + 1.6, tw + 1.6, 6, 0x4a7a6a);
  k.cyl(0, top + 7.3 + th, bz + 2, 0.12, 0.05, 5, 0xb7bcc2, 6);
  k.sphere(0, top + 7.3 + th, bz + 2, 0.5, 0xd9b44a);
  // wings: 3-storey set back at sides
  for (const s of [-1, 1]) {
    k.box(s * 42, 0, bz + 4, 24, 1.0, 14, 0xa7a49c);
    k.box(s * 42, 1.0, bz + 4, 23, 3 * fh, 13, wall);
    winRow(k, 'front', s * 42, bz + 4, 23, 13, 1.0, 3, 6, 0xa7a49c);
    winRow(k, s < 0 ? 'left' : 'right', s * 42, bz + 4, 23, 13, 1.0, 3, 3, 0xa7a49c);
    k.box(s * 42, 1.0 + 3 * fh, bz + 4, 24, 0.4, 14, 0xa7a49c);
  }
  // entrance: grand stairs + 6 columns + low dome lobby cap
  for (let i = 0; i < 6; i++) k.box(0, 0.06, bz + bd / 2 + 8 - i * 0.7, 24 - i * 0.8, 0.2 * (6 - i), 0.7, 0xa7a49c);
  columnsRow(k, 0, bz + bd / 2 + 3.8, 12, 1.2, floors * fh - 1.0, 6, WHITE, 0.6);
  // plaza features: flags, fountain pools, benches, lamp posts, statues
  for (const s of [-1, 1]) {
    flagPole(k, s * 16, 20, 14);
    flagPole(k, s * 22, 20, 12);
    k.box(s * 28, 0.1, 24, 14, 0.4, 8, 0xa7a49c);
    k.box(s * 28, 0.5, 24, 12.6, 0.1, 6.6, 0x4cb0d0);
    for (let i = 0; i < 4; i++) { k.box(s * 32 + i * 0.0, 0.1, 10 + i * 5, 0.4, 0.6, 1.6, 0x7a5a3a); }
    for (let i = 0; i < 4; i++) { k.cyl(s * 36, 0.1, 30 + i * 3.5 - 6, 0.08, 0.06, 4.0, 0x555a60, 5); k.sphere(s * 36, 4.3, 30 + i * 3.5 - 6, 0.3, 0xf6d86a); }
  }
  k.cyl(0, 0.1, 22, 4, 4, 0.6, 0xa7a49c, 18);
  k.cyl(0, 0.7, 22, 3.6, 3.6, 0.08, 0x4cb0d0, 18);
  k.cyl(0, 0.6, 22, 0.4, 0.25, 2.4, 0xa7a49c, 8);
  for (const s of [-1, 1]) for (let i = 0; i < 4; i++) { palm(k, s * (12 + i * 10), 34, 9); }
  for (const s of [-1, 1]) for (let i = 0; i < 3; i++) k.tree(s * 46, -34 + i * 8, 6, 0x4b8a42);
  vehicle(k, -40, 36, 0.2, 'jeep', 0xf4efe4, 0x2f5f8a); vehicle(k, 40, 36, -0.2, 'jeep', 0x1a3a5a);
  return k.finish(W, D, top + 14 + th * 0.5 + 6);
}
