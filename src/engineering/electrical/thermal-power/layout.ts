/**
 * Thermal power plant (gas-fired steam unit, ~150 MW) layout, metres. Local frame: x east, y up, z south, origin = site centre.
 * The working fluid (Rankine cycle): condensate -> deaerator -> feed pump -> boiler -> main steam -> turbine -> condenser -> condensate ...
 * Fuel: gas from the west (pipeline) -> boiler burners -> flue gas -> stack (west).  Heat rejection: condenser -> cooling tower (north-east).
 * Electricity: generator -> step-up transformer -> switchyard -> transmission line to the east.  Entrance (gate) on the south side.
 */
import type { Rect } from '../../core/Site';

export const SITE: Rect = { minX: -160, maxX: 178, minZ: -107, maxZ: 107 };
export const PAD: Rect = { minX: -165, maxX: 183, minZ: -112, maxZ: 112 };

export const L = {
  gate: { x: 0, z: 108 },
  gas: { x: -150, z: 20, w: 20, d: 16 },
  boiler: { x: -95, z: -30, w: 22, d: 22, h: 34 },
  stack: { x: -128, z: -30, r0: 3.4, r1: 2.3, h: 72 },
  hall: { x: -5, z: -30, w: 62, d: 30, h: 22 },
  /** shaft axis (height, z) of the turbine-generator set; all along x */
  shaft: { y: 10.4, z: -30 },
  condenser: { x: -2, z: -30, w: 12, d: 8 },
  feed: { x: -52, z: 12 },
  dm: { x: -125, z: 55, w: 26, d: 14 },
  cooling: { x: 105, z: -66, rBase: 22, rThroat: 13, h: 68 },
  coolPump: { x: 58, z: -76, w: 14, d: 10 },
  trafo: { x: 45, z: -30 },
  yard: { x0: 70, x1: 140 },
  control: { x: 22, z: 8, w: 30, d: 14, h: 9 },
  admin: { x: -45, z: 88, w: 26, d: 12 },
} as const;
