import type { XGround } from './ExpresswayNetwork';

/** Rectangles the expressway keeps out of (world metres). */
export interface XAvoid {
  x0: number;
  z0: number;
  x1: number;
  z1: number;
  /** Extra clearance around it (m). */
  margin: number;
}

type Pt = [number, number];

const CELL = 80;
const HALF = 4640;
const N = Math.round((2 * HALF) / CELL) + 1;

/**
 * Finds a cheap, flat, dry way between the hint points: an A* search on an 80 m grid.
 * Cost = distance x (1 + hill penalty + slope penalty + water penalty), with walls around the 'avoid' rectangles.
 * The result is a short list of points (staircase removed) that the Catmull-Rom curve then rounds off.
 * The hint points marked `pinned` (interchanges, the city centre) are kept exactly; the other hints are only guides
 * and slide to the nearest flat ground when they lie on a hill.
 */
export class ExpresswayRouter {
  /** Highest ground in each cell (centre + 4 points 30 m away), so the deck width is covered. */
  private H: Float32Array;
  private blocked: Uint8Array;

  constructor(
    private ground: XGround,
    avoid: readonly XAvoid[],
  ) {
    this.H = new Float32Array(N * N);
    this.blocked = new Uint8Array(N * N);
    for (let iz = 0; iz < N; iz++) {
      for (let ix = 0; ix < N; ix++) {
        const x = ix * CELL - HALF;
        const z = iz * CELL - HALF;
        let h = this.ground.heightAt(x, z);
        for (const [dx, dz] of [[30, 0], [-30, 0], [0, 30], [0, -30]]) h = Math.max(h, this.ground.heightAt(x + dx, z + dz));
        this.H[iz * N + ix] = h;
        for (const a of avoid) {
          if (x > a.x0 - a.margin && x < a.x1 + a.margin && z > a.z0 - a.margin && z < a.z1 + a.margin) this.blocked[iz * N + ix] = 1;
        }
      }
    }
  }

  private idx(x: number, z: number): number {
    const ix = Math.max(0, Math.min(N - 1, Math.round((x + HALF) / CELL)));
    const iz = Math.max(0, Math.min(N - 1, Math.round((z + HALF) / CELL)));
    return iz * N + ix;
  }

  /** Ground height used by the router at a point (highest of the cell). */
  heightNear(x: number, z: number): number {
    return this.H[this.idx(x, z)];
  }

  private stepCost(a: number, b: number, dist: number): number {
    const ha = this.H[a];
    const hb = this.H[b];
    const h = Math.max(ha, hb);
    const hill = Math.max(0, h - 45) / 12; // 45 m and under is the plain; a 100 m hill costs 5.6x
    const slope = Math.abs(ha - hb) / dist;
    const water = h < 3 ? 2.5 : 0; // the sea / lakes: avoid, the deck would stand on piers in water
    let c = 1 + hill * hill * 0.35 + hill + slope * 30 + water;
    if (this.blocked[b]) c += 60;
    return dist * c;
  }

  /** A* between two points -> list of points (cell centres, ends exact). */
  private path(a: Pt, b: Pt): Pt[] {
    const s = this.idx(a[0], a[1]);
    const t = this.idx(b[0], b[1]);
    if (s === t) return [a, b];
    const g = new Float32Array(N * N).fill(Infinity);
    const from = new Int32Array(N * N).fill(-1);
    const closed = new Uint8Array(N * N);
    // binary heap of [f, index]
    const heap: [number, number][] = [];
    const push = (f: number, i: number): void => {
      heap.push([f, i]);
      let k = heap.length - 1;
      while (k > 0) {
        const p = (k - 1) >> 1;
        if (heap[p][0] <= heap[k][0]) break;
        [heap[p], heap[k]] = [heap[k], heap[p]];
        k = p;
      }
    };
    const pop = (): [number, number] => {
      const top = heap[0];
      const last = heap.pop()!;
      if (heap.length) {
        heap[0] = last;
        let k = 0;
        for (;;) {
          const l = 2 * k + 1;
          const r = l + 1;
          let m = k;
          if (l < heap.length && heap[l][0] < heap[m][0]) m = l;
          if (r < heap.length && heap[r][0] < heap[m][0]) m = r;
          if (m === k) break;
          [heap[m], heap[k]] = [heap[k], heap[m]];
          k = m;
        }
      }
      return top;
    };
    const tx = t % N;
    const tz = Math.floor(t / N);
    g[s] = 0;
    push(0, s);
    while (heap.length) {
      const [, cur] = pop();
      if (closed[cur]) continue;
      closed[cur] = 1;
      if (cur === t) break;
      const cx = cur % N;
      const cz = Math.floor(cur / N);
      for (let dz = -1; dz <= 1; dz++) {
        for (let dx = -1; dx <= 1; dx++) {
          if (!dx && !dz) continue;
          const nx = cx + dx;
          const nz = cz + dz;
          if (nx < 0 || nz < 0 || nx >= N || nz >= N) continue;
          const ni = nz * N + nx;
          if (closed[ni]) continue;
          const dist = CELL * (dx && dz ? Math.SQRT2 : 1);
          const ng = g[cur] + this.stepCost(cur, ni, dist);
          if (ng < g[ni]) {
            g[ni] = ng;
            from[ni] = cur;
            push(ng + Math.hypot(nx - tx, nz - tz) * CELL, ni);
          }
        }
      }
    }
    const out: Pt[] = [];
    for (let c = t; c !== -1 && c !== s; c = from[c]) out.push([(c % N) * CELL - HALF, Math.floor(c / N) * CELL - HALF]);
    out.push(a);
    out.reverse();
    out[out.length - 1] = b;
    return out;
  }

  /** Nearest cell (spiral search) whose ground is flat enough: used for hint points that sit on a hill. */
  private relax(p: Pt): Pt {
    if (this.H[this.idx(p[0], p[1])] <= 55 && !this.blocked[this.idx(p[0], p[1])]) return p;
    for (let r = 1; r <= 12; r++) {
      let best: Pt | null = null;
      let bh = Infinity;
      for (let dz = -r; dz <= r; dz++) {
        for (let dx = -r; dx <= r; dx++) {
          if (Math.max(Math.abs(dx), Math.abs(dz)) !== r) continue;
          const x = p[0] + dx * CELL;
          const z = p[1] + dz * CELL;
          const i = this.idx(x, z);
          if (this.blocked[i]) continue;
          if (this.H[i] < bh) {
            bh = this.H[i];
            best = [x, z];
          }
        }
      }
      if (best && bh <= 55) return best;
    }
    return p;
  }

  /** Ramer-Douglas-Peucker: drop the points of the grid staircase that lie within `tol` metres of the line. */
  private simplify(pts: Pt[], tol: number): Pt[] {
    if (pts.length < 3) return pts;
    const keep = new Uint8Array(pts.length);
    keep[0] = keep[pts.length - 1] = 1;
    const stack: [number, number][] = [[0, pts.length - 1]];
    while (stack.length) {
      const [i0, i1] = stack.pop()!;
      const [ax, az] = pts[i0];
      const [bx, bz] = pts[i1];
      const L = Math.hypot(bx - ax, bz - az) || 1;
      let md = 0;
      let mi = -1;
      for (let i = i0 + 1; i < i1; i++) {
        const d = Math.abs((bx - ax) * (az - pts[i][1]) - (ax - pts[i][0]) * (bz - az)) / L;
        if (d > md) {
          md = d;
          mi = i;
        }
      }
      if (mi >= 0 && md > tol) {
        keep[mi] = 1;
        stack.push([i0, mi], [mi, i1]);
      }
    }
    return pts.filter((_, i) => keep[i]);
  }

  /**
   * Route through the hints in order. `pinned(p)` says which hints must be passed exactly (interchanges, the centre).
   * `closed`: the last hint connects back to the first.
   */
  route(hints: readonly (readonly [number, number])[], closed: boolean, pinned: (p: Pt) => boolean): Pt[] {
    const anchors: Pt[] = hints.map((h) => (pinned([h[0], h[1]]) ? ([h[0], h[1]] as Pt) : this.relax([h[0], h[1]])));
    const legs = closed ? anchors.length : anchors.length - 1;
    const out: Pt[] = [];
    for (let i = 0; i < legs; i++) {
      const a = anchors[i];
      const b = anchors[(i + 1) % anchors.length];
      const leg = this.simplify(this.path(a, b), 55);
      // drop the last point (it is the next leg's first), except on an open route's final leg
      if (i < legs - 1 || closed) leg.pop();
      out.push(...leg);
    }
    return out;
  }
}
