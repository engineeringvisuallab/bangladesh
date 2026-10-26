import { FLOOR_H, Kit, pick, type BuiltBuilding } from './BuildingKit';

/** URBAN RESIDENTIAL: brick house (ইটের বাড়ি 2/3 তলা), row house, villa, flats (6 / 12 floors), tower (28 floors), hostel, labour quarters. */

const PLASTER = [0xe8dcc0, 0xe9d9a0, 0xcfe0c4, 0xe9c9c0, 0xd6dde6] as const;
const GLASS = 0x2f4f66;

/** ইটের/পাকা বাড়ি: RCC frame house with plastered walls, sunshades, roof tank, expansion rebars, boundary wall. */
export function buildBrickHouse(floors: 2 | 3, seed = 0): BuiltBuilding {
  const k = new Kit();
  const plaster = pick(seed, PLASTER);
  const trim = 0xf4efe4;
  const bw = 8.5, bd = 10.5, zc = -2.0;
  const H = floors * FLOOR_H;

  k.box(0, 0, zc, bw + 0.4, 0.45, bd + 0.4, 0x8d8b86);
  k.box(0, 0.45, zc, bw, H, bd, plaster);
  for (let f = 1; f <= floors; f++) k.box(0, 0.45 + f * FLOOR_H - 0.1, zc, bw + 0.14, 0.2, bd + 0.14, trim);

  const g = { y0: 0.45, floors, cols: 3, ww: 1.3, wh: 1.35, sill: 0.95, glass: GLASS, frame: trim };
  k.windowGrid('front', 0, zc, bw, bd, { ...g, skip: (f, c) => f === 0 && c === 1 });
  k.windowGrid('back', 0, zc, bw, bd, g);
  k.windowGrid('left', 0, zc, bw, bd, { ...g, cols: 3 });
  k.windowGrid('right', 0, zc, bw, bd, { ...g, cols: 3 });
  // sunshades (chhaja) above front windows
  for (let f = 0; f < floors; f++) {
    for (const x of [-bw / 3, 0, bw / 3]) {
      if (f === 0 && x === 0) continue;
      k.box(x, 0.45 + f * FLOOR_H + 0.95 + 1.35 + 0.12, zc + bd / 2 + 0.25, 1.8, 0.08, 0.5, trim);
    }
  }
  // entrance door + canopy + steps
  k.box(0, 0.45, zc + bd / 2 + 0.03, 1.2, 2.3, 0.08, 0x5a3a24);
  k.box(0, 2.9, zc + bd / 2 + 0.6, 2.8, 0.14, 1.4, trim);
  for (let i = 0; i < 2; i++) k.box(0, i * 0.22, zc + bd / 2 + 0.55 + (1 - i) * 0.35, 2.0, 0.22, 0.4, 0x9b968c);
  // balcony on the top floors (3-storey)
  if (floors === 3) {
    k.balcony('front', 0, zc, bw, bd, 0.45 + 2 * FLOOR_H, -bw / 2 + 0.6, bw / 2 - 0.6, 1.1, trim, 0xd7cfbf);
  }
  // split AC units on the right wall
  for (let f = 1; f < floors; f++) k.box(bw / 2 + 0.22, 0.45 + f * FLOOR_H + 2.0, zc + 2, 0.4, 0.3, 0.9, 0xeeeeee);

  // flat roof: parapet, stair headroom, tank, rebars for a future floor
  const top = 0.45 + H;
  k.box(0, top, zc, bw + 0.3, 0.18, bd + 0.3, 0xa7a49c);
  k.parapet(0, top + 0.18, zc, bw + 0.3, bd + 0.3, 0.9, 0.18, plaster);
  k.box(-bw / 2 + 1.6, top + 0.18, zc - bd / 2 + 1.6, 2.4, 2.5, 2.4, plaster);
  k.box(-bw / 2 + 1.6, top + 2.68, zc - bd / 2 + 1.6, 2.7, 0.15, 2.7, 0xa7a49c);
  k.waterTank(bw / 2 - 1.5, top + 0.18, zc - bd / 2 + 1.6, 0.85, pick(seed, [0x1d2530, 0x1f4a3a]));
  if (floors === 2) {
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      for (const o of [-0.1, 0.1]) k.cyl(sx * (bw / 2 - 0.35) + o, top + 0.18, zc + sz * (bd / 2 - 0.35), 0.02, 0.02, 1.4, 0x5a4338, 4);
    }
  }
  // boundary wall with gate, front yard
  k.boundaryWall(0, zc - 0.5, bw + 4.4, bd + 5.4, 0xcfc7b6, 0xa7a49c);
  k.box(-bw / 2 - 1.6, 0, zc + bd / 2 + 1.8, 1.4, 0.04, 1.4, 0x6b9a4a);
  k.tree(bw / 2 + 1.5, zc + bd / 2 + 1.6, 4.2);
  return k.finish(bw + 4.4, bd + 5.4, top + 3);
}

/** সারি বাড়ি / টাউনহাউস: 5 narrow 3-storey units side by side, each with its own colour. */
export function buildRowHouse(seed = 0): BuiltBuilding {
  const k = new Kit();
  const n = 5, uw = 4.2, d = 9.5, floors = 3, H = floors * FLOOR_H;
  const cols = [0xe9c9a8, 0xcfe0c4, 0xe6d8a0, 0xd6c1d8, 0xc3d6e6, 0xe9b8a8];
  const W = n * uw;
  k.box(0, 0, 0, W + 0.3, 0.4, d + 0.3, 0x8d8b86);
  for (let i = 0; i < n; i++) {
    const cx = -W / 2 + uw * (i + 0.5);
    const c = pick(seed + i * 2 + 1, cols);
    k.box(cx, 0.4, 0, uw - 0.04, H, d, c);
    k.box(cx, 0.4 + H, 0, uw + 0.02, 0.2, d + 0.2, 0xeeeae0);
    k.parapet(cx, 0.4 + H + 0.2, 0, uw, d, 0.7, 0.14, c);
    // door + big window ground floor
    k.box(cx - 0.8, 0.4, d / 2 + 0.03, 1.0, 2.2, 0.08, 0x5a3a24);
    k.glass(cx + 0.9, 0.4 + 0.9, d / 2 + 0.04, 1.3, 1.3, 0.05, GLASS);
    // upper floors: balcony alternate + window
    for (let f = 1; f < floors; f++) {
      const y = 0.4 + f * FLOOR_H;
      if ((i + f) % 2 === 0) {
        k.balcony('front', 0, 0, uw, d, y, cx - 1.6, cx + 1.6, 1.0, 0xeeeae0, 0x6a6a68);
        k.glass(cx, y + 0.35, d / 2 + 0.04, 2.0, 2.1, 0.05, GLASS);
      } else {
        k.glass(cx - 0.6, y + 0.95, d / 2 + 0.04, 1.2, 1.3, 0.05, GLASS);
        k.glass(cx + 0.9, y + 0.95, d / 2 + 0.04, 0.8, 1.3, 0.05, GLASS);
      }
    }
    // back windows
    for (let f = 0; f < floors; f++) k.glass(cx, 0.4 + f * FLOOR_H + 0.95, -d / 2 - 0.04, 1.4, 1.3, 0.05, GLASS);
    k.waterTank(cx + 0.6, 0.4 + H + 0.2, -d / 2 + 1.8, 0.65, 0x1d2530);
  }
  // party-wall pilasters
  for (let i = 0; i <= n; i++) k.box(-W / 2 + uw * i, 0.4, d / 2 + 0.06, 0.25, H, 0.12, 0xbfb8aa);
  return k.finish(W + 0.3, d + 0.3, H + 2.4);
}

/** ভিলা / ডুপ্লেক্স: modern two-storey villa, glass front, terracotta roof, carport, pool, garden. */
export function buildVilla(seed = 0): BuiltBuilding {
  const k = new Kit();
  const wall = 0xf1eee6, wood = pick(seed, [0xc8a77d, 0xb98a5c]), tile = 0xa8452b, slab = 0x3d3d3f;
  // ground floor
  k.box(0, 0, 0, 12.6, 0.4, 9.6, 0x9a968c);
  k.box(0, 0.4, 0, 12, 3.2, 9, wall);
  k.glass(-1.0, 0.7, 4.54, 7.2, 2.5, 0.06, 0x3c6a86);
  for (const x of [-4.6, -1.0, 2.6]) k.box(x, 0.4, 4.52, 0.12, 3.0, 0.1, 0x30343a);
  k.box(4.6, 0.4, 4.52, 1.1, 2.3, 0.08, 0x5a3a24);
  k.glass(5.5, 1.3, -4.54, 3.0, 1.6, 0.05, GLASS);
  k.glass(-3.5, 1.3, -4.54, 3.0, 1.6, 0.05, GLASS);
  // slab over ground floor
  k.box(0, 3.6, 0.3, 12.8, 0.25, 9.8, slab);
  // upper block (offset right, cantilevers forward)
  k.box(1.8, 3.85, 1.2, 8.6, 3.0, 8.4, wood);
  k.glass(1.8, 4.5, 5.42, 5.6, 1.9, 0.06, 0x3c6a86);
  k.box(1.8, 4.5, 5.40, 0.1, 1.9, 0.1, 0x30343a);
  k.glass(6.12, 4.7, 1.2, 0.06, 1.5, 3.0, GLASS);
  k.glass(-2.52, 4.7, 1.2, 0.06, 1.5, 3.0, GLASS);
  // pitched roof on upper block (ridge along X)
  k.local(1.8, 6.85, 1.2, Math.PI / 2, () => k.gable(0, 0, 0, 9.4, 9.2, 2.1, tile));
  k.box(1.8, 6.85, 1.2, 9.6, 0.15, 9.4, slab);
  // terrace with glass rail on the left part of the slab
  k.box(-4.0, 3.85, 0.0, 3.8, 0.05, 7.6, 0xb7b1a4);
  k.glass(-4.0, 3.9, 3.85, 3.8, 1.05, 0.05, 0x6a9bb5);
  k.glass(-5.88, 3.9, 0.0, 0.05, 1.05, 7.6, 0x6a9bb5);
  // carport on the left
  for (const [x, z] of [[-9.6, 4.0], [-9.6, -2.0], [-6.8, 4.0], [-6.8, -2.0]] as const) k.box(x, 0, z, 0.25, 2.8, 0.25, 0x30343a);
  k.box(-8.2, 2.8, 1.0, 3.8, 0.2, 6.8, slab);
  // car (placeholder body so scale is readable)
  k.box(-8.2, 0.25, 1.0, 1.8, 0.7, 4.0, 0x9aa1a8);
  k.box(-8.2, 0.95, 1.2, 1.6, 0.6, 2.2, 0x2f4f66);
  // pool
  k.box(1.5, 0, 10.5, 7.2, 0.14, 4.0, 0xe8e6de);
  k.box(1.5, 0.12, 10.5, 6.6, 0.06, 3.4, 0x38a8cc);
  // lawn + paths
  k.box(-7, 0, 10.5, 5, 0.05, 6, 0x6b9a4a);
  k.box(4.6, 0, 7.4, 1.4, 0.04, 2.6, 0xb7b1a4);
  // trees + shrubs
  k.tree(-9.5, 11.5, 5.2);
  k.tree(8.8, 11.8, 4.4);
  for (const x of [-4.8, -3.6, 5.2, 6.4]) k.sphere(x, 0.45, 5.4, 0.55, 0x3f7a3a, 0.8);
  // boundary wall
  k.boundaryWall(0, 4.2, 24, 28, 0xe6e1d4, 0x6a6a68, 4.6, 1.9);
  return k.finish(24, 28, 9.0);
}

/** ফ্ল্যাট বিল্ডিং (6 তলা): pilotis car-park ground floor, balconies, stair/lift core, roof tanks. */
export function buildApartmentMid(seed = 0): BuiltBuilding {
  const k = new Kit();
  const W = 18, D = 13, floors = 6, GF = 3.4;
  const body = pick(seed, [0xe3d7c2, 0xdfe3d3, 0xe6d1c4]);
  const accent = pick(seed, [0xb85c38, 0x4f7a8a, 0x8a6aa0]);
  // plinth + pilotis
  k.box(0, 0, 0, W + 0.4, 0.2, D + 0.4, 0x8d8b86);
  for (const x of [-7.5, -2.5, 2.5, 7.5]) for (const z of [-5.5, 0, 5.5]) k.box(x, 0.2, z, 0.55, GF - 0.2, 0.55, 0xb9b6ae);
  // lobby / lift core at the back
  k.box(0, 0.2, -4.6, 5.2, GF - 0.2, 3.6, accent);
  k.box(0, 0.2, -2.78, 3.0, 2.6, 0.1, 0x2b3037);
  // guard cabin
  k.box(-7.5, 0.2, 3.0, 2.4, 2.4, 2.4, 0xcfc7b6);
  k.glass(-7.5, 1.0, 4.22, 1.8, 1.0, 0.04, GLASS);
  // parked cars
  for (const [x, c] of [[-2.5, 0xb02a2a], [2.5, 0xd9d9d6], [7.5, 0x2f3b4a]] as const) {
    k.box(x, 0.3, 3.4, 1.8, 0.7, 4.0, c);
    k.box(x, 1.0, 3.5, 1.6, 0.55, 2.0, 0x2f4f66);
  }
  // typical floors
  const y0 = GF;
  k.box(0, y0, 0, W, floors * FLOOR_H, D, body);
  for (let f = 0; f <= floors; f++) k.box(0, y0 + f * FLOOR_H - 0.12, 0, W + 0.18, 0.24, D + 0.18, 0xf4efe4);
  // coloured core stripe on the front
  k.box(0, y0, D / 2 + 0.05, 3.4, floors * FLOOR_H, 0.12, accent);
  const g = { y0, floors, ww: 1.4, wh: 1.4, sill: 0.95, glass: GLASS, frame: 0xf4efe4 };
  k.windowGrid('front', 0, 0, W, D, { ...g, cols: 6, skip: (_f, c) => c === 2 || c === 3 });
  k.windowGrid('back', 0, 0, W, D, { ...g, cols: 6 });
  k.windowGrid('left', 0, 0, W, D, { ...g, cols: 4 });
  k.windowGrid('right', 0, 0, W, D, { ...g, cols: 4 });
  // balconies (front: two per floor, back: kitchen balconies)
  for (let f = 0; f < floors; f++) {
    const y = y0 + f * FLOOR_H;
    k.balcony('front', 0, 0, W, D, y, -8.6, -1.9, 1.3, 0xf4efe4, 0x7a7a78);
    k.balcony('front', 0, 0, W, D, y, 1.9, 8.6, 1.3, 0xf4efe4, 0x7a7a78);
    k.glass(-5.25, y + 0.3, D / 2 + 0.04, 2.8, 2.2, 0.05, GLASS);
    k.glass(5.25, y + 0.3, D / 2 + 0.04, 2.8, 2.2, 0.05, GLASS);
    k.balcony('back', 0, 0, W, D, y, -2.0, 2.0, 0.9, 0xf4efe4, 0x7a7a78);
  }
  // roof
  const top = y0 + floors * FLOOR_H;
  k.box(0, top, 0, W + 0.3, 0.2, D + 0.3, 0xa7a49c);
  k.parapet(0, top + 0.2, 0, W + 0.3, D + 0.3, 1.0, 0.2, body);
  k.box(0, top + 0.2, -2.0, 5.6, 2.6, 4.2, accent);
  k.box(0, top + 2.8, -2.0, 6.0, 0.18, 4.6, 0xa7a49c);
  k.waterTank(-6.5, top + 0.2, 2.5, 1.1);
  k.waterTank(-6.5, top + 0.2, -3.5, 1.1);
  k.waterTank(6.5, top + 0.2, 2.5, 1.1);
  k.cyl(7.0, top + 0.2, -4.5, 0.05, 0.05, 6.0, 0x555a60, 5); // antenna
  return k.finish(W + 0.4, D + 0.4, top + 3);
}

/** বহুতল ফ্ল্যাট (12 তলা): ground-floor shops, tall slab with glazed bands, balconies, set-back top, roof gym. */
export function buildApartmentHigh(seed = 0): BuiltBuilding {
  const k = new Kit();
  const W = 26, D = 17, floors = 12, GF = 4.4;
  const body = pick(seed, [0xd8d4cc, 0xd4d9de, 0xdcd2c0]);
  const accent = pick(seed, [0x2f5f8a, 0x8a3f3a, 0x3b6b52]);
  k.box(0, 0, 0, W + 0.6, 0.25, D + 0.6, 0x8d8b86);
  // podium: shops with glass fronts + awning
  k.box(0, 0.25, 0, W, GF - 0.25, D, 0xcfc9bb);
  k.onSide('front', 0, 0, W, D, (len, half) => {
    for (let i = 0; i < 5; i++) {
      const t = -len / 2 + 2.3 + i * ((len - 4.6) / 4);
      if (i === 2) {
        k.box(t, 0.25, half + 0.05, 3.4, 3.2, 0.1, 0x2b3037);
        continue;
      }
      k.glass(t, 0.65, half + 0.05, 3.9, 2.6, 0.06, 0x3c6a86);
      k.box(t, 3.15, half + 0.55, 4.6, 0.14, 1.1, [0xc0392b, 0x2f6f9f, 0xd49a2a, 0x3b8a55][i % 4]!);
    }
  });
  // typical floors
  const y0 = GF;
  const fl = floors - 2;
  k.box(0, y0, 0, W - 1.0, fl * FLOOR_H, D - 0.6, body);
  for (let f = 0; f <= fl; f++) k.box(0, y0 + f * FLOOR_H - 0.12, 0, W - 0.8, 0.24, D - 0.4, 0xf1ede4);
  // vertical colour fins at both ends + core (back)
  for (const sx of [-1, 1]) k.box(sx * (W / 2 - 1.9), y0, (D - 0.6) / 2 + 0.1, 1.4, fl * FLOOR_H, 0.25, accent);
  k.box(0, y0, -D / 2 - 0.6, 6.0, fl * FLOOR_H + 3, 2.4, accent);
  const g = { y0, floors: fl, ww: 1.6, wh: 1.45, sill: 0.9, glass: GLASS, frame: 0xf1ede4 };
  k.windowGrid('front', 0, 0, W - 1.0, D - 0.6, { ...g, cols: 8 });
  k.windowGrid('back', 0, 0, W - 1.0, D - 0.6, { ...g, cols: 8 });
  k.windowGrid('left', 0, 0, W - 1.0, D - 0.6, { ...g, cols: 5 });
  k.windowGrid('right', 0, 0, W - 1.0, D - 0.6, { ...g, cols: 5 });
  // balconies every floor on the front, glass rails, alternating segments
  for (let f = 0; f < fl; f++) {
    const y = y0 + f * FLOOR_H;
    const a = f % 2 === 0;
    k.balcony('front', 0, 0, W - 1.0, D - 0.6, y, a ? -9.5 : -5.5, a ? -1.5 : 3.5, 1.4, 0xf1ede4, 0x6a9bb5, true);
    k.balcony('front', 0, 0, W - 1.0, D - 0.6, y, a ? 3.5 : 1.5, a ? 9.5 : 9.5, 1.4, 0xf1ede4, 0x6a9bb5, true);
  }
  // set-back top 2 floors with terrace
  const t0 = y0 + fl * FLOOR_H;
  k.box(0, t0, 0, W - 7, 2 * FLOOR_H, D - 4, body);
  k.box(0, t0 - 0.12, 0, W - 0.8, 0.3, D - 0.4, 0xf1ede4);
  k.glass(0, t0 + 0.6, (D - 4) / 2 + 0.04, W - 10, 2.2, 0.05, 0x3c6a86);
  k.glass(0, t0 + FLOOR_H + 0.6, (D - 4) / 2 + 0.04, W - 10, 2.2, 0.05, 0x3c6a86);
  k.parapet(0, t0 + 2 * FLOOR_H + 0.2, 0, W - 6.6, D - 3.6, 1.0, 0.2, body);
  const top = t0 + 2 * FLOOR_H;
  k.box(0, top, 0, W - 6.8, 0.2, D - 3.8, 0xa7a49c);
  k.box(3, top + 0.2, -1.5, 6, 2.4, 5, accent);
  k.waterTank(-5, top + 0.2, 1.0, 1.2);
  k.waterTank(-8.5, top + 0.2, 1.0, 1.2);
  k.cyl(-1, top + 0.2, 3.0, 0.07, 0.07, 8, 0x555a60, 5);
  // terrace railing on the set-back floor
  k.glass(0, t0 + 0.15, D / 2 - 0.4, W - 4, 1.0, 0.05, 0x6a9bb5);
  return k.finish(W + 0.6, D + 3.2, top + 8);
}

/** আবাসিক টাওয়ার (28 তলা): glazed podium with roof garden, setback glass tower, mechanical crown + spire. */
export function buildResidentialTower(seed = 0): BuiltBuilding {
  const k = new Kit();
  const acc = pick(seed, [0x2f5f8a, 0x4a4a52, 0x7a5a3a]);
  const PW = 44, PD = 38, PH = 12;
  // podium (3 storeys, ribbon glazing)
  k.box(0, 0, 0, PW + 0.6, 0.3, PD + 0.6, 0x8d8b86);
  k.box(0, 0.3, 0, PW, PH - 0.3, PD, 0xb8b4aa);
  for (const s of ['front', 'back', 'left', 'right'] as const) {
    k.onSide(s, 0, 0, PW, PD, (len, half) => {
      for (let f = 0; f < 3; f++) k.glass(0, 0.9 + f * 3.9, half + 0.05, len - 3, 2.8, 0.06, 0x3c6a86);
      for (let i = 0; i <= 8; i++) k.box(-len / 2 + 1.5 + ((len - 3) * i) / 8, 0.3, half + 0.08, 0.3, PH - 0.3, 0.16, 0xdad6cc);
      k.box(0, PH - 0.4, half + 0.4, len + 0.6, 0.4, 0.9, 0xe9e6de);
    });
  }
  // grand entrance canopy
  k.box(0, 4.4, PD / 2 + 3.0, 12, 0.3, 6, 0x30343a);
  for (const x of [-5.4, 5.4]) k.cyl(x, 0, PD / 2 + 5.4, 0.3, 0.3, 4.4, 0xe9e6de, 10);
  // podium roof garden
  k.box(0, PH, 0, PW - 1, 0.2, PD - 1, 0x6b9a4a);
  for (const [x, z] of [[-17, 12], [17, 12], [-17, -12], [17, -12], [-12, 14], [12, 14], [0, 14], [-20, 0], [20, 0]] as const) k.tree(x, z, 4.0);
  k.box(-13, PH + 0.2, 8, 8, 0.08, 4, 0x38a8cc); // sky pool
  // main tower (20 floors) + upper tower (8 floors, setback)
  const tf = 20, uf = 8, TW = 26, FH = 3.2;
  const y1 = PH + 0.2;
  k.box(0, y1, 0, TW, tf * FH, TW, 0xcdd2d6);
  for (const s of ['front', 'back', 'left', 'right'] as const) {
    k.onSide(s, 0, 0, TW, TW, (len, half) => {
      for (let f = 0; f < tf; f++) {
        k.glass(0, y1 + f * FH + 0.7, half + 0.04, len - 5, 2.1, 0.05, GLASS);
        k.box(0, y1 + f * FH - 0.1, half + 0.1, len, 0.22, 0.3, 0xeceae4);
      }
      for (const t of [-len / 2 + 0.7, len / 2 - 0.7]) k.box(t, y1, half + 0.5, 1.4, tf * FH, 1.2, acc);
    });
  }
  const y2 = y1 + tf * FH;
  const UW = 20;
  k.box(0, y2, 0, UW, uf * FH, UW, 0xd8dcdf);
  for (const s of ['front', 'back', 'left', 'right'] as const) {
    k.onSide(s, 0, 0, UW, UW, (len, half) => {
      for (let f = 0; f < uf; f++) {
        k.glass(0, y2 + f * FH + 0.7, half + 0.04, len - 4, 2.1, 0.05, 0x2c5470);
        k.box(0, y2 + f * FH - 0.1, half + 0.1, len, 0.22, 0.3, 0xeceae4);
      }
      for (const t of [-len / 2 + 0.6, len / 2 - 0.6]) k.box(t, y2, half + 0.4, 1.2, uf * FH, 1.0, acc);
    });
  }
  // setback terrace railing on the main tower roof
  k.glass(0, y2 + 0.1, TW / 2 - 0.2, TW, 1.1, 0.05, 0x6a9bb5);
  k.glass(0, y2 + 0.1, -TW / 2 + 0.2, TW, 1.1, 0.05, 0x6a9bb5);
  // crown
  const top = y2 + uf * FH;
  k.box(0, top, 0, UW + 0.4, 0.3, UW + 0.4, 0xeceae4);
  k.box(0, top + 0.3, 0, 12, 5.5, 12, acc);
  for (const sx of [-1, 1]) k.box(sx * 5.6, top + 5.8, 0, 0.6, 3.5, 12, 0xcdd2d6);
  k.cyl(0, top + 5.8, 0, 0.35, 0.08, 20, 0xb7bcc2, 8);
  k.sphere(0, top + 25.9, 0, 0.35, 0xd33a2c);
  return k.finish(PW + 0.6, PD + 6.6, top + 26);
}

/** হোস্টেল / মেস: L-shaped 4-storey hostel with an open corridor balcony, stair block, roof tanks. */
export function buildDormitory(seed = 0): BuiltBuilding {
  const k = new Kit();
  const wall = pick(seed, [0xe8d7a1, 0xd6e0c8, 0xe6d0c4]);
  const trim = pick(seed, [0x2f5f8a, 0x4f7a5a, 0x8a4a3a]);
  const floors = 4, H = floors * FLOOR_H;
  const wings: [number, number, number, number][] = [
    [0, 0, 32, 11], // main wing (x,z,w,d)
    [-10.5, -15.5, 11, 20], // rear wing
  ];
  k.box(0, 0, -5.0, 33, 0.35, 32, 0x8d8b86);
  for (const [x, z, w, d] of wings) {
    k.box(x, 0.35, z, w, H, d, wall);
    for (let f = 0; f <= floors; f++) k.box(x, 0.35 + f * FLOOR_H - 0.1, z, w + 0.14, 0.2, d + 0.14, trim);
    k.box(x, 0.35 + H, z, w + 0.3, 0.2, d + 0.3, 0xa7a49c);
    k.parapet(x, 0.35 + H + 0.2, z, w + 0.3, d + 0.3, 0.9, 0.18, wall);
  }
  const g = { y0: 0.35, floors, ww: 1.2, wh: 1.35, sill: 0.95, glass: GLASS, frame: 0xf4efe4 };
  // main wing: windows at the back, corridor with doors at the front
  k.windowGrid('back', 0, 0, 32, 11, { ...g, cols: 10 });
  k.windowGrid('right', 0, 0, 32, 11, { ...g, cols: 3 });
  k.windowGrid('front', 0, 0, 32, 11, { ...g, cols: 10, ww: 1.0, wh: 1.2, sill: 1.0 });
  // rear wing
  k.windowGrid('left', -10.5, -15.5, 11, 20, { ...g, cols: 6 });
  k.windowGrid('right', -10.5, -15.5, 11, 20, { ...g, cols: 6, skip: () => false });
  k.windowGrid('back', -10.5, -15.5, 11, 20, { ...g, cols: 3 });
  // corridor balcony along the front: slab + brick rail + posts, every floor
  for (let f = 0; f < floors; f++) {
    const y = 0.35 + f * FLOOR_H;
    k.box(0, y, 5.5 + 0.9, 32, 0.18, 1.8, 0xf4efe4);
    k.box(0, y + 0.18, 5.5 + 1.75, 32, 1.0, 0.14, trim);
    for (let i = 0; i <= 8; i++) k.box(-16 + i * 4, y, 5.5 + 1.75, 0.3, FLOOR_H, 0.3, 0xf4efe4);
  }
  // stair block at the corner
  k.box(14.8, 0.35, 5.5 + 0.9, 4.4, H + 3.0, 3.6, wall);
  k.box(14.8, 0.35 + H + 3.0, 5.5 + 0.9, 4.7, 0.2, 3.9, trim);
  for (let f = 1; f <= floors; f++) k.box(14.8, 0.35 + f * FLOOR_H - 0.1, 5.5 + 0.9, 4.5, 0.2, 3.7, trim);
  k.glass(14.8, 0.35 + FLOOR_H, 5.5 + 2.72, 1.4, 0.9 + 0, 0.05, GLASS);
  // gate + sign
  k.box(0, 0, 8.7, 10.0, 0.2, 2.2, 0x6a6a68);
  k.box(-4.8, 0, 8.7, 0.5, 3.0, 0.5, trim);
  k.box(4.8, 0, 8.7, 0.5, 3.0, 0.5, trim);
  k.box(0, 2.9, 8.7, 10.0, 0.9, 0.35, trim);
  // roof tanks
  for (const x of [-8, -2, 4, 10]) k.waterTank(x, 0.35 + H + 0.2, -1, 1.0);
  return k.finish(33, 33, 0.35 + H + 3.2);
}

/** শ্রমিক কোয়ার্টার: 2-storey long barrack, gallery on the front, outside stair, low tin shed roof, toilet block. */
export function buildLaborQuarters(seed = 0): BuiltBuilding {
  const k = new Kit();
  const W = 30, D = 6.5, floors = 2;
  const wall = pick(seed, [0xb5b0a4, 0xc9b9a0, 0xa9a49a]);
  const H = floors * FLOOR_H;
  k.box(0, 0, 0, W + 0.4, 0.3, D + 0.4, 0x8d8b86);
  k.box(0, 0.3, 0, W, H, D, wall);
  k.box(0, 0.3 + FLOOR_H - 0.1, 0, W + 0.1, 0.2, D + 0.1, 0xe8e2d4);
  // doors + small windows on the gallery side (front)
  for (let f = 0; f < floors; f++) {
    const y = 0.3 + f * FLOOR_H;
    for (let i = 0; i < 10; i++) {
      const x = -W / 2 + 1.5 + i * 3.0;
      k.box(x - 0.55, y, D / 2 + 0.03, 0.9, 2.0, 0.08, [0x3b6b52, 0x2f5f8a, 0x8a3f3a][i % 3]!);
      k.glass(x + 0.65, y + 1.0, D / 2 + 0.04, 0.8, 0.8, 0.05, GLASS);
      k.glass(x, y + 1.1, -D / 2 - 0.04, 0.9, 0.8, 0.05, GLASS);
    }
    // gallery slab + rail + posts
    k.box(0, y, D / 2 + 0.8, W, 0.16, 1.6, 0xe8e2d4);
    k.box(0, y + 0.16, D / 2 + 1.55, W, 0.95, 0.1, 0x6a6a68);
    for (let i = 0; i <= 10; i++) k.box(-W / 2 + i * 3.0, y, D / 2 + 1.55, 0.22, FLOOR_H, 0.22, 0xe8e2d4);
  }
  // outside stair at the right end (steps + landing)
  for (let i = 0; i < 15; i++) k.box(W / 2 + 1.75 + (14 - i) * 0.3, 0.3, D / 2 + 1.0, 0.3, (i + 1) * 0.19, 1.0, 0x9b968c);
  k.box(W / 2 + 0.8, 0.3 + FLOOR_H - 0.16, D / 2 + 0.8, 1.6, 0.16, 1.6, 0xe8e2d4);
  // low-pitch tin shed roof with overhang
  k.local(0, 0.3 + H, 0, Math.PI / 2, () => k.shed(0, 0, 0, D + 3.4, W + 1.2, 0.35, 1.1, 0x7d8a8f));
  // roof ribs
  for (let i = 0; i < 60; i++) k.box(-W / 2 - 0.5 + i * ((W + 1) / 59), 0.3 + H + 0.62, 0, 0.07, 0.05, D + 3.4, 0xaab4b8);
  // water tank on a stand + toilet block at the end
  k.box(-W / 2 - 3.0, 0, 0, 3.4, 2.6, 3.4, 0xbfb8aa);
  k.box(-W / 2 - 3.0, 2.6, 0, 3.6, 0.15, 3.6, 0x7d8a8f);
  k.waterTank(-W / 2 - 3.0, 2.75, 0, 0.85);
  k.box(-W / 2 - 3.0, 0, D / 2 + 0.04, 0.9, 2.0, 0.06, 0x2f5f8a);
  return k.finish(W + 10, D + 4, 0.3 + H + 1.2);
}
