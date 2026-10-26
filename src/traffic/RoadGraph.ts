import type { RoadNetwork } from '../roads';
import type { RoadSpec } from '../roads';

export interface RoadPoint {
  x: number;
  z: number;
  y: number;
  /** Unit heading of the requested travel direction. */
  hx: number;
  hz: number;
}

export interface Station {
  /** Distance along the road (m) of the junction pad centre. */
  s: number;
  pad: number;
}

/**
 * Walking / driving helper on top of the road splines: position at distance s along a road,
 * lane offset (left-hand traffic, as in Bangladesh) and the junction "stations" where a road meets a pad.
 * Pure functions of the (already built) RoadNetwork - no state, no physics.
 */
export class RoadGraph {
  readonly roads: RoadSpec[];
  private stationsByRoad: Station[][];
  private armsByPad: { roadId: number; s: number }[][] = [];
  private cumLen: number[] = [];
  totalLength = 0;
  /** Sample spots every ~30 m along every road: lets us find "a road 110-260 m from the player" without scanning splines. */
  private spotX: number[] = [];
  private spotZ: number[] = [];
  private spotRoad: number[] = [];
  private spotS: number[] = [];

  constructor(readonly net: RoadNetwork) {
    this.roads = net.roads;
    this.stationsByRoad = this.roads.map(() => []);
    for (let p = 0; p < net.pads.length; p++) {
      const pad = net.pads[p];
      const seen = new Set<number>();
      const arms: { roadId: number; s: number }[] = [];
      for (const a of pad.arms) {
        if (seen.has(a.roadId)) continue;
        seen.add(a.roadId);
        const r = this.roads[a.roadId];
        if (!r) continue;
        let bi = 0;
        let bd = Infinity;
        for (let i = 0; i < r.xs.length; i++) {
          const d = Math.hypot(r.xs[i] - pad.x, r.zs[i] - pad.z);
          if (d < bd) {
            bd = d;
            bi = i;
          }
        }
        if (bd > 30) continue;
        const s = r.cum[bi];
        this.stationsByRoad[a.roadId].push({ s, pad: p });
        arms.push({ roadId: a.roadId, s });
      }
      this.armsByPad.push(arms);
    }
    for (const st of this.stationsByRoad) st.sort((a, b) => a.s - b.s);
    let acc = 0;
    for (const r of this.roads) {
      this.cumLen.push(acc);
      if (!r.earth) acc += r.length;
    }
    this.totalLength = acc;
    const p: RoadPoint = { x: 0, z: 0, y: 0, hx: 0, hz: 0 };
    for (let i = 0; i < this.roads.length; i++) {
      if (this.roads[i].earth) continue;
      for (let s = 0; s <= this.roads[i].length; s += 30) {
        this.at(i, s, 1, 0, p);
        this.spotX.push(p.x);
        this.spotZ.push(p.z);
        this.spotRoad.push(i);
        this.spotS.push(s);
      }
    }
  }

  /** A random point on some road whose distance from (cx, cz) is between rmin and rmax (null if no road is there). */
  randomSpotInRing(cx: number, cz: number, rmin: number, rmax: number, r: () => number): { roadId: number; s: number } | null {
    let n = 0;
    let pick = -1;
    const a = rmin * rmin;
    const b = rmax * rmax;
    for (let i = 0; i < this.spotX.length; i++) {
      const dx = this.spotX[i] - cx;
      const dz = this.spotZ[i] - cz;
      const d2 = dx * dx + dz * dz;
      if (d2 < a || d2 > b) continue;
      n++;
      if (r() * n < 1) pick = i; // reservoir sampling: uniform over the matches
    }
    if (pick < 0) return null;
    const road = this.roads[this.spotRoad[pick]];
    const s = Math.max(0, Math.min(road.length, this.spotS[pick] + (r() - 0.5) * 30));
    return { roadId: this.spotRoad[pick], s };
  }

  stations(roadId: number): Station[] {
    return this.stationsByRoad[roadId];
  }

  arms(pad: number): { roadId: number; s: number }[] {
    return this.armsByPad[pad];
  }

  /** Closest sampled road point to a WORLD coordinate, useful for deterministic roadside structures. */
  nearestSpot(x: number, z: number, maxDistance = Infinity): { roadId: number; s: number; distance: number } | null {
    const max2 = maxDistance * maxDistance;
    let best = -1;
    let best2 = max2;
    for (let i = 0; i < this.spotX.length; i++) {
      const dx = this.spotX[i] - x;
      const dz = this.spotZ[i] - z;
      const d2 = dx * dx + dz * dz;
      if (d2 < best2) { best2 = d2; best = i; }
    }
    if (best < 0) return null;
    return { roadId: this.spotRoad[best], s: this.spotS[best], distance: Math.sqrt(best2) };
  }

  /** Closest cached road sample inside a rectangular map district (used for area-based Tour stops). */
  nearestSpotInBounds(
    x: number,
    z: number,
    bounds: { minX: number; minZ: number; maxX: number; maxZ: number },
    maxDistance = Infinity,
  ): { roadId: number; s: number; distance: number; x: number; z: number; y: number; hx: number; hz: number } | null {
    let bestIndex = -1;
    let bestD2 = maxDistance * maxDistance;
    for (let i = 0; i < this.spotX.length; i++) {
      const px = this.spotX[i];
      const pz = this.spotZ[i];
      if (px < bounds.minX || px >= bounds.maxX || pz < bounds.minZ || pz >= bounds.maxZ) continue;
      const dx = px - x;
      const dz = pz - z;
      const d2 = dx * dx + dz * dz;
      if (d2 < bestD2) { bestD2 = d2; bestIndex = i; }
    }
    if (bestIndex < 0) return null;

    const roadId = this.spotRoad[bestIndex];
    const road = this.roads[roadId];
    let bestS = this.spotS[bestIndex];
    const best: RoadPoint = { x: 0, z: 0, y: 0, hx: 0, hz: 0 };
    this.at(roadId, bestS, 1, 0, best);
    const p: RoadPoint = { x: 0, z: 0, y: 0, hx: 0, hz: 0 };
    const start = Math.max(0, bestS - 32);
    const end = Math.min(road.length, bestS + 32);
    for (let ss = start; ss <= end + 0.01; ss += 3) {
      this.at(roadId, ss, 1, 0, p);
      if (p.x < bounds.minX || p.x >= bounds.maxX || p.z < bounds.minZ || p.z >= bounds.maxZ) continue;
      const d2 = (p.x - x) ** 2 + (p.z - z) ** 2;
      if (d2 < bestD2) {
        bestD2 = d2;
        bestS = ss;
        best.x = p.x; best.z = p.z; best.y = p.y; best.hx = p.hx; best.hz = p.hz;
      }
    }
    if (bestD2 >= maxDistance * maxDistance) return null;
    return { roadId, s: bestS, distance: Math.sqrt(bestD2), ...best };
  }

  /** Random (road, s) with probability proportional to road length. */
  randomSpot(r: () => number): { roadId: number; s: number } {
    let t = r() * this.totalLength;
    for (let i = 0; i < this.roads.length; i++) {
      const len = this.roads[i].earth ? 0 : this.roads[i].length;
      if (t < len) return { roadId: i, s: t };
      t -= len;
    }
    const last = this.roads.length - 1;
    return { roadId: last, s: this.roads[last].length * r() };
  }

  /** Index i such that cum[i] <= s < cum[i+1]. */
  private seg(road: RoadSpec, s: number): number {
    const cum = road.cum;
    let lo = 0;
    let hi = cum.length - 2;
    if (hi < 0) return 0;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (cum[mid] <= s) lo = mid;
      else hi = mid - 1;
    }
    return lo;
  }

  /** True if (road, s) is on a bridge deck. */
  onBridge(roadId: number, s: number): boolean {
    const r = this.roads[roadId];
    return r.bridgeOf[this.seg(r, s)] >= 0 || r.bridgeOf[Math.min(r.bridgeOf.length - 1, this.seg(r, s) + 1)] >= 0;
  }

  /**
   * Point at distance `s` along road `roadId`, shifted sideways by `lateral` metres to the LEFT of the travel
   * direction `dir` (negative = right). Heading is the travel direction. The surface height comes from the road profile.
   */
  at(roadId: number, s: number, dir: 1 | -1, lateral: number, out: RoadPoint): RoadPoint {
    const r = this.roads[roadId];
    const sc = Math.max(0, Math.min(r.length, s));
    const i = this.seg(r, sc);
    const j = Math.min(r.xs.length - 1, i + 1);
    const span = r.cum[j] - r.cum[i];
    const t = span > 1e-6 ? (sc - r.cum[i]) / span : 0;
    const x = r.xs[i] + (r.xs[j] - r.xs[i]) * t;
    const z = r.zs[i] + (r.zs[j] - r.zs[i]) * t;
    out.y = r.ys[i] + (r.ys[j] - r.ys[i]) * t;
    let tx = r.xs[j] - r.xs[i];
    let tz = r.zs[j] - r.zs[i];
    if (tx * tx + tz * tz < 1e-9 && i > 0) {
      tx = r.xs[i] - r.xs[i - 1];
      tz = r.zs[i] - r.zs[i - 1];
    }
    const l = Math.hypot(tx, tz) || 1;
    out.hx = (tx / l) * dir;
    out.hz = (tz / l) * dir;
    // left of the travel direction (the car faces +Z, its left is +X): (hz, -hx)
    out.x = x + out.hz * lateral;
    out.z = z - out.hx * lateral;
    return out;
  }

  /** Lane centre offset from the road centreline for left-hand traffic (kerb-side lane). */
  laneOffset(roadId: number): number {
    const r = this.roads[roadId];
    return r.halfWidth * (1 - 1 / Math.max(2, r.lanes));
  }

  /** Overtaking data for (road, s): sideways shift into the passing lane and whether that lane carries oncoming traffic (shift 0 = never overtake here). */
  passInfo(roadId: number, s: number): { shift: number; oncoming: boolean } {
    const r = this.roads[roadId];
    if (r.halfWidth < 2.6 || this.onBridge(roadId, s)) return { shift: 0, oncoming: false };
    const L = Math.max(2, r.lanes);
    const laneW = (2 * r.halfWidth) / L;
    const dual = L >= 4 && r.kind === 'highway';
    return { shift: -laneW, oncoming: !dual };
  }

  /** Cruise speed limit (m/s) of a road. */
  limit(roadId: number): number {
    return this.roads[roadId].speedKmh / 3.6;
  }
}
