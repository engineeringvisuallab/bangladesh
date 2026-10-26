import type { TerrainSample } from '../terrain/Lakes';
import { RAIL_DESIGN as D } from './RailPlan';
import type { RailNetwork } from './RailNetwork';

const CELL = 64;
const key = (cx: number, cz: number): number => (cx + 2048) * 8192 + (cz + 2048);

/**
 * The railway's earthworks, applied inside TerrainGenerator.sample() AFTER the roads (so every chunk, worker and physics collider
 * sees the same embankment / cutting).
 *
 *   ground line   flat formation (embankment top / cutting floor) `formationHalf` wide at (design - ballast), then slopes
 *                 fill 1:2 / cut 1:1.5 until they meet the natural ground;
 *   bridge        the ground under a viaduct is NOT touched (the deck passes over roads, rivers and junctions);
 *   tunnel / cut & cover   the ground above is NOT touched (the hill / the road stays);
 *   water         wet ground is never cut or filled.
 *
 * There are no conflicts with roads because RailNetwork never leaves a ground line where a road, pad or road bridge would be touched
 * (it turns that stretch into a bridge or a box), so the two earthworks never overlap.
 */
export class RailFormation {
  // interval data (one entry per 20 m piece of a line)
  private x0: number[] = [];
  private z0: number[] = [];
  private x1: number[] = [];
  private z1: number[] = [];
  private h0: number[] = [];
  private h1: number[] = [];
  private fh: number[] = [];
  /** 0 ground (earthwork), 1 bridge, 2 tunnel, 3 cut & cover */
  private kind: number[] = [];
  /** The interval continues into another GROUND interval at its start / end (so a round cap is wanted there; at a structure it is not). */
  private capA: boolean[] = [];
  private capB: boolean[] = [];
  private reach: number[] = [];
  private cells = new Map<number, number[]>();

  constructor(rail: RailNetwork) {
    for (const e of rail.edges) {
      for (let i = 0; i < e.xs.length - 1; i++) {
        const mid = (e.cum[i] + e.cum[i + 1]) / 2;
        const seg = e.segments.find((q) => mid >= q.s0 && mid <= q.s1);
        const kindAt = (m: number): number => {
          const q = e.segments.find((g) => m >= g.s0 && m <= g.s1);
          return q ? (q.kind === 'ground' ? 0 : q.kind === 'bridge' ? 1 : q.kind === 'tunnel' ? 2 : 3) : 0;
        };
        const k = seg ? (seg.kind === 'ground' ? 0 : seg.kind === 'bridge' ? 1 : seg.kind === 'tunnel' ? 2 : 3) : 0;
        this.capA.push(i > 0 && kindAt((e.cum[i - 1] + e.cum[i]) / 2) === 0);
        this.capB.push(i + 2 < e.xs.length && kindAt((e.cum[i + 1] + e.cum[i + 2]) / 2) === 0);
        const inStation = e.cum[i + 1] <= e.zoneA + 1e-6 || e.cum[i] >= e.length - e.zoneB - 1e-6;
        const fh = inStation ? D.formationHalf + 4 : D.formationHalf;
        const hd0 = e.design[i] - D.ballast;
        const hd1 = e.design[i + 1] - D.ballast;
        let reach: number;
        if (k === 0) {
          const dh = Math.max(Math.abs(hd0 - e.ground[i]), Math.abs(hd1 - e.ground[i + 1]));
          reach = fh + Math.min(D.slopeMax, dh * Math.max(D.fillSlope, D.cutSlope)) + 3;
        } else if (k === 1) reach = D.deckHalf + 3;
        else reach = 0;
        const id = this.x0.length;
        this.x0.push(e.xs[i]);
        this.z0.push(e.zs[i]);
        this.x1.push(e.xs[i + 1]);
        this.z1.push(e.zs[i + 1]);
        this.h0.push(hd0);
        this.h1.push(hd1);
        this.fh.push(fh);
        this.kind.push(k);
        this.reach.push(reach);
        if (reach <= 0) continue;
        const minx = Math.min(e.xs[i], e.xs[i + 1]) - reach;
        const maxx = Math.max(e.xs[i], e.xs[i + 1]) + reach;
        const minz = Math.min(e.zs[i], e.zs[i + 1]) - reach;
        const maxz = Math.max(e.zs[i], e.zs[i + 1]) + reach;
        for (let cz = Math.floor(minz / CELL); cz <= Math.floor(maxz / CELL); cz++) {
          for (let cx = Math.floor(minx / CELL); cx <= Math.floor(maxx / CELL); cx++) {
            const kk = key(cx, cz);
            const a = this.cells.get(kk);
            if (a) a.push(id);
            else this.cells.set(kk, [id]);
          }
        }
      }
    }
  }

  /** Distance to interval `id` and the height of its formation level at the nearest point. */
  private probe(id: number, x: number, z: number, res: { d: number; h: number }): void {
    const ax = this.x0[id];
    const az = this.z0[id];
    const bx = this.x1[id];
    const bz = this.z1[id];
    const abx = bx - ax;
    const abz = bz - az;
    const l2 = abx * abx + abz * abz;
    let t = l2 > 0 ? ((x - ax) * abx + (z - az) * abz) / l2 : 0;
    if ((t < 0 && !this.capA[id]) || (t > 1 && !this.capB[id])) {
      res.d = Infinity; // no round cap at the end of a ground stretch that meets a bridge / box / tunnel
      res.h = 0;
      return;
    }
    t = t < 0 ? 0 : t > 1 ? 1 : t;
    res.d = Math.hypot(x - (ax + abx * t), z - (az + abz * t));
    res.h = this.h0[id] + (this.h1[id] - this.h0[id]) * t;
  }

  private tmp = { d: 0, h: 0 };

  /** Cut & fill of every railway ground line at (x, z); leaves bridges, tunnels, boxes and wet ground alone. */
  apply(x: number, z: number, out: TerrainSample): void {
    const list = this.cells.get(key(Math.floor(x / CELL), Math.floor(z / CELL)));
    if (!list) return;
    if (!Number.isNaN(out.water) && out.h <= out.water + 0.3) return; // never cut / fill wet ground
    const r = this.tmp;
    let bestD = Infinity;
    let bestH = 0;
    let bestFh = 0;
    for (const id of list) {
      this.probe(id, x, z, r);
      const k = this.kind[id];
      if (k === 0) {
        if (r.d < this.reach[id] && r.d < bestD) {
          bestD = r.d;
          bestH = r.h;
          bestFh = this.fh[id];
        }
      }
    }
    if (bestD < Infinity) {
      const h0 = out.h;
      let h: number;
      if (bestD <= bestFh) h = bestH;
      else if (bestH >= h0) h = Math.max(h0, bestH - (bestD - bestFh) / D.fillSlope);
      else h = Math.min(h0, bestH + (bestD - bestFh) / D.cutSlope);
      out.h = h;
    }
  }

  /**
   * Is (x, z) inside the railway corridor (embankment / cutting with slopes, viaduct footprint) or within `margin` m of it?
   * Trees, grass, rocks, and later buildings and local streets must keep out.
   */
  inCorridor(x: number, z: number, margin: number): boolean {
    const list = this.cells.get(key(Math.floor(x / CELL), Math.floor(z / CELL)));
    if (!list) return false;
    const r = this.tmp;
    for (const id of list) {
      const reach = this.reach[id];
      if (reach <= 0) continue;
      this.probe(id, x, z, r);
      if (r.d < Math.max(reach, D.rowHalf) + margin) return true;
    }
    return false;
  }
}
