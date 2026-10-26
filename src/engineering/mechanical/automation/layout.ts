/**
 * Automation & Robotics Plant layout, metres. Local frame: x east, y up, z south, origin = site centre.
 * North row (open to the spine road): Sensor Lab, Process Control Lab (PID), PLC & Control Room, Administration.
 * South row (open to the road): the Automated Production Hall (conveyor, sorter, robot, pallets) and the Warehouse (rack, AGV).
 * Gate on the EAST side (towards the public road).
 */
import type { Rect } from '../../core/Site';

export const SITE: Rect = { minX: -190, maxX: 180, minZ: -90, maxZ: 76 };
export const PAD: Rect = { minX: -195, maxX: 185, minZ: -95, maxZ: 80 };

export const L = {
  gate: { x: 180, z: 0 },
  sensorLab: { x: -140, z: -60, w: 58, d: 34, h: 9 },
  pidLab: { x: -70, z: -60, w: 54, d: 34, h: 11 },
  plc: { x: -5, z: -60, w: 44, d: 34, h: 9 },
  admin: { x: 100, z: -58, w: 36, d: 22, h: 8 },
  hall: { x: -62, z: 40, w: 140, d: 40, h: 12 },
  warehouse: { x: 62, z: 40, w: 70, d: 40, h: 12 },
  /** conveyor line inside the hall (all along x at z = beltZ) */
  line: { beltZ: 45, beltY: 1.0, xSpawn: -122, xS1: -104, xS2: -84, xSort: -62, xPick: -30, xEnd: -20 },
  pallet: { x: -30, z: 29 },
  robot: { x: -30, z: 37, shoulderY: 2.4, l1: 4.6, l2: 4.6, grip: 1.0 },
  /** AGV: parking spot, the lane (z) along the spine road, the rack drop point */
  agv: { parkX: 16, parkZ: 7, laneZ: 3.5, rackDropX: 62, rackDropZ: 40 },
  rack: { x: 62, z: 52, cols: [-6, 6] as const, levels: [0.45, 2.75, 5.05] as const },
} as const;
