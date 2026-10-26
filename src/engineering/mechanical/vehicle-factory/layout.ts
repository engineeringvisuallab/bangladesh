/**
 * Vehicle factory (EV manufacturing) layout, metres. Local frame: x east, y up, z south, origin = site centre, floor y = 0.
 *
 * PROCESS (west -> east along the main line z = -25):
 *   steel coils (north-west yard) -> PRESS shop -> BODY shop (welding robots) -> PAINT shop -> FINAL ASSEMBLY -> END-OF-LINE tests -> vehicle YARD -> car carrier
 *   feeders from the north: PARTS WAREHOUSE (AS/RS) and BATTERY + MOTOR shop (battery pack joins the car at the "marriage" station, x = 60)
 *   south of the line: DESIGN studio + wind tunnel, CRASH lab, TEST TRACK, visitor centre and the entrance.
 */
import type { Rect } from '../../core/Site';

export const SITE: Rect = { minX: -186, maxX: 186, minZ: -146, maxZ: 148 };
export const PAD: Rect = { minX: -190, maxX: 190, minZ: -150, maxZ: 150 };

/** z of the main production line and the doors the cars pass through */
export const LINE_Z = -25;

/** Production hall row: all z -50..0 (open to the south so the lines can be seen). */
export const ROW = { z0: -50, z1: 0, d: 50 };
export const SHOP = {
  press: { x0: -176, x1: -116, h: 13 },
  body: { x0: -112, x1: -52, h: 12 },
  paint: { x0: -48, x1: 22, h: 12 },
  assembly: { x0: 26, x1: 116, h: 12 },
  eol: { x0: 120, x1: 178, h: 10 },
} as const;

export const L = {
  gate: { x: 0, z: 146 },
  roadZ: 8,
  warehouse: { x: -60, z: -112, w: 80, d: 55, h: 16 },
  battery: { x: 48, z: -112, w: 96, d: 55, h: 12 },
  coilYard: { x: -150, z: -112, w: 60, d: 55 },
  design: { x: -141, z: 32, w: 70, d: 36, h: 11 },
  crash: { x: -55, z: 32, w: 70, d: 36, h: 10 },
  visitor: { x: -34, z: 122, w: 40, d: 20 },
  yard: { x0: 122, x1: 178, z0: 14, z1: 46 },
  /** battery pack joins the car here */
  marriageX: 60,
  /** test track: closed loop (x, z) */
  track: [[70, 54], [145, 54], [168, 76], [168, 116], [145, 138], [70, 138], [44, 116], [44, 76]] as [number, number][],
} as const;
