import type { TerrainSample } from '../terrain/Lakes';
import type { RoadNetwork } from '../roads/RoadNetwork';
import type { RoadSpec } from '../roads/RoadTypes';
import { RAIL_FACILITIES } from '../city/WorldZones';

/** What the railway needs from the terrain: natural ground + water (no roads, no rail) and the finished road network. */
export interface RailTerrain {
  makeSample(): TerrainSample;
  sampleNatural(x: number, z: number, out: TerrainSample): void;
  readonly roads: RoadNetwork;
}

const CELL = 64;
const key = (cx: number, cz: number): number => (cx + 1024) * 4096 + (cz + 1024);

export interface NearRoad {
  road: RoadSpec;
  /** Index of the centre-line point nearest to the query. */
  i: number;
  /** Distance (m) from the query to the road centre line (segment distance). */
  d: number;
  /** Road surface height at the nearest point on the centre line (m). */
  y: number;
  onBridge: boolean;
  /** Unit tangent of the nearest road segment and the nearest point on it. */
  tx: number;
  tz: number;
  px: number;
  pz: number;
}

/**
 * "What else stands here?" for the railway engineer: roads (asphalt, shoulder, cut & fill, junction pads), road bridges and their piers,
 * the airport and the seaport. Everything the railway must not run into is answered from here, so the railway never has to guess.
 */
export class RailContext {
  private cells = new Map<number, number[]>();
  private pts: { r: number; i: number }[] = [];
  private bridgeCells = new Map<number, number[]>();
  private bridgePts: { x: number; z: number; r: number }[] = [];
  private sa;

  constructor(private terrain: RailTerrain) {
    this.sa = terrain.makeSample();
    const roads = terrain.roads.roads;
    for (let r = 0; r < roads.length; r++) {
      const rd = roads[r];
      for (let i = 0; i < rd.xs.length; i++) {
        const id = this.pts.length;
        this.pts.push({ r, i });
        const k = key(Math.floor(rd.xs[i] / CELL), Math.floor(rd.zs[i] / CELL));
        const a = this.cells.get(k);
        if (a) a.push(id);
        else this.cells.set(k, [id]);
      }
    }
    // road bridges: every deck point (the deck + its abutments / piers form one obstacle of radius deckHalfWidth + 9 m)
    for (const b of terrain.roads.bridges) {
      const rd = roads[b.roadId];
      for (let i = b.i0; i <= b.i1; i++) {
        const id = this.bridgePts.length;
        this.bridgePts.push({ x: rd.xs[i], z: rd.zs[i], r: b.deckHalfWidth + 9 });
        const k = key(Math.floor(rd.xs[i] / CELL), Math.floor(rd.zs[i] / CELL));
        const a = this.bridgeCells.get(k);
        if (a) a.push(id);
        else this.bridgeCells.set(k, [id]);
      }
    }
  }

  /** Nearest road centre line within `reach` m (segment distance), or null. */
  nearestRoad(x: number, z: number, reach = 60): NearRoad | null {
    const roads = this.terrain.roads.roads;
    let best: NearRoad | null = null;
    const c0x = Math.floor((x - reach) / CELL);
    const c1x = Math.floor((x + reach) / CELL);
    const c0z = Math.floor((z - reach) / CELL);
    const c1z = Math.floor((z + reach) / CELL);
    const reachSq = reach * reach * 1.000001; // cheap reject before the exact Math.hypot below (result unchanged)
    for (let cz = c0z; cz <= c1z; cz++) {
      for (let cx = c0x; cx <= c1x; cx++) {
        const a = this.cells.get(key(cx, cz));
        if (!a) continue;
        for (const id of a) {
          const { r, i } = this.pts[id];
          const rd = roads[r];
          const n = rd.xs.length;
          for (let j = i - 1; j <= i; j++) {
            let ja = j;
            let jb = j + 1;
            if (rd.closed) {
              ja = (j + n) % n;
              jb = (j + 1 + n) % n;
            } else if (j < 0 || j + 1 >= n) continue;
            const ax = rd.xs[ja];
            const az = rd.zs[ja];
            const bx = rd.xs[jb];
            const bz = rd.zs[jb];
            const abx = bx - ax;
            const abz = bz - az;
            const l2 = abx * abx + abz * abz;
            let t = l2 > 0 ? ((x - ax) * abx + (z - az) * abz) / l2 : 0;
            t = t < 0 ? 0 : t > 1 ? 1 : t;
            const ex = x - (ax + abx * t);
            const ez = z - (az + abz * t);
            if (ex * ex + ez * ez > reachSq) continue;
            const d = Math.hypot(ex, ez);
            if (d < reach && (!best || d < best.d)) {
              const y = rd.ys[ja] + (rd.ys[jb] - rd.ys[ja]) * t;
              const l = Math.sqrt(l2) || 1;
              best = { road: rd, i: t < 0.5 ? ja : jb, d, y, onBridge: rd.bridgeOf[ja] >= 0 || rd.bridgeOf[jb] >= 0, tx: abx / l, tz: abz / l, px: ax + abx * t, pz: az + abz * t };
            }
          }
        }
      }
    }
    return best;
  }

  /**
   * A railway point that runs ALONGSIDE a road (track direction within ~35 deg of the road, closer than the clearance) is moved sideways
   * to the clearance distance. Crossings at a larger angle are left alone (they are resolved by a structure). Returns null if nothing to do.
   */
  pushFromRoad(x: number, z: number, dirx: number, dirz: number): [number, number] | null {
    const nr = this.nearestRoad(x, z, 60);
    if (!nr) return null;
    const hw = nr.road.halfWidth + nr.road.shoulder;
    // main roads: keep the whole formation (flat top + slopes) clear; city streets: only room for a viaduct pier beside them
    const clear = nr.road.tier === 4 ? hw + 5 : hw + 24;
    if (nr.d >= clear) return null;
    const sin = Math.abs(dirx * nr.tz - dirz * nr.tx);
    if (sin > (nr.road.tier === 4 ? 0.5 : 0.57)) return null;
    let nx = x - nr.px;
    let nz = z - nr.pz;
    const l = Math.hypot(nx, nz);
    if (l < 0.5) {
      nx = -nr.tz;
      nz = nr.tx;
    } else {
      nx /= l;
      nz /= l;
    }
    const k = clear - nr.d + 1;
    return [x + nx * k, z + nz * k];
  }

  /** Same as pushFromRoad / pushFromBridge, but returned as a half-plane the point must stay in: (p - (px,pz)) . (nx,nz) >= clear. */
  keepAway(x: number, z: number, dirx: number, dirz: number): { px: number; pz: number; nx: number; nz: number; clear: number } | null {
    const b = this.pushFromBridge(x, z, 45);
    if (b) {
      // nearest bridge point: direction from it to the point
      let best: { x: number; z: number; r: number } | null = null;
      let bd = Infinity;
      for (let cz = Math.floor((z - 80) / CELL); cz <= Math.floor((z + 80) / CELL); cz++) {
        for (let cx = Math.floor((x - 80) / CELL); cx <= Math.floor((x + 80) / CELL); cx++) {
          for (const id of this.bridgeCells.get(key(cx, cz)) ?? []) {
            const p = this.bridgePts[id];
            const d = Math.hypot(x - p.x, z - p.z) - p.r;
            if (d < bd) {
              bd = d;
              best = p;
            }
          }
        }
      }
      if (best) {
        const l = Math.hypot(x - best.x, z - best.z) || 1;
        return { px: best.x, pz: best.z, nx: (x - best.x) / l, nz: (z - best.z) / l, clear: best.r + 46 };
      }
    }
    const nr = this.nearestRoad(x, z, 60);
    if (!nr) return null;
    const hw = nr.road.halfWidth + nr.road.shoulder;
    const clear = nr.road.tier === 4 ? hw + 5 : hw + 24;
    if (nr.d >= clear + 2) return null;
    const sin = Math.abs(dirx * nr.tz - dirz * nr.tx);
    if (sin > (nr.road.tier === 4 ? 0.5 : 0.57)) return null;
    let nx = x - nr.px;
    let nz = z - nr.pz;
    const l = Math.hypot(nx, nz);
    if (l < 0.5) {
      nx = -nr.tz;
      nz = nr.tx;
    } else {
      nx /= l;
      nz /= l;
    }
    return { px: nr.px, pz: nr.pz, nx, nz, clear };
  }

  /** If (x, z) is within `margin` m of a road bridge (deck, abutments, piers), the nearest point outside that zone; otherwise null. */
  pushFromBridge(x: number, z: number, margin: number): [number, number] | null {
    let best: { p: { x: number; z: number; r: number }; d: number } | null = null;
    for (let cz = Math.floor((z - 80) / CELL); cz <= Math.floor((z + 80) / CELL); cz++) {
      for (let cx = Math.floor((x - 80) / CELL); cx <= Math.floor((x + 80) / CELL); cx++) {
        const a = this.bridgeCells.get(key(cx, cz));
        if (!a) continue;
        for (const id of a) {
          const p = this.bridgePts[id];
          const d = Math.hypot(x - p.x, z - p.z);
          if (d < p.r + margin && (!best || d - p.r < best.d - best.p.r)) best = { p, d };
        }
      }
    }
    if (!best) return null;
    const { p, d } = best;
    const k = (p.r + margin + 1) / Math.max(d, 1e-3);
    return [p.x + (x - p.x) * k, p.z + (z - p.z) * k];
  }

  /** Is (x, z) inside a road bridge (deck, abutments, piers) or within `margin` m of it? */
  nearRoadBridge(x: number, z: number, margin = 0): boolean {
    for (let cz = Math.floor((z - 40) / CELL); cz <= Math.floor((z + 40) / CELL); cz++) {
      for (let cx = Math.floor((x - 40) / CELL); cx <= Math.floor((x + 40) / CELL); cx++) {
        const a = this.bridgeCells.get(key(cx, cz));
        if (!a) continue;
        for (const id of a) {
          const p = this.bridgePts[id];
          if (Math.hypot(x - p.x, z - p.z) < p.r + margin) return true;
        }
      }
    }
    return false;
  }

  /**
   * Does a road (asphalt, shoulder, cut & fill slopes, junction pad plateau, bridge-abutment trimming) change the terrain at (x, z)?
   * Asked of the real terrain function, so it is exact: if the answer is no, a railway formation here cannot fight a road.
   */
  roadTouches(x: number, z: number): boolean {
    this.terrain.sampleNatural(x, z, this.sa);
    const h0 = this.sa.h;
    this.terrain.roads.apply(x, z, this.sa);
    return Math.abs(this.sa.h - h0) > 0.03;
  }

  /** Road, pad or road bridge at (x, z) (blocks a railway formation). */
  roadBlocked(x: number, z: number): boolean {
    return this.roadTouches(x, z) || this.nearRoadBridge(x, z, 0);
  }

  /** Can a viaduct pier column (half size `half`) stand at (x, z)? Not on / next to asphalt, not in a junction pad, not at a road bridge. */
  pierFree(x: number, z: number, half: number, gap: number): boolean {
    const nr = this.nearestRoad(x, z, 50);
    if (nr && nr.d < nr.road.halfWidth + nr.road.shoulder + half + gap) return false;
    for (const p of this.terrain.roads.pads) {
      if (Math.abs(p.x - x) > p.rCore + 60 || Math.abs(p.z - z) > p.rCore + 60) continue;
      if (Math.hypot(x - p.x, z - p.z) < p.rCore + half + gap) return false;
    }
    return !this.nearRoadBridge(x, z, 2);
  }

  /** The airport / seaport whose grounds (+ margin m) contain (x, z), or null. */
  facilityAt(x: number, z: number, margin: number): string | null {
    for (const f of RAIL_FACILITIES) if (x > f.x0 - margin && x < f.x1 + margin && z > f.z0 - margin && z < f.z1 + margin) return f.id;
    return null;
  }
}
