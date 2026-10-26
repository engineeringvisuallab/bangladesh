// The army camp's place in the world + the level pad it needs (same idea as AirportSite). Pure numbers + one height function (worker safe).
import { ARMY_POS, createArmyPlan, armyToLocal, type ArmyPlan } from './ArmyPlan';

const SINK = 0.03;
const smoothstep = (a: number, b: number, x: number): number => {
  const t = x <= a ? 0 : x >= b ? 1 : (x - a) / (b - a);
  return t * t * (3 - 2 * t);
};

export class ArmySite {
  readonly plan: ArmyPlan = createArmyPlan();
  /** Floor height (m): the MEDIAN natural ground over the pad. Set once by the TerrainGenerator. */
  floorY = 0;

  /** World rectangle of the pad (heading 0: axis-aligned). */
  get rect(): { x0: number; x1: number; z0: number; z1: number } {
    const p = this.plan, cx = p.site.cx + p.pad.cx, cz = p.site.cz + p.pad.cz;
    return { x0: cx - p.pad.w / 2, x1: cx + p.pad.w / 2, z0: cz - p.pad.d / 2, z1: cz + p.pad.d / 2 };
  }

  private outside(x: number, z: number): number {
    const l = armyToLocal(this.plan.site, x, z), p = this.plan.pad;
    return Math.hypot(Math.max(0, Math.abs(l.x - p.cx) - p.w / 2), Math.max(0, Math.abs(l.z - p.cz) - p.d / 2));
  }

  /** True on the pad (+ margin): no trees, rocks or grass here. */
  contains(x: number, z: number, margin = 0): boolean {
    return this.outside(x, z) <= this.plan.pad.blend * 0.5 + margin;
  }

  near(x: number, z: number): boolean {
    return this.outside(x, z) < this.plan.pad.blend;
  }

  /** Level the ground: new height for natural height `h` at (x, z). `k` (0..1) weakens the pad where a road or the railway is. */
  height(x: number, z: number, h: number, k = 1): number {
    const d = this.outside(x, z), blend = this.plan.pad.blend;
    if (d >= blend) return h;
    const t = (1 - smoothstep(0, blend, d)) * k;
    return h + (this.floorY - SINK - h) * t;
  }
}

/** Local streets may not be planned on the camp (+ 30 m all round). */
let cachedPad: ArmyPlan['pad'] | null = null;
export function armyKeepout(x: number, z: number): boolean {
  const l = armyToLocal(ARMY_POS, x, z), p = (cachedPad ??= createArmyPlan().pad);
  return Math.abs(l.x - p.cx) <= p.w / 2 + 30 && Math.abs(l.z - p.cz) <= p.d / 2 + 30;
}
