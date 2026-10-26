/**
 * Mechanical works (workshop + machine demonstrations) layout, metres. Local frame: x east, y up, z south, origin = site centre.
 * One spine road (z = 0). North row (open to the road): engine test cell, mechanisms hall, machine shop.
 * South row (open to the road): hydraulics bay, refrigeration plant. Gate on the EAST side (towards the public road).
 */
import type { Rect } from '../../core/Site';

export const SITE: Rect = { minX: -200, maxX: 170, minZ: -102, maxZ: 95 };
export const PAD: Rect = { minX: -205, maxX: 175, minZ: -107, maxZ: 100 };

export const L = {
  gate: { x: 170, z: 0 },
  engine: { x: -150, z: -55, w: 50, d: 36, h: 14 },
  mech: { x: -50, z: -55, w: 60, d: 36, h: 11 },
  shop: { x: 75, z: -55, w: 70, d: 36, h: 12 },
  hydro: { x: -120, z: 55, w: 50, d: 36, h: 12 },
  fridge: { x: -25, z: 55, w: 56, d: 36, h: 10 },
  admin: { x: 140, z: 58, w: 32, d: 18, h: 8 },
} as const;
