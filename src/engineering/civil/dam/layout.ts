/**
 * Dam & hydropower station layout, metres. Local frame: x east, y up, z south, origin = site centre, floor y = 0.
 *
 * WATER PATH: river inflow (waterfall, north) -> RESERVOIR (north, held 36 m high by rock banks) -> concrete GRAVITY DAM (east-west wall).
 *   (a) power: intake tower -> penstock -> Francis turbine -> draft tube -> tailrace -> river
 *   (b) floods: radial gates -> spillway chute -> stilling basin -> river
 * ELECTRICITY: generator (11 kV) -> step-up transformer (11/132 kV) -> switchyard -> transmission line east (to the grid).
 * ACCESS: entrance + bridge-free gate road on the south edge, E-W road at z = 78, west road to the control room, east road over the river bridge.
 * Heights above the floor: crest 44, max water level (MWL) 40, full reservoir level (FRL) 36, spillway sill 28, min draw-down level (MDDL) 26.
 */
import type { Rect } from '../../core/Site';

export const SITE: Rect = { minX: -146, maxX: 146, minZ: -101, maxZ: 103 };
export const PAD: Rect = { minX: -150, maxX: 150, minZ: -105, maxZ: 105 };

export const H = {
  crest: 44,
  mwl: 40,
  frl: 36,
  sill: 28,
  mddl: 26,
  /** intake centre line */
  intake: 20,
} as const;

/** Dam profile (z, y): upstream face z = -26 (vertical), crest 10 m wide, downstream slope down to the toe at z = +14. */
export const DAM = { zUp: -26, zCrestIn: -16, zToe: 14, xEnd: 84, xSpill: 42 } as const;

/** Height of the downstream face of the concrete dam at z (between the crest edge and the toe). */
export function faceY(z: number): number {
  const k = (z - DAM.zCrestIn) / (DAM.zToe - DAM.zCrestIn);
  return H.crest * (1 - Math.min(1, Math.max(0, k)));
}

export const L = {
  gate: { x: 0, z: 101 },
  admin: { x: -42, z: 92, w: 26, d: 12 },
  /** E-W road z, west road x, east road x */
  roadZ: 78,
  roadW: -92,
  roadE: 107,
  /** five spillway bays (centres) and gate geometry */
  bays: [-32, -16, 0, 16, 32],
  piers: [-40, -24, -8, 8, 24, 40],
  stilling: { x0: -46, x1: 46, z0: 20, z1: 52, depth: 6 },
  river: { x0: -80, x1: 146, z0: 54, z1: 70, depth: 4 },
  /** powerhouse: two Francis units */
  hall: { x0: 46, x1: 86, z0: 18, z1: 38, h: 18 },
  units: [58, 74],
  unitZ: 28,
  tailrace: { x0: 48, x1: 84, z0: 40, z1: 52, depth: 4 },
  trafoX: 97,
  yard: { x0: 112, x1: 146 },
  control: { x: -122, z: 34, w: 30, d: 14, h: 9 },
  model: { x: -74, z: 34 },
} as const;
