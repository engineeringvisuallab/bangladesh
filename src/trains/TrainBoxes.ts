import { BODY } from './TrainMesh';
import type { CarPose, Train } from './TrainSim';
import { CONSIST } from './TrainConfig';

/**
 * STAGE 14 / Step 5B.2: the solid shape of a train: one oriented box per car. Pure geometry (no Rapier, no three.js): TrainPhysics hands
 * these to Rapier, TrainOverlap tests the player / vehicles against them, and the tests ray-cast the very same boxes (like deckBoxes for the
 * viaducts). World coordinates, y up.
 */
export type V3 = [number, number, number];

export interface Obb {
  /** Centre. */
  x: number;
  y: number;
  z: number;
  /** Half sizes along the three axes. */
  hx: number;
  hy: number;
  hz: number;
  /** Unit axes: ax = along the car (direction of travel), ay = up, az = across (ax x ay). */
  ax: V3;
  ay: V3;
  az: V3;
  /** True: a vertical cylinder (radius hx = hz, half height hy) instead of a box. The player. */
  round?: boolean;
}

export interface TrainBox extends Obb {
  train: number;
  /** Car index in CONSIST order (0 = locomotive), not path order. */
  car: number;
  q: { x: number; y: number; z: number; w: number };
}

/** The box covers the car body and the roof gear from just above the bogie frames up (the wheels stay out, so a person beside the track is not "hit" by a wheel). */
export const BOX_BOTTOM = 0.3;
export const BOX_HALF_WIDTH = BODY.width / 2;
/** Loco: the roof gear and the pantograph insulators (to 0.3 m over the roof); coaches: the roof gear (0.2 m). The raised pantograph itself is above the box. */
export const boxTop = (kind: 'loco' | 'coach' | 'cab'): number => (kind === 'loco' ? BODY.loco.roof + 0.3 : BODY.coach.roof + 0.2);

/** Unit quaternion of the rotation whose columns are the axes (x = ax, y = ay, z = az). */
export function quatFromAxes(ax: V3, ay: V3, az: V3): { x: number; y: number; z: number; w: number } {
  const m11 = ax[0], m21 = ax[1], m31 = ax[2];
  const m12 = ay[0], m22 = ay[1], m32 = ay[2];
  const m13 = az[0], m23 = az[1], m33 = az[2];
  const tr = m11 + m22 + m33;
  let x: number, y: number, z: number, w: number;
  if (tr > 0) {
    const s = 0.5 / Math.sqrt(tr + 1);
    w = 0.25 / s;
    x = (m32 - m23) * s;
    y = (m13 - m31) * s;
    z = (m21 - m12) * s;
  } else if (m11 > m22 && m11 > m33) {
    const s = 2 * Math.sqrt(1 + m11 - m22 - m33);
    w = (m32 - m23) / s;
    x = 0.25 * s;
    y = (m12 + m21) / s;
    z = (m13 + m31) / s;
  } else if (m22 > m33) {
    const s = 2 * Math.sqrt(1 + m22 - m11 - m33);
    w = (m13 - m31) / s;
    x = (m12 + m21) / s;
    y = 0.25 * s;
    z = (m23 + m32) / s;
  } else {
    const s = 2 * Math.sqrt(1 + m33 - m11 - m22);
    w = (m21 - m12) / s;
    x = (m13 + m31) / s;
    y = (m23 + m32) / s;
    z = 0.25 * s;
  }
  const l = Math.hypot(x, y, z, w) || 1;
  return { x: x / l, y: y / l, z: z / l, w: w / l };
}

/** The box of one car from its pose (the pose already holds the direction of travel, pitch included). */
export function boxFromPose(train: number, car: number, kind: 'loco' | 'coach' | 'cab', p: CarPose, out: TrainBox): TrainBox {
  const f: V3 = [p.fx, p.fy, p.fz];
  // up = world up with the part along the car removed
  const d = f[1];
  let u: V3 = [-f[0] * d, 1 - f[1] * d, -f[2] * d];
  const ul = Math.hypot(u[0], u[1], u[2]) || 1;
  u = [u[0] / ul, u[1] / ul, u[2] / ul];
  const s: V3 = [f[1] * u[2] - f[2] * u[1], f[2] * u[0] - f[0] * u[2], f[0] * u[1] - f[1] * u[0]];
  const top = boxTop(kind);
  const mid = (BOX_BOTTOM + top) / 2;
  out.train = train;
  out.car = car;
  out.x = p.x + u[0] * mid;
  out.y = p.y + u[1] * mid;
  out.z = p.z + u[2] * mid;
  out.hx = CONSIST[car].length / 2;
  out.hy = (top - BOX_BOTTOM) / 2;
  out.hz = BOX_HALF_WIDTH;
  out.ax = f;
  out.ay = u;
  out.az = s;
  out.q = quatFromAxes(f, u, s);
  return out;
}

const scratch: CarPose = { kind: 'coach', x: 0, y: 0, z: 0, fx: 1, fy: 0, fz: 0, flipped: false, bf: { x: 0, y: 0, z: 0 }, br: { x: 0, y: 0, z: 0 } };

/** The six boxes of a train as it is drawn right now (running trains: between the last two simulation steps, exactly like the view). */
export function trainBoxes(t: Train): TrainBox[] {
  const n = CONSIST.length;
  const out: TrainBox[] = [];
  for (let car = 0; car < n; car++) {
    const j = t.reversed ? n - 1 - car : car;
    t.carPose(j, scratch);
    out.push(boxFromPose(t.id, car, CONSIST[car].kind, scratch, { train: 0, car: 0, x: 0, y: 0, z: 0, hx: 0, hy: 0, hz: 0, ax: [1, 0, 0], ay: [0, 1, 0], az: [0, 0, 1], q: { x: 0, y: 0, z: 0, w: 1 } }));
  }
  return out;
}

/** Ray against a box: distance along the (unit) direction to the first hit, or null. */
export function rayBox(b: Obb, ox: number, oy: number, oz: number, dx: number, dy: number, dz: number): number | null {
  const rel: V3 = [ox - b.x, oy - b.y, oz - b.z];
  let t0 = 0, t1 = Infinity;
  const axes = [b.ax, b.ay, b.az], half = [b.hx, b.hy, b.hz];
  for (let k = 0; k < 3; k++) {
    const a = axes[k];
    const o = rel[0] * a[0] + rel[1] * a[1] + rel[2] * a[2];
    const d = dx * a[0] + dy * a[1] + dz * a[2];
    if (Math.abs(d) < 1e-12) {
      if (Math.abs(o) > half[k]) return null;
    } else {
      let ta = (-half[k] - o) / d, tb = (half[k] - o) / d;
      if (ta > tb) [ta, tb] = [tb, ta];
      t0 = Math.max(t0, ta);
      t1 = Math.min(t1, tb);
      if (t0 > t1) return null;
    }
  }
  return t0;
}
