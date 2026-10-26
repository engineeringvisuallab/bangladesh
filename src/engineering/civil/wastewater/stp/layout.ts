/**
 * STP (Sewage Treatment Plant) layout, metres. Local frame: x east, y up, z south, origin = site centre.
 * Sewage: west trunk sewer -> screw-pump lift -> fine screen -> grit -> primary clarifiers -> aeration tank
 *   -> secondary clarifiers -> chlorine contact -> outfall to the river (east).
 * Sludge: thickener -> anaerobic digester (+ biogas) -> belt-press dewatering -> cake truck.
 */
import type { Rect } from '../../../core/Site';

export const SITE: Rect = { minX: -150, maxX: 150, minZ: -100, maxZ: 100 };
export const PAD: Rect = { minX: -153, maxX: 153, minZ: -103, maxZ: 103 };

export const L = {
  pump: { x: -128, z: -45, w: 16, d: 12 },
  channel: { x0: -122, x1: -97, z: -45 },
  screenX: -108,
  grit: { x: -85, z: -45, w: 16, d: 10 },
  primary: { xs: [-58, -28], z: -45, r: 12 },
  aeration: { x: 35, z: -45, w: 70, d: 24 },
  blower: { x: 35, z: -23, w: 18, d: 9 },
  secondary: { xs: [91, 117], z: -45, r: 12 },
  contact: { x: 100, z: 10, w: 30, d: 16 },
  chlorine: { x: 124, z: -5, w: 8, d: 6 },
  thickener: { x: -70, z: 45, r: 8 },
  digester: { x: -35, z: 45, r: 10, h: 14 },
  gasHolder: { x: -35, z: 66, r: 5 },
  flare: { x: -48, z: 66 },
  dewater: { x: 15, z: 48, w: 22, d: 14 },
  substation: { x: 100, z: 62, w: 20, d: 14 },
  generator: { x: 126, z: 62, w: 14, d: 9 },
  admin: { x: -110, z: 75, w: 26, d: 12 },
  lab: { x: -88, z: 75, w: 16, d: 10 },
  gate: { x: -5, z: 100 },
} as const;
