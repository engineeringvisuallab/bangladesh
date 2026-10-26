// FARM JOBS (pure numbers, no three.js / game objects): who works where in a field, the lane routes of the machines, the farmer's look and the
// steering controller. FarmCrew turns these into real people / vehicles; scripts/farm-crew-test.ts checks them on the real field table.
import type { Appearance, WorkPose } from '../people/PersonModel';
import type { VehicleId } from '../vehicles/VehicleSpec';
import { Act, cropById } from './CropDefs';
import type { Field } from './FarmPlan';

const SKINS = [0xc68e6b, 0xb87a56, 0xa86f4c, 0xd2a07c, 0x8d5a3c, 0x9a6642];
const HAIRS = [0x111111, 0x1a1410, 0x2a2018, 0x4a4038];
const SHIRTS = [0xcbbf9a, 0x7e8b6a, 0x9b7b5a, 0x6d8aa8, 0xb5503c, 0x8a8f96, 0xd8d2c0, 0x5f7d5a];
const PANTS = [0x3b3f4a, 0x5a4b3a, 0x2f3b2f, 0x6a6a6a, 0x404a5a];
const HATS = [0xf2efe6, 0xe4dfd0, 0xb79c63, 0x8a7a54];

const pick = <T>(r: () => number, a: readonly T[]): T => a[Math.min(a.length - 1, Math.floor(r() * a.length))];

/** A Bangladeshi farmer: faded shirt, work trousers, bare-ish feet, a white cap / topi or a straw-coloured one, often a beard. */
export function farmerLook(r: () => number): Appearance {
  const roll = r();
  return {
    skin: pick(r, SKINS), hair: pick(r, HAIRS), shirt: pick(r, SHIRTS), pants: pick(r, PANTS), shoes: pick(r, [0x3a2a1a, 0x2a2118]),
    scale: 0.9 + r() * 0.1, headwear: roll < 0.45 ? 'topi' : roll < 0.75 ? 'cap' : 'none', headwearColor: pick(r, HATS),
    vest: false, beard: r() < 0.45, bodyType: r() < 0.5 ? 'slim' : 'average',
  };
}

export type WKind = 'stay' | 'shuffle' | 'lane' | 'wander' | 'ferry';
export interface WSpec { kind: WKind; x: number; z: number; pose: WorkPose | null; range?: number; speed?: number }
export interface VSpec { id: VehicleId; route: [number, number][]; speed: number; park?: boolean }

export const tri = (u: number): number => { const k = ((u % 2) + 2) % 2; return k < 1 ? k : 2 - k; };
export const clamp = (v: number, a: number, b: number): number => Math.max(a, Math.min(b, v));

/**
 * Lane loop with half-circle headland turns, local frame: up the lane at xa, a half circle (radius width / 2) round the end, back down at xa + width,
 * a second half circle. `width / 2` must be at least the turning radius of the machine (wheelbase / tan(max steer)).
 */
export function loopRoute(xa: number, width: number, Z: number): [number, number][] {
  const xm = xa + width / 2, r = width / 2, pts: [number, number][] = [[xa, -Z], [xa, Z]];
  for (let k = 1; k <= 5; k++) { const th = Math.PI - (k * Math.PI) / 6; pts.push([xm + r * Math.cos(th), Z + r * Math.sin(th)]); }
  pts.push([xa + width, Z], [xa + width, -Z]);
  for (let k = 1; k <= 5; k++) { const th = -(k * Math.PI) / 6; pts.push([xm + r * Math.cos(th), -Z + r * Math.sin(th)]); }
  return pts;
}

export function planJobs(f: Field, r: () => number): { w: WSpec[]; v: VSpec[] } {
  const w: WSpec[] = [], v: VSpec[] = [];
  const hw = f.w / 2, hd = f.d / 2, c = cropById(f.crop);
  const front = -hw + f.progress * f.w;
  const zs = (n: number, i: number, margin = 5): number => -hd + margin + ((f.d - 2 * margin) * (i + 0.5)) / n;
  const tree = c.shape === 'tree' || c.shape === 'palm' || c.shape === 'banana';
  const xaFor = (width: number): number => clamp(front + 1, -hw + 3, hw - width - 3); // start of the lane loop, wide enough for the machine to turn
  const Z = hd - 2;
  const bankX = -hw - 5;
  let act: number = f.act;
  if (f.level && act === Act.harvestCombine) act = Act.harvestHand; // machines cannot work the levelled paddy terraces
  switch (act) {
    case Act.plow:
      if (f.level) for (let i = 0; i < 2; i++) w.push({ kind: 'stay', x: front + 0.8, z: zs(2, i), pose: 'hoe' });
      else v.push({ id: 'tractor', route: loopRoute(xaFor(8), 8, Z), speed: 2.6 });
      break;
    case Act.sow: for (let i = 0; i < 2; i++) w.push({ kind: 'lane', x: -hw + 10 + i * f.w * 0.35, z: -hd + 6, pose: 'sow', range: f.d - 12, speed: 0.9 }); break;
    case Act.transplant: {
      const n = Math.max(6, Math.round(f.d / 8)), x0 = -hw + 8 + r() * f.w * 0.3;
      for (let i = 0; i < n; i++) w.push({ kind: 'shuffle', x: x0, z: zs(n, i), pose: 'plant', range: 8, speed: 0.12 });
      break;
    }
    case Act.weed: { const n = 3 + Math.floor(r() * 3); for (let i = 0; i < n; i++) w.push({ kind: 'wander', x: (r() - 0.5) * f.w * 0.5, z: (r() - 0.5) * f.d * 0.5, pose: 'weed', range: 10 }); break; }
    case Act.irrigate: w.push({ kind: 'stay', x: -hw + 4, z: 4, pose: 'tend' }); break;
    case Act.spray: w.push({ kind: 'lane', x: -hw + 12 + r() * f.w * 0.5, z: -hd + 6, pose: 'spray', range: f.d - 12, speed: 0.8 }); break;
    case Act.harvestCombine:
      v.push({ id: 'combine', route: loopRoute(xaFor(14), 14, Z), speed: 2.2 }); // turning circle ~13 m: wide headland loop
      v.push({ id: 'pickup', route: [[bankX - 2, -hd * 0.3]], speed: 0, park: true });
      break;
    case Act.harvestHand: {
      const n = Math.max(5, Math.round(f.d / 9));
      for (let i = 0; i < n; i++) w.push({ kind: 'stay', x: front + 0.6, z: zs(n, i), pose: 'cut' });
      w.push({ kind: 'ferry', x: front - 3, z: 0, pose: 'carry', speed: 1.0 });
      break;
    }
    case Act.pick: { const n = 3 + Math.floor(r() * 3); for (let i = 0; i < n; i++) w.push({ kind: 'wander', x: (r() - 0.5) * f.w * 0.5, z: (r() - 0.5) * f.d * 0.5, pose: tree ? 'pick' : 'plant', range: 9 }); break; }
    case Act.thresh:
      for (let i = 0; i < 3; i++) w.push({ kind: 'stay', x: bankX - 2.2 + i * 1.3, z: 4 + (i - 1) * 2.4, pose: 'tend' });
      w.push({ kind: 'ferry', x: -hw + 6, z: 8, pose: 'carry', speed: 1.0 });
      break;
    case Act.haul:
      if (f.level) for (let i = 0; i < 2; i++) w.push({ kind: 'ferry', x: -hw + 8 + i * 6, z: -6 + i * 12, pose: 'carry', speed: 1.1 });
      else v.push({ id: 'pickup', route: loopRoute(-hw - 14, 10, hd - 8), speed: 4.5 });
      break;
    case Act.graze: w.push({ kind: 'stay', x: -hw + 3, z: -hd * 0.4, pose: null }); break;
    default:
      if (r() < 0.35 && c.group !== 'fruit') w.push({ kind: 'wander', x: (r() - 0.5) * f.w * 0.4, z: (r() - 0.5) * f.d * 0.4, pose: 'weed', range: 8 });
      break;
  }
  return { w, v };
}


/**
 * Pure pursuit for a machine on a lane route. `fx, fz` = the unit vector of the vehicle's nose, `px, pz` = its position, `tx, tz` = the point to reach,
 * `speed` = its forward speed, `lane` = the speed the job asks for. Returns the DriveInput numbers (steer: +1 = left, like Vehicle.DriveInput).
 */
export function pursue(fx: number, fz: number, px: number, pz: number, tx: number, tz: number, speed: number, lane: number): { steer: number; throttle: number; brake: number } {
  const dx = tx - px, dz = tz - pz, d = Math.max(Math.hypot(dx, dz), 0.001);
  const ang = Math.atan2((fz * dx - fx * dz) / d, (fx * dx + fz * dz) / d); // + = the point is on the left
  const want = Math.abs(ang) > 0.9 ? lane * 0.45 : lane;
  return { steer: clamp(ang * 1.5, -1, 1), throttle: clamp((want - speed) * 0.9, 0, 1), brake: clamp((speed - want - 0.4) * 0.8, 0, 1) };
}
