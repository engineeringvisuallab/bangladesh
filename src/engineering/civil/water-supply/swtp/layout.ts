/**
 * SWTP layout (metres). Local frame: x east, y up, z south, origin = site centre.
 * Water travels: river (west) -> intake -> pumps -> flume/rapid mix -> flocculation -> sedimentation -> filters
 *                -> chlorine contact -> clear water reservoir -> high-lift pumps -> delivery main (south gate).
 */
import type { Rect } from '../../../core/Site';

export const SITE: Rect = { minX: -165, maxX: 155, minZ: -110, maxZ: 110 };
export const PAD: Rect = { minX: -168, maxX: 158, minZ: -113, maxZ: 113 };

export const L = {
  intake: { x: -154, z: -40, w: 22, d: 14 },
  intakePump: { x: -133, z: -40, w: 16, d: 14 },
  flume: { x0: -100, x1: -86, z: -40 },
  mixer: { x: -83, z: -40, w: 6, d: 6 },
  chem: { x: -90, z: -8, w: 24, d: 12 },
  floc: { x: -59, w: 30, d: 18, zN: -52, zS: -28 },
  sed: { x: -13, w: 50, d: 18, zN: -52, zS: -28 },
  filter: { xs: [30, 47, 64], w: 15, d: 18, zN: -52, zS: -28 },
  backwash: { x: 62, z: -8, r: 4.5 },
  contact: { x: 111, z: -40, w: 30, d: 24 },
  chlorine: { x: 114, z: -66, w: 16, d: 12 },
  reservoir: { x: 105, z: 16, w: 50, d: 32 },
  highLift: { x: 40, z: 14, w: 20, d: 12 },
  deliveryX: 15,
  lagoon: { x: -130, zs: [69, 91], w: 30, d: 18 },
  substation: { x: 50, z: 66, w: 32, d: 22 },
  generator: { x: 88, z: 66, w: 16, d: 10 },
  admin: { x: -75, z: 59, w: 30, d: 14 },
  lab: { x: -52, z: 59, w: 16, d: 10 },
  gate: { x: -30, z: 110 },
} as const;

export const ROAD_W = 7;
