import type { TrainManager } from './TrainManager';
import { trainBoxes, type Obb, type TrainBox, type V3 } from './TrainBoxes';

/**
 * STAGE 14 / Step 5B.2: overlap check between trains and the things the player controls or drives. Pure maths (oriented boxes, separating
 * axis test), NO damage: it only reports who touches which car, how deep, and how fast the train was going, so Step 6 / later stages can use it.
 */
export interface TrainEntity {
  id: string;
  kind: 'player' | 'vehicle';
  obb: Obb;
}

export interface TrainHit {
  train: number;
  car: number;
  entity: string;
  kind: 'player' | 'vehicle';
  /** How far the two shapes go into each other along the best separating axis (m, > 0). */
  depth: number;
  /** Speed of the train (m/s). */
  trainSpeed: number;
}

/** The player: an upright cylinder (feet at y, round) around the capsule. */
export function playerObb(x: number, feetY: number, z: number, radius: number, height: number): Obb {
  return { x, y: feetY + height / 2, z, hx: radius, hy: height / 2, hz: radius, ax: [1, 0, 0], ay: [0, 1, 0], az: [0, 0, 1], round: true };
}

/** A vehicle chassis from its position, yaw direction (forward unit vector in x / z) and half sizes (half.z is the half LENGTH, the way the chassis collider is built). */
export function vehicleObb(x: number, y: number, z: number, fx: number, fz: number, half: { x: number; y: number; z: number }): Obb {
  const l = Math.hypot(fx, fz) || 1;
  const f: V3 = [fx / l, 0, fz / l];
  return { x, y, z, hx: half.z, hy: half.y, hz: half.x, ax: f, ay: [0, 1, 0], az: [-f[2], 0, f[0]] };
}

const dot = (a: V3, b: V3): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];

/** A box against an upright cylinder: horizontal distance from the cylinder axis to the box rectangle, and the vertical overlap. */
function roundPenetration(box: Obb, cyl: Obb): number {
  const d: V3 = [cyl.x - box.x, cyl.y - box.y, cyl.z - box.z];
  const lx = dot(d, box.ax), ly = dot(d, box.ay), lz = dot(d, box.az);
  const vo = box.hy + cyl.hy - Math.abs(ly);
  if (vo <= 0) return 0;
  const cx = Math.max(-box.hx, Math.min(box.hx, lx)), cz = Math.max(-box.hz, Math.min(box.hz, lz));
  const dh = Math.hypot(lx - cx, lz - cz);
  if (dh >= cyl.hx) return 0;
  const hd = dh > 0 ? cyl.hx - dh : cyl.hx + Math.min(box.hx - Math.abs(lx), box.hz - Math.abs(lz));
  return Math.min(vo, hd);
}

/** Penetration depth (m) of two oriented boxes, 0 if they are apart (separating axis test, 15 axes). A `round` one is a cylinder. */
export function obbPenetration(a: Obb, b: Obb): number {
  if (b.round && !a.round) return roundPenetration(a, b);
  if (a.round && !b.round) return roundPenetration(b, a);
  const A = [a.ax, a.ay, a.az], B = [b.ax, b.ay, b.az];
  const ha = [a.hx, a.hy, a.hz], hb = [b.hx, b.hy, b.hz];
  const t: V3 = [b.x - a.x, b.y - a.y, b.z - a.z];
  const axes: V3[] = [...A, ...B];
  for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) {
    const c = cross(A[i], B[j]);
    const l = Math.hypot(c[0], c[1], c[2]);
    if (l > 1e-6) axes.push([c[0] / l, c[1] / l, c[2] / l]);
  }
  let best = Infinity;
  for (const ax of axes) {
    let ra = 0, rb = 0;
    for (let k = 0; k < 3; k++) {
      ra += ha[k] * Math.abs(dot(A[k], ax));
      rb += hb[k] * Math.abs(dot(B[k], ax));
    }
    const o = ra + rb - Math.abs(dot(t, ax));
    if (o <= 0) return 0;
    if (o < best) best = o;
  }
  return best === Infinity ? 0 : best;
}

/**
 * Every fixed step: which entity touches which car. Only trains within `reach` m of an entity are looked at. `onBegin` is called once when a
 * train / entity pair starts touching (edge-triggered); `hits` is the list of current touches.
 * A pair counts as "still touching" for `grace` checks after the last hit: a thin person can sit between two cars (0.8 m coupling gap) for a
 * frame or two while the train runs over him, and that must not end the contact and start a new one.
 */
export class TrainContacts {
  hits: TrainHit[] = [];
  /** Counters for tests / debug. */
  began = 0;
  /** pair key -> checks left before the contact counts as over. */
  private touching = new Map<string, number>();

  constructor(private trains: TrainManager, private onBegin?: (h: TrainHit) => void, private reach = 250, private grace = 30) {}

  check(entities: readonly TrainEntity[]): TrainHit[] {
    const hits: TrainHit[] = [];
    const seen = new Set<string>();
    if (entities.length) {
      for (const t of this.trains.trains) {
        let near = false;
        for (const e of entities) if (this.trains.distanceTo(t, e.obb.x, e.obb.z) < this.reach) { near = true; break; }
        if (!near) continue;
        const boxes: TrainBox[] = trainBoxes(t);
        for (const e of entities) {
          for (const bx of boxes) {
            // cheap reject: centres farther apart than the longest half size of the car plus the entity's radius
            const far = Math.hypot(bx.x - e.obb.x, bx.y - e.obb.y, bx.z - e.obb.z);
            if (far > bx.hx + Math.hypot(e.obb.hx, e.obb.hy, e.obb.hz) + 1) continue;
            const depth = obbPenetration(bx, e.obb);
            if (depth <= 0) continue;
            const h: TrainHit = { train: t.id, car: bx.car, entity: e.id, kind: e.kind, depth, trainSpeed: t.v };
            hits.push(h);
            const key = `${t.id}|${e.id}`;
            if (!seen.has(key)) {
              seen.add(key);
              if (!this.touching.has(key)) {
                this.began++;
                this.onBegin?.(h);
              }
            }
          }
        }
      }
    }
    // pairs that touched recently stay "touching" for `grace` checks
    for (const key of seen) this.touching.set(key, this.grace);
    for (const [key, left] of [...this.touching]) {
      if (seen.has(key)) continue;
      if (left <= 1) this.touching.delete(key);
      else this.touching.set(key, left - 1);
    }
    this.hits = hits;
    return hits;
  }
}
