/**
 * Chemical process plant (crude-oil distillation + reaction unit) layout, metres. Local frame: x east, y up, z south, origin = site centre.
 * One spine road (z = 24). North of it, from west to east, the process runs: tank farm -> feed pump + heat exchangers -> furnace -> distillation column -> reactor unit.
 * Cooling tower in the north-west, flare stack in the north-east (far from the tanks). South of the road: administration (west) and control room (east).
 * Gate on the SOUTH side (the nearest public road is south-west of the pad).
 */
import type { Rect } from '../../core/Site';

export const SITE: Rect = { minX: -128, maxX: 128, minZ: -70, maxZ: 70 };
export const PAD: Rect = { minX: -133, maxX: 133, minZ: -75, maxZ: 75 };

export const L = {
  gate: { x: -100, z: 70 },
  roadZ: 24,
  admin: { x: -62, z: 50, w: 30, d: 16, h: 8 },
  control: { x: 62, z: 50, w: 34, d: 16, h: 6.5 },
  /** bund (spill wall) round the tanks */
  bund: { x0: -126, x1: -58, z0: -66, z1: -4, h: 1.2 },
  crude: [
    { x: -106, z: -46, r: 11, h: 12 },
    { x: -80, z: -46, r: 11, h: 12 },
  ],
  /** product tanks, west -> east: residue, naphtha, kerosene, diesel */
  prod: [
    { x: -117, z: -19, r: 5.5, h: 9 },
    { x: -104, z: -19, r: 5.5, h: 9 },
    { x: -91, z: -19, r: 5.5, h: 9 },
    { x: -78, z: -19, r: 5.5, h: 9 },
  ],
  pump: { x: -52, z: -2 },
  exA: { x: -38, z: -10 },
  exB: { x: -38, z: -18 },
  tower: { x: -38, z: -58 },
  furnace: { x: -15, z: -38, w: 14, d: 12, h: 10 },
  col: { x: 38, z: -38, r: 3.2, yBase: 4, yTop: 34 },
  cooler: { x: 38, z: -52 },
  drum: { x: 27, z: -52 },
  feedTanks: [
    { x: 76, z: -52 },
    { x: 76, z: -42 },
  ],
  cstr: { x: 90, z: -40 },
  bed: { x: 98, z: -24 },
  flare: { x: 116, z: -60, h: 42 },
  kod: { x: 110, z: -62 },
  /** the four product lanes on the pipe rack (z), north -> south: diesel, kerosene, naphtha, residue */
  lanes: [6, 7.5, 9, 10.5],
  rackY: 5.5,
} as const;
