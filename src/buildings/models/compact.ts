import { FLOOR_H, Kit, pick, type BuiltBuilding, type Side } from './BuildingKit';

/**
 * COMPACT CITY BUILDINGS (Step A): small footprints (9 - 20 m) with 3 - 30 floors, so that they fit between the streets of the city fill
 * (the original models are 25 - 45 m wide and leave gaps in 80 - 110 m blocks). Same kit / style / surfaces as the other models:
 * front (street side) = +Z, origin = centre of the footprint, ONE merged mesh per surface.
 * These are registered in FILL_BUILDING_MODELS (registry.ts), NOT in BUILDING_MODELS: they belong to the city fill only.
 */

const GLASS = 0x2f4f66;
const GLASS_LIGHT = 0x4c7f9f;
const SIDES: Side[] = ['front', 'back', 'left', 'right'];
const SIGN = [0xc0392b, 0x2f6f9f, 0x3b8a55, 0xd49a2a, 0x7a4a9a, 0x2a8a8a];

/** Glass curtain wall on one side: a glass band per floor + vertical mullions + slab edges. */
function curtainWall(k: Kit, side: Side, w: number, d: number, y0: number, floors: number, fh: number, glass: number, frame: number, bay = 3.0): void {
  k.onSide(side, 0, 0, w, d, (len, half) => {
    for (let f = 0; f < floors; f++) {
      k.glass(0, y0 + f * fh + 0.35, half + 0.04, len - 0.8, fh - 0.9, 0.05, glass);
      k.box(0, y0 + f * fh - 0.12, half + 0.08, len, 0.28, 0.2, frame);
    }
    const n = Math.max(2, Math.round(len / bay));
    for (let i = 0; i <= n; i++) k.box(-len / 2 + (len * i) / n, y0, half + 0.1, 0.3, floors * fh, 0.22, frame);
  });
}

/** Roof slab + parapet + a small plant room, a few units and an antenna. Returns the roof level. */
function roof(k: Kit, y: number, w: number, d: number, parapetColor: number, plant = 0xb7bcc2): number {
  k.box(0, y, 0, w + 0.3, 0.25, d + 0.3, 0xa7a49c);
  k.parapet(0, y + 0.25, 0, w + 0.3, d + 0.3, 0.9, 0.2, parapetColor);
  k.box(-w * 0.18, y + 0.25, -d * 0.12, w * 0.34, 2.8, d * 0.4, plant);
  for (let i = 0; i < 2; i++) k.box(w * 0.2 + i * 2.4, y + 0.25, d * 0.12, 2.0, 1.3, 2.0, plant);
  k.cyl(w * 0.3, y + 0.25, -d * 0.25, 0.06, 0.06, 6.0, 0x555a60, 5);
  return y + 0.25;
}

/** Glazed lobby on the front with a canopy on two columns. */
function lobby(k: Kit, w: number, d: number, h: number, y0: number, frame: number): void {
  k.glass(0, y0 + 0.4, d / 2 + 0.05, Math.min(w - 3, 11), h - 1.0, 0.08, GLASS_LIGHT);
  k.box(0, y0 + h, d / 2 + 1.4, Math.min(w - 2, 12), 0.3, 2.8, frame);
  for (const s of [-1, 1]) k.cyl(s * (Math.min(w - 2, 12) / 2 - 0.5), y0, d / 2 + 2.4, 0.28, 0.28, h, frame, 8);
}

// ---------------------------------------------------------------- office / mixed-use towers

/** Slim 20-floor glass office tower on a 2-floor podium (18 x 18 m). */
export function buildSlimTower20(seed = 0): BuiltBuilding {
  const k = new Kit();
  const W = 18, D = 18, fh = 3.6, floors = 18, PH = 7.0;
  const glass = pick(seed, [0x2c5f7f, 0x3a6a82, 0x2f5f6a]);
  const stone = pick(seed, [0xb8b4aa, 0xbdb7a8, 0xaeb1b3]);
  k.box(0, 0, 0, W + 2, 0.35, D + 2, 0x8d8b86);
  k.box(0, 0.35, 0, W, PH, D, stone);
  lobby(k, W, D, 5.2, 0.35, 0xe9e6de);
  k.box(0, 0.35 + PH, 0, W + 0.8, 0.4, D + 0.8, 0xe9e6de);
  const y1 = 0.35 + PH + 0.4;
  k.box(0, y1, 0, W - 2, floors * fh, D - 2, glass);
  for (const s of SIDES) curtainWall(k, s, W - 2, D - 2, y1 + 0.7, floors, fh, GLASS_LIGHT, 0xcfd5da, 3.2);
  const top = y1 + floors * fh;
  k.box(0, top, 0, W - 1.6, 0.4, D - 1.6, 0xcfd5da);
  k.box(0, top + 0.4, 0, W - 7, 3.2, D - 7, 0xb7bcc2);
  k.cyl(0, top + 3.6, 0, 0.4, 0.07, 14, 0xb7bcc2, 8);
  k.sphere(0, top + 17.8, 0, 0.3, 0xd33a2c);
  return k.finish(W + 2, D + 3, top + 18);
}

/** Slim 30-floor tower with a set-back crown and spire (16 x 16 m shaft). */
export function buildSlimTower30(seed = 0): BuiltBuilding {
  const k = new Kit();
  const W = 19, D = 19, fh = 3.7, PH = 8.0;
  const glass = pick(seed, [0x27495f, 0x35607a, 0x2d5a63]);
  const frame = pick(seed, [0xcfd5da, 0xd9d4c8]);
  k.box(0, 0, 0, W + 2, 0.35, D + 2, 0x8d8b86);
  k.box(0, 0.35, 0, W, PH, D, 0xaeb1b3);
  lobby(k, W, D, 5.8, 0.35, 0xe9e6de);
  k.box(0, 0.35 + PH, 0, W + 0.8, 0.45, D + 0.8, 0xe9e6de);
  const y1 = 0.35 + PH + 0.45;
  const TW = 16, TD = 16;
  k.box(0, y1, 0, TW, 22 * fh, TD, glass);
  for (const s of SIDES) curtainWall(k, s, TW, TD, y1 + 0.7, 22, fh, GLASS_LIGHT, frame, 3.0);
  const y2 = y1 + 22 * fh;
  k.box(0, y2, 0, TW - 4, 6 * fh, TD - 4, glass);
  for (const s of SIDES) curtainWall(k, s, TW - 4, TD - 4, y2 + 0.7, 6, fh, GLASS_LIGHT, frame, 3.0);
  const y3 = y2 + 6 * fh;
  k.box(0, y3, 0, TW - 3.6, 0.4, TD - 3.6, frame);
  k.hip(0, y3 + 0.4, 0, TW - 7, TD - 7, 6, glass);
  k.cyl(0, y3 + 6.4, 0, 0.45, 0.07, 20, 0xb7bcc2, 8);
  k.sphere(0, y3 + 26.2, 0, 0.32, 0xd33a2c);
  return k.finish(W + 2, D + 3, y3 + 27);
}

/** 12-floor office slab with ribbon glazing and a glazed lobby (20 x 15 m). */
export function buildOfficeSlim12(seed = 0): BuiltBuilding {
  const k = new Kit();
  const w = 20, d = 15, fh = 3.6, floors = 12, concrete = pick(seed, [0xd0cdc6, 0xc9ccd0, 0xd8d2c4]);
  k.box(0, 0, 0, w + 1, 0.4, d + 1, 0x9b968c);
  k.box(0, 0.4, 0, w, floors * fh + 0.6, d, concrete);
  for (const s of SIDES) curtainWall(k, s, w, d, 1.2, floors, fh, GLASS, concrete === 0xd0cdc6 ? 0xeceae4 : 0xdfe2e6, 4.0);
  lobby(k, w, d, 4.4, 0.6, 0xeceae4);
  const top = 0.4 + floors * fh + 0.6;
  const r = roof(k, top, w, d, concrete);
  k.box(0, r, d / 2 - 0.35, 8, 1.6, 0.3, pick(seed, [0x2f5f8a, 0x3b6b52, 0x8a3f3a]));
  return k.finish(w + 1, d + 5, top + 4);
}

/** 6-floor mixed-use block: shops with awnings on the ground floor, offices / flats above (18 x 14 m). */
export function buildMixedUse6(seed = 0): BuiltBuilding {
  const k = new Kit();
  const W = 18, D = 14, GF = 4.2, floors = 5;
  const body = pick(seed, [0xe3d7c2, 0xdfe3d3, 0xe6d1c4, 0xd9dde0]);
  const acc = pick(seed, [0xb85c38, 0x4f7a8a, 0x8a6aa0]);
  k.box(0, 0, 0, W + 0.6, 0.25, D + 0.6, 0x8d8b86);
  k.box(0, 0.25, 0, W, GF - 0.25, D, 0xcfc9bb);
  k.onSide('front', 0, 0, W, D, (len, half) => {
    for (let i = 0; i < 4; i++) {
      const t = -len / 2 + 2.25 + i * ((len - 4.5) / 3);
      k.glass(t, 0.6, half + 0.05, 3.0, 2.6, 0.08, GLASS_LIGHT);
      k.box(t, 3.1, half + 0.7, 3.6, 0.2, 1.5, pick(seed + i, SIGN));
    }
  });
  const y0 = GF;
  k.box(0, y0, 0, W, floors * FLOOR_H, D, body);
  for (let f = 0; f <= floors; f++) k.box(0, y0 + f * FLOOR_H - 0.12, 0, W + 0.18, 0.24, D + 0.18, 0xf4efe4);
  const g = { y0, floors, ww: 1.5, wh: 1.4, sill: 0.95, glass: GLASS, frame: 0xf4efe4 };
  k.windowGrid('front', 0, 0, W, D, { ...g, cols: 5 });
  k.windowGrid('back', 0, 0, W, D, { ...g, cols: 5 });
  k.windowGrid('left', 0, 0, W, D, { ...g, cols: 3 });
  k.windowGrid('right', 0, 0, W, D, { ...g, cols: 3 });
  const top = y0 + floors * FLOOR_H;
  roof(k, top, W, D, body);
  k.box(0, top + 0.25, D / 2 - 0.4, 7, 1.5, 0.3, acc);
  return k.finish(W + 0.6, D + 2, top + 4);
}

/** Boutique hotel: 12 floors, a balcony on every room, porch and rooftop sign (16 x 13 m). */
export function buildHotelBoutique(seed = 0): BuiltBuilding {
  const k = new Kit();
  const w = 16, d = 13, floors = 12, GF = 4.4, body = pick(seed, [0xe3d7c2, 0xe6d9c4, 0xddd6c6, 0xd6d9dc]);
  const acc = pick(seed, [0x8a3f3a, 0x2f5f8a, 0x3b6b52]);
  k.box(0, 0, 0, w + 1, 0.3, d + 1, 0x9b968c);
  k.box(0, 0.3, 0, w, GF - 0.3, d, 0xcfc7b6);
  lobby(k, w, d, 3.6, 0.3, 0xf4efe4);
  const y0 = GF;
  k.box(0, y0, 0, w, floors * FLOOR_H, d, body);
  for (let f = 0; f <= floors; f++) k.box(0, y0 + f * FLOOR_H - 0.12, 0, w + 0.18, 0.24, d + 0.18, 0xf4efe4);
  k.box(0, y0, d / 2 + 0.05, 2.6, floors * FLOOR_H, 0.12, acc);
  const g = { y0, floors, ww: 1.3, wh: 1.4, sill: 0.95, glass: GLASS, frame: 0xf4efe4 };
  k.windowGrid('back', 0, 0, w, d, { ...g, cols: 4 });
  k.windowGrid('left', 0, 0, w, d, { ...g, cols: 3 });
  k.windowGrid('right', 0, 0, w, d, { ...g, cols: 3 });
  for (let f = 0; f < floors; f++) {
    const y = y0 + f * FLOOR_H;
    k.balcony('front', 0, 0, w, d, y, -7.0, -1.8, 1.1, 0xf4efe4, 0x7a7a78);
    k.balcony('front', 0, 0, w, d, y, 1.8, 7.0, 1.1, 0xf4efe4, 0x7a7a78);
    k.glass(-4.4, y + 0.3, d / 2 + 0.04, 2.6, 2.2, 0.05, GLASS);
    k.glass(4.4, y + 0.3, d / 2 + 0.04, 2.6, 2.2, 0.05, GLASS);
  }
  const top = y0 + floors * FLOOR_H;
  const r = roof(k, top, w, d, body);
  k.box(0, r + 0.2, d / 2 - 0.4, 9, 1.8, 0.3, acc);
  return k.finish(w + 1, d + 5, top + 4);
}

/** Compact bank branch: 3 floors, columned portico, vault block at the back (15 x 14 m). */
export function buildBankCompact(seed = 0): BuiltBuilding {
  const k = new Kit();
  const w = 15, d = 14, floors = 3, fh = 4.0, stone = pick(seed, [0xd9d4c8, 0xcfd2d4, 0xd8cdb8]);
  k.box(0, 0, 0, w + 1, 0.35, d + 1, 0x8d8b86);
  k.box(0, 0.35, 0, w, floors * fh, d, stone);
  k.box(0, 0.35 + floors * fh, 0, w + 0.6, 0.4, d + 0.6, 0xeceae4);
  k.glass(0, 0.9, d / 2 + 0.05, w - 6, 3.0, 0.08, GLASS_LIGHT);
  for (let i = 0; i < 4; i++) k.cyl(-w / 2 + 3.0 + i * ((w - 6) / 3), 0.35, d / 2 + 1.8, 0.4, 0.4, 5.4, 0xeceae4, 10);
  k.box(0, 5.75, d / 2 + 1.0, w - 3, 0.5, 3.6, 0xeceae4);
  const g = { y0: 5.2, floors: 2, floorH: fh, ww: 1.5, wh: 1.7, sill: 0.8, glass: GLASS, frame: 0xeceae4 };
  k.windowGrid('front', 0, 0, w, d, { ...g, cols: 4 });
  k.windowGrid('left', 0, 0, w, d, { ...g, cols: 3 });
  k.windowGrid('right', 0, 0, w, d, { ...g, cols: 3 });
  const top = 0.35 + floors * fh + 0.4;
  roof(k, top, w, d, stone);
  k.box(0, top + 0.25, d / 2 - 0.4, 6, 1.4, 0.3, pick(seed, [0x2f5f8a, 0x3b6b52, 0x8a3f3a]));
  return k.finish(w + 1, d + 4, top + 4);
}

// ---------------------------------------------------------------- residential

/** Slim 9-floor apartment block (14 x 12 m): pilotis, lift core, balconies on the front and back. */
export function buildAptSlim9(seed = 0): BuiltBuilding {
  const k = new Kit();
  const W = 14, D = 12, floors = 9, GF = 3.4;
  const body = pick(seed, [0xe3d7c2, 0xdfe3d3, 0xe6d1c4, 0xd9d4cc]);
  const accent = pick(seed, [0xb85c38, 0x4f7a8a, 0x8a6aa0]);
  k.box(0, 0, 0, W + 0.4, 0.2, D + 0.4, 0x8d8b86);
  for (const x of [-5.5, 0, 5.5]) for (const z of [-4.5, 4.5]) k.box(x, 0.2, z, 0.55, GF - 0.2, 0.55, 0xb9b6ae);
  k.box(0, 0.2, -3.6, 4.4, GF - 0.2, 3.4, accent);
  k.box(-4.5, 0.2, 3.2, 2.2, 2.4, 2.2, 0xcfc7b6);
  const y0 = GF;
  k.box(0, y0, 0, W, floors * FLOOR_H, D, body);
  for (let f = 0; f <= floors; f++) k.box(0, y0 + f * FLOOR_H - 0.12, 0, W + 0.18, 0.24, D + 0.18, 0xf4efe4);
  k.box(0, y0, D / 2 + 0.05, 2.8, floors * FLOOR_H, 0.12, accent);
  const g = { y0, floors, ww: 1.3, wh: 1.4, sill: 0.95, glass: GLASS, frame: 0xf4efe4 };
  k.windowGrid('front', 0, 0, W, D, { ...g, cols: 4, skip: (_f, c) => c === 1 || c === 2 });
  k.windowGrid('back', 0, 0, W, D, { ...g, cols: 4 });
  k.windowGrid('left', 0, 0, W, D, { ...g, cols: 3 });
  k.windowGrid('right', 0, 0, W, D, { ...g, cols: 3 });
  for (let f = 0; f < floors; f++) {
    const y = y0 + f * FLOOR_H;
    k.balcony('front', 0, 0, W, D, y, -6.4, -1.8, 1.2, 0xf4efe4, 0x7a7a78);
    k.balcony('front', 0, 0, W, D, y, 1.8, 6.4, 1.2, 0xf4efe4, 0x7a7a78);
    k.balcony('back', 0, 0, W, D, y, -1.8, 1.8, 0.9, 0xf4efe4, 0x7a7a78);
  }
  const top = y0 + floors * FLOOR_H;
  const r = roof(k, top, W, D, body, accent);
  k.waterTank(W * 0.3, r, -D * 0.2, 1.0);
  return k.finish(W + 0.4, D + 1.2, top + 3);
}

/** Slim 14-floor apartment tower (15 x 13 m): shops on the ground floor, glazed bands, set-back top two floors. */
export function buildAptSlim14(seed = 0): BuiltBuilding {
  const k = new Kit();
  const W = 15, D = 13, floors = 14, GF = 4.2;
  const body = pick(seed, [0xd8d4cc, 0xd4d9de, 0xdcd2c0, 0xe0dccf]);
  const accent = pick(seed, [0x2f5f8a, 0x8a3f3a, 0x3b6b52]);
  k.box(0, 0, 0, W + 0.6, 0.25, D + 0.6, 0x8d8b86);
  k.box(0, 0.25, 0, W, GF - 0.25, D, 0xcfc9bb);
  k.onSide('front', 0, 0, W, D, (len, half) => {
    for (let i = 0; i < 3; i++) {
      const t = -len / 2 + 2.5 + i * ((len - 5) / 2);
      k.glass(t, 0.6, half + 0.05, 3.4, 2.7, 0.08, GLASS_LIGHT);
      k.box(t, 3.2, half + 0.7, 4.0, 0.2, 1.5, pick(seed + i, SIGN));
    }
  });
  const y0 = GF;
  const low = floors - 2;
  k.box(0, y0, 0, W, low * FLOOR_H, D, body);
  for (let f = 0; f <= low; f++) k.box(0, y0 + f * FLOOR_H - 0.12, 0, W + 0.18, 0.24, D + 0.18, 0xf4efe4);
  k.box(0, y0, D / 2 + 0.05, 2.6, low * FLOOR_H, 0.12, accent);
  const g = { y0, floors: low, ww: 1.3, wh: 1.4, sill: 0.95, glass: GLASS, frame: 0xf4efe4 };
  k.windowGrid('front', 0, 0, W, D, { ...g, cols: 4 });
  k.windowGrid('back', 0, 0, W, D, { ...g, cols: 4 });
  k.windowGrid('left', 0, 0, W, D, { ...g, cols: 3 });
  k.windowGrid('right', 0, 0, W, D, { ...g, cols: 3 });
  for (let f = 0; f < low; f += 1) k.balcony('front', 0, 0, W, D, y0 + f * FLOOR_H, -6.8, -2.2, 1.1, 0xf4efe4, 0x7a7a78);
  // set-back top two floors
  const y1 = y0 + low * FLOOR_H;
  k.box(0, y1, 0, W - 3, 2 * FLOOR_H, D - 3, body);
  for (const s of SIDES) k.windowGrid(s, 0, 0, W - 3, D - 3, { y0: y1, floors: 2, cols: s === 'front' || s === 'back' ? 3 : 2, ww: 1.4, wh: 1.4, sill: 0.95, glass: GLASS, frame: 0xf4efe4 });
  const top = y1 + 2 * FLOOR_H;
  const r = roof(k, top, W - 3, D - 3, body, accent);
  k.waterTank(-2.5, r, 0, 1.0);
  return k.finish(W + 0.6, D + 1.2, top + 3);
}

/** Narrow 3-floor town house with a small gate wall and a hip roof (9 x 10 m). */
export function buildTownhouse3(seed = 0): BuiltBuilding {
  const k = new Kit();
  const W = 9, D = 10, floors = 3, GF = 3.3;
  const wall = pick(seed, [0xe3d7c2, 0xe6d1c4, 0xd9dde0, 0xdfd0b8]);
  const trim = pick(seed, [0x8a3f3a, 0x2f5f8a, 0x3b6b52]);
  k.box(0, 0, 0, W + 0.4, 0.25, D + 0.4, 0x8d8b86);
  k.box(0, 0.25, 0, W, floors * GF, D, wall);
  for (let f = 1; f <= floors; f++) k.box(0, 0.25 + f * GF - 0.12, 0, W + 0.18, 0.24, D + 0.18, 0xf4efe4);
  k.box(-1.8, 0.25, D / 2 + 0.05, 1.4, 2.3, 0.1, 0x6a4a2f); // door
  k.glass(1.6, 0.9, D / 2 + 0.05, 2.0, 1.5, 0.05, GLASS);
  const g = { y0: GF + 0.25, floors: floors - 1, floorH: GF, ww: 1.3, wh: 1.4, sill: 0.9, glass: GLASS, frame: 0xf4efe4 };
  k.windowGrid('front', 0, 0, W, D, { ...g, cols: 2 });
  k.windowGrid('back', 0, 0, W, D, { ...g, cols: 2 });
  k.windowGrid('left', 0, 0, W, D, { ...g, cols: 2 });
  k.windowGrid('right', 0, 0, W, D, { ...g, cols: 2 });
  k.balcony('front', 0, 0, W, D, GF + 0.25, -3.6, 3.6, 1.0, 0xf4efe4, trim);
  const top = 0.25 + floors * GF;
  k.hip(0, top, 0, W + 0.8, D + 0.8, 2.4, 0xa8452b);
  k.waterTank(2.2, top + 0.1, -2.0, 0.8);
  return k.finish(W + 0.4, D + 1.2, top + 2.6);
}

// ---------------------------------------------------------------- shop houses

function shopHouse(seed: number, floors: number, W: number, D: number): BuiltBuilding {
  const k = new Kit();
  const wall = pick(seed, [0xe3d7c2, 0xdfe3d3, 0xe6d1c4, 0xd9dde0]);
  const GF = 3.6;
  k.box(0, 0, 0, W + 0.4, 0.3, D + 0.4, 0x9b8f84);
  k.box(0, 0.3, 0, W, GF + (floors - 1) * FLOOR_H, D, wall);
  k.box(0, 0.3 + GF - 0.1, 0, W + 0.2, 0.24, D + 0.3, 0xf4efe4);
  k.box(0, 0.3, D / 2 + 0.04, W - 1.2, 2.7, 0.1, 0x6a6f73); // rolling shutter
  k.box(0, 3.1, D / 2 + 0.3, W - 0.6, 0.8, 0.12, pick(seed, SIGN)); // signboard
  const g = { y0: GF + 0.3, floors: floors - 1, floorH: FLOOR_H, ww: 1.4, wh: 1.4, sill: 0.95, glass: GLASS, frame: 0xf4efe4 };
  k.windowGrid('front', 0, 0, W, D, { ...g, cols: 2 });
  k.windowGrid('back', 0, 0, W, D, { ...g, cols: 2 });
  k.windowGrid('left', 0, 0, W, D, { ...g, cols: 2 });
  k.windowGrid('right', 0, 0, W, D, { ...g, cols: 2 });
  k.balcony('front', 0, 0, W, D, GF + 0.3, -W / 2 + 1.4, W / 2 - 1.4, 0.9, 0xf4efe4, 0x7a7a78);
  const top = 0.3 + GF + (floors - 1) * FLOOR_H;
  k.box(0, top, 0, W + 0.3, 0.2, D + 0.3, 0xa7a49c);
  k.parapet(0, top + 0.2, 0, W + 0.3, D + 0.3, 0.9, 0.2, wall);
  k.waterTank(W * 0.22, top + 0.2, -D * 0.2, 0.8);
  return k.finish(W + 0.4, D + 1.2, top + 2.5);
}
/** Narrow 3-floor shop house (12 x 10 m). */
export function buildShopHouse3(seed = 0): BuiltBuilding { return shopHouse(seed, 3, 12, 10); }
/** Narrow 4-floor shop house (10 x 9 m). */
export function buildShopHouse4(seed = 0): BuiltBuilding { return shopHouse(seed, 4, 10, 9); }
