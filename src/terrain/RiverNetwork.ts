import { Config } from '../core/Config';
import type { TerrainSample } from './Lakes';

const smoothstep = (a: number, b: number, x: number): number => {
  const t = x <= a ? 0 : x >= b ? 1 : (x - a) / (b - a);
  return t * t * (3 - 2 * t);
};

export interface RiverSegment {
  ax: number;
  az: number;
  bx: number;
  bz: number;
  len: number;
  /** Water surface height at both ends (never rises downstream). */
  wsA: number;
  wsB: number;
  /** Water depth and channel half-width at both ends. */
  wdA: number;
  wdB: number;
  hwA: number;
  hwB: number;
  /** Number of waterfall steps inside this segment (0 = smooth). */
  steps: number;
}

export interface PondSpec {
  x: number;
  z: number;
  level: number;
}

class MinHeap {
  private k: Float64Array;
  private v: Int32Array;
  size = 0;
  constructor(cap: number) {
    this.k = new Float64Array(cap);
    this.v = new Int32Array(cap);
  }
  push(key: number, val: number): void {
    let i = this.size++;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (this.k[p] <= key) break;
      this.k[i] = this.k[p];
      this.v[i] = this.v[p];
      i = p;
    }
    this.k[i] = key;
    this.v[i] = val;
  }
  pop(): number {
    const top = this.v[0];
    const lastK = this.k[--this.size];
    const lastV = this.v[this.size];
    const n = this.size;
    let i = 0;
    for (;;) {
      let c = 2 * i + 1;
      if (c >= n) break;
      if (c + 1 < n && this.k[c + 1] < this.k[c]) c++;
      if (this.k[c] >= lastK) break;
      this.k[i] = this.k[c];
      this.v[i] = this.v[c];
      i = c;
    }
    this.k[i] = lastK;
    this.v[i] = lastV;
    return top;
  }
}

const NB: [number, number][] = [
  [-1, 0], [1, 0], [0, -1], [0, 1], [-1, -1], [1, -1], [-1, 1], [1, 1],
];

const waterDepthOf = (acc: number): number => 0.8 + 0.06 * Math.sqrt(acc);
const halfWidthOf = (acc: number): number => (4 + 0.7 * Math.sqrt(acc)) / 2;

/**
 * River network, built ONCE from the seed (every worker builds the identical network).
 *
 * 1. Sample the natural terrain on a coarse grid and blur it a little.
 * 2. "Priority flood": fill every pit so each cell has a downhill path to the sea (or map border).
 *    This is how real drainage works, so rivers always flow downhill and end in the sea.
 * 3. Count how many cells drain through each cell (drainage area). Big drainage = river.
 *    Small streams merge into bigger rivers (tributaries) automatically.
 * 4. Smooth the river paths, build a water-surface height that never rises downstream,
 *    and add waterfall steps where the drop is steep.
 * 5. `apply()` carves a channel + valley into the terrain around the nearest river segment.
 */
export class RiverNetwork {
  readonly segments: RiverSegment[] = [];
  readonly ponds: PondSpec[] = [];
  readonly stats = { sources: 0, lengthM: 0, waterfalls: 0 };

  private readonly GC = 160;
  private readonly GMIN = -6700;
  private readonly GN = Math.ceil(13400 / 160);
  private cells: number[][] = [];

  constructor(base: (x: number, z: number) => number) {
    const R = Config.terrain.river;
    const C = R.gridStep;
    const extent = (Config.world.size / 2 + Config.world.chunkMargin * Config.world.chunkSize + 240) * 2;
    const N = Math.ceil(extent / C);
    const ORG = -(N * C) / 2;
    const cellX = (i: number) => ORG + (i + 0.5) * C;
    const total = N * N;

    // 1. coarse terrain + blur
    let hS = new Float32Array(total);
    for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) hS[j * N + i] = base(cellX(i), cellX(j));
    let tmp = new Float32Array(total);
    for (let pass = 0; pass < 2; pass++) {
      for (let j = 0; j < N; j++) {
        for (let i = 0; i < N; i++) {
          let sum = 0;
          for (let dj = -1; dj <= 1; dj++) {
            for (let di = -1; di <= 1; di++) {
              const ii = Math.min(N - 1, Math.max(0, i + di));
              const jj = Math.min(N - 1, Math.max(0, j + dj));
              sum += hS[jj * N + ii];
            }
          }
          tmp[j * N + i] = sum / 9;
        }
      }
      [hS, tmp] = [tmp, hS];
    }

    // 2. priority flood (outlets: sea cells and the map border)
    const filled = new Float32Array(total);
    const down = new Int32Array(total).fill(-1);
    const closed = new Uint8Array(total);
    const heap = new MinHeap(total);
    for (let j = 0; j < N; j++) {
      for (let i = 0; i < N; i++) {
        const c = j * N + i;
        if (i === 0 || j === 0 || i === N - 1 || j === N - 1 || hS[c] <= 0.8) {
          closed[c] = 1;
          filled[c] = hS[c];
          heap.push(hS[c], c);
        }
      }
    }
    while (heap.size > 0) {
      const c = heap.pop();
      const ci = c % N;
      const cj = (c - ci) / N;
      for (const [di, dj] of NB) {
        const ni = ci + di;
        const nj = cj + dj;
        if (ni < 0 || nj < 0 || ni >= N || nj >= N) continue;
        const n = nj * N + ni;
        if (closed[n]) continue;
        closed[n] = 1;
        down[n] = c;
        filled[n] = Math.max(hS[n], filled[c] + 0.002);
        heap.push(filled[n], n);
      }
    }

    // 3. drainage area
    const order = Array.from({ length: total }, (_, i) => i).sort((a, b) => filled[b] - filled[a]);
    const acc = new Float32Array(total).fill(1);
    for (const c of order) {
      const d = down[c];
      if (d >= 0) acc[d] += acc[c];
    }

    // River nodes: river cells + the sea cell each river flows into (the mouth).
    const limit = Config.world.size / 2 + 400;
    const isRiver = new Uint8Array(total);
    for (let c = 0; c < total; c++) {
      const i = c % N;
      const j = (c - i) / N;
      if (acc[c] >= R.accThreshold && hS[c] > 0.8 && Math.abs(cellX(i)) <= limit && Math.abs(cellX(j)) <= limit) {
        isRiver[c] = 1;
      }
    }
    const isNode = new Uint8Array(total);
    const hasEdge = new Uint8Array(total); // node c has an edge to down[c]
    for (let c = 0; c < total; c++) {
      if (!isRiver[c]) continue;
      const d = down[c];
      if (d < 0) continue;
      if (isRiver[d] || hS[d] <= 0.8) {
        isNode[c] = 1;
        isNode[d] = 1;
        hasEdge[c] = 1;
      }
    }
    const ups = new Map<number, number[]>();
    for (let c = 0; c < total; c++) {
      if (!hasEdge[c]) continue;
      const d = down[c];
      let l = ups.get(d);
      if (!l) ups.set(d, (l = []));
      l.push(c);
    }

    // 4a. smooth positions (Laplacian), mouths stay fixed
    const px = new Float64Array(total);
    const pz = new Float64Array(total);
    for (let c = 0; c < total; c++) {
      if (!isNode[c]) continue;
      const i = c % N;
      px[c] = cellX(i);
      pz[c] = cellX((c - i) / N);
    }
    const nodeList: number[] = [];
    for (let c = 0; c < total; c++) if (isNode[c]) nodeList.push(c);
    const nx = new Float64Array(total);
    const nz = new Float64Array(total);
    for (let it = 0; it < 4; it++) {
      for (const c of nodeList) {
        if (hS[c] <= 0.8) {
          nx[c] = px[c];
          nz[c] = pz[c];
          continue;
        }
        let sx = 0;
        let sz = 0;
        let cnt = 0;
        if (hasEdge[c]) {
          sx += px[down[c]];
          sz += pz[down[c]];
          cnt++;
        }
        for (const u of ups.get(c) ?? []) {
          sx += px[u];
          sz += pz[u];
          cnt++;
        }
        if (cnt === 0) {
          nx[c] = px[c];
          nz[c] = pz[c];
        } else {
          nx[c] = px[c] * 0.4 + (sx / cnt) * 0.6;
          nz[c] = pz[c] * 0.4 + (sz / cnt) * 0.6;
        }
      }
      for (const c of nodeList) {
        px[c] = nx[c];
        pz[c] = nz[c];
      }
    }

    // 4b. water surface heights, upstream -> downstream, never rising
    const ws = new Float64Array(total);
    const edgeKept = new Uint8Array(total);
    const orderedNodes = nodeList.sort((a, b) => filled[b] - filled[a]);
    for (const c of orderedNodes) {
      const mouth = hS[c] <= 0.8;
      const cand = mouth ? 0 : base(px[c], pz[c]) - 0.3;
      let w = cand;
      for (const u of ups.get(c) ?? []) {
        if (cand - ws[u] > R.maxCut) {
          // would need a deep gorge: the river ends in a pond just before this point
          this.ponds.push({ x: px[u], z: pz[u], level: ws[u] });
          continue;
        }
        edgeKept[u] = 1;
        if (ws[u] < w) w = ws[u];
      }
      ws[c] = mouth ? 0 : Math.max(0, w);
    }

    // 4c. segments
    for (const c of orderedNodes) {
      if (!edgeKept[c]) continue;
      const d = down[c];
      const len = Math.hypot(px[d] - px[c], pz[d] - pz[c]);
      if (len < 1) continue;
      this.segments.push({
        ax: px[c], az: pz[c], bx: px[d], bz: pz[d], len,
        wsA: ws[c], wsB: ws[d],
        wdA: waterDepthOf(acc[c]), wdB: waterDepthOf(acc[d]),
        hwA: halfWidthOf(acc[c]), hwB: halfWidthOf(acc[d]),
        steps: 0,
      });
      this.stats.lengthM += len;
    }
    // 4d. ESTUARY: the coarse grid puts the river's last node on a blurred "sea" cell that can still be 100+ m inland of the real
    // shoreline, which left a land bar between the river and the sea (the river never reached the sea). Every river mouth is
    // therefore continued, at sea level, in the downhill direction until the real sea (natural ground clearly below 0) is reached.
    for (const s of this.segments.slice()) {
      if (s.wsB !== 0) continue;
      let dx = (s.bx - s.ax) / s.len;
      let dz = (s.bz - s.az) / s.len;
      // best direction: the ray (within +-90 degrees of the flow) that reaches open sea (ground below -1.5 m for 300 m) after the
      // shortest way over land; the channel is dredged through any spit or bar that is in the way
      const reach = (ex: number, ez: number): number => {
        for (let d = 30; d <= 900; d += 30) {
          let open = true;
          for (let q = 0; q < 10 && open; q++) if (base(s.bx + ex * (d + q * 30), s.bz + ez * (d + q * 30)) > -1.5) open = false;
          if (open) return d;
        }
        return Infinity;
      };
      let bestCost = Infinity;
      for (let k = -9; k <= 9; k++) {
        const a = (k / 9) * 1.57;
        const ex = dx * Math.cos(a) - dz * Math.sin(a);
        const ez = dx * Math.sin(a) + dz * Math.cos(a);
        const cost = reach(ex, ez) + Math.abs(k) * 8;
        if (cost < bestCost) {
          bestCost = cost;
          dx = ex;
          dz = ez;
        }
      }
      if (!Number.isFinite(bestCost)) continue;
      const total = reach(dx, dz) + 60;
      let px0 = s.bx;
      let pz0 = s.bz;
      let wd = s.wdB;
      const nSteps = Math.ceil(total / 60);
      for (let step = 0; step < nSteps; step++) {
        const len = 60;
        const nxp = px0 + dx * len;
        const nzp = pz0 + dz * len;
        const done = step === nSteps - 1;
        const wdNew = done ? Math.min(wd, 2.6) : Math.max(2.6, wd - 0.6);
        this.segments.push({ ax: px0, az: pz0, bx: nxp, bz: nzp, len, wsA: 0, wsB: 0, wdA: wd, wdB: wdNew, hwA: s.hwB, hwB: s.hwB, steps: 0 });
        this.stats.lengthM += len;
        px0 = nxp;
        pz0 = nzp;
        wd = wdNew;
      }
    }

    // Waterfalls: a few well-spaced drops of 6-28 m in the hills (steeper reaches stay as cascades).
    const cand = this.segments
      .filter((s) => s.wsA - s.wsB >= 6 && s.wsA - s.wsB <= 28 && s.wsA > 25)
      .sort((a, b) => b.wsA - b.wsB - (a.wsA - a.wsB));
    const chosen: RiverSegment[] = [];
    for (const s of cand) {
      if (chosen.length >= 12) break;
      if (chosen.some((o) => Math.hypot(o.ax - s.ax, o.az - s.az) < 350)) continue;
      s.steps = Math.min(2, Math.ceil((s.wsA - s.wsB) / 12));
      this.stats.waterfalls += s.steps;
      chosen.push(s);
    }
    for (const c of orderedNodes) {
      if (hasEdge[c] && edgeKept[c] && !(ups.get(c) ?? []).some((u) => edgeKept[u])) this.stats.sources++;
    }

    // 5. spatial index
    this.cells = Array.from({ length: this.GN * this.GN }, () => [] as number[]);
    this.segments.forEach((s, idx) => {
      const infl = Math.max(s.hwA, s.hwB) * 3.2 + 70;
      const i0 = Math.floor((Math.min(s.ax, s.bx) - infl - this.GMIN) / this.GC);
      const i1 = Math.floor((Math.max(s.ax, s.bx) + infl - this.GMIN) / this.GC);
      const j0 = Math.floor((Math.min(s.az, s.bz) - infl - this.GMIN) / this.GC);
      const j1 = Math.floor((Math.max(s.az, s.bz) + infl - this.GMIN) / this.GC);
      for (let j = Math.max(0, j0); j <= Math.min(this.GN - 1, j1); j++) {
        for (let i = Math.max(0, i0); i <= Math.min(this.GN - 1, i1); i++) this.cells[j * this.GN + i].push(idx);
      }
    });
  }

  /** Water surface height along a segment at t in [0,1] (with waterfall steps). */
  private wsAt(s: RiverSegment, t: number): number {
    if (s.steps === 0) return s.wsA + (s.wsB - s.wsA) * t;
    const ns = s.steps;
    const tw = Math.min(0.14, 6 / s.len);
    let acc = 0;
    for (let k = 0; k < ns; k++) {
      const tk = (k + 0.5) / ns;
      acc += smoothstep(tk - tw, tk + tw, t);
    }
    return s.wsA - ((s.wsA - s.wsB) * acc) / ns;
  }

  private nearest(x: number, z: number): { seg: RiverSegment; t: number; d: number } | null {
    const ci = Math.floor((x - this.GMIN) / this.GC);
    const cj = Math.floor((z - this.GMIN) / this.GC);
    if (ci < 0 || cj < 0 || ci >= this.GN || cj >= this.GN) return null;
    const list = this.cells[cj * this.GN + ci];
    let best = Infinity;
    let bi = -1;
    let bt = 0;
    for (let n = 0; n < list.length; n++) {
      const s = this.segments[list[n]];
      const dx = s.bx - s.ax;
      const dz = s.bz - s.az;
      let t = ((x - s.ax) * dx + (z - s.az) * dz) / (s.len * s.len);
      t = t < 0 ? 0 : t > 1 ? 1 : t;
      const ex = s.ax + dx * t - x;
      const ez = s.az + dz * t - z;
      const d2 = ex * ex + ez * ez;
      if (d2 < best) {
        best = d2;
        bi = list[n];
        bt = t;
      }
    }
    if (bi < 0) return null;
    return { seg: this.segments[bi], t: bt, d: Math.sqrt(best) };
  }

  /** True if (x,z) lies inside the area influenced by a river (used to keep lakes away from rivers). */
  isNearRiver(x: number, z: number): boolean {
    const n = this.nearest(x, z);
    if (!n) return false;
    const hw = n.seg.hwA + (n.seg.hwB - n.seg.hwA) * n.t;
    return n.d < hw * 3.2 + 70;
  }

  /** Carve the river channel and valley into `out.h`, and report the water surface + flow. */
  apply(x: number, z: number, out: TerrainSample): void {
    const n = this.nearest(x, z);
    if (!n) return;
    const { seg, t, d } = n;
    const hw = seg.hwA + (seg.hwB - seg.hwA) * t;
    const Vw = hw * 3.2 + 70;
    if (d >= Vw) return;

    const ws = this.wsAt(seg, t);
    const wd = seg.wdA + (seg.wdB - seg.wdA) * t;
    const bed = ws - wd;

    // Cross-section: flat bed -> bank edge slightly above the water -> valley side slope.
    // A waterfall step only shapes the channel and its banks; the wider valley follows the smooth slope.
    let P: number;
    if (d < hw) P = bed + (ws + 0.4 - bed) * smoothstep(0.5 * hw, hw, d);
    else {
      const wsLin = seg.wsA + (seg.wsB - seg.wsA) * t;
      const wsP = seg.steps === 0 ? ws : ws + (wsLin - ws) * smoothstep(hw, hw * 2 + 6, d);
      P = wsP + 0.4 + 0.22 * (d - hw);
    }
    const u = smoothstep(hw, Vw, d);
    const blended = P + (out.h - P) * u; // inside the channel this replaces the terrain (cut or fill), outside it blends back
    // At the river mouth (water at about sea level) the valley walls must never RAISE the ground: the sea floor / low shore beside
    // the mouth would otherwise be filled up to the valley slope (a land bar and walls that closed the river off from the sea).
    out.h = d >= hw && ws < 1.5 && blended > out.h ? out.h : blended;

    if (d < hw + 4) {
      out.water = ws;
      const inv = 1 / seg.len;
      const slope = (seg.wsA - seg.wsB) * inv;
      let speed = Math.min(5, Math.max(0.6, 0.8 + slope * 20));
      if (seg.steps > 0) {
        const tw = Math.min(0.14, 6 / seg.len);
        for (let k = 0; k < seg.steps; k++) if (Math.abs(t - (k + 0.5) / seg.steps) < tw * 1.6) speed = 8;
      }
      out.fx = (seg.bx - seg.ax) * inv * speed;
      out.fz = (seg.bz - seg.az) * inv * speed;
    }
  }
}
