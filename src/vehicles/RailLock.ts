import type { RailNetwork } from '../rail/RailNetwork';
import { RAIL_DESIGN } from '../rail/RailPlan';
import { RAIL_HEAD } from '../trains/TrainConfig';
import { vertexRadius } from '../trains/TrackPath';

/** One running rail (a single track of the double-track line), as a polyline in absolute world coordinates. */
export interface RailTrack {
  id: number;
  n: number;
  xs: Float64Array;
  zs: Float64Array;
  /** Top of the rail head (m). */
  ys: Float64Array;
  /** Distance along the track from point 0 (m). */
  cum: Float64Array;
  /** Curve radius at each vertex (m). */
  rad: Float64Array;
  length: number;
}

/** A point on a track: segment `i` (between vertex i and i+1) and `t` 0..1 inside it. */
export interface RailPoint {
  track: number;
  i: number;
  t: number;
  x: number;
  y: number;
  z: number;
  /** Unit tangent in the direction of increasing distance. */
  tx: number;
  tz: number;
  /** Horizontal distance (m) from the query position. */
  dist: number;
}

const CELL = 40;

/**
 * The two rails of every railway line, ready for a road vehicle that wants to drive ON the tracks (EVCity Suprim rail mode).
 * Geometry is the same as the trains use (TrackPath.LegPath): centre line of the edge, offset sideways by half the track spacing, top of rail
 * = designed ballast height + RAIL_HEAD. A coarse grid finds the nearest track point quickly.
 */
export class RailLock {
  readonly tracks: RailTrack[] = [];
  private grid = new Map<number, number[]>(); // cell -> [trackId, segment, trackId, segment, ...]

  constructor(rail: RailNetwork) {
    const half = RAIL_DESIGN.trackSpacing / 2;
    for (const e of rail.edges) {
      const n = e.xs.length;
      if (n < 2) continue;
      const R = vertexRadius(e);
      for (const side of [-1, 1]) {
        const xs = new Float64Array(n);
        const zs = new Float64Array(n);
        const ys = new Float64Array(n);
        const cum = new Float64Array(n);
        const rad = new Float64Array(n);
        for (let q = 0; q < n; q++) {
          const a = Math.max(0, q - 1);
          const b = Math.min(n - 1, q + 1);
          let tx = e.xs[b] - e.xs[a];
          let tz = e.zs[b] - e.zs[a];
          const l = Math.hypot(tx, tz) || 1;
          tx /= l;
          tz /= l;
          xs[q] = e.xs[q] + -tz * side * half;
          zs[q] = e.zs[q] + tx * side * half;
          ys[q] = e.design[q] + RAIL_HEAD;
          rad[q] = R[q];
          if (q > 0) cum[q] = cum[q - 1] + Math.hypot(xs[q] - xs[q - 1], zs[q] - zs[q - 1]);
        }
        this.tracks.push({ id: this.tracks.length, n, xs, zs, ys, cum, rad, length: cum[n - 1] });
      }
    }
    for (const t of this.tracks) {
      for (let i = 0; i < t.n - 1; i++) {
        const len = Math.hypot(t.xs[i + 1] - t.xs[i], t.zs[i + 1] - t.zs[i]);
        const steps = Math.max(1, Math.ceil(len / (CELL * 0.5)));
        let last = -1;
        for (let k = 0; k <= steps; k++) {
          const u = k / steps;
          const key = this.key(Math.floor((t.xs[i] + (t.xs[i + 1] - t.xs[i]) * u) / CELL), Math.floor((t.zs[i] + (t.zs[i + 1] - t.zs[i]) * u) / CELL));
          if (key === last) continue;
          last = key;
          let list = this.grid.get(key);
          if (!list) this.grid.set(key, (list = []));
          list.push(t.id, i);
        }
      }
    }
  }

  private key(cx: number, cz: number): number {
    return (cx + 4096) * 8192 + (cz + 4096);
  }

  /** Fills `out` with the point on the nearest track within `maxDist` m of (x, z); false if there is none. `skipTrack` = ignore that track. */
  nearest(x: number, z: number, maxDist: number, out: RailPoint, skipTrack = -1): boolean {
    const c0x = Math.floor((x - maxDist) / CELL);
    const c1x = Math.floor((x + maxDist) / CELL);
    const c0z = Math.floor((z - maxDist) / CELL);
    const c1z = Math.floor((z + maxDist) / CELL);
    let best = maxDist;
    let found = false;
    for (let cx = c0x; cx <= c1x; cx++) {
      for (let cz = c0z; cz <= c1z; cz++) {
        const list = this.grid.get(this.key(cx, cz));
        if (!list) continue;
        for (let k = 0; k < list.length; k += 2) {
          const tid = list[k];
          if (tid === skipTrack) continue;
          const t = this.tracks[tid];
          const i = list[k + 1];
          const ax = t.xs[i], az = t.zs[i];
          const dx = t.xs[i + 1] - ax, dz = t.zs[i + 1] - az;
          const l2 = dx * dx + dz * dz || 1e-9;
          const u = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / l2));
          const d = Math.hypot(ax + dx * u - x, az + dz * u - z);
          if (d < best) {
            best = d;
            found = true;
            this.fill(t, i, u, out);
            out.dist = d;
          }
        }
      }
    }
    return found;
  }

  /** Point at segment i, fraction t of track `t`. */
  fill(t: RailTrack, i: number, u: number, out: RailPoint): RailPoint {
    const dx = t.xs[i + 1] - t.xs[i];
    const dz = t.zs[i + 1] - t.zs[i];
    const l = Math.hypot(dx, dz) || 1;
    out.track = t.id;
    out.i = i;
    out.t = u;
    out.x = t.xs[i] + dx * u;
    out.z = t.zs[i] + dz * u;
    out.y = t.ys[i] + (t.ys[i + 1] - t.ys[i]) * u;
    out.tx = dx / l;
    out.tz = dz / l;
    return out;
  }

  /** Advance a track position by `ds` metres (negative = backwards). Returns false when it runs off the end of the track (the point stays at the end). */
  advance(p: RailPoint, ds: number): boolean {
    const t = this.tracks[p.track];
    let i = p.i;
    let u = p.t;
    let left = ds;
    while (left !== 0) {
      const segLen = Math.hypot(t.xs[i + 1] - t.xs[i], t.zs[i + 1] - t.zs[i]) || 1e-6;
      const nu = u + left / segLen;
      if (nu > 1) {
        left -= (1 - u) * segLen;
        if (i >= t.n - 2) {
          this.fill(t, i, 1, p);
          return false;
        }
        i++;
        u = 0;
      } else if (nu < 0) {
        left += u * segLen;
        if (i <= 0) {
          this.fill(t, 0, 0, p);
          return false;
        }
        i--;
        u = 1;
      } else {
        u = nu;
        left = 0;
      }
    }
    this.fill(t, i, u, p);
    return true;
  }

  /** Smallest curve radius (m) of the vertices between the point and `dist` m ahead in the direction `dir` (+1 / -1). */
  minRadiusAhead(p: RailPoint, dir: number, dist: number): number {
    const t = this.tracks[p.track];
    let r = Infinity;
    let i = dir > 0 ? p.i + 1 : p.i;
    let walked = 0;
    let lastX = p.x;
    let lastZ = p.z;
    while (i >= 0 && i < t.n && walked <= dist) {
      r = Math.min(r, t.rad[i]);
      walked += Math.hypot(t.xs[i] - lastX, t.zs[i] - lastZ);
      lastX = t.xs[i];
      lastZ = t.zs[i];
      i += dir;
    }
    return r;
  }
}
