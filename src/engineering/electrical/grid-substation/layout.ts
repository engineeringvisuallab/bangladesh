/**
 * Grid substation 132/33 kV layout, metres. Local frame: x east, y up, z south, origin = site centre. Gate on the NORTH side (local -z).
 * Power path: 132 kV line from the thermal plant (north) -> line bay (arrester, CVT, isolator, breaker, CT) -> 132 kV bus
 *   -> 2 power transformers (132/33 kV) -> 33 kV bus -> 6 feeder bays -> overhead feeders leaving to the south (towards the city).
 */
import type { Rect } from '../../core/Site';

export const SITE: Rect = { minX: -175, maxX: 175, minZ: -88, maxZ: 76 };
export const PAD: Rect = { minX: -180, maxX: 180, minZ: -92, maxZ: 80 };

export const L = {
  gate: { x: -60, z: -88 },
  /** incoming 132 kV line: dead-end tower, outer tower (outside the pad), portal gantry */
  line: { x: 60, towerZ: [-84, -108] as const, gantryZ: -76 },
  /** HV bus (3 bars along x) and the bays hanging on it */
  hvBus: { x0: -5, x1: 125, z: [-50, -47, -44] as const, y: 10 },
  trafoX: [20, 100] as const,
  trafoZ: 6,
  /** 33 kV bus and feeder bays */
  mvBus: { x0: -2, x1: 126, z: [22, 24, 26] as const, y: 8 },
  feederX: [5, 28, 51, 74, 97, 120] as const,
  gantryZ: 52,
  capBank: { x: -30, z: 40 },
  control: { x: -108, z: -40, w: 36, d: 16, h: 9 },
  /** feeder that gets the lightning fault in the demo (index into feederX) */
  faultFeeder: 2,
} as const;
