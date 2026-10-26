// Where the EV Agro Research Institute stands in the world, plus the level pad it needs.
// Pure numbers + one height function (no three.js / DOM), so the terrain generator and its worker can use it safely.
//
// LOCATION: the west farmland (zone 'west-farms'), ~3 km west of the spawn crossing. The land there is the flattest dry farmland of the
// whole map (about +-5 m over the pad, no river, no lake, no road or railway within 40 m). Found by scripts/agro-site-test.ts's search.
//
// LOCAL FRAME (heading 0, so the pad is axis-aligned): x = east, z = SOUTH. Origin = centre of the institute building.
//   - building 120 x 80 m (x -60..60, z -40..40), entrance side + driveway + EV parking to the SOUTH (z 40..100)
//   - research field to the EAST (x 60..230, z -75..75): shade houses, open plots, pond
const smoothstep = (a: number, b: number, x: number): number => {
  const t = x <= a ? 0 : x >= b ? 1 : (x - a) / (b - a);
  return t * t * (3 - 2 * t);
};

/** Centre of the institute building (world metres). Same turn as the world: the building faces SOUTH. */
export const AGRO_POS = { x: -3000, z: -910 };
/** The levelled rectangle in the institute's local frame (m): building + field + driveway/parking. */
export const AGRO_PAD = { x0: -65, x1: 235, z0: -80, z1: 105 };
/** The building itself (local half sizes, m) - AgroRooms.FOOT.hx / hz. */
export const AGRO_BUILDING = { hx: 60, hz: 40 };
/** The soft skirt (m) between the level pad and the natural ground. */
const BLEND = 40;
/** The pad is sunk a little so the floor planes (0.005+ m above the floor) never float above the ground. */
export const AGRO_PAD_SINK = 0.03;

export class AgroSite {
  /** Floor height (m): the MEDIAN natural ground over the pad. Set once by the TerrainGenerator. */
  floorY = 0;
  readonly x = AGRO_POS.x;
  readonly z = AGRO_POS.z;

  /** World rectangle of the pad. */
  get rect(): { x0: number; x1: number; z0: number; z1: number } {
    return { x0: this.x + AGRO_PAD.x0, x1: this.x + AGRO_PAD.x1, z0: this.z + AGRO_PAD.z0, z1: this.z + AGRO_PAD.z1 };
  }

  /** Distance outside the pad rectangle (0 inside). */
  private outside(x: number, z: number): number {
    const dx = Math.max(0, AGRO_PAD.x0 - (x - this.x), (x - this.x) - AGRO_PAD.x1);
    const dz = Math.max(0, AGRO_PAD.z0 - (z - this.z), (z - this.z) - AGRO_PAD.z1);
    return Math.hypot(dx, dz);
  }

  /** True on the pad (+ margin): no trees, rocks or grass here. */
  contains(x: number, z: number, margin = 0): boolean {
    return this.outside(x, z) <= BLEND * 0.5 + margin;
  }

  /** Strictly on the levelled rectangle (the HUD area label and the pointer logic use this one). */
  inside(x: number, z: number, margin = 0): boolean {
    return this.outside(x, z) <= margin;
  }

  /** Inside the walls of the institute building (x / z only). */
  inBuilding(x: number, z: number, margin = 0): boolean {
    return Math.abs(x - this.x) <= AGRO_BUILDING.hx + margin && Math.abs(z - this.z) <= AGRO_BUILDING.hz + margin;
  }

  /** Cheap pre-check: on the pad or its skirt? */
  near(x: number, z: number): boolean {
    return this.outside(x, z) < BLEND;
  }

  /** Level the ground: new height for ground height `h` at (x, z). `k` (0..1) weakens the pad where a road is. */
  height(x: number, z: number, h: number, k = 1): number {
    const d = this.outside(x, z);
    if (d >= BLEND) return h;
    const t = (1 - smoothstep(0, BLEND, d)) * k;
    return h + (this.floorY - AGRO_PAD_SINK - h) * t;
  }
}

/** Local streets (LocalRoads) may not be planned on the institute (+ 30 m all round). Main roads are never touched. */
export function agroKeepout(x: number, z: number): boolean {
  return x >= AGRO_POS.x + AGRO_PAD.x0 - 30 && x <= AGRO_POS.x + AGRO_PAD.x1 + 30 && z >= AGRO_POS.z + AGRO_PAD.z0 - 30 && z <= AGRO_POS.z + AGRO_PAD.z1 + 30;
}
