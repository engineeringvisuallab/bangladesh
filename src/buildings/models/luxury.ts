import * as THREE from 'three';
import { Kit, pick, type BuiltBuilding } from './BuildingKit';
import { palm } from './village';

/**
 * ISLAND LUXURY: সমুদ্রের ওপর ভিলা (overwater villas), ক্লিফ-টপ ইনফিনিটি-পুল ম্যানশন, মেরিনা ইয়ট ক্লাব,
 * বিচ রিসোর্ট (curved hotel), ট্রপিক্যাল বিচ ভিলা, বাতিঘর. Meant for the coast / islands.
 */

const SAND = 0xe3d3a8;
const SAND_DARK = 0xd2bf8c;
const SEA_DEEP = 0x3f9ab8;
const SEA_SHALLOW = 0x4cb0d0;
const POOL = 0x38a8cc;
const THATCH = 0xc9a24a;
const WOOD = 0x8a6a45;
const WOOD_DARK = 0x5a3f2a;
const WHITE = 0xf4efe4;
const GLASS = 0x2f4f66;
const GLASS_LIGHT = 0x4c7f9f;
const ROCK = 0x7b766d;

const SAND_OVER = { [SAND]: 'earth', [SAND_DARK]: 'earth', [ROCK]: 'earth' } as const;

function lounger(k: Kit, x: number, z: number, ry: number): void {
  k.local(x, 0, z, ry, () => {
    k.box(0, 0.15, 0, 0.7, 0.18, 1.9, WHITE);
    k.box(0, 0.33, 0.6, 0.7, 0.1, 0.8, 0x2f6f9f);
    k.box(0, 0.33, -0.3, 0.7, 0.1, 1.0, 0x2f6f9f);
    k.local(0, 0.45, -0.9, 0, () => k.withMatrix(new THREE.Matrix4().makeRotationX(-0.9), () => k.box(0, 0, 0, 0.7, 0.1, 0.8, 0x2f6f9f)));
  });
}

function parasol(k: Kit, x: number, z: number, color: number): void {
  k.cyl(x, 0, z, 0.05, 0.05, 2.5, 0x6b4a2f, 5);
  k.hip(x, 2.3, z, 3.0, 3.0, 0.7, color);
}

function yacht(k: Kit, x: number, z: number, ry: number, len: number, hull: number): void {
  k.local(x, 0, z, ry, () => {
    const w = len * 0.3;
    k.box(0, 0.05, 0, w, 1.3, len, hull);
    k.box(0, 1.35, 0, w + 0.1, 0.12, len + 0.1, 0xd49a2a);
    k.box(0, 1.3, -len * 0.05, w - 0.6, 1.6, len * 0.5, WHITE);
    k.glass(0, 1.7, len * 0.2 - len * 0.05 + 0.04, w - 0.8, 0.8, len * 0.3, 0x24323b);
    k.box(0, 2.9, -len * 0.08, w - 1.2, 0.8, len * 0.3, WHITE);
    k.glass(0, 3.0, len * 0.07, w - 1.4, 0.5, 0.05, 0x24323b);
    k.cyl(0, 3.7, -len * 0.08, 0.05, 0.05, 1.4, 0xb7bcc2, 5);
    k.box(0, 3.9, -len * 0.08, 0.9, 0.08, 0.3, 0xb7bcc2);
    // bow taper: two wedges
    k.box(0, 0.05, len / 2 + 0.6, w * 0.7, 1.3, 1.2, hull);
    k.box(0, 0.05, len / 2 + 1.5, w * 0.35, 1.3, 0.8, hull);
    k.box(0, 0.05, -len / 2 - 0.3, w, 0.8, 0.5, 0xcfc7b6); // swim platform
  });
}

function sailboat(k: Kit, x: number, z: number, ry: number): void {
  k.local(x, 0, z, ry, () => {
    k.box(0, 0.05, 0, 2.6, 0.9, 8.0, WHITE);
    k.box(0, 0.05, 4.4, 1.5, 0.9, 1.2, WHITE);
    k.box(0, 0.95, -0.5, 1.9, 0.5, 3.2, 0xcfc7b6);
    k.cyl(0, 0.95, 0.8, 0.07, 0.05, 11, 0xb7bcc2, 6);
    k.local(0, 1.6, 0.8, 0, () => k.gable(0, 0, -0.5, 3.6, 0.05, 9, 0xf4efe4));
    k.local(0, 1.6, 0.8, 0, () => k.box(0, 0, 1.3, 0.05, 6.5, 0.04, 0xf4efe4));
  });
}

/** Overwater thatch villa, local frame: terrace/plunge pool toward +Z. */
function waterVilla(k: Kit, hip: number): void {
  for (const ix of [-4.4, 0, 4.4]) for (const iz of [-4, 0, 4]) k.cyl(ix, 0, iz, 0.2, 0.16, 1.5, 0x6b4a2f, 7);
  k.box(0, 1.4, 0, 10.8, 0.24, 9.8, WOOD);
  for (let i = 0; i < 6; i++) k.box(0, 1.64, -4.2 + i * 1.7, 10.8, 0.01, 0.06, WOOD_DARK);
  // cabin
  k.box(0, 1.64, -1.4, 7.0, 3.0, 5.6, 0xe9e6de);
  k.box(0, 1.64, -1.4, 7.1, 0.9, 5.7, WOOD);
  k.glass(0, 2.2, -1.4 + 2.84, 5.4, 2.2, 0.06, GLASS_LIGHT);
  for (const x of [-2.7, 0, 2.7]) k.box(x, 1.64, -1.4 + 2.86, 0.12, 2.9, 0.1, WOOD_DARK);
  // thatch roof with large eaves
  k.hip(0, 4.6, -0.4, hip, 10.2, 3.6, THATCH);
  k.hip(0, 4.5, -0.4, hip + 0.5, 10.7, 1.6, 0xa38139);
  k.cyl(0, 8.1, -0.4, 0.12, 0.05, 0.9, WOOD_DARK, 6);
  // veranda posts
  for (const x of [-4.8, -1.6, 1.6, 4.8]) k.cyl(x, 1.64, 4.2, 0.13, 0.13, 2.9, WOOD_DARK, 6);
  // plunge pool + loungers + daybed
  k.box(2.6, 1.64, 2.6, 3.8, 0.14, 2.6, 0xe9e6de);
  k.box(2.6, 1.7, 2.6, 3.4, 0.1, 2.2, POOL);
  lounger(k, -3.0, 2.8, Math.PI);
  lounger(k, -4.2, 2.8, Math.PI);
  k.box(-1.5, 1.64, 3.4, 0.05, 0.9, 0.05, WOOD_DARK);
  // deck rail on the water side
  k.box(0, 1.64, 4.78, 10.4, 0.9, 0.05, WOOD_DARK);
  // ladder to the water
  for (let i = 0; i < 4; i++) k.box(4.4, 0.2 + i * 0.35, 4.9, 1.0, 0.05, 0.3, 0xb7bcc2);
  // hanging lantern
  k.cyl(-4.8, 3.2, 4.2, 0.18, 0.18, 0.4, 0xf6d86a, 6);
}

/** সমুদ্রের ওপর ভিলা: 6 thatch villas on stilts along a timber jetty, reception pavilion at the end, shore with palms. */
export function buildOverwaterVillas(seed = 0): BuiltBuilding {
  const k = new Kit(SAND_OVER);
  const W = 76, D = 80;
  const hip = pick(seed, [11.2, 11.2]);
  // lagoon (deep + shallow) and shore
  k.box(0, 0, 0, W, 0.1, D, SEA_DEEP);
  k.box(0, 0, 14, 56, 0.14, 44, SEA_SHALLOW);
  k.box(0, 0, 38, W, 0.32, 8, SAND);
  k.box(0, 0, 41, W, 0.34, 6, SAND_DARK);
  // jetty with posts + rails
  const jz0 = 36, jz1 = -26;
  k.box(0, 1.4, (jz0 + jz1) / 2, 3.2, 0.24, jz0 - jz1, WOOD);
  for (let z = jz1; z <= jz0; z += 4) {
    for (const s of [-1.5, 1.5]) k.cyl(s, 0, z, 0.15, 0.12, 1.5, 0x6b4a2f, 6);
    for (const s of [-1.5, 1.5]) k.box(s, 1.64, z, 0.1, 1.0, 0.1, WOOD_DARK);
  }
  for (const s of [-1.55, 1.55]) k.box(s, 2.55, (jz0 + jz1) / 2, 0.05, 0.08, jz0 - jz1, WOOD_DARK);
  // 6 villas + connecting walkways
  for (const z of [20, 6, -8]) {
    for (const s of [-1, 1]) {
      k.local(s * 10.4, 0, z, s < 0 ? Math.PI / 2 : -Math.PI / 2, () => waterVilla(k, hip));
      k.box(s * 3.6, 1.4, z, 4.6, 0.2, 1.8, WOOD);
    }
  }
  // reception / bar pavilion at the end
  k.local(0, 0, -34, 0, () => {
    for (const ix of [-6, -2, 2, 6]) for (const iz of [-4, 0, 4]) k.cyl(ix, 0, iz, 0.22, 0.18, 1.5, 0x6b4a2f, 7);
    k.box(0, 1.4, 0, 16, 0.24, 12, WOOD);
    k.box(0, 1.64, -1, 11, 3.2, 7, 0xe9e6de);
    k.glass(0, 2.0, 2.55, 9, 2.6, 0.06, GLASS_LIGHT);
    k.hip(0, 4.8, 0, 17, 13, 4.5, THATCH);
    k.hip(0, 4.7, 0, 17.6, 13.6, 2.2, 0xa38139);
    for (const x of [-7, -3.5, 0, 3.5, 7]) k.cyl(x, 1.64, 5.4, 0.15, 0.15, 3.1, WOOD_DARK, 6);
    k.box(-3, 1.64, 4.4, 5, 1.0, 0.8, WOOD); // bar counter
    for (let i = 0; i < 4; i++) k.cyl(-4.5 + i * 1.0, 1.64, 5.0, 0.2, 0.2, 0.8, 0xf4efe4, 6);
    parasol(k, 5, 4.2, 0xd33a2c);
  });
  // palms + shore bar
  for (const [x, z] of [[-28, 38], [-20, 40], [-10, 39], [10, 39], [20, 40], [28, 38], [-32, 42], [32, 42]] as const) palm(k, x, z, 8 + ((x * 7) % 3));
  lounger(k, -14, 36, 0);
  lounger(k, -16.4, 36, 0);
  lounger(k, 14, 36, 0);
  parasol(k, -15.2, 36.6, 0xf4efe4);
  return k.finish(W, D, 12);
}

/** ক্লিফ-টপ ম্যানশন: cantilevered white/glass villa with infinity pool on a sea cliff, pier with speedboat, helipad. */
export function buildCliffMansion(seed = 0): BuiltBuilding {
  const k = new Kit(SAND_OVER);
  const W = 64, D = 70;
  const wood = pick(seed, [0xc8a77d, 0xb98a5c]);
  // sea + cliff (stepped rocks)
  k.box(0, 0, 14, W, 0.1, 42, SEA_DEEP);
  k.box(0, 0, 20, 40, 0.13, 30, SEA_SHALLOW);
  k.box(0, 0, -12, 56, 7.0, 40, ROCK);
  k.box(4, 7.0, -10, 50, 1.5, 34, ROCK);
  k.box(-6, 0, 12, 30, 3.0, 8, ROCK);
  k.box(8, 3.0, 6, 24, 2.2, 6, ROCK);
  k.box(0, 8.5, -8, 52, 0.4, 30, 0x74b05a);
  for (const [x, z, s] of [[-20, 20, 3], [-24, 14, 2.2], [22, 22, 2.6], [26, 14, 1.8], [-8, 26, 1.8]] as const) k.box(x, 0, z, s * 1.6, s * 1.2, s * 1.4, ROCK);
  // house levels (plateau top y = 8.9)
  const y0 = 8.9;
  k.box(0, y0, -4, 36, 0.3, 17, 0xe9e6de);
  // ground level: glass lounge with stone back wall
  k.box(-2, y0 + 0.3, -9, 26, 3.6, 0.6, 0x9b968c);
  k.box(-14.6, y0 + 0.3, -4.5, 0.6, 3.6, 9.5, 0x9b968c);
  k.glass(-2, y0 + 0.3, 0.1, 26, 3.4, 0.08, GLASS_LIGHT);
  for (let i = 0; i <= 6; i++) k.box(-15 + i * 4.3, y0 + 0.3, 0.14, 0.18, 3.5, 0.14, 0x30343a);
  k.box(-2, y0 + 3.9, -4.4, 28, 0.4, 10.2, 0x3d3d3f);
  // upper volume (cantilevered over the pool)
  k.box(3, y0 + 4.3, -4, 22, 3.6, 8.5, 0xf1eee6);
  for (let i = 0; i < 30; i++) k.box(-6 + i * 0.7, y0 + 4.3, 0.35, 0.12, 3.6, 0.2, wood);
  k.glass(11, y0 + 4.9, 0.28, 8, 2.4, 0.06, GLASS_LIGHT);
  k.box(3, y0 + 7.9, -4, 24, 0.4, 11, 0x3d3d3f);
  // roof terrace with glass rail + pergola
  k.glass(-6, y0 + 8.3, 1.4, 14, 1.1, 0.05, 0x6a9bb5);
  for (const x of [-12, -6, 0]) k.box(x, y0 + 8.3, -3, 0.2, 2.8, 0.2, wood);
  k.box(-6, y0 + 11.1, -3, 14, 0.15, 0.3, wood);
  for (let i = 0; i < 8; i++) k.box(-12.5 + i * 1.9, y0 + 11.1, -3, 0.2, 0.12, 5, wood);
  lounger(k, -9, -1, 0);
  lounger(k, -6.6, -1, 0);
  // infinity pool at the cliff edge
  k.box(-2, y0, 6.5, 26, 0.5, 8, 0xe9e6de);
  k.box(-2, y0 + 0.3, 6.5, 24.4, 0.14, 6.4, POOL);
  k.glass(-2, y0 + 0.2, 10.5, 25.5, 0.9, 0.08, 0x6a9bb5);
  for (let i = 0; i < 4; i++) lounger(k, -10 + i * 2.2, 3.0, Math.PI);
  parasol(k, -9, 2.0, WHITE);
  parasol(k, -4.6, 2.0, WHITE);
  for (const [x, z] of [[-26, -2], [-24, 8], [24, -2], [26, 8], [20, -14]] as const) palm(k, x, z + 0, 9 + ((x * 3) % 3) + 7 * 0);
  for (const [x, z] of [[-22, -16], [24, -16]] as const) k.tree(x, z, 6, 0x3f7a35);
  // helipad (back-left)
  k.cyl(-24, y0, -16, 6, 6, 0.2, 0x5a5f66, 24);
  k.cyl(-24, y0 + 0.2, -16, 5.2, 5.2, 0.03, WHITE, 24);
  k.cyl(-24, y0 + 0.22, -16, 4.7, 4.7, 0.03, 0x5a5f66, 24);
  k.box(-25.3, y0 + 0.25, -16, 0.5, 0.03, 3, WHITE);
  k.box(-22.7, y0 + 0.25, -16, 0.5, 0.03, 3, WHITE);
  k.box(-24, y0 + 0.25, -16, 2.8, 0.03, 0.5, WHITE);
  // stairs down the cliff to a private pier + speedboat
  for (let i = 0; i < 26; i++) k.box(18 - i * 0.2, y0 - 0.2 - i * 0.33, 8 + i * 0.5, 2.0, 0.33, 0.55, 0xcfc7b6);
  k.box(14, 0.15, 24, 3, 0.25, 14, WOOD);
  for (const z of [18, 22, 26, 30]) for (const x of [12.7, 15.3]) k.cyl(x, 0, z, 0.12, 0.1, 1.0, 0x6b4a2f, 6);
  yacht(k, 18.5, 26, 0, 9, WHITE);
  return k.finish(W, D, y0 + 11.5);
}

/** মেরিনা ইয়ট ক্লাব: 2-storey clubhouse on a quay, long pier with finger piers, motor yachts + sailboats. */
export function buildMarina(seed = 0): BuiltBuilding {
  const k = new Kit(SAND_OVER);
  const W = 84, D = 80;
  const acc = pick(seed, [0x2f5f8a, 0x1a4a6a]);
  k.box(0, 0, 8, W, 0.1, D - 16, SEA_DEEP);
  k.box(0, 0, 14, 60, 0.13, 40, SEA_SHALLOW);
  // quay / apron
  k.box(0, 0, -30, W, 1.0, 20, 0xcfc7b6);
  // clubhouse
  const cw = 34, cd = 14, cz = -33;
  k.box(0, 1.0, cz, cw, 3.8, cd, 0xf4efe4);
  k.glass(-2, 1.4, cz + cd / 2 + 0.04, 28, 3.0, 0.06, GLASS_LIGHT);
  for (let i = 0; i <= 7; i++) k.box(-16 + i * 4.57, 1.0, cz + cd / 2 + 0.07, 0.15, 3.6, 0.1, 0x30343a);
  k.box(0, 4.8, cz, cw + 2, 0.3, cd + 2, acc);
  k.box(0, 5.1, cz - 1, cw - 4, 3.4, cd - 4, 0xf4efe4);
  k.glass(0, 5.6, cz - 1 + (cd - 4) / 2 + 0.04, cw - 6, 2.4, 0.06, GLASS_LIGHT);
  // upper wooden terrace in front with glass rail
  k.box(0, 4.8, cz + cd / 2 + 1.6, cw, 0.2, 3.4, WOOD);
  k.glass(0, 5.0, cz + cd / 2 + 3.2, cw, 1.0, 0.05, 0x6a9bb5);
  k.box(0, 8.5, cz - 1, cw - 3, 0.3, cd - 3, acc);
  k.hip(0, 8.8, cz - 1, cw - 8, cd - 6, 2.6, 0x8d9aa0);
  // lower terrace + parasols
  k.box(0, 1.0, cz + cd / 2 + 3.0, cw, 0.12, 5, WOOD);
  for (let i = 0; i < 5; i++) { parasol(k, -14 + i * 7, cz + cd / 2 + 3.4, i % 2 ? WHITE : acc); k.cyl(-14 + i * 7, 1.12, cz + cd / 2 + 3.4, 0.7, 0.7, 0.05, WHITE, 8); }
  // flag mast + tower
  k.cyl(-18, 1.0, cz + 4, 0.15, 0.1, 15, 0xb7bcc2, 6);
  k.box(-17, 13.0, cz + 4, 2.2, 1.4, 0.04, 0xd33a2c);
  // main pier (centre) + 3 finger piers on each side
  k.box(0, 0.5, 8, 3.4, 0.3, 66, WOOD);
  for (let z = -24; z <= 40; z += 4) for (const s of [-1.6, 1.6]) k.cyl(s, 0, z, 0.15, 0.12, 0.7, 0x6b4a2f, 6);
  for (const [z, s] of [[-6, 1], [-6, -1], [8, 1], [8, -1], [22, 1], [22, -1]] as const) {
    k.box(s * 8, 0.5, z, 14, 0.25, 1.4, WOOD);
    for (let i = 0; i < 3; i++) k.cyl(s * (2.4 + i * 5), 0, z + 0.6, 0.1, 0.1, 0.7, 0x6b4a2f, 5);
  }
  // yachts moored between finger piers
  yacht(k, -4.0, -1, 0, 11, WHITE);
  yacht(k, 4.4, -1, 0, 13, 0x2f5f8a);
  yacht(k, -4.4, 15, 0, 16, WHITE);
  sailboat(k, 4.6, 15, 0);
  yacht(k, -4.4, 29, 0, 10, 0x1a1d24);
  sailboat(k, 4.6, 29, 0);
  yacht(k, 4.6, 40.2, 0, 8, WHITE);
  // fuel dock, lamps, palms
  k.box(-12, 0.5, 36, 5, 0.25, 6, WOOD);
  k.box(-12, 0.75, 34.5, 0.8, 1.3, 0.6, 0xd33a2c);
  for (let x = -36; x <= 36; x += 12) palm(k, x, -22, 8);
  for (let x = -30; x <= 30; x += 10) { k.cyl(x, 1.0, -19.5, 0.08, 0.06, 3.0, 0x555a60, 5); k.sphere(x, 4.2, -19.5, 0.28, 0xf6d86a); }
  return k.finish(W, D, 14);
}

/** বিচ রিসোর্ট: 100-degree curved 6/12-storey beach hotel, lagoon pool with island bar, palm deck, sea pier, beach bar. */
export function buildBeachResort(seed = 0): BuiltBuilding {
  const k = new Kit(SAND_OVER);
  const W = 100, D = 110;
  const body = pick(seed, [0xf4efe4, 0xf1eee6]);
  const wood = 0xc8a77d;
  // beach and sea
  k.box(0, 0, 36, W, 0.25, 36, SAND);
  k.box(0, 0, 66, W, 0.1, 34, SEA_DEEP);
  k.box(0, 0, 58, 80, 0.13, 20, SEA_SHALLOW);
  k.box(0, 0, -6, W, 0.3, 46, 0xcfc7b6);
  // curved wing: 7 segments around (0,22)
  const R = 50, n = 7, L = 15, step = 0.27;
  for (let i = 0; i < n; i++) {
    const th = (i - 3) * step;
    const floors = i === 3 ? 12 : i === 2 || i === 4 ? 9 : 6;
    const fh = 3.4;
    k.local(R * Math.sin(th), 0, 24 - R * Math.cos(th), -th, () => {
      const d = 14;
      k.box(0, 0, 0, L + 1.2, 0.5, d + 1, 0x9b968c);
      k.box(0, 0.5, 0, L + 1.0, floors * fh, d, body);
      for (let f = 0; f <= floors; f++) k.box(0, 0.5 + f * fh - 0.1, d / 2 - 0.5, L + 1.1, 0.2, 2.0, 0xe9e6de);
      // room balconies with glass rails + timber louvres
      for (let f = 1; f < floors; f++) {
        k.balcony('front', 0, 0, L + 1.0, d, 0.5 + f * fh, -L / 2 - 0.1, L / 2 + 0.1, 1.6, 0xe9e6de, 0x6a9bb5, true);
        k.glass(0, 0.5 + f * fh + 0.35, d / 2 + 0.04, L - 1.0, fh - 1.0, 0.06, GLASS);
        for (let j = 0; j <= 5; j++) k.box(-L / 2 + 0.4 + j * ((L - 0.8) / 5), 0.5 + f * fh, d / 2 + 0.05, 0.14, fh - 0.2, 0.2, wood);
      }
      k.windowGrid('back', 0, 0, L + 1.0, d, { y0: 0.5, floors, floorH: fh, cols: 4, ww: 1.4, wh: 1.2, sill: 1.0, glass: GLASS, frame: 0xe9e6de });
      // ground floor lobby / arcade
      k.glass(0, 0.9, d / 2 + 0.04, L - 1, 2.6, 0.06, GLASS_LIGHT);
      k.box(0, 0.5 + floors * fh, 0, L + 1.2, 0.3, d + 0.4, 0xa7a49c);
      k.parapet(0, 0.8 + floors * fh, 0, L + 1.2, d + 0.4, 0.9, 0.2, body);
      if (i === 3) {
        k.box(0, 0.8 + floors * fh, 0, 8, 2.4, 6, 0xb7bcc2);
        k.cyl(0, 0.8 + floors * fh + 2.4, 0, 0.1, 0.05, 8, 0xb7bcc2, 6);
      }
      if (i === 2) {
        // rooftop infinity pool
        k.box(0, 0.8 + floors * fh, 0, L - 1, 0.5, 8, 0xe9e6de);
        k.box(0, 1.1 + floors * fh, 0, L - 2, 0.12, 6, POOL);
      }
    });
  }
  // porte-cochère in the centre-back
  k.box(0, 0, -16, 22, 0.1, 10, 0x4a4d52);
  // lagoon pool in the centre of the arc: free form from a box + 2 round ends
  const pz = 18;
  k.box(0, 0.25, pz, 54, 0.3, 14, 0xe9e6de);
  k.cyl(-27, 0.25, pz, 7, 7, 0.3, 0xe9e6de, 24);
  k.cyl(27, 0.25, pz, 7, 7, 0.3, 0xe9e6de, 24);
  k.box(0, 0.55, pz, 54, 0.08, 12, POOL);
  k.cyl(-27, 0.55, pz, 6, 6, 0.08, POOL, 24);
  k.cyl(27, 0.55, pz, 6, 6, 0.08, POOL, 24);
  // island bar with thatch roof in the pool
  k.cyl(0, 0.55, pz, 3.6, 3.6, 0.5, wood, 14);
  k.cyl(0, 1.05, pz, 3.8, 3.8, 0.1, WOOD, 14);
  for (let i = 0; i < 6; i++) k.cyl(Math.cos((i / 6) * 6.283) * 3.0, 1.15, pz + Math.sin((i / 6) * 6.283) * 3.0, 0.1, 0.1, 2.6, WOOD_DARK, 6);
  k.hip(0, 3.6, pz, 8.4, 8.4, 2.4, THATCH);
  // sun loungers + parasols along the pool
  for (let i = 0; i < 8; i++) { lounger(k, -22 + i * 3.4, pz + 8.5, Math.PI); if (i % 2 === 0) parasol(k, -21 + i * 3.4, pz + 8.5, i % 4 === 0 ? 0x2f6f9f : WHITE); }
  for (let i = 0; i < 8; i++) lounger(k, -22 + i * 3.4, pz - 8.5, 0);
  // beach: palms, bar, pier into the sea
  for (let i = 0; i < 9; i++) palm(k, -44 + i * 11, 38 + ((i * 5) % 4), 8.5 + (i % 3));
  k.box(-30, 0.25, 48, 9, 0.3, 7, WOOD);
  for (const x of [-33, -27]) for (const z of [45, 51]) k.cyl(x, 0.25, z, 0.12, 0.12, 2.6, WOOD_DARK, 6);
  k.hip(-30, 2.8, 48, 11, 9, 2.4, THATCH);
  k.box(0, 0.4, 58, 3, 0.25, 40, WOOD);
  for (let z = 40; z <= 76; z += 4) for (const s of [-1.3, 1.3]) k.cyl(s, 0, z, 0.12, 0.1, 0.6, 0x6b4a2f, 5);
  yacht(k, 4.5, 70, 0, 11, WHITE);
  return k.finish(W, D, 0.8 + 12 * 3.4 + 9);
}

/** ট্রপিক্যাল বিচ ভিলা: Bali-style open pavilion with huge thatch roof, stone-clad bedroom wings, pool deck, garden, walls. */
export function buildTropicalVilla(seed = 0): BuiltBuilding {
  const k = new Kit({ ...SAND_OVER, 0x9b968c: 'stone', 0xb9b6ae: 'stone' });
  const W = 56, D = 56;
  const roofC = pick(seed, [THATCH, THATCH]);
  k.box(0, 0, 0, W, 0.1, D, 0x74b05a);
  k.box(0, 0, 21, W, 0.16, 14, SAND); // sand toward the sea
  // main open pavilion (living + dining) with a steep thatch roof
  k.box(0, 0.1, -6, 18, 0.9, 14, 0xcfc7b6);
  for (const x of [-7.5, -2.5, 2.5, 7.5]) for (const z of [-11.5, -6, -0.5]) k.cyl(x, 1.0, z, 0.25, 0.22, 4.4, WOOD_DARK, 8);
  k.box(0, 1.0, -11.8, 17, 4.4, 0.4, 0x9b968c); // stone back wall
  k.local(0, 5.4, -6, Math.PI / 2, () => k.gable(0, 0, 0, 16.8, 20, 5.6, roofC));
  k.local(0, 5.2, -6, Math.PI / 2, () => k.gable(0, 0, 0, 17.8, 21, 3.0, 0xa38139));
  k.box(0, 10.9, -6, 0.4, 0.3, 20.6, WOOD_DARK);
  // furniture: sofas, dining table, fireplace
  k.box(-4, 1.0, -9, 5, 0.6, 1.4, 0xe9e6de);
  k.box(-6.4, 1.0, -7.3, 1.4, 0.6, 3.0, 0xe9e6de);
  k.box(3, 1.0, -6, 4.5, 0.15, 1.6, WOOD);
  for (let i = 0; i < 6; i++) k.box(1.4 + (i % 3) * 1.6, 1.0, -7.4 + Math.floor(i / 3) * 2.8, 0.5, 0.5, 0.5, WOOD_DARK);
  // two bedroom wings with stone cladding and hip thatch roofs
  for (const s of [-1, 1]) {
    k.box(s * 17, 0.1, -4, 10, 0.5, 10, 0xcfc7b6);
    k.box(s * 17, 0.6, -4, 9, 3.4, 9, 0x9b968c);
    k.box(s * 17, 0.6, -4, 9.1, 0.8, 9.1, WOOD);
    k.glass(s * 17 - s * 0.0, 1.8, 0.54, 6, 2.0, 0.06, GLASS_LIGHT);
    k.hip(s * 17, 4.0, -4, 12, 12, 4.4, roofC);
    k.hip(s * 17, 3.9, -4, 12.6, 12.6, 2.0, 0xa38139);
  }
  // pool deck with infinity edge, loungers, outdoor shower
  k.box(0, 0.1, 9, 34, 0.3, 14, WOOD);
  k.box(0, 0.4, 9, 20, 0.14, 7, 0xe9e6de);
  k.box(0, 0.45, 9, 19, 0.1, 6, POOL);
  for (let i = 0; i < 5; i++) lounger(k, -9 + i * 3.4, 15, Math.PI);
  parasol(k, -6, 14.6, WHITE);
  parasol(k, 4, 14.6, 0xd49a2a);
  k.cyl(12.6, 0.1, 11, 0.06, 0.06, 2.4, 0xb7bcc2, 5);
  k.box(12.6, 2.3, 11.3, 0.1, 0.1, 0.6, 0xb7bcc2);
  // stepping-stone path, hammock, gazebo daybed
  for (let i = 0; i < 8; i++) k.box(-2 + (i % 2) * 0.6, 0.12, 18 + i * 0.0 - 0, 0.0, 0.0, 0.0, 0xcfc7b6);
  for (let i = 0; i < 6; i++) k.cyl(-16, 0.1, 6 + i * 1.1, 0.4, 0.4, 0.06, 0xcfc7b6, 8);
  k.cyl(-22, 0.1, 14, 0.12, 0.12, 3.4, WOOD_DARK, 6);
  k.cyl(-17, 0.1, 14, 0.12, 0.12, 3.4, WOOD_DARK, 6);
  k.box(-19.5, 1.5, 14, 4.6, 0.12, 0.7, 0xe9e6de);
  k.local(0, 0.1, 24, 0, () => {
    for (const x of [-2.4, 2.4]) for (const z of [-1.6, 1.6]) k.cyl(x, 0, z, 0.1, 0.1, 2.6, WOOD_DARK, 6);
    k.box(0, 0, 0, 5.4, 0.5, 3.8, WOOD);
    k.box(0, 0.5, 0, 5.0, 0.2, 3.4, WHITE);
    k.hip(0, 2.6, 0, 6.4, 5.0, 1.6, roofC);
  });
  // garden: palms, banana, frangipani trees, low wall with gate
  for (const [x, z] of [[-24, 4], [-24, 14], [24, 4], [24, 16], [-12, -22], [12, -22], [22, -14], [-22, -14]] as const) palm(k, x, z, 8 + ((x + z) % 3));
  for (const [x, z] of [[-24, -8], [-26, -2], [26, -6]] as const) k.tree(x, z, 5, 0x4b8a42);
  k.boundaryWall(0, 0, W - 0.6, D - 0.6, 0x9b968c, 0xcfc7b6, 6.0, 1.8);
  return k.finish(W, D, 11.5);
}

/** বাতিঘর: red-white banded tapered tower on a rock base, gallery rail, glass lantern + dome, keeper's cottage, boat shed. */
export function buildLighthouse(seed = 0): BuiltBuilding {
  const k = new Kit({ ...SAND_OVER, 0xcfc7b6: 'stone' });
  const W = 56, D = 56;
  const band = pick(seed, [0xc0392b, 0x1a4a6a]);
  k.box(0, 0, 0, W, 0.1, D, SEA_DEEP);
  k.box(0, 0, 4, 38, 0.13, 38, SEA_SHALLOW);
  // rock island
  k.cyl(0, 0, 0, 17, 15, 2.2, ROCK, 10);
  k.cyl(0, 2.2, 0, 13, 11, 1.6, ROCK, 9);
  k.cyl(0, 3.8, 0, 10, 9, 1.0, 0x74b05a, 9);
  for (const [x, z, s] of [[18, 6, 2], [-18, 8, 2.4], [14, -17, 1.8], [-14, -17, 2.2], [20, -6, 1.6]] as const) k.box(x, 0, z, s * 1.8, s * 1.3, s * 1.5, ROCK);
  // tower: 6 bands, tapered from r 3.8 to r 2.4
  const y0 = 4.8, TH = 30, nb = 6;
  k.cyl(0, y0, 0, 5.2, 4.8, 1.4, 0xcfc7b6, 12);
  for (let i = 0; i < nb; i++) {
    const t0 = i / nb, t1 = (i + 1) / nb;
    const r0 = 3.8 - 1.4 * t0, r1 = 3.8 - 1.4 * t1;
    k.cyl(0, y0 + 1.4 + (TH * i) / nb, 0, r0, r1, TH / nb + 0.02, i % 2 ? WHITE : band, 16);
  }
  const ty = y0 + 1.4 + TH;
  // small windows up the front + door
  k.arch(0, y0 + 1.4, 3.75, 1.4, 2.6, 0.2, 0x5a3a24);
  for (let i = 1; i < nb; i++) k.glass(0, y0 + 1.4 + (TH * i) / nb + 1.2, 3.7 - 1.4 * (i / nb), 0.7, 1.1, 0.12, 0x24323b);
  // gallery with railing
  k.cyl(0, ty, 0, 3.6, 3.0, 0.4, 0x30343a, 16);
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * Math.PI * 2;
    k.box(Math.cos(a) * 3.4, ty + 0.4, Math.sin(a) * 3.4, 0.08, 1.1, 0.08, 0x30343a);
  }
  for (let i = 0; i < 16; i++) {
    const a = ((i + 0.5) / 16) * Math.PI * 2;
    k.local(Math.cos(a) * 3.4, ty + 1.45, Math.sin(a) * 3.4, -a + Math.PI / 2, () => k.box(0, 0, 0, 2.1, 0.07, 0.07, 0x30343a));
  }
  // lantern room (glass) + dome + lightning rod
  k.asGlass(() => k.cyl(0, ty + 0.4, 0, 1.8, 1.8, 2.8, 0xf6e08a, 14));
  for (let i = 0; i < 8; i++) { const a = (i / 8) * Math.PI * 2; k.box(Math.cos(a) * 1.8, ty + 0.4, Math.sin(a) * 1.8, 0.12, 2.8, 0.12, 0x30343a); }
  k.cyl(0, ty + 3.2, 0, 2.2, 2.0, 0.3, band, 14);
  k.withSurface('metal', () => k.dome(0, ty + 3.5, 0, 2.0, 1.8, band, 16));
  k.cyl(0, ty + 5.3, 0, 0.08, 0.04, 2.4, 0xb7bcc2, 5);
  k.sphere(0, ty + 1.8, 0, 0.55, 0xfff3b0);
  // keeper's cottage + chimney
  k.box(0, 0, 0, 0, 0, 0, 0xffffff);
  const cx = 9.5, cz = 3;
  k.box(cx, 3.8, cz, 8.4, 0.3, 6.4, 0xcfc7b6);
  k.box(cx, 4.1, cz, 8, 3.2, 6, WHITE);
  k.windowGrid('front', cx, cz, 8, 6, { y0: 4.1, floors: 1, cols: 3, ww: 1.1, wh: 1.4, sill: 0.8, glass: GLASS, frame: band, skip: (_f, c) => c === 1 });
  k.windowGrid('left', cx, cz, 8, 6, { y0: 4.1, floors: 1, cols: 2, ww: 1.1, wh: 1.4, sill: 0.8, glass: GLASS, frame: band });
  k.box(cx, 4.1, cz + 3.04, 1.1, 2.2, 0.08, 0x5a3a24);
  k.hip(cx, 7.3, cz, 9.6, 7.6, 2.8, 0xa8452b);
  k.box(cx + 2.6, 8.4, cz - 1.2, 0.8, 2.2, 0.8, 0xb8654a);
  // boat shed + jetty + dinghy
  k.box(-9, 3.8, 6, 6, 0.2, 5, 0xcfc7b6);
  k.box(-9, 4.0, 6, 5.2, 2.4, 4.4, 0x8a6a45);
  k.gable(-9, 6.4, 6, 5.6, 4.8, 1.2, 0x8d9aa0);
  k.box(-14, 0.35, 12, 3, 0.2, 10, WOOD);
  for (const z of [8, 12, 16]) for (const x of [-15.3, -12.7]) k.cyl(x, 0, z, 0.1, 0.08, 0.5, 0x6b4a2f, 5);
  k.box(-11.2, 0.15, 13, 1.6, 0.5, 4, WHITE);
  // stone steps up from the jetty + path + fence
  for (let i = 0; i < 6; i++) k.box(-12 + i * 0.6, 0.3 + i * 0.6, 7, 1.6, 0.6, 0.8, 0xcfc7b6);
  for (let i = 0; i < 10; i++) k.box(cx - 6 + i * 0.7, 3.9, cz + 4.6, 0.1, 0.9, 0.1, 0xe9e6de);
  k.box(cx - 2.5, 3.9, cz + 4.6, 7.2, 0.06, 0.08, 0xe9e6de);
  return k.finish(W, D, ty + 7.6);
}
