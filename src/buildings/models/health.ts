import * as THREE from 'three';
import { FLOOR_H, Kit, pick, type BuiltBuilding } from './BuildingKit';

/** HEALTH: হাসপাতাল, ক্লিনিক, ডায়াগনস্টিক সেন্টার. */

const GLASS = 0x2f4f66;
const RED = 0xd33a2c;
const GREEN = 0x3b8a55;

function crossSignFront(k: Kit, x: number, y: number, z: number, size: number, color: number): void {
  k.box(x - size / 2, y - size * 0.17, z, size, size * 0.34, 0.12, color);
  k.box(x - size * 0.17, y - size / 2, z, size * 0.34, size, 0.12, color);
}

function ambulance(k: Kit, x: number, z: number, ry: number): void {
  k.local(x, 0, z, ry, () => {
    k.box(0, 0.4, 0, 2.1, 1.6, 5.2, 0xf4efe4);
    k.box(0, 1.2, 1.6, 1.9, 0.9, 1.8, 0x2f4f66);
    k.box(0, 0.8, 0, 2.14, 0.35, 5.2, RED);
    k.box(0, 2.0, -0.4, 1.6, 0.18, 0.5, 0x2f6f9f);
    for (const sx of [-1.0, 1.0]) for (const sz of [-1.6, 1.6]) k.withMatrix(new THREE.Matrix4().makeTranslation(sx, 0.4, sz).multiply(new THREE.Matrix4().makeRotationZ(Math.PI / 2)), () => k.cyl(0, -0.1, 0, 0.4, 0.4, 0.22, 0x222222, 8));
    k.box(1.06, 1.1, -0.4, 0.04, 0.8, 0.1, RED);
  });
}

function parking(k: Kit, cx: number, cz: number, w: number, d: number): void {
  k.box(cx, 0, cz, w, 0.08, d, 0x4a4d52);
  const n = Math.floor(w / 3);
  for (let i = 0; i <= n; i++) k.box(cx - (n * 3) / 2 + i * 3, 0.08, cz, 0.12, 0.01, d - 1, 0xe9e6de);
  const cols = [0xb02a2a, 0xd9d9d6, 0x2f3b4a, 0x6a7a8a, 0xe9c23a];
  for (let i = 0; i < n; i++) if (i % 3 !== 2) k.local(cx - (n * 3) / 2 + 1.5 + i * 3, 0, cz, 0, () => {
    k.box(0, 0.3, 0, 1.8, 0.65, 4.2, cols[i % cols.length]!);
    k.box(0, 0.95, -0.1, 1.6, 0.55, 2.2, GLASS);
  });
}

/** হাসপাতাল: central 8-storey tower + two 5-storey wings, emergency bay with ambulances, rooftop helipad. */
export function buildHospital(seed = 0): BuiltBuilding {
  const k = new Kit();
  const W = 80, D = 62, fh = 3.6;
  const wall = pick(seed, [0xf1ede4, 0xe9e6de]);
  const acc = pick(seed, [0x2f6f9f, 0x3b8a55]);
  k.box(0, 0, 0, W, 0.06, D, 0xcfc7b6);
  // central tower
  const tw = 24, td = 18, tf = 8, tz = -6;
  k.box(0, 0, tz, tw + 1, 0.4, td + 1, 0x9b968c);
  k.box(0, 0.4, tz, tw, tf * fh, td, wall);
  for (let f = 1; f <= tf; f++) k.box(0, 0.4 + f * fh - 0.12, tz, tw + 0.2, 0.24, td + 0.2, 0xdfe3e6);
  for (const s of ['front', 'back', 'left', 'right'] as const) {
    k.onSide(s, 0, tz, tw, td, (len, half) => {
      for (let f = 1; f < tf; f++) for (let i = 0; i < Math.round(len / 3); i++) {
        const x = -len / 2 + (len * (i + 0.5)) / Math.round(len / 3);
        k.glass(x, 0.4 + f * fh + 0.9, half + 0.04, 1.6, 1.5, 0.05, GLASS);
        k.box(x, 0.4 + f * fh + 0.8, half + 0.02, 1.8, 1.7, 0.04, 0xdfe3e6);
      }
    });
  }
  // coloured vertical band + big red cross on the tower front
  k.box(0, 0.4, tz + td / 2 + 0.08, 4, tf * fh, 0.12, acc);
  crossSignFront(k, 0, 0.4 + (tf - 1) * fh + 2.6, tz + td / 2 + 0.2, 3.4, RED);
  const top = 0.4 + tf * fh;
  k.box(0, top, tz, tw + 0.6, 0.3, td + 0.6, 0xa7a49c);
  k.parapet(0, top + 0.3, tz, tw + 0.6, td + 0.6, 1.0, 0.2, wall);
  k.box(6, top + 0.3, tz - 3, 8, 3.2, 6, 0xb7bcc2);
  // two wings with a helipad on the left
  for (const s of [-1, 1]) {
    const wx = s * 26, wd = 16, ww = 28, wf = 5, wz = -4;
    k.box(wx, 0, wz, ww + 1, 0.4, wd + 1, 0x9b968c);
    k.box(wx, 0.4, wz, ww, wf * fh, wd, wall);
    for (let f = 1; f <= wf; f++) k.box(wx, 0.4 + f * fh - 0.12, wz, ww + 0.2, 0.24, wd + 0.2, 0xdfe3e6);
    k.windowGrid('front', wx, wz, ww, wd, { y0: 0.4, floors: wf, floorH: fh, cols: 9, ww: 1.6, wh: 1.5, sill: 0.95, glass: GLASS, frame: 0xdfe3e6, skip: (f, c) => f === 0 && c === 0 && s < 0 });
    k.windowGrid('back', wx, wz, ww, wd, { y0: 0.4, floors: wf, floorH: fh, cols: 9, ww: 1.6, wh: 1.5, sill: 0.95, glass: GLASS, frame: 0xdfe3e6 });
    k.windowGrid(s < 0 ? 'left' : 'right', wx, wz, ww, wd, { y0: 0.4, floors: wf, floorH: fh, cols: 5, ww: 1.6, wh: 1.5, sill: 0.95, glass: GLASS, frame: 0xdfe3e6 });
    k.box(wx, 0.4 + wf * fh, wz, ww + 0.5, 0.3, wd + 0.5, 0xa7a49c);
    k.parapet(wx, 0.7 + wf * fh, wz, ww + 0.5, wd + 0.5, 0.9, 0.2, wall);
    k.box(wx, 0.4 + wf * fh * 0.0, wz + wd / 2 + 0.06, ww, 0.5, 0.1, acc);
  }
  // helipad on the left wing roof
  const hy = 0.7 + 5 * fh + 0.2;
  k.cyl(-26, hy, -4, 6.2, 6.2, 0.15, 0x5a5f66, 24);
  k.cyl(-26, hy + 0.15, -4, 5.4, 5.4, 0.04, 0xe9e6de, 24);
  k.cyl(-26, hy + 0.18, -4, 4.8, 4.8, 0.04, 0x5a5f66, 24);
  k.box(-27.4, hy + 0.2, -4, 0.5, 0.04, 3.2, 0xf4efe4);
  k.box(-24.6, hy + 0.2, -4, 0.5, 0.04, 3.2, 0xf4efe4);
  k.box(-26, hy + 0.2, -4, 3.0, 0.04, 0.5, 0xf4efe4);
  // emergency entrance with ambulance bay (front-right wing)
  k.box(26, 4.4, 8.6, 20, 0.35, 8.2, RED);
  for (const x of [17, 35]) for (const z of [5.4, 11.4]) k.cyl(x, 0.06, z, 0.3, 0.3, 4.3, 0xf4efe4, 8);
  k.glass(26, 0.7, 4.06, 12, 3.4, 0.06, 0x3c6a86);
  crossSignFront(k, 26, 5.7, 12.9, 2.2, 0xf4efe4);
  ambulance(k, 21, 15, 0.1);
  ambulance(k, 29, 14, -0.05);
  // main entrance: glass lobby + canopy
  k.glass(0, 0.6, tz + td / 2 + 5.04, 12, 4.6, 0.08, 0x4c7f9f);
  k.box(0, 0.4, tz + td / 2 + 2.6, 13, 5.6, 5.2, 0xf1ede4);
  k.box(0, 5.9, tz + td / 2 + 3.0, 15, 0.4, 6.0, acc);
  for (const x of [-6.4, 6.4]) k.cyl(x, 0.06, tz + td / 2 + 5.6, 0.3, 0.3, 5.8, 0xf4efe4, 8);
  // car park, trees, generator house
  parking(k, -4, 24, 42, 10);
  k.box(-34, 0.06, 22, 8, 3.2, 6, 0xb7bcc2);
  for (const x of [-36, -18, 12, 38]) k.tree(x, 15, 5, 0x3f7a35);
  k.boundaryWall(0, 0, W - 0.6, D - 0.6, 0xd9ceb8, 0x8d8b86, 9.0, 1.8);
  return k.finish(W, D, top + 4.5);
}

/** ক্লিনিক: small 2-storey clinic, green cross sign, wheelchair ramp, waiting benches. */
export function buildClinic(seed = 0): BuiltBuilding {
  const k = new Kit();
  const w = 16, d = 11, wall = pick(seed, [0xf1ede4, 0xe3efe6, 0xe9e6de]);
  k.box(0, 0, 0, w + 6, 0.06, d + 14, 0xcfc7b6);
  k.box(0, 0.06, 0, w + 0.6, 0.4, d + 0.6, 0x9b968c);
  k.box(0, 0.46, 0, w, 2 * FLOOR_H, d, wall);
  k.box(0, 0.46 + FLOOR_H - 0.1, 0, w + 0.16, 0.2, d + 0.16, GREEN);
  k.windowGrid('front', 0, 0, w, d, { y0: 0.46, floors: 2, cols: 4, ww: 1.5, wh: 1.4, sill: 0.95, glass: GLASS, frame: 0xf4efe4, skip: (f, c) => f === 0 && (c === 1 || c === 2) });
  k.windowGrid('back', 0, 0, w, d, { y0: 0.46, floors: 2, cols: 4, ww: 1.5, wh: 1.4, sill: 0.95, glass: GLASS, frame: 0xf4efe4 });
  k.windowGrid('left', 0, 0, w, d, { y0: 0.46, floors: 2, cols: 3, ww: 1.5, wh: 1.4, sill: 0.95, glass: GLASS, frame: 0xf4efe4 });
  k.windowGrid('right', 0, 0, w, d, { y0: 0.46, floors: 2, cols: 3, ww: 1.5, wh: 1.4, sill: 0.95, glass: GLASS, frame: 0xf4efe4 });
  k.glass(0, 0.7, d / 2 + 0.05, 5.2, 2.6, 0.06, 0x4c7f9f);
  k.box(0, 3.3, d / 2 + 1.1, 7.2, 0.25, 2.3, GREEN);
  for (const x of [-3.3, 3.3]) k.cyl(x, 0.46, d / 2 + 2.1, 0.18, 0.18, 2.9, 0xf4efe4, 8);
  // green cross sign on the facade
  k.box(w / 2 - 2.2, 0.46 + FLOOR_H + 0.9, d / 2 + 0.1, 2.6, 0.8, 0.1, GREEN);
  k.box(w / 2 - 2.2 - 0.0, 0.46 + FLOOR_H + 0.9 - 0.9, d / 2 + 0.1, 0.8, 2.6, 0.1, GREEN);
  k.box(0, 0.46 + 2 * FLOOR_H, 0, w + 0.4, 0.22, d + 0.4, 0xa7a49c);
  k.parapet(0, 0.68 + 2 * FLOOR_H, 0, w + 0.4, d + 0.4, 0.8, 0.16, wall);
  k.waterTank(-4, 0.68 + 2 * FLOOR_H, -2, 0.9);
  // wheelchair ramp with rails
  k.local(-w / 2 + 2.0, 0.06, d / 2 + 3.2, 0, () => {
    for (let i = 0; i < 6; i++) k.box(0, 0, 3 - i * 1.0, 1.8, 0.08 + i * 0.07, 1.0, 0xcfc7b6);
    for (const s of [-0.95, 0.95]) k.box(s, 0.4, 0, 0.05, 0.9, 6.0, 0xb7bcc2);
  });
  // benches + tree + ambulance
  for (const x of [-2, 2]) k.box(x, 0, d / 2 + 4.6, 1.8, 0.5, 0.5, 0x7a5a3a);
  ambulance(k, 11, 10, 0.3);
  k.tree(-11, 8, 5);
  return k.finish(w + 6, d + 14, 9);
}

/** ডায়াগনস্টিক সেন্টার: 4-storey glass-front lab/imaging centre with a big sign and rooftop plant. */
export function buildDiagnostic(seed = 0): BuiltBuilding {
  const k = new Kit();
  const w = 18, d = 14, floors = 4, fh = 3.5;
  const acc = pick(seed, [0x2f6f9f, 0x7a4a9a, 0x2a8a8a]);
  k.box(0, 0, 0, w + 0.6, 0.35, d + 0.6, 0x9b968c);
  k.box(0, 0.35, 0, w, floors * fh, d, 0xe9e6de);
  for (const s of ['front'] as const) {
    k.onSide(s, 0, 0, w, d, (len, half) => {
      for (let f = 0; f < floors; f++) {
        k.glass(0, 0.35 + f * fh + 0.5, half + 0.05, len - 3.5, fh - 1.1, 0.06, 0x3c6a86);
        k.box(0, 0.35 + f * fh - 0.12, half + 0.12, len, 0.24, 0.3, acc);
      }
      for (let i = 0; i <= 6; i++) k.box(-len / 2 + 1.75 + ((len - 3.5) * i) / 6, 0.35, half + 0.1, 0.25, floors * fh, 0.2, 0xf4efe4);
    });
  }
  k.windowGrid('back', 0, 0, w, d, { y0: 0.35, floors, floorH: fh, cols: 5, ww: 1.4, wh: 1.3, sill: 1.0, glass: GLASS, frame: 0xf4efe4 });
  k.windowGrid('left', 0, 0, w, d, { y0: 0.35, floors, floorH: fh, cols: 4, ww: 1.4, wh: 1.3, sill: 1.0, glass: GLASS, frame: 0xf4efe4 });
  k.windowGrid('right', 0, 0, w, d, { y0: 0.35, floors, floorH: fh, cols: 4, ww: 1.4, wh: 1.3, sill: 1.0, glass: GLASS, frame: 0xf4efe4 });
  k.box(0, 0.35 + floors * fh, 0, w + 0.4, 0.25, d + 0.4, 0xa7a49c);
  k.parapet(0, 0.6 + floors * fh, 0, w + 0.4, d + 0.4, 0.9, 0.18, 0xe9e6de);
  // roof sign + chiller units
  k.box(0, 0.6 + floors * fh, d / 2 - 0.2, 14, 1.9, 0.25, acc);
  k.box(0, 0.6 + floors * fh + 0.7, d / 2 - 0.05, 11, 0.5, 0.05, 0xf4efe4);
  for (let i = 0; i < 3; i++) k.box(-5 + i * 4, 0.6 + floors * fh, -3, 2.8, 1.8, 2.8, 0xb7bcc2);
  k.box(0, 0.35, d / 2 + 1.6, 7, 0.25, 3.0, acc);
  k.box(0, 0.35 + 3.6, d / 2 + 1.6, 7.3, 0.2, 3.3, 0xf4efe4);
  k.box(w / 2 + 2.6, 0, 0, 5, 0.06, d, 0x4a4d52);
  return k.finish(w + 6, d + 4, 0.6 + floors * fh + 3);
}
