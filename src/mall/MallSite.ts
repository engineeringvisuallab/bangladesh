// Where City Mall stands in the world, plus the flat building pad (and paved plaza) it needs.
// Pure numbers + one height function (no three.js / DOM), so the terrain generator and its worker can use it safely.
import { parkingContains } from '../parking/ParkingSite';
const smoothstep = (a: number, b: number, x: number): number => {
  const t = x <= a ? 0 : x >= b ? 1 : (x - a) / (b - a);
  return t * t * (3 - 2 * t);
};

/** The shopping block inside the hall (metres): corridor, shops, atrium. MallBuilder's MALL.W / MALL.D come from here, so they can never disagree. */
export const MALL_SIZE = { W: 96, D: 64 };
/** ONE floor, 14 m high (= the old two 7 m storeys put together): an empty glass hall. */
export const MALL_FLOORS = 1;
export const MALL_FH = 14;

/**
 * The mall plot = the open wedge of grass in the CORNER between the F4 road (west side), the F7 road (south side) and the railway
 * viaduct (east side), right beside the spawn crossing. The outline follows the road edges (kept ~4 m clear of the road shoulder, ~10 m
 * from the viaduct), so the plot's border curves/bends with the roads. Everything inside is level: no trees, rocks, grass or local
 * streets. The glass building stands inside it; the rest is a paved plaza (MallManager draws it).
 * Vertices are world metres (x, z), going round the plot once. (Generated from the real road network: scripts/mall-outline.ts.)
 */
export const MALL_POLY: ReadonlyArray<readonly [number, number]> = [
  [42, -13.2], [31.2, -13.2], [26.5, -13.8], [22.2, -15.6], [18.5, -18.5], [15.6, -22.2], [13.8, -26.5], [13.2, -31.2], [13, -42], [12, -55], [13, -60.5], [28, -88.5], [48.5, -148], [57, -170], [62, -175], [160.5, -175], [155.5, -147], [143, -81], [135, -46.5], [133, -43], [88.5, -28], [60.5, -13], [55, -12],
];

/**
 * The building outline (world metres, x / z): the same bends as the roads, ~3 m inside the plot. The WHOLE outline is a glass curtain wall.
 * It is NOT a rectangle: it follows F4 on the west, F7 on the south and the viaduct on the east.
 */
export const MALL_BUILDING: ReadonlyArray<readonly [number, number]> = [
  [47, -16.2], [31.2, -16.2], [27.3, -16.7], [23.7, -18.2], [20.6, -20.6], [18.2, -23.7], [16.7, -27.3], [16.2, -31.2], [16.5, -47], [15, -56], [19.5, -67.5], [31, -88.5], [48.5, -140], [59.8, -168.9], [64, -172], [157, -172], [152.5, -143.5], [151, -135.5], [132.5, -48.5], [130, -45.5], [88.5, -31], [67.5, -19.5], [56, -15],
];

/** Bounding box of the plot (handy for tests and quick rejects). */
export const MALL_PLOT = (() => {
  let x0 = 1e9, x1 = -1e9, z0 = 1e9, z1 = -1e9;
  for (const [x, z] of MALL_POLY) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); z0 = Math.min(z0, z); z1 = Math.max(z1, z); }
  return { x0, x1, z0, z1 };
})();

/**
 * Centre + turn of the shopping block. The block is turned a little (yaw) so it sits inside the bent outline with a few metres to spare
 * on every side; its west + east end walls hold the entrances. World = centre + R(yaw) * local: x_w = x c + z s, z_w = -x s + z c.
 */
export const MALL_POS = { x: 88, z: -91, yaw: -0.24 };

/** World -> the block's local x / z (the inverse of the group's own yaw turn). */
export function mallToLocal(wx: number, wz: number, out: { x: number; z: number } = { x: 0, z: 0 }): { x: number; z: number } {
  const dx = wx - MALL_POS.x, dz = wz - MALL_POS.z, c = Math.cos(MALL_POS.yaw), s = Math.sin(MALL_POS.yaw);
  out.x = dx * c - dz * s;
  out.z = dx * s + dz * c;
  return out;
}
/** The block's local x / z -> world. */
export function mallToWorld(lx: number, lz: number, out: { x: number; z: number } = { x: 0, z: 0 }): { x: number; z: number } {
  const c = Math.cos(MALL_POS.yaw), s = Math.sin(MALL_POS.yaw);
  out.x = MALL_POS.x + lx * c + lz * s;
  out.z = MALL_POS.z - lx * s + lz * c;
  return out;
}

/** The building outline in the block's local coordinates (what MallBuilder uses). */
export const MALL_BUILDING_LOCAL: ReadonlyArray<readonly [number, number]> = MALL_BUILDING.map(([x, z]) => {
  const l = mallToLocal(x, z);
  return [l.x, l.z] as const;
});

/**
 * The two entrances: the corridor's axis (local z = 0) meets the glass wall at the west (side -1) and the east (side +1). `lx` is where
 * (local), `x`/`z` the same point in world metres.
 */
export const MALL_DOORS: ReadonlyArray<{ side: -1 | 1; lx: number; x: number; z: number }> = ([-1, 1] as const).map((side) => {
  let best = side * 1e9;
  const P = MALL_BUILDING_LOCAL;
  for (let i = 0, j = P.length - 1; i < P.length; j = i++) {
    const [x1, z1] = P[j], [x2, z2] = P[i];
    if ((z1 > 0) === (z2 > 0)) continue;
    const x = x1 + ((0 - z1) / (z2 - z1)) * (x2 - x1);
    if (side * x > MALL_SIZE.W / 2 && (side * best > 1e8 || side * x < side * best)) best = x;
  }
  const w = mallToWorld(best, 0);
  return { side, lx: best, x: w.x, z: w.z };
});

/** Soft blend (m) from the level plot back to natural terrain, and the zone local streets keep out of. */
const BLEND = 16;
const STREET_KEEPOUT = 30;
/** The terrain pad is slightly BELOW the floor, so the floor tiles never z-fight with the ground. */
export const PAD_SINK = 0.03;

/** Distance from (x, z) to the plot polygon: 0 inside, else the distance to the nearest edge. */
function distToPlot(x: number, z: number): number {
  // quick reject: far outside the bounding box
  const bx = Math.max(MALL_PLOT.x0 - x, x - MALL_PLOT.x1, 0), bz = Math.max(MALL_PLOT.z0 - z, z - MALL_PLOT.z1, 0);
  if (bx > BLEND + 1 || bz > BLEND + 1) return Math.hypot(bx, bz);
  let inside = false, best = Infinity;
  const n = MALL_POLY.length;
  for (let i = 0, j = n - 1; i < n; j = i++) {
    const [xi, zi] = MALL_POLY[i], [xj, zj] = MALL_POLY[j];
    if ((zi > z) !== (zj > z) && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) inside = !inside;
    const ex = xi - xj, ez = zi - zj;
    const t = Math.max(0, Math.min(1, ((x - xj) * ex + (z - zj) * ez) / (ex * ex + ez * ez)));
    best = Math.min(best, Math.hypot(x - (xj + t * ex), z - (zj + t * ez)));
  }
  return inside ? 0 : best;
}

export class MallSite {
  readonly x = MALL_POS.x;
  readonly z = MALL_POS.z;
  readonly yaw = MALL_POS.yaw;
  /** Floor height (m). Set once from the natural ground (see TerrainGenerator). */
  floorY = 0;

  /** True if (x, z) is on the mall plot (+ margin): no trees, rocks or grass here. */
  contains(x: number, z: number, margin = 0): boolean {
    return distToPlot(x, z) <= BLEND * 0.5 + margin || parkingContains(x, z, margin); // + the two parking lots across F4
  }

  /** Inside the building outline (glass walls included). margin > 0 grows it, margin < 0 shrinks it. */
  inside(x: number, z: number, margin = 0): boolean {
    const P = MALL_BUILDING;
    let inn = false, best = Infinity;
    for (let i = 0, j = P.length - 1; i < P.length; j = i++) {
      const [xi, zi] = P[i], [xj, zj] = P[j];
      if ((zi > z) !== (zj > z) && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) inn = !inn;
      if (margin !== 0) {
        const ex = xi - xj, ez = zi - zj;
        const t = Math.max(0, Math.min(1, ((x - xj) * ex + (z - zj) * ez) / (ex * ex + ez * ez)));
        best = Math.min(best, Math.hypot(x - (xj + t * ex), z - (zj + t * ez)));
      }
    }
    if (margin === 0) return inn;
    return inn ? best >= -margin : best <= margin;
  }

  /** On the level plot itself (not just its blend skirt). */
  onPlot(x: number, z: number): boolean {
    return distToPlot(x, z) === 0;
  }

  /** Cheap pre-check: is (x, z) on the pad or its blend skirt? */
  near(x: number, z: number): boolean {
    return distToPlot(x, z) < BLEND;
  }

  /** Flatten the ground: returns the new height for ground height `h` at (x, z). `k` (0..1) weakens the pad where a road is. */
  height(x: number, z: number, h: number, k = 1): number {
    const d = distToPlot(x, z);
    if (d >= BLEND) return h;
    const t = (1 - smoothstep(0, BLEND, d)) * k;
    return h + (this.floorY - PAD_SINK - h) * t;
  }
}

/**
 * Local streets (LocalRoads) may not be planned on the mall plot (+ 30 m all round). Main roads are never touched.
 * The first version of the mall stood further east (x -4..235, z -205..6 with the keep-out margin); that old zone stays closed as well,
 * so the local street network - and the railway planned around it - is exactly the same as before the mall was reshaped.
 */
export function mallKeepout(x: number, z: number): boolean {
  if (x >= -4 && x <= 235 && z >= -205 && z <= 6) return true;
  return x >= MALL_PLOT.x0 - STREET_KEEPOUT && x <= MALL_PLOT.x1 + STREET_KEEPOUT && z >= MALL_PLOT.z0 - STREET_KEEPOUT && z <= MALL_PLOT.z1 + STREET_KEEPOUT;
}
