import type { TerrainSample } from '../terrain/Lakes';
import type { RoadNetwork } from '../roads/RoadNetwork';
import { Config } from '../core/Config';
import { BERTHS, BREAKWATERS, GATES, OIL, PLATFORMS, PORT_BOUNDS as B, PORT_DESIGN as D, platform } from './PortPlan';

const smooth = (a: number, b: number, x: number): number => {
  const t = x <= a ? 0 : x >= b ? 1 : (x - a) / (b - a);
  return t * t * (3 - 2 * t);
};

/** A gate road: asphalt strip from the coast road to the gate booths. It follows the ground (the mesh samples the terrain). */
export interface PortGateRoad {
  id: string;
  x: number;
  /** Start (next to the coast road) and end (gate booths), z in metres. */
  z0: number;
  z1: number;
}

/**
 * The port's earthworks, applied inside TerrainGenerator.sample() AFTER the roads and the railway (so every chunk, worker and
 * physics collider sees the same quay, basin and breakwater):
 *
 *   platforms    flat deck, cut 1:1.5 / fill 1:2 slopes to the natural ground (the sea is filled: reclaimed land);
 *   dredging     a pocket of full depth in front of every quay face (z > quay line), fading back into the seabed;
 *   breakwater   rubble mound: flat crest, 1:1.6 side slopes down to the seabed;
 *   roads        nothing is touched within `roadClear` m of any road (their own cut & fill stays exactly as it is).
 *
 * A quay edge sits on a terrain vertex row (see PortPlan.snap), so the collider is flat up to the edge; the first row beyond is dredged.
 */
export class PortFormation {
  readonly gates: PortGateRoad[] = [];
  private sx0: number[] = [];
  private sz0: number[] = [];
  private sx1: number[] = [];
  private sz1: number[] = [];

  constructor(roads: RoadNetwork) {
    // road segments near the port (collector S30 / S28, the highway ...): used for the clearance and for the gate roads
    const r = roads as unknown as { roads: { id: number; xs: Float64Array; zs: Float64Array; halfWidth: number; shoulder: number }[] };
    const m = 200;
    const near: { xs: Float64Array; zs: Float64Array; edge: number }[] = [];
    for (const rd of r.roads) {
      let any = false;
      for (let i = 0; i < rd.xs.length - 1; i++) {
        const ax = rd.xs[i], az = rd.zs[i], bx = rd.xs[i + 1], bz = rd.zs[i + 1];
        if (Math.max(ax, bx) < B.x0 - m || Math.min(ax, bx) > B.x1 + m || Math.max(az, bz) < B.z0 - m || Math.min(az, bz) > B.z1 + m) continue;
        this.sx0.push(ax); this.sz0.push(az); this.sx1.push(bx); this.sz1.push(bz);
        any = true;
      }
      if (any) near.push({ xs: rd.xs, zs: rd.zs, edge: rd.halfWidth + rd.shoulder });
    }
    // gate roads: the road point south-most at the gate's x, start just beyond the road's shoulder
    const gateZ1 = platform('landside').z0 + 6;
    for (const g of GATES) {
      let bestZ = -Infinity;
      let edge = 6.2;
      for (const rd of near) {
        for (let i = 0; i < rd.xs.length - 1; i++) {
          const a = rd.xs[i], b = rd.xs[i + 1];
          if ((a - g.x) * (b - g.x) > 0) continue;
          const t = b === a ? 0 : (g.x - a) / (b - a);
          const z = rd.zs[i] + (rd.zs[i + 1] - rd.zs[i]) * t;
          if (z < gateZ1 && z > bestZ) {
            bestZ = z;
            edge = rd.edge;
          }
        }
      }
      if (bestZ > -Infinity) this.gates.push({ id: g.id, x: g.x, z0: bestZ + edge + 0.4, z1: gateZ1 });
    }
  }

  /** Distance (m) from (x, z) to the nearest road centre line near the port. */
  roadDist(x: number, z: number): number {
    let best = Infinity;
    for (let i = 0; i < this.sx0.length; i++) {
      const ax = this.sx0[i], az = this.sz0[i];
      const abx = this.sx1[i] - ax, abz = this.sz1[i] - az;
      const l2 = abx * abx + abz * abz;
      let t = l2 > 0 ? ((x - ax) * abx + (z - az) * abz) / l2 : 0;
      t = t < 0 ? 0 : t > 1 ? 1 : t;
      const d = Math.hypot(x - (ax + abx * t), z - (az + abz * t));
      if (d < best) best = d;
    }
    return best;
  }

  /** Cut & fill, dredging and the breakwater at (x, z). */
  apply(x: number, z: number, out: TerrainSample): void {
    if (x < B.x0 || x > B.x1 || z < B.z0 || z > B.z1) return;
    const h0 = out.h;
    let h = h0;
    let touched = false;

    // 1. platforms (nearest one decides; the union of the decks has one level except the oil terrace)
    let bestD = Infinity;
    let bestH = 0;
    for (const p of PLATFORMS) {
      const d = Math.hypot(Math.max(p.x0 - x, 0, x - p.x1), Math.max(p.z0 - z, 0, z - p.z1));
      if (d < bestD) {
        bestD = d;
        bestH = p.h;
      }
    }
    const onDeck = bestD === 0;
    if (bestD <= D.reach) {
      const wRoad = smooth(D.roadClear, D.roadClear + D.roadFade, this.roadDist(x, z));
      let t: number;
      if (onDeck) t = bestH;
      else if (bestH >= h0) t = Math.max(h0, bestH - bestD / D.fillSlope);
      else t = Math.min(h0, bestH + bestD / D.cutSlope);
      if (wRoad > 0) {
        h = h0 + (t - h0) * wRoad;
        touched = true;
      }
    }

    // 2. dredged pockets south of every quay face (never under a deck)
    if (!onDeck) {
      for (const b of BERTHS) {
        const s = z - b.zq;
        if (s <= 0 || s > D.pocketLen + D.pocketFade) continue;
        const dx = Math.max(b.x0 - x, 0, x - b.x1);
        if (dx >= D.pocketSide) continue;
        const w = (1 - smooth(D.pocketLen, D.pocketLen + D.pocketFade, s)) * (1 - smooth(0, D.pocketSide, dx));
        const dug = h + (Math.min(h, -b.depth) - h) * w;
        if (dug < h) {
          h = dug;
          touched = true;
        }
      }
      const q = OIL.pocket;
      const dxo = Math.max(q.x0 - x, 0, x - q.x1);
      const dzo = Math.max(q.z0 - z, 0, z - q.z1);
      const wo = (1 - smooth(0, 40, Math.hypot(dxo, dzo)));
      if (wo > 0) {
        const dug = h + (Math.min(h, -q.depth) - h) * wo;
        if (dug < h) {
          h = dug;
          touched = true;
        }
      }
    }

    // 3. breakwater mound
    if (z > 2900) {
      for (const s of BREAKWATERS) {
        const abx = s.bx - s.ax, abz = s.bz - s.az;
        const l2 = abx * abx + abz * abz;
        let t = ((x - s.ax) * abx + (z - s.az) * abz) / l2;
        t = t < 0 ? 0 : t > 1 ? 1 : t;
        const d = Math.hypot(x - (s.ax + abx * t), z - (s.az + abz * t));
        if (d > D.mound.half + 70) continue;
        const m = D.mound.crest - Math.max(0, d - D.mound.half) / D.mound.slope;
        if (m > h) {
          h = m;
          touched = true;
        }
      }
    }

    if (!touched) return;
    out.h = h;
    const sea = Config.terrain.seaLevel;
    if (h < 0.6) {
      if (Number.isNaN(out.water)) out.water = sea; // dug out below sea level: sea water
    } else if (out.water === sea) {
      out.water = NaN; // filled or heaped above the sea: dry
    }
  }

  /** Is (x, z) on the port's earthworks (decks with their slopes, breakwater, jetties) or within `margin` m of them? Trees, grass, rocks keep out. */
  inFootprint(x: number, z: number, margin: number): boolean {
    if (x < B.x0 || x > B.x1 || z < B.z0 || z > B.z1) return false;
    const m = margin + 14;
    for (const p of PLATFORMS) if (x > p.x0 - m && x < p.x1 + m && z > p.z0 - m && z < p.z1 + m) return true;
    if (z > 2930) {
      if (x > OIL.trunkX - OIL.trunkHalf - margin && x < OIL.trunkX + OIL.trunkHalf + margin) return true;
      for (const s of BREAKWATERS) {
        const abx = s.bx - s.ax, abz = s.bz - s.az;
        let t = ((x - s.ax) * abx + (z - s.az) * abz) / (abx * abx + abz * abz);
        t = t < 0 ? 0 : t > 1 ? 1 : t;
        if (Math.hypot(x - (s.ax + abx * t), z - (s.az + abz * t)) < D.mound.half + 30 + margin) return true;
      }
    }
    for (const g of this.gates) if (Math.abs(x - g.x) < 10 + margin && z > g.z0 - margin && z < g.z1 + margin) return true;
    return false;
  }
}
