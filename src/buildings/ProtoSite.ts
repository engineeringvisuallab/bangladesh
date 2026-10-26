// Where the prototype building (the police station / thana) stands in the world, plus the flat building pad it needs.
// Pure numbers + one height function (no three.js / DOM), so the terrain generator and its worker can use it safely.
// Same idea as LibrarySite: to MOVE or RESIZE the building later, only the numbers in this file change.
const smoothstep = (a: number, b: number, x: number): number => {
  const t = x <= a ? 0 : x >= b ? 1 : (x - a) / (b - a);
  return t * t * (3 - 2 * t);
};

/** Which model of src/buildings/models/registry.ts stands here. Change this id to try another building on the same plot (keep it <= 70 x 62 m). */
export const PROTO_MODEL_ID = 'police_station';

/** Footprint of the model incl. its walled compound (metres). Police station = 54 x 46. */
export const PROTO_SIZE = { W: 54, D: 46 };

/**
 * The plot = the open grass field SOUTH of the F6 road (the road running west from the spawn crossing) and WEST of the F5 road
 * (the one running south from the crossing). Level, nearly empty land, mirror image of the library on the other side of the crossing.
 * Level, paved rectangle: the compound stands in the middle (8 m apron all round), a footpath joins the gate to the F6 road edge.
 * No trees, rocks, grass or local streets inside. World metres (x = east, z = south).
 */
export const PROTO_PLOT = { x0: -107, x1: -37, z0: 19, z1: 81 };

/** Centre of the compound (local origin = compound centre on the ground). The gate is on the model's local +z side; yaw = PI turns it to the NORTH (the F6 road). */
export const PROTO_POS = { x: -72, z: 50, yaw: Math.PI };

/** Footpath from the gate to the road edge (a strip north of the plot): centre x, half width, and the z of its road end. */
export const PROTO_PATH = { x: -72, halfWidth: 3.5, z0: 9.5 };

/** Soft blend (m) from the level plot back to natural terrain, and the zone local streets keep out of. */
const BLEND = 10;
const STREET_KEEPOUT = 30;
/** The terrain pad is slightly BELOW the floor, so the floor never z-fights with the ground. */
export const PROTO_PAD_SINK = 0.03;

export class ProtoSite {
  readonly x = PROTO_POS.x;
  readonly z = PROTO_POS.z;
  readonly yaw = PROTO_POS.yaw;
  /** Floor height (m). Set once from the natural ground (see TerrainGenerator). */
  floorY = 0;

  /** Distance outside the pad (plot rectangle + footpath strip), 0 inside. Yaw is PI, so everything is axis-aligned. */
  private outside(x: number, z: number): number {
    const P = PROTO_PLOT;
    const dx = Math.max(P.x0 - x, x - P.x1, 0);
    const dz = Math.max(P.z0 - z, z - P.z1, 0);
    const rect = Math.hypot(dx, dz);
    const px = Math.max(Math.abs(x - PROTO_PATH.x) - PROTO_PATH.halfWidth, 0);
    const pz = Math.max(PROTO_PATH.z0 - z, z - (P.z0 + 1), 0);
    return Math.min(rect, Math.hypot(px, pz));
  }

  /** True if (x, z) is on the plot (+ margin): no trees, rocks or grass here. */
  contains(x: number, z: number, margin = 0): boolean {
    return this.outside(x, z) <= BLEND * 0.5 + margin;
  }

  /** Strictly inside the plot rectangle (HUD area label). */
  onPlot(x: number, z: number): boolean {
    const P = PROTO_PLOT;
    return x >= P.x0 && x <= P.x1 && z >= P.z0 && z <= P.z1;
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
    return h + (this.floorY - PROTO_PAD_SINK - h) * t;
  }
}

/** Local streets (LocalRoads) may not be planned on the plot (+ 30 m all round). Main roads are never touched. */
export function protoKeepout(x: number, z: number): boolean {
  const P = PROTO_PLOT;
  return x >= P.x0 - STREET_KEEPOUT && x <= P.x1 + STREET_KEEPOUT && z >= P.z0 - STREET_KEEPOUT && z <= P.z1 + STREET_KEEPOUT;
}
