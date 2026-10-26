/**
 * Renewable energy park layout, metres. Local frame: x east, y up, z south, origin = site centre.
 * North: the solar field (west) and three wind turbines (east). Middle: inverter, step-up transformer + switchyard, battery containers.
 * One spine road (z = 44); south of it the administration building and the energy control centre. Gate on the SOUTH side (nearest road is south-west).
 * Everything here runs on one accelerated "day" (see Sim in parts/ctx.ts): sun rises, sets, wind gusts, the battery charges and discharges.
 */
import type { Rect } from '../../core/Site';

export const SITE: Rect = { minX: -153, maxX: 153, minZ: -88, maxZ: 88 };
export const PAD: Rect = { minX: -158, maxX: 158, minZ: -93, maxZ: 93 };

export const L = {
  gate: { x: -100, z: 88 },
  roadZ: 44,
  admin: { x: -60, z: 72, w: 28, d: 14, h: 7 },
  control: { x: 40, z: 72, w: 36, d: 16, h: 7 },
  /** solar rows run along x; row i is at z = row.z0 + i * row.pitch */
  solar: { x0: -146, x1: -30, z0: -78, pitch: 9.5, rows: 8, tilt: (23 * Math.PI) / 180 },
  collectorX: -24,
  demo: { x: -112, z: 20 },
  inverter: { x: -14, z: 0 },
  trafo: { x: 30, z: -10 },
  gantry: { x: 48, z: -10 },
  pylon: { x: 148, z: -10 },
  /** wind turbines (rotor faces south) */
  turbines: [
    { x: 30, z: -60 },
    { x: 75, z: -62 },
    { x: 120, z: -56 },
  ],
  windBusZ: -22,
  hubY: 41.5,
  mast: { x: 78, z: 58 },
  /** battery containers: 2 rows x 3 */
  battery: { x0: 52, z0: 14, dz: 16, dx: 18 },
  pcs: { x: 34, z: 22 },
} as const;
