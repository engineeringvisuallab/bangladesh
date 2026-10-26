// Where the City Library stands in the world, plus the flat building pad (and paved forecourt) it needs.
// Pure numbers + one height function (no three.js / DOM), so the terrain generator and its worker can use it safely.
const smoothstep = (a: number, b: number, x: number): number => {
  const t = x <= a ? 0 : x >= b ? 1 : (x - a) / (b - a);
  return t * t * (3 - 2 * t);
};

/** Footprint of the library hall (metres). Same numbers as CityLibrary.HALF_X / HALF_Z (x2). */
export const LIBRARY_SIZE = { W: 40, D: 32 };

/**
 * The library plot = the open grass field SOUTH of the F7 road (the road east of the spawn crossing) and WEST of the railway viaduct
 * (the area circled red on the screenshot). It is a level, paved rectangle: the hall stands in the middle, the forecourt in front of the
 * door faces the road, and a footpath joins the forecourt to the road edge. Everything inside is level: no trees, rocks, grass or local streets.
 * World metres (x = east, z = south). The viaduct is ~50 m away to the east, the F5 road ~35 m to the west.
 */
export const LIBRARY_PLOT = { x0: 34, x1: 98, z0: 22, z1: 86 };

/**
 * Centre of the hall (local origin = hall centre on the floor). The door is on the hall's local +z wall.
 * yaw = PI turns the door to the NORTH, towards the F7 road and the spawn crossing.
 */
export const LIBRARY_POS = { x: 66, z: 56, yaw: Math.PI };

/** Footpath from the forecourt to the road edge (a strip in front of the door): centre x, half width, and the z of its road end. */
export const LIBRARY_PATH = { x: 66, halfWidth: 5, z0: 9.5 };

/** Soft blend (m) from the level plot back to natural terrain, and the zone local streets keep out of. */
const BLEND = 10;
const STREET_KEEPOUT = 30;
/** The terrain pad is slightly BELOW the floor, so the floor tiles never z-fight with the ground. */
export const LIBRARY_PAD_SINK = 0.03;

export class LibrarySite {
  readonly x = LIBRARY_POS.x;
  readonly z = LIBRARY_POS.z;
  readonly yaw = LIBRARY_POS.yaw;
  /** Floor height (m). Set once from the natural ground (see TerrainGenerator). */
  floorY = 0;

  /** Distance outside the pad (plot rectangle + footpath strip), 0 inside. Yaw is PI, so everything is axis-aligned. */
  private outside(x: number, z: number): number {
    const P = LIBRARY_PLOT;
    const dx = Math.max(P.x0 - x, x - P.x1, 0);
    const dz = Math.max(P.z0 - z, z - P.z1, 0);
    const rect = Math.hypot(dx, dz);
    const px = Math.max(Math.abs(x - LIBRARY_PATH.x) - LIBRARY_PATH.halfWidth, 0);
    const pz = Math.max(LIBRARY_PATH.z0 - z, z - (P.z0 + 1), 0);
    return Math.min(rect, Math.hypot(px, pz));
  }

  /** True if (x, z) is on the plot (+ margin): no trees, rocks or grass here. */
  contains(x: number, z: number, margin = 0): boolean {
    return this.outside(x, z) <= BLEND * 0.5 + margin;
  }

  /** Inside the building itself (walls included). The hall is symmetric, so the yaw does not matter for this test. */
  inside(x: number, z: number, margin = 0): boolean {
    return Math.abs(x - this.x) <= LIBRARY_SIZE.W / 2 + margin && Math.abs(z - this.z) <= LIBRARY_SIZE.D / 2 + margin;
  }

  /** Cheap pre-check: is (x, z) on the pad or its blend skirt? */
  near(x: number, z: number): boolean {
    return this.outside(x, z) < BLEND;
  }

  /** Flatten the ground: returns the new height for ground height `h` at (x, z). `k` (0..1) weakens the pad where a road is. */
  height(x: number, z: number, h: number, k = 1): number {
    const d = this.outside(x, z);
    if (d >= BLEND) return h;
    const t = (1 - smoothstep(0, BLEND, d)) * k;
    return h + (this.floorY - LIBRARY_PAD_SINK - h) * t;
  }
}

/** Local streets (LocalRoads) may not be planned on the library plot (+ 30 m all round). Main roads are never touched. */
export function libraryKeepout(x: number, z: number): boolean {
  const P = LIBRARY_PLOT;
  return x >= P.x0 - STREET_KEEPOUT && x <= P.x1 + STREET_KEEPOUT && z >= P.z0 - STREET_KEEPOUT && z <= P.z1 + STREET_KEEPOUT;
}
