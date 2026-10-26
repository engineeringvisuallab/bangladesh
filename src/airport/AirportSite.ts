// STAGE B: where an airport stands in the world, plus the level pad it needs.
// Pure numbers + one height function (no three.js / DOM), so the terrain generator and its worker can use it safely.
// Only the land the airport really needs is levelled: the module's own pad (runway, taxiway, apron, terminal, hangars, fence) + a soft skirt.
// TWO airports use this class: the old NE airport (AIRPORT_POS, on rolling land) and the SEA AIRPORT (SEA_AIRPORT_POS, on reclaimed land in the sea).
import { createAirportPlan, worldToLocal, type AirportPlan } from './AirportPlan';

/** Everything that places one airport. */
export interface AirportDef {
  cx: number;
  cz: number;
  /** 0: runway west-east, terminal + parking on the SOUTH side. PI: runway west-east, terminal + parking on the NORTH side. */
  heading: number;
  seed: number;
  /** Soft skirt (m) between the level pad and the natural ground. */
  blend: number;
  /** Lowest allowed floor height (m above sea level): the sea airport is filled up to this level. null = the median natural ground. */
  minFloor: number | null;
  /** Length (m) of the access causeway that continues the entrance road (0 = none) and the skirt (m) of that narrow strip. */
  causeway: number;
  causewayBlend: number;
  /** A military apron + shelters (see AirportPlan). */
  military: boolean;
}

/** The old airport: runway centre, heading 0 = runway runs west-east, terminal + parking on the SOUTH side (towards the railway station). */
export const AIRPORT_POS = { cx: 2500, cz: -4000, heading: 0, seed: 1 };
export const OLD_AIRPORT_DEF: AirportDef = { ...AIRPORT_POS, blend: 60, minFloor: null, causeway: 0, causewayBlend: 30, military: false };

/**
 * The SEA AIRPORT: reclaimed land in the sea just south of the south coast, between the island and the seaport (~3.7 km from the city centre).
 * Heading PI: the runway still runs west-east but the terminal, parking and causeway road face NORTH, towards the shore.
 */
export const SEA_AIRPORT_POS = { cx: 180, cz: 3670, heading: Math.PI, seed: 2 };
/** Height (m above sea level) of the reclaimed platform and its causeway. */
export const SEA_AIRPORT_FLOOR = 5;
export const SEA_AIRPORT_DEF: AirportDef = { ...SEA_AIRPORT_POS, blend: 80, minFloor: SEA_AIRPORT_FLOOR, causeway: 250, causewayBlend: 30, military: true };

/** The pad is sunk a little so the pavement (0.04+ m above the floor) never floats above the ground. */
export const AIRPORT_PAD_SINK = 0.03;

const smoothstep = (a: number, b: number, x: number): number => {
  const t = x <= a ? 0 : x >= b ? 1 : (x - a) / (b - a);
  return t * t * (3 - 2 * t);
};

export const airportPlanOf = (d: AirportDef): AirportPlan => createAirportPlan({ cx: d.cx, cz: d.cz, heading: d.heading, groundY: 0, seed: d.seed, causeway: d.causeway, military: d.military });

export class AirportSite {
  /** The layout (groundY is 0 here: the model is lifted to `floorY` when it is placed). */
  readonly plan: AirportPlan;
  /** Floor height (m): the MEDIAN natural ground over the pad (never below def.minFloor). Set once by the TerrainGenerator. */
  floorY = 0;

  constructor(readonly def: AirportDef = OLD_AIRPORT_DEF) {
    this.plan = airportPlanOf(def);
    if (def.minFloor !== null) this.floorY = def.minFloor;
  }

  /** World rectangle of the pad (heading 0 or PI, so it is axis-aligned). */
  get rect(): { x0: number; x1: number; z0: number; z1: number } {
    const p = this.plan.pad;
    return { x0: p.worldX - p.w / 2, x1: p.worldX + p.w / 2, z0: p.worldZ - p.d / 2, z1: p.worldZ + p.d / 2 };
  }

  /** Distance outside the pad rectangle (0 inside). */
  private outside(x: number, z: number): number {
    const l = worldToLocal(this.plan.site, x, z);
    const dx = Math.max(0, Math.abs(l.x - this.plan.pad.cx) - this.plan.pad.w / 2);
    const dz = Math.max(0, Math.abs(l.z - this.plan.pad.cz) - this.plan.pad.d / 2);
    return Math.hypot(dx, dz);
  }

  /** Distance outside the causeway strip (0 inside); a big number when there is no causeway. */
  private outsideCauseway(x: number, z: number): number {
    const c = this.plan.causeway;
    if (c.z1 <= c.z0) return 1e9;
    const l = worldToLocal(this.plan.site, x, z);
    return Math.hypot(Math.max(0, c.x0 - l.x, l.x - c.x1), Math.max(0, c.z0 - l.z, l.z - c.z1));
  }

  /** True on the pad or the causeway (+ margin): no trees, rocks or grass here. */
  contains(x: number, z: number, margin = 0): boolean {
    return this.outside(x, z) <= this.def.blend * 0.5 + margin || this.outsideCauseway(x, z) <= this.def.causewayBlend * 0.5 + margin;
  }

  /** Cheap pre-check: on the pad / causeway or their skirts? */
  near(x: number, z: number): boolean {
    return this.outside(x, z) < this.def.blend || this.outsideCauseway(x, z) < this.def.causewayBlend;
  }

  /** Level the ground: new height for ground height `h` at (x, z). `k` (0..1) weakens the pad where a road is. */
  height(x: number, z: number, h: number, k = 1): number {
    const d = this.outside(x, z), dc = this.outsideCauseway(x, z);
    if (d >= this.def.blend && dc >= this.def.causewayBlend) return h;
    const t = Math.max(1 - smoothstep(0, this.def.blend, d), 1 - smoothstep(0, this.def.causewayBlend, dc)) * k;
    return h + (this.floorY - AIRPORT_PAD_SINK - h) * t;
  }
}

function keepoutOf(plan: AirportPlan, x: number, z: number): boolean {
  const l = worldToLocal(plan.site, x, z);
  const p = plan.pad, c = plan.causeway;
  if (Math.abs(l.x - p.cx) <= p.w / 2 + 30 && Math.abs(l.z - p.cz) <= p.d / 2 + 30) return true;
  return c.z1 > c.z0 && l.x >= c.x0 - 30 && l.x <= c.x1 + 30 && l.z >= c.z0 - 30 && l.z <= c.z1 + 30;
}

let oldPlan: AirportPlan | null = null;
let seaPlan: AirportPlan | null = null;

/** Local streets (LocalRoads) may not be planned on the old airport (+ 30 m all round). Main roads are never touched. */
export function airportKeepout(x: number, z: number): boolean {
  return keepoutOf((oldPlan ??= airportPlanOf(OLD_AIRPORT_DEF)), x, z);
}

/** Same for the sea airport and its causeway. */
export function seaAirportKeepout(x: number, z: number): boolean {
  return keepoutOf((seaPlan ??= airportPlanOf(SEA_AIRPORT_DEF)), x, z);
}
