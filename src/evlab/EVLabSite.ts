// Where EVLab stands in the world, the big level plot it needs, and the zone that local streets keep out of.
// Pure numbers + a few functions (no three.js / DOM), so the terrain generator, the road planner and their workers can use it.
const smoothstep = (a: number, b: number, x: number): number => {
  const t = x <= a ? 0 : x >= b ? 1 : (x - a) / (b - a);
  return t * t * (3 - 2 * t);
};

/**
 * The EVLab plot = the whole flat basin WEST of the F4 road and NORTH of the F6 highway (the "Evlab" area drawn on the screenshot).
 * It is a fenced, perfectly level rectangle of 480 x 440 m (world metres). The F4 road, the F6 highway and the foothills of the north-west
 * hem the basin in, so this is the biggest rectangle that fits on level ground without touching a main road.
 *
 * The full campus is 600 x 600 m, which is bigger than the basin, so it is built at EVLAB_SCALE and stands in the middle of the plot;
 * the strip of the plot around it is just empty, fenced, level ground (room to grow). The fence is the plot boundary.
 */
export const EVLAB_PLOT = { x0: -520, x1: -40, z0: -470, z1: -30 };

/**
 * The fenced boundary of the EVLAB area (world metres [x, z], closed polygon): it follows the F4 road on the north, the F6 highway on the
 * south, the arterials on the west and keeps clear of the parking lots beside it. Only the FENCE grows - the campus, the level pad and
 * the street keep-out zone stay exactly as before.
 */
export const EVLAB_FENCE: ReadonlyArray<readonly [number, number]> = [
  [131.6, -643.5],
  [140.9, -606.8],
  [136.9, -565.4],
  [73.2, -341.6],
  [58.4, -296.4],
  [39.1, -254.2],
  [-5.9, -193.4],
  [-32.8, -105.0],
  [-33, -34.9],
  [-50.0, -21],
  [-248.9, -18.2],
  [-511.0, -21],
  [-529, -35.5],
  [-567.6, -90.5],
  [-610.3, -139.2],
  [-663.4, -197.6],
  [-693.9, -248.6],
  [-701.8, -276.4],
  [-704.1, -305.3],
  [-692.9, -363.0],
  [-665.3, -416.3],
  [-627.6, -465.8],
  [-494.9, -614.8],
  [-434.5, -669.3],
  [-393.9, -692.2],
  [-333.9, -706.9],
  [-21.7, -703.1],
  [39.4, -697.2],
  [82.1, -685.2],
  [116.5, -663.5],
];

/** True inside the closed EVLAB_FENCE polygon. */
export function insideFence(x: number, z: number): boolean {
  let inn = false;
  const P = EVLAB_FENCE;
  for (let i = 0, j = P.length - 1; i < P.length; j = i++) {
    const [xi, zi] = P[i], [xj, zj] = P[j];
    if (zi > z !== zj > z && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) inn = !inn;
  }
  return inn;
}

/** Campus scale: 600 m x 0.7 = 420 m, which fits inside the plot's shorter side (440 m). */
export const EVLAB_SCALE = 0.7;

/** Centre of the plot = centre of the campus (the Central Hub). Yaw 0: the gate is on the SOUTH side (+z), facing the F6 highway. */
export const EVLAB_POS = { x: (EVLAB_PLOT.x0 + EVLAB_PLOT.x1) / 2, z: (EVLAB_PLOT.z0 + EVLAB_PLOT.z1) / 2, yaw: 0 };

/** Half sizes of the fenced plot in WORLD metres (x = east-west, z = north-south). */
export const EVLAB_HALF_X = (EVLAB_PLOT.x1 - EVLAB_PLOT.x0) / 2; // 240
export const EVLAB_HALF_Z = (EVLAB_PLOT.z1 - EVLAB_PLOT.z0) / 2; // 220
/** The same half sizes in the campus' own (unscaled) local metres: pass them to `new EVLab({ halfX, halfZ })`. */
export const EVLAB_LOCAL_HALF_X = EVLAB_HALF_X / EVLAB_SCALE;
export const EVLAB_LOCAL_HALF_Z = EVLAB_HALF_Z / EVLAB_SCALE;

/** Access road from the gate to the F6 highway: half width (m) and the z where it meets F6's edge. */
export const EVLAB_ROAD = { halfWidth: 8, endZ: -7 };

const FLAT_MARGIN = 4; // level ground outside the fence
const BLEND = 48; // soft blend back to natural terrain (the north-west corner climbs into the foothills)
/** Flat strip under the access road (half width, m). */
const ROAD_FLAT = 14;
/** The terrain pad is slightly BELOW the floor, so the floor tiles never z-fight with the ground. */
export const EVLAB_PAD_SINK = 0.03;
/** Local streets stay this far (m) away from the fence. */
const STREET_KEEPOUT = 30;

export class EVLabSite {
  readonly x = EVLAB_POS.x;
  readonly z = EVLAB_POS.z;
  readonly yaw = EVLAB_POS.yaw;
  readonly halfX = EVLAB_HALF_X;
  readonly halfZ = EVLAB_HALF_Z;
  /** Floor height (m). Set once from the natural ground (see TerrainGenerator). */
  floorY = 0;

  /** z of the gate (south fence). */
  get gateZ(): number {
    return this.z + this.halfZ;
  }

  /** Distance outside the plot pad (rectangle + access road strip), 0 inside. Yaw is 0, so everything is axis-aligned. */
  private outside(x: number, z: number): number {
    const dx = Math.max(Math.abs(x - this.x) - (this.halfX + FLAT_MARGIN), 0);
    const dz = Math.max(Math.abs(z - this.z) - (this.halfZ + FLAT_MARGIN), 0);
    const sq = Math.hypot(dx, dz);
    // access road strip: from the south fence to F6
    const rx = Math.max(Math.abs(x - this.x) - ROAD_FLAT, 0);
    const z0 = this.gateZ - 2;
    const z1 = EVLAB_ROAD.endZ + 2;
    const rz = Math.max(z0 - z, z - z1, 0);
    return Math.min(sq, Math.hypot(rx, rz));
  }

  /** True if (x, z) is on the plot (+ margin): no trees, rocks or grass here. */
  contains(x: number, z: number, margin = 0): boolean {
    return this.outside(x, z) <= BLEND * 0.5 + margin;
  }

  /** Inside the fenced rectangle (fence line included; `margin` < 0 = further inside). */
  inside(x: number, z: number, margin = 0): boolean {
    if (Math.abs(x - this.x) <= this.halfX + margin && Math.abs(z - this.z) <= this.halfZ + margin) return true;
    return margin >= 0 && insideFence(x, z);
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
    return h + (this.floorY - EVLAB_PAD_SINK - h) * t;
  }
}

/**
 * Local streets (LocalRoads) may not be planned here: the whole plot + 30 m all round, and the strip of the access road.
 * This is what "removes" the street grid that was planned on the site. Main roads (highways, arterials) are never touched.
 */
export function evlabKeepout(x: number, z: number): boolean {
  if (Math.abs(x - EVLAB_POS.x) <= EVLAB_HALF_X + STREET_KEEPOUT && Math.abs(z - EVLAB_POS.z) <= EVLAB_HALF_Z + STREET_KEEPOUT) return true;
  const w = EVLAB_ROAD.halfWidth + 22;
  return Math.abs(x - EVLAB_POS.x) <= w && z >= EVLAB_POS.z + EVLAB_HALF_Z - 1 && z <= EVLAB_ROAD.endZ + 1;
}
