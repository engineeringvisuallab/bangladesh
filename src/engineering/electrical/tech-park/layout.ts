/**
 * Computer Science & Electronics Park layout, metres. Local frame: x east, y up, z south, origin = site centre.
 * One spine road (z = 0). North row (open to the road): CPU & Logic Hall, Algorithms Hall, Electronics & Telecom Lab.
 * South row (open to the road): Network Hall, Data Center, AI Lab, and the cell tower. Gate on the WEST side (towards the city).
 */
import type { Rect } from '../../core/Site';

export const SITE: Rect = { minX: -170, maxX: 170, minZ: -96, maxZ: 96 };
export const PAD: Rect = { minX: -175, maxX: 175, minZ: -100, maxZ: 100 };

export const L = {
  gate: { x: -170, z: 0 },
  cpu: { x: -110, z: -52, w: 110, d: 44, h: 12 },
  algo: { x: 10, z: -52, w: 110, d: 44, h: 12 },
  tele: { x: 122, z: -52, w: 92, d: 44, h: 12 },
  net: { x: -115, z: 48, w: 100, d: 44, h: 12 },
  dc: { x: -5, z: 48, w: 100, d: 44, h: 12 },
  ai: { x: 88, z: 48, w: 66, d: 44, h: 12 },
  tower: { x: 150, z: 48 },
} as const;
