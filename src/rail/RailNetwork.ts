import { Config } from '../core/Config';
import type { RoadSpec } from '../roads/RoadTypes';
import { RailContext, type RailTerrain } from './RailContext';
import { bandOk, movingAverage, solveProfile } from './RailProfile';
import { LINES, RAIL_DESIGN as D, STATIONS, type StationKind } from './RailPlan';
import { buildDiamonds, buildSwitches, type RailDiamond, type RailSwitch } from './RailSwitches';

export type { RailTerrain } from './RailContext';

export interface RailStation {
  id: string;
  kind: StationKind;
  x: number;
  z: number;
  radius: number;
  /** Mean natural ground height (m) and height spread (m) of the station area. */
  y: number;
  spread: number;
  /** Height (m) of the platforms (top of ballast). Equal to the ground level, or higher when the station is ELEVATED over streets. */
  level: number;
  /** True: the station zone stands on a viaduct above roads (no road is ever cut or buried by a platform). */
  elevated: boolean;
  /** Lines that end here: edge id, which end of the edge, and the bearing (rad, atan2(dz, dx)) of the straight platform approach. */
  arrivals: { edgeId: string; end: 'a' | 'b'; bearing: number }[];
}

/**
 * STAGE 13: a station link joins the inner ends (buffer-stop end, `D.endR` m from the station centre) of two lines of one station by a
 * smooth S-free curve at the platform level, so a train can run through the station from line `a` to line `b` (both directions).
 * Only pairs that can be joined with a radius >= `D.linkMinRadius` get a link; the others stay terminal (the train reverses).
 */
export interface RailLink {
  id: string;
  station: string;
  /** The two lines joined (edge ids) and the end of each edge that touches the station. */
  a: { edgeId: string; end: 'a' | 'b' };
  b: { edgeId: string; end: 'a' | 'b' };
  /** Centre line, from the end of `a` to the end of `b`, about every 10 m. */
  xs: Float64Array;
  zs: Float64Array;
  length: number;
  /** Smallest curve radius (m). */
  minRadius: number;
  /** Platform level (top of ballast) the whole link lies at. */
  level: number;
  /** True: the link stands on a viaduct deck (elevated station). */
  elevated: boolean;
  /** The link as a one-segment edge (flat at the platform level) so the track / deck mesh code can treat it like a line. Not part of `edges`. */
  edge: RailEdge;
}

/** ground = on the formation (embankment / cutting); tunnel = under a hill; bridge = viaduct / bridge deck; cutcover = box under a road. */
export type RailSegmentKind = 'ground' | 'tunnel' | 'bridge' | 'cutcover';
export type RailSegmentWhy = 'open' | 'water' | 'valley' | 'hill' | 'overpass' | 'underpass' | 'conflict' | 'station';
export interface RailSegment {
  kind: RailSegmentKind;
  why: RailSegmentWhy;
  /** Distance along the edge (m). */
  s0: number;
  s1: number;
}

export interface RailPier {
  edgeId: string;
  s: number;
  x: number;
  z: number;
  /** Ground / river-bed height under the pier (m) and the height of the top of ballast above it (m). */
  baseY: number;
  deckY: number;
  /** Unit direction of the track. */
  dx: number;
  dz: number;
}

export interface RailEdge {
  id: string;
  from: string;
  to: string;
  xs: Float64Array;
  zs: Float64Array;
  /** Natural ground height under each point (m). */
  ground: Float32Array;
  /** Designed height of the top of the ballast (m). */
  design: Float32Array;
  /** Water surface height under each point (NaN = dry). */
  water: Float32Array;
  /** Distance along the edge from point 0 (m). */
  cum: Float64Array;
  length: number;
  segments: RailSegment[];
  /** Smallest curve radius of the smoothed path (m) and steepest design grade (rise / run). */
  minRadius: number;
  maxGrade: number;
  /** Share (0..1) of the path over water. */
  wetShare: number;
  /** Length (m) of the flat, straight station approach at the start (edge.from) and at the end (edge.to). */
  zoneA: number;
  zoneB: number;
}

/** How a road and the railway cross (all crossings are grade-separated, never at the same level). */
export type CrossingKind =
  | 'road-over-rail' // the road stays on the ground, the rail passes in a concrete box (cut & cover) under it
  | 'rail-over-road' // rail on a viaduct, the road passes under it with 5.2 m clearance
  | 'rail-tunnel' // rail in a tunnel, the road passes over the hill
  | 'rail-under-bridge'; // the road is already on a bridge here, the rail passes under it

export interface RailCrossing {
  x: number;
  z: number;
  edgeId: string;
  /** Distance along the rail edge (m). */
  s: number;
  roadId: number;
  roadName: string;
  roadTier: 1 | 2 | 3 | 4;
  kind: CrossingKind;
}

const STEP = 60;
const N = Math.round(Config.world.size / STEP);
const HALF = Config.world.size / 2;
const cellX = (i: number): number => -HALF + (i + 0.5) * STEP;
const cellI = (x: number): number => Math.max(0, Math.min(N - 1, Math.floor((x + HALF) / STEP)));

// 16 neighbour moves (8 + 8 knight moves): paths bend more smoothly than on a plain 8-neighbour grid.
const MOVES: ReadonlyArray<readonly [number, number]> = [
  [1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1],
  [2, 1], [2, -1], [-2, 1], [-2, -1], [1, 2], [1, -2], [-1, 2], [-1, -2],
];

/** Fine step (m) of the conflict scan along the line. */
const SCAN = 5;
/** Deck underside to top of ballast (m): ballast + girder. */
const DECK_DEPTH = D.ballast + D.deckThick;
const OVER_RISE = D.roadClearance + DECK_DEPTH + 0.06; // top of ballast above a road it crosses over (0.3 m margin)
const WATER_RISE = D.waterClearance + DECK_DEPTH; // top of ballast above the highest water

/** A run along a line where the formation would fight something else (a road, a pad, a road bridge). */
interface Conflict {
  a: number;
  b: number;
  roadYMax: number;
  roadYMin: number;
  /** A road centre line crosses the track inside the run. */
  crosses: boolean;
  /** The run touches a road BRIDGE (deck / piers). */
  roadBridge: boolean;
  roads: Set<number>;
}

/** One structure window decided for a line, in metres along the edge. */
interface Zone {
  a: number;
  b: number;
  /** Road surface height at the crossing (m); the deck top for a road on a bridge. */
  y: number;
  bridge: boolean;
}

interface Window {
  a: number;
  b: number;
  kind: 'over' | 'under' | 'free' | 'under-bridge';
  /** Where a road passes UNDER or OVER the line: the vertical clearance rules apply only inside these zones. */
  zones: Zone[];
}

/** Binary min-heap of (key, value) pairs. */
class Heap {
  private k: number[] = [];
  private v: number[] = [];
  get size(): number {
    return this.k.length;
  }
  push(key: number, val: number): void {
    let i = this.k.length;
    this.k.push(key);
    this.v.push(val);
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (this.k[p] <= this.k[i]) break;
      [this.k[p], this.k[i]] = [this.k[i], this.k[p]];
      [this.v[p], this.v[i]] = [this.v[i], this.v[p]];
      i = p;
    }
  }
  pop(): number {
    const top = this.v[0];
    const lk = this.k.pop()!;
    const lv = this.v.pop()!;
    if (this.k.length) {
      this.k[0] = lk;
      this.v[0] = lv;
      let i = 0;
      for (;;) {
        const l = 2 * i + 1;
        const r = l + 1;
        let m = i;
        if (l < this.k.length && this.k[l] < this.k[m]) m = l;
        if (r < this.k.length && this.k[r] < this.k[m]) m = r;
        if (m === i) break;
        [this.k[m], this.k[i]] = [this.k[i], this.k[m]];
        [this.v[m], this.v[i]] = [this.v[i], this.v[m]];
        i = m;
      }
    }
    return top;
  }
}


/**
 * The railway network: station areas + double-track lines between them, fully designed (plan, long section, structures).
 * Deterministic: depends only on the terrain (seed), the finished road network and the plan in RailPlan.ts.
 *
 * DESIGN RULES (why nothing else gets in the way):
 *   1. The router avoids: lakes / sea, junction pads, road bridges, the airport and seaport grounds, and (strongly) running along roads.
 *   2. Every place where the formation would still touch a road, pad or road bridge becomes a STRUCTURE, never an earthwork:
 *        rail over road   -> viaduct, girder 5.2 m above the road          (terrain below is left alone)
 *        rail under road  -> concrete box (cut & cover) 7.4 m below the road (the road stays on the ground)
 *        parallel / pad   -> viaduct (terrain below is left alone)
 *   3. Rivers are bridged (deck >= highest water + 2.5 m); no earthwork ever touches wet ground.
 *   4. Viaduct piers only stand where a pier is free of asphalt, shoulder, pads and road bridges (searched along the line).
 *   5. Stations: flat straight platform approaches (0 % grade); a station whose platforms would touch streets is ELEVATED.
 *   6. Long section: <= 2.5 % grade, vertical curves, deep cuts become tunnels, high fills become viaducts.
 */
export class RailNetwork {
  readonly stations: RailStation[] = [];
  readonly edges: RailEdge[] = [];
  readonly crossings: RailCrossing[] = [];
  readonly piers: RailPier[] = [];
  /** STAGE 13: through-running links inside the stations (data only; no mesh yet). */
  readonly links: RailLink[] = [];
  /** STAGE 13 / Step 4: turnouts where two links leave the same line end (both tracks), and diamond crossings where link tracks cross. */
  readonly switches: RailSwitch[] = [];
  readonly diamonds: RailDiamond[] = [];
  /** STAGE 13: lines that need a grade above the normal limit, with the reason (documented exceptions; checked by test:rail). */
  readonly gradeNotes: string[] = [];
  /** Problems the design could not solve (empty = clean). Checked by scripts/rail-plan-test.ts. */
  readonly issues: string[] = [];

  // coarse grid (STEP m)
  private h = new Float32Array(N * N);
  /** 0 = dry, 1 = river / shallow water (a bridge is needed), 2 = lake / sea (blocked). */
  private wet = new Uint8Array(N * N);
  /** 0 = no road, 1..3 = tier of the main road in the cell. */
  private road = new Uint8Array(N * N);
  /** 1 = junction pad nearby, 3 = road bridge nearby (the router keeps away), 2 = inside a facility (blocked). */
  private near = new Uint8Array(N * N);
  private sc;
  private ctx: RailContext;
  private roadBuckets = new Map<number, { r: RoadSpec; i: number }[]>();

  constructor(private terrain: RailTerrain) {
    this.sc = terrain.makeSample();
    this.ctx = new RailContext(terrain);
    this.buildGrid();
    this.placeStations();
    this.indexRoads();
    const grid = this.routeGrid();
    this.fixArrivals(grid);
    const aligned = LINES.map((l, k) => this.alignment(l.id, l.from, l.to, grid[k]));
    this.elevateStations(aligned);
    for (const a of aligned) this.edges.push(this.design(a));
    this.findCrossings();
    this.placePiers();
    this.buildLinks();
    this.switches.push(...buildSwitches(this.links));
    this.diamonds.push(...buildDiamonds(this.links));
    this.checkClearances();
  }

  stationById(id: string): RailStation | undefined {
    return this.stations.find((s) => s.id === id);
  }

  /** The station area that contains (x, z), or null. */
  stationAt(x: number, z: number): RailStation | null {
    for (const s of this.stations) if (Math.hypot(x - s.x, z - s.z) <= s.radius) return s;
    return null;
  }

  /** Total length of all rail edges (km). */
  get lengthKm(): number {
    return this.edges.reduce((a, e) => a + e.length, 0) / 1000;
  }

  /* ---------------------------------------------------------------- grid */

  private buildGrid(): void {
    const sc = this.sc;
    const off = [0, -20, 20];
    for (let j = 0; j < N; j++) {
      for (let i = 0; i < N; i++) {
        const x = cellX(i);
        const z = cellX(j);
        this.terrain.sampleNatural(x, z, sc);
        const k = j * N + i;
        this.h[k] = sc.h;
        let wetN = 0;
        let deep = 0;
        let n = 0;
        for (const dx of off) {
          for (const dz of off) {
            if (dx !== 0 && dz !== 0) continue; // plus-shaped probe: centre + 4 neighbours
            n++;
            if (dx === 0 && dz === 0) this.terrain.sampleNatural(x, z, sc);
            else this.terrain.sampleNatural(x + dx, z + dz, sc);
            if (!Number.isNaN(sc.water) && sc.h <= sc.water + 0.3) {
              wetN++;
              if (sc.water - sc.h > 2.5) deep++;
            }
          }
        }
        this.wet[k] = wetN === 0 ? 0 : deep >= 3 || wetN >= n - 1 ? 2 : 1;
        // facilities (airport, seaport): the grounds + 50 m are closed to the railway (stations stand outside)
        if (this.ctx.facilityAt(x, z, 50 + STEP * 0.5)) this.near[k] = 2;
      }
    }
    // roads of tier 1-3: mark the cells they pass (finer than the grid so no cell is skipped)
    for (const r of this.terrain.roads.roads) {
      if (r.tier > 3) continue;
      for (let a = 0; a < r.xs.length - 1; a++) {
        const len = Math.hypot(r.xs[a + 1] - r.xs[a], r.zs[a + 1] - r.zs[a]);
        const steps = Math.max(1, Math.ceil(len / 20));
        for (let q = 0; q <= steps; q++) {
          const t = q / steps;
          const k = cellI(r.zs[a] + (r.zs[a + 1] - r.zs[a]) * t) * N + cellI(r.xs[a] + (r.xs[a + 1] - r.xs[a]) * t);
          if (!this.road[k] || r.tier < this.road[k]) this.road[k] = r.tier;
        }
      }
    }
    // junction pads and road bridges: the router keeps 70 m away (a crossing is made between junctions, not through them)
    const mark = (x: number, z: number, reach: number, bridge = false): void => {
      for (let j = cellI(z - reach); j <= cellI(z + reach); j++) {
        for (let i = cellI(x - reach); i <= cellI(x + reach); i++) {
          if (Math.hypot(cellX(i) - x, cellX(j) - z) <= reach + STEP * 0.5 && this.near[j * N + i] !== 2 && this.near[j * N + i] < (bridge ? 3 : 1)) this.near[j * N + i] = bridge ? 3 : 1;
        }
      }
    };
    for (const p of this.terrain.roads.pads) mark(p.x, p.z, p.rCore + p.emb + 45);
    for (const b of this.terrain.roads.bridges) {
      const r = this.terrain.roads.roads[b.roadId];
      for (let i = b.i0; i <= b.i1; i += 2) mark(r.xs[i], r.zs[i], b.deckHalfWidth + 110, true);
    }
  }

  /* ---------------------------------------------------------------- stations */

  private placeStations(): void {
    const sc = this.sc;
    for (const p of STATIONS) {
      let best = { x: p.x, z: p.z, score: Infinity, y: 0, spread: 0 };
      const span = Math.max(60, Math.ceil(p.snap / 40)) * 40;
      for (let dx = -span; dx <= span; dx += 40) {
        for (let dz = -span; dz <= span; dz += 40) {
          const d = Math.hypot(dx, dz);
          if (d > p.snap) continue;
          const x = p.x + dx;
          const z = p.z + dz;
          if (Math.abs(x) > HALF - 400 || Math.abs(z) > HALF - 400) continue;
          // sample the station disc: height spread + wetness (+ the airport / seaport grounds: never)
          let lo = Infinity;
          let hi = -Infinity;
          let sum = 0;
          let wet = 0;
          let bad = 0;
          let n = 0;
          for (let a = -p.radius; a <= p.radius; a += p.radius / 2) {
            for (let b = -p.radius; b <= p.radius; b += p.radius / 2) {
              if (Math.hypot(a, b) > p.radius) continue;
              this.terrain.sampleNatural(x + a, z + b, sc);
              n++;
              sum += sc.h;
              lo = Math.min(lo, sc.h);
              hi = Math.max(hi, sc.h);
              if (!Number.isNaN(sc.water) && sc.h <= sc.water + 0.3) wet++;
              if (this.ctx.facilityAt(x + a, z + b, 40)) bad++;
            }
          }
          // junction pads / road bridges inside the station area are very bad for platforms (the area would have to be a viaduct over a junction)
          let pads = 0;
          for (const pd of this.terrain.roads.pads) if (Math.hypot(pd.x - x, pd.z - z) < p.radius + pd.rCore) pads++;
          const score = hi - lo + (wet / n) * 400 + (bad / n) * 4000 + pads * 25 + d * 0.01;
          if (score < best.score) best = { x, z, score, y: sum / n, spread: hi - lo };
        }
      }
      this.stations.push({ id: p.id, kind: p.kind, x: best.x, z: best.z, radius: p.radius, y: best.y, spread: best.spread, level: best.y, elevated: false, arrivals: [] });
    }
  }

  /* ---------------------------------------------------------------- routing */

  private nearestFree(x: number, z: number): number {
    const ci = cellI(x);
    const cj = cellI(z);
    let bestK = cj * N + ci;
    let bestD = Infinity;
    for (let r = 0; r < 12; r++) {
      for (let dj = -r; dj <= r; dj++) {
        for (let di = -r; di <= r; di++) {
          const i = ci + di;
          const j = cj + dj;
          if (i < 1 || j < 1 || i >= N - 1 || j >= N - 1) continue;
          const k = j * N + i;
          if (this.wet[k] === 2 || this.near[k] === 2) continue;
          const d = di * di + dj * dj;
          if (d < bestD) {
            bestD = d;
            bestK = k;
          }
        }
      }
      if (bestD < Infinity) break;
    }
    return bestK;
  }

  /** A* from cell `a` to cell `b`; returns the cell centres. */
  private astar(a: number, b: number, strict: boolean): number[][] | null {
    const gScore = new Float64Array(N * N).fill(Infinity);
    const from = new Int32Array(N * N).fill(-1);
    const done = new Uint8Array(N * N);
    const heap = new Heap();
    const bi = b % N;
    const bj = (b / N) | 0;
    const heur = (k: number): number => Math.hypot(((k % N) - bi) * STEP, (((k / N) | 0) - bj) * STEP);
    gScore[a] = 0;
    heap.push(heur(a), a);
    while (heap.size) {
      const k = heap.pop();
      if (done[k]) continue;
      done[k] = 1;
      if (k === b) break;
      const i = k % N;
      const j = (k / N) | 0;
      for (const [di, dj] of MOVES) {
        const ni = i + di;
        const nj = j + dj;
        if (ni < 1 || nj < 1 || ni >= N - 1 || nj >= N - 1) continue;
        const nk = nj * N + ni;
        if (done[nk] || this.wet[nk] === 2 || this.near[nk] === 2 || (strict && this.near[nk] === 3)) continue;
        const dist = Math.hypot(di, dj) * STEP;
        const grade = Math.abs(this.h[nk] - this.h[k]) / dist;
        if (grade > 0.3) continue; // a cliff: not even a tunnel
        // steep ground is not forbidden (the line goes under it in a tunnel) but it is expensive
        let cost = dist * (1 + Math.min(18 * (grade / 0.03) ** 2, 30));
        if (this.wet[nk] === 1) cost += 2500; // river: a bridge. Cross it, never run along it
        if (this.near[nk] === 1) cost += 7 * dist; // junction pad nearby: keep away
        if (this.near[nk] === 3) cost += 45 * dist; // road bridge nearby: a railway bridge needs its own ground
        if (this.road[nk]) cost += this.road[k] ? 260 * (dist / STEP) : 160; // crossing a road costs; running along a road costs more
        const g = gScore[k] + cost;
        if (g < gScore[nk]) {
          gScore[nk] = g;
          from[nk] = k;
          heap.push(g + heur(nk), nk);
        }
      }
    }
    const path: number[][] = [];
    let c = b;
    if (from[b] === -1 && a !== b) return strict ? null : [[cellX(a % N), cellX((a / N) | 0)], [cellX(bi), cellX(bj)]];
    while (c !== -1) {
      path.push([cellX(c % N), cellX((c / N) | 0)]);
      c = from[c];
    }
    return path.reverse();
  }

  private routeGrid(): number[][][] {
    return LINES.map((line) => {
      const sa = this.stationById(line.from)!;
      const sb = this.stationById(line.to)!;
      const pts: number[][] = [];
      const stops: [number, number][] = [[sa.x, sa.z], ...line.via.map((v) => [v[0], v[1]] as [number, number]), [sb.x, sb.z]];
      for (let q = 0; q < stops.length - 1; q++) {
        const ka = this.nearestFree(stops[q][0], stops[q][1]);
        const kb = this.nearestFree(stops[q + 1][0], stops[q + 1][1]);
        // road-bridge zones are closed to the railway (a rail bridge needs its own river crossing); only if no path exists they are crossable
        const seg = this.astar(ka, kb, true) ?? this.astar(ka, kb, false)!;
        pts.push(...(q === 0 ? seg : seg.slice(1)));
      }
      return this.smoothFree(pts, sa, sb);
    });
  }

  /**
   * Relaxation kernel (typed arrays, no allocation in the loops).
   * mode 0: Laplacian (every free point moves to the middle of its neighbours) - shortens / straightens the path;
   * mode 1: bending energy (4th difference) - keeps tangents, gives gentle railway curves.
   * Free points stay within `clamp` m of `orig`; with `refresh` > 0 they are also kept out of road-bridge zones and off the roads they
   * run alongside (hard half-plane constraints re-evaluated every `refresh` iterations until iteration `stop`; `soft` < 1 = partial push).
   */
  private relax(pts: number[][], pin: Uint8Array | undefined, orig: number[][], mode: 0 | 1, iters: number, clamp: number, refresh: number, stop: number, soft: number, r0 = 1, r1 = pts.length - 2): void {
    const m = pts.length;
    const px = new Float64Array(m);
    const pz = new Float64Array(m);
    const ox = new Float64Array(m);
    const oz = new Float64Array(m);
    for (let i = 0; i < m; i++) {
      px[i] = pts[i][0];
      pz[i] = pts[i][1];
      ox[i] = orig[i][0];
      oz[i] = orig[i][1];
    }
    const has = new Uint8Array(m);
    const cpx = new Float64Array(m);
    const cpz = new Float64Array(m);
    const cnx = new Float64Array(m);
    const cnz = new Float64Array(m);
    const ccl = new Float64Array(m);
    const lam = mode === 1 ? 0.04 : 0.5;
    const last = m - 1;
    for (let it = 0; it < iters; it++) {
      if (refresh > 0) {
        if (it % refresh === 0 && it < stop) {
          for (let i = r0; i <= r1; i++) {
            if (pin && pin[i]) {
              has[i] = 0;
              continue;
            }
            const dx = px[i + 1] - px[i - 1];
            const dz = pz[i + 1] - pz[i - 1];
            const l = Math.hypot(dx, dz) || 1;
            const c = this.ctx.keepAway(px[i], pz[i], dx / l, dz / l);
            if (c) {
              has[i] = 1;
              cpx[i] = c.px;
              cpz[i] = c.pz;
              cnx[i] = c.nx;
              cnz[i] = c.nz;
              ccl[i] = c.clear;
            } else has[i] = 0;
          }
        } else if (it === stop) has.fill(0);
      }
      for (let i = r0; i <= r1; i++) {
        if (pin && pin[i]) continue;
        let nx: number;
        let nz: number;
        if (mode === 0) {
          nx = px[i] + lam * ((px[i - 1] + px[i + 1]) / 2 - px[i]);
          nz = pz[i] + lam * ((pz[i - 1] + pz[i + 1]) / 2 - pz[i]);
        } else {
          const i2 = i < 2 ? 0 : i - 2;
          const j2 = i + 2 > last ? last : i + 2;
          nx = px[i] - lam * (px[i2] - 4 * px[i - 1] + 6 * px[i] - 4 * px[i + 1] + px[j2]);
          nz = pz[i] - lam * (pz[i2] - 4 * pz[i - 1] + 6 * pz[i] - 4 * pz[i + 1] + pz[j2]);
        }
        const dx = nx - ox[i];
        const dz = nz - oz[i];
        const d2 = dx * dx + dz * dz;
        if (d2 > clamp * clamp) {
          const k = clamp / Math.sqrt(d2);
          nx = ox[i] + dx * k;
          nz = oz[i] + dz * k;
        }
        if (has[i]) {
          const g = (nx - cpx[i]) * cnx[i] + (nz - cpz[i]) * cnz[i];
          if (g < ccl[i]) {
            nx += cnx[i] * (ccl[i] - g) * soft;
            nz += cnz[i] * (ccl[i] - g) * soft;
          }
        }
        px[i] = nx;
        pz[i] = nz;
      }
    }
    for (let i = 0; i < m; i++) {
      pts[i][0] = px[i];
      pts[i][1] = pz[i];
    }
  }

  /** The router's grid path, smoothed to railway curves with FREE ends at the station centres (used to find natural arrival directions). */
  private smoothFree(grid: number[][], sa: RailStation, sb: RailStation): number[][] {
    let pts = this.resample([[sa.x, sa.z], ...grid, [sb.x, sb.z]], D.step);
    const orig = pts.map((p) => [p[0], p[1]]);
    this.relax(pts, undefined, orig, 0, 4000, 520, 40, 3200, 0.55);
    pts = this.resample(pts, D.step);
    return pts;
  }

  /**
   * Arrival bearings: each line arrives at its station on a straight, flat platform approach. The bearing follows the router's path
   * (the first point 420 m from the station); lines at the same station are then fanned apart so platforms never overlap.
   */
  private fixArrivals(grid: number[][][]): void {
    const bearingOf = (_st: RailStation, pts: number[][], reverse: boolean): number => {
      const seq = reverse ? [...pts].reverse() : pts;
      // tangent of the smoothed path 330 m from the station (arc length), pointing away from the station
      let arc = 0;
      let k = 1;
      while (k < seq.length - 2 && arc < 290) {
        arc += Math.hypot(seq[k][0] - seq[k - 1][0], seq[k][1] - seq[k - 1][1]);
        k++;
      }
      const p = seq[Math.max(0, k - 2)];
      const q = seq[Math.min(seq.length - 1, k + 2)];
      return Math.atan2(q[1] - p[1], q[0] - p[0]);
    };
    LINES.forEach((l, k) => {
      this.stationById(l.from)!.arrivals.push({ edgeId: l.id, end: 'a', bearing: bearingOf(this.stationById(l.from)!, grid[k], false) });
      this.stationById(l.to)!.arrivals.push({ edgeId: l.id, end: 'b', bearing: bearingOf(this.stationById(l.to)!, grid[k], true) });
    });
    const gap = (D.minArrivalGap * Math.PI) / 180;
    const wrap = (a: number): number => Math.atan2(Math.sin(a), Math.cos(a));
    const fan = (): void => {
      for (const st of this.stations) {
        const arr = st.arrivals;
        for (let it = 0; it < 200 && arr.length > 1; it++) {
          let moved = false;
          for (let i = 0; i < arr.length; i++) {
            for (let j = i + 1; j < arr.length; j++) {
              const d = wrap(arr[j].bearing - arr[i].bearing);
              if (Math.abs(d) < gap) {
                const push = (gap - Math.abs(d)) / 2 + 1e-3;
                const sgn = d >= 0 ? 1 : -1;
                arr[i].bearing = wrap(arr[i].bearing - sgn * push);
                arr[j].bearing = wrap(arr[j].bearing + sgn * push);
                moved = true;
              }
            }
          }
          if (!moved) break;
        }
      }
    };
    fan();
    // A straight platform approach must not run along or over a road: turn it (up to 45 deg) to the direction with the fewest conflicts.
    const rayCost = (st: RailStation, b: number): number => {
      let c = 0;
      for (let r = D.endR; r <= D.stationFlat; r += 20) {
        const x = st.x + Math.cos(b) * r;
        const z = st.z + Math.sin(b) * r;
        if (this.ctx.facilityAt(x, z, 60)) c += 50;
        for (const u of [0, -9, 9]) {
          const px = x - Math.sin(b) * u;
          const pz = z + Math.cos(b) * u;
          if (this.ctx.roadBlocked(px, pz)) c += u === 0 ? 3 : 1;
        }
        const nr = this.ctx.nearestRoad(x, z, 40);
        if (nr && nr.d < nr.road.halfWidth + nr.road.shoulder + 14) c += 1;
        if (this.wetAt(x, z)) c += 6;
      }
      return c;
    };
    for (let round = 0; round < 2; round++) {
      for (const st of this.stations) {
        for (const ar of st.arrivals) {
          let best = ar.bearing;
          let bestCost = rayCost(st, ar.bearing);
          for (let k = 1; k <= 15 && bestCost > 0; k++) {
            for (const sg of [1, -1]) {
              const b = wrap(ar.bearing + sg * k * 3 * (Math.PI / 180));
              // keep the 26 deg fan: skip directions that crowd another arrival
              if (st.arrivals.some((o) => o !== ar && Math.abs(wrap(o.bearing - b)) < gap)) continue;
              const c = rayCost(st, b) + k * 0.15;
              if (c < bestCost) {
                bestCost = c;
                best = b;
              }
            }
          }
          ar.bearing = best;
        }
      }
      fan();
    }
  }

  /* ---------------------------------------------------------------- alignment (plan view) */

  private indexRoads(): void {
    const B = 250;
    const key = (bx: number, bz: number): number => (bx + 100) * 1000 + (bz + 100);
    for (const r of this.terrain.roads.roads) {
      for (let i = 0; i < r.xs.length - 1; i++) {
        const k = key(Math.floor(r.xs[i] / B), Math.floor(r.zs[i] / B));
        (this.roadBuckets.get(k) ?? this.roadBuckets.set(k, []).get(k)!).push({ r, i });
      }
    }
  }

  /** Roads whose centre line crosses the polyline (all places, with the distance along the line). */
  private crossingsOf(xs: Float64Array, zs: Float64Array, cum: Float64Array): AlignedCross[] {
    const B = 250;
    const key = (bx: number, bz: number): number => (bx + 100) * 1000 + (bz + 100);
    const out: AlignedCross[] = [];
    for (let a = 0; a < xs.length - 1; a++) {
      const bx = Math.floor(xs[a] / B);
      const bz = Math.floor(zs[a] / B);
      for (let dx = -1; dx <= 1; dx++) {
        for (let dz = -1; dz <= 1; dz++) {
          for (const { r, i } of this.roadBuckets.get(key(bx + dx, bz + dz)) ?? []) {
            const hit = segIntersect(xs[a], zs[a], xs[a + 1], zs[a + 1], r.xs[i], r.zs[i], r.xs[i + 1], r.zs[i + 1]);
            if (!hit) continue;
            const s = cum[a] + hit.t * (cum[a + 1] - cum[a]);
            if (out.some((c) => c.road.id === r.id && Math.abs(c.s - s) < 30)) continue;
            const tr = Math.hypot(hit.x - r.xs[i], hit.z - r.zs[i]) / (Math.hypot(r.xs[i + 1] - r.xs[i], r.zs[i + 1] - r.zs[i]) || 1);
            out.push({ s, x: hit.x, z: hit.z, road: r, i, y: r.ys[i] + (r.ys[i + 1] - r.ys[i]) * Math.min(1, tr), onBridge: r.bridgeOf[i] >= 0 || r.bridgeOf[i + 1] >= 0 });
          }
        }
      }
    }
    return out.sort((p, q) => p.s - q.s);
  }

  /** Straight flat station approaches at both ends, the router's path in between, smoothed to railway curves. */
  private alignment(id: string, from: string, to: string, grid: number[][]): Aligned {
    const sa = this.stationById(from)!;
    const sb = this.stationById(to)!;
    const ba = sa.arrivals.find((q) => q.edgeId === id && q.end === 'a')!.bearing;
    const bb = sb.arrivals.find((q) => q.edgeId === id && q.end === 'b')!.bearing;
    const at = (st: RailStation, b: number, r: number): number[] => [st.x + Math.cos(b) * r, st.z + Math.sin(b) * r];
    const zoneLen = D.stationFlat - D.endR;
    // `grid` is the already smoothed natural path (see smoothFree). Its ends are replaced by the straight platform approaches.
    const far = D.stationFlat + 30;
    const mid = grid.filter((p) => Math.hypot(p[0] - sa.x, p[1] - sa.z) > far && Math.hypot(p[0] - sb.x, p[1] - sb.z) > far);
    const raw = [at(sa, ba, D.endR), at(sa, ba, D.stationFlat), ...mid, at(sb, bb, D.stationFlat), at(sb, bb, D.endR)];
    let pts = this.resample(raw, D.step);
    // pinned = the straight station approaches (they never move)
    const total0 = (() => {
      let c = 0;
      for (let i = 1; i < pts.length; i++) c += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
      return c;
    })();
    const pin = new Uint8Array(pts.length);
    {
      let c = 0;
      for (let i = 0; i < pts.length; i++) {
        if (i) c += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
        if (c <= zoneLen + 1e-6 || total0 - c <= zoneLen + 1e-6) pin[i] = 1;
      }
    }
    const orig = pts.map((p) => [p[0], p[1]]);
    // 1. shorten / straighten (Laplacian), soft clearance from roads; 2. elastic band (bending energy) with HARD clearance:
    //    the line behaves like a stiff rod pushed against obstacles - smooth curves, never closer than the clearance.
    this.relax(pts, pin, orig, 0, 4000, 520, 40, 3200, 0.55);
    this.relax(pts, pin, orig, 1, 5000, 520, 80, 4000, 1.0);
    // 3. tangent-continuous joint: the free points right after each straight approach are re-smoothed (bending energy) so the curve
    //    leaves the straight exactly along it (no kink), with the fixed points on both sides as boundary.
    {
      const m = pts.length;
      let pA = 0;
      while (pA + 1 < m && pin[pA + 1]) pA++;
      let pB = m - 1;
      while (pB - 1 >= 0 && pin[pB - 1]) pB--;
      const W = 44;
      const ranges: [number, number][] = [[pA + 1, Math.min(pA + W, m - 3)], [Math.max(pB - W, 2), pB - 1]];
      for (const [r0, r1] of ranges) if (r1 > r0) this.relax(pts, undefined, pts.map((p) => [p[0], p[1]]), 1, 6000, 1e9, 0, 0, 1, r0, r1);
    }
    // 4. gentle-curve pass: wherever the radius is still below `curveGoal`, the points around it are stiffened (bending energy) again,
    //    never moving a point more than `curveMove` m and never closer to a road than the hard clearance. A round is kept only if it
    //    raises the smallest radius of the line (the pass may never make a line worse).
    pts = this.resample(pts, D.step);
    const radii = (q: number[][]): { min: number; lo: number; hi: number } => {
      let min = Infinity, lo = Infinity, hi = -1;
      for (let i = 3; i < q.length - 3; i++) {
        if (i < pin.length && pin[i]) continue;
        const r = circumRadius(q[i - 3][0], q[i - 3][1], q[i][0], q[i][1], q[i + 3][0], q[i + 3][1]);
        if (r < min) min = r;
        if (r < D.curveGoal) { lo = Math.min(lo, i); hi = Math.max(hi, i); }
      }
      return { min, lo, hi };
    };
    for (let round = 0; round < 8; round++) {
      const cur = radii(pts);
      if (cur.hi < 0) break;
      const m = pts.length;
      const trial = pts.map((p) => [p[0], p[1]]);
      const base = pts.map((p) => [p[0], p[1]]);
      const pin2 = new Uint8Array(m);
      for (let i = 0; i < m; i++) pin2[i] = i < pin.length && pin[i] ? 1 : 0;
      this.relax(trial, pin2, base, 1, 60000, D.curveMove, 40, 45000, 1.0, Math.max(2, cur.lo - D.curveWindow), Math.min(m - 3, cur.hi + D.curveWindow));
      const res = this.resample(trial, D.step);
      if (radii(res).min > cur.min + 1) pts = res;
      else break;
    }
    const n = pts.length;
    const xs = new Float64Array(n);
    const zs = new Float64Array(n);
    const cum = new Float64Array(n);
    const ground = new Float32Array(n);
    const water = new Float32Array(n).fill(NaN);
    const wet = new Uint8Array(n);
    for (let i = 0; i < n; i++) {
      xs[i] = pts[i][0];
      zs[i] = pts[i][1];
      if (i) cum[i] = cum[i - 1] + Math.hypot(xs[i] - xs[i - 1], zs[i] - zs[i - 1]);
      this.terrain.sampleNatural(xs[i], zs[i], this.sc);
      ground[i] = this.sc.h;
      if (!Number.isNaN(this.sc.water) && this.sc.h <= this.sc.water + 0.3) {
        wet[i] = 1;
        water[i] = this.sc.water;
      }
    }
    // minimum curve radius (circle through points 3 samples apart)
    let minRadius = Infinity;
    const k = 3;
    for (let i = k; i < n - k; i++) {
      const r = circumRadius(xs[i - k], zs[i - k], xs[i], zs[i], xs[i + k], zs[i + k]);
      if (r < minRadius) minRadius = r;
    }
    return { id, from, to, xs, zs, cum, ground, water, wet, minRadius, zoneA: zoneLen, zoneB: zoneLen, cross: this.crossingsOf(xs, zs, cum) };
  }

  /** Is (x, z) on a road, pad or road bridge (a place no railway structure may stand on)? */
  roadBlockedAt(x: number, z: number): boolean {
    return this.ctx.roadBlocked(x, z);
  }

  /** Position and unit direction at distance s along a polyline. */
  pointAt(a: { xs: Float64Array; zs: Float64Array; cum: Float64Array }, s: number): { x: number; z: number; dx: number; dz: number; i: number } {
    const n = a.cum.length;
    let i = 0;
    let lo = 0;
    let hi = n - 2;
    while (lo <= hi) {
      const m = (lo + hi) >> 1;
      if (a.cum[m] <= s) {
        i = m;
        lo = m + 1;
      } else hi = m - 1;
    }
    i = Math.max(0, Math.min(n - 2, i));
    const len = a.cum[i + 1] - a.cum[i] || 1;
    const t = Math.max(0, Math.min(1, (s - a.cum[i]) / len));
    const dx = (a.xs[i + 1] - a.xs[i]) / len;
    const dz = (a.zs[i + 1] - a.zs[i]) / len;
    return { x: a.xs[i] + (a.xs[i + 1] - a.xs[i]) * t, z: a.zs[i] + (a.zs[i + 1] - a.zs[i]) * t, dx, dz, i };
  }

  private wetAt(x: number, z: number): boolean {
    this.terrain.sampleNatural(x, z, this.sc);
    return !Number.isNaN(this.sc.water) && this.sc.h <= this.sc.water + 0.3;
  }

  /**
   * Conflict scan: walks the line from s0 to s1 every 5 m and probes the ground across it (`reach` m each side).
   * A probe is a conflict when a road / pad / road bridge touches the terrain there. Runs closer than 14 m are merged.
   */
  private scan(a: Aligned, s0: number, s1: number, reachAt: (s: number) => number, withWater: boolean): Conflict[] {
    const runs: Conflict[] = [];
    let cur: Conflict | null = null;
    for (let s = s0; s <= s1 + 1e-6; s += SCAN) {
      const p = this.pointAt(a, s);
      const reach = reachAt(s);
      const nx = -p.dz;
      const nz = p.dx;
      let hit = false;
      let yMax = -Infinity;
      let yMin = Infinity;
      let bridge = false;
      const roads = new Set<number>();
      for (const u of [0, -reach * 0.5, reach * 0.5, -reach, reach]) {
        const x = p.x + nx * u;
        const z = p.z + nz * u;
        const rb = this.ctx.nearRoadBridge(x, z, 0);
        const blocked = rb || this.ctx.roadTouches(x, z);
        if (blocked || (withWater && this.wetAt(x, z))) {
          hit = true;
          if (rb) bridge = true;
          const nr = this.ctx.nearestRoad(x, z, 60);
          if (nr) {
            yMax = Math.max(yMax, nr.y);
            yMin = Math.min(yMin, nr.y);
            roads.add(nr.road.id);
            if (nr.onBridge && nr.d < nr.road.halfWidth + 12) bridge = true;
          }
        }
      }
      if (!hit) continue;
      if (cur && s - cur.b <= 14) {
        cur.b = s;
        cur.roadYMax = Math.max(cur.roadYMax, yMax);
        cur.roadYMin = Math.min(cur.roadYMin, yMin);
        cur.roadBridge ||= bridge;
        for (const r of roads) cur.roads.add(r);
      } else {
        cur = { a: s, b: s, roadYMax: yMax, roadYMin: yMin, crosses: false, roadBridge: bridge, roads };
        runs.push(cur);
      }
    }
    for (const r of runs) r.crosses = a.cross.some((c) => c.s >= r.a - 8 && c.s <= r.b + 8);
    return runs;
  }

  /**
   * A station whose platform approaches touch streets / pads / road bridges is built ELEVATED: the platforms stand on a viaduct
   * `OVER_RISE` above the highest road under them, so no street is ever cut or buried. Otherwise the platforms are on the ground
   * at the mean ground level of the approaches (least earthwork).
   */
  private elevateStations(all: Aligned[]): void {
    for (const st of this.stations) {
      let rise = -Infinity;
      let sum = 0;
      let cnt = 0;
      for (const arr of st.arrivals) {
        const a = all.find((q) => q.id === arr.edgeId)!;
        const L = a.cum[a.cum.length - 1];
        const [s0, s1] = arr.end === 'a' ? [0, a.zoneA] : [L - a.zoneB, L];
        const runs = this.scan(a, s0, s1, () => D.rowHalf + 4, false);
        for (const r of runs) if (Number.isFinite(r.roadYMax)) rise = Math.max(rise, r.roadYMax + OVER_RISE);
        for (let i = 0; i < a.cum.length; i++) {
          if (a.cum[i] >= s0 - 1e-6 && a.cum[i] <= s1 + 1e-6) {
            sum += a.ground[i];
            cnt++;
            // a river / pond under the platform approach: the platforms stand on a viaduct above the highest water
            if (a.wet[i]) rise = Math.max(rise, a.water[i] + WATER_RISE + 0.5);
          }
        }
        if (runs.some((r) => r.roadBridge && !Number.isFinite(r.roadYMax))) rise = Math.max(rise, st.y + OVER_RISE);
        // roads the line has to cross soon after the station: an elevated station must be high enough to still clear them (3 % climb)
        if (Number.isFinite(rise)) {
          let extra = -Infinity;
          for (const c of a.cross) {
            const dd = arr.end === 'a' ? c.s - s1 : s0 - c.s;
            if (dd > 0 && dd < 450) extra = Math.max(extra, c.y + OVER_RISE - 0.02 * dd);
          }
          // never more than 14 m above the ground: a crossing that needs more is passed in a cut & cover box instead
          const meanG = cnt ? sum / cnt : st.y;
          rise = Math.max(rise, Math.min(extra, meanG + 14));
        }
      }
      const mean = cnt ? sum / cnt : st.y;
      if (Number.isFinite(rise)) {
        st.elevated = true;
        st.level = Math.max(rise, mean);
      } else {
        st.elevated = false;
        st.level = mean;
      }
    }
  }

  /* ---------------------------------------------------------------- long section + structures */

  private crossOf = new Map<string, AlignedCross[]>();

  /**
   * Long section of one line and the structures it needs. Order of work:
   *   1. vertical bounds: flat platforms, river decks, overbridge / box clearances, then the profile solver;
   *   2. structure tags (tunnel, viaduct, cut & cover) from the profile and the bounds;
   *   3. validation with the TRUE formation width (slopes included): any place that would still touch a road / river becomes a viaduct.
   */
  private design(a: Aligned): RailEdge {
    const n = a.xs.length;
    const step = D.step;
    const L = a.cum[n - 1];
    const sa = this.stationById(a.from)!;
    const sb = this.stationById(a.to)!;
    this.crossOf.set(a.id, a.cross);
    const inA = (i: number): boolean => a.cum[i] <= a.zoneA + 1e-6;
    const inB = (i: number): boolean => a.cum[i] >= L - a.zoneB - 1e-6;
    const baseLo = new Float64Array(n).fill(-Infinity);
    const baseUp = new Float64Array(n).fill(Infinity);
    for (let i = 0; i < n; i++) {
      if (inA(i)) baseLo[i] = baseUp[i] = sa.level;
      else if (inB(i)) baseLo[i] = baseUp[i] = sb.level;
    }
    // rivers: deck above the highest water within 3 samples
    for (let i = 0; i < n; i++) {
      if (!a.wet[i]) continue;
      for (let j = Math.max(0, i - 3); j <= Math.min(n - 1, i + 3); j++) {
        if (inA(j) || inB(j)) continue;
        baseLo[j] = Math.max(baseLo[j], a.water[i] + WATER_RISE);
      }
    }
    const hs = movingAverage(a.ground, 10);
    const hsAt = (s0: number, s1: number): number => {
      let sum = 0;
      let c = 0;
      for (let i = 0; i < n; i++) if (a.cum[i] >= s0 - step && a.cum[i] <= s1 + step) {
        sum += hs[i];
        c++;
      }
      return c ? sum / c : hs[Math.min(n - 1, Math.round(s0 / step))];
    };
    // windows from the conflict scan outside the station approaches
    const runs = this.scan(a, a.zoneA, L - a.zoneB, () => D.rowHalf, false);
    const windows: Window[] = runs.map((r) => {
      const zones: Zone[] = a.cross
        .filter((c) => c.s >= r.a - 8 && c.s <= r.b + 8)
        .map((c) => {
          const p = this.pointAt(a, c.s);
          const rx = c.road.xs[c.i + 1] - c.road.xs[c.i];
          const rz = c.road.zs[c.i + 1] - c.road.zs[c.i];
          const sin = Math.abs(p.dx * rz - p.dz * rx) / (Math.hypot(rx, rz) || 1);
          const half = Math.min(70, (c.road.halfWidth + c.road.shoulder + 5) / Math.max(0.3, sin) + 6);
          return { a: c.s - half, b: c.s + half, y: c.y, bridge: c.onBridge };
        });
      let kind: Window['kind'] = 'free';
      if (zones.length) {
        const wetHere = a.wet.some((w, i) => w && a.cum[i] >= r.a - 20 && a.cum[i] <= r.b + 20);
        if (zones.some((z) => z.bridge) && !wetHere) kind = 'under-bridge';
        else if (zones.some((z) => z.bridge)) kind = 'over';
        else {
          let over = 0;
          let under = 0;
          for (const z of zones) {
            const h = hsAt(z.a, z.b);
            over += Math.max(0, z.y + OVER_RISE - h);
            under += 1.25 * Math.max(0, h - (z.y - D.underRoadDrop));
          }
          kind = over <= under ? 'over' : 'under';
        }
      }
      return { a: r.a - 8, b: r.b + 8, kind, zones };
    });
    // Decide over / under window by window (from the line start): the preferred option is taken if a legal grade can still
    // reach it; otherwise the other one; otherwise the window becomes a plain viaduct without clearance rule and is reported.
    const gv = new Float64Array(n).fill(D.maxGrade - D.gradeMargin);
    const lo = Float64Array.from(baseLo);
    const up = Float64Array.from(baseUp);
    const apply = (w: Window, kind: Window['kind'], l: Float64Array, u: Float64Array): void => {
      for (const z of w.zones) {
        const i0 = Math.max(0, Math.floor(z.a / step));
        const i1 = Math.min(n - 1, Math.ceil(z.b / step));
        for (let i = i0; i <= i1; i++) {
          if (kind === 'over') l[i] = Math.max(l[i], z.y + OVER_RISE);
          else if (kind === 'under') u[i] = Math.min(u[i], z.y - D.underRoadDrop - 0.06);
          else if (kind === 'under-bridge') u[i] = Math.min(u[i], z.y - D.underRoadDrop - (z.bridge ? 0.4 : 0));
        }
      }
    };
    // STAGE 13 / step 3: choose over / under for ALL windows together (fewest non-preferred choices first) at the normal grade; if no
    // combination works, raise the grade as little as possible (smallest `gx`, first only near the structures, then on the whole line).
    // The old greedy search below is only the fall-back (many windows).
    let combined = false;
    {
      const wins = windows.filter((w) => w.kind !== 'free');
      const optsOf = (w: Window): Window['kind'][] => (w.kind === 'over' ? ['over', 'under'] : w.kind === 'under' ? ['under', 'over'] : ['under-bridge', 'over']);
      if (wins.length <= 12) {
        const masks: number[] = [];
        for (let m = 0; m < 1 << wins.length; m++) masks.push(m);
        const pop = (m: number): number => { let c = 0; for (; m; m &= m - 1) c++; return c; };
        masks.sort((x, y) => pop(x) - pop(y) || x - y);
        // samples near a structure (a river deck / station level / a window): where a steeper grade may be used
        const near = new Uint8Array(n);
        const mark = (i0: number, i1: number): void => { for (let i = Math.max(0, i0); i <= Math.min(n - 1, i1); i++) near[i] = 1; };
        const reach = Math.ceil(D.gradeReach / step);
        for (let i = 0; i < n; i++) if (Number.isFinite(baseLo[i]) || Number.isFinite(baseUp[i])) if (!inA(i) && !inB(i)) mark(i - reach, i + reach);
        for (const w of wins) mark(Math.floor(w.a / step) - reach, Math.ceil(w.b / step) + reach);
        const tryGrade = (gvx: Float64Array): boolean => {
          for (const m of masks) {
            const l2 = Float64Array.from(baseLo);
            const u2 = Float64Array.from(baseUp);
            wins.forEach((w, k) => apply(w, optsOf(w)[(m >> k) & 1], l2, u2));
            if (bandOk(l2, u2, step, gvx)) {
              wins.forEach((w, k) => { w.kind = optsOf(w)[(m >> k) & 1]; });
              lo.set(l2);
              up.set(u2);
              gv.set(gvx);
              return true;
            }
          }
          return false;
        };
        const normalV = new Float64Array(n).fill(D.maxGrade - D.gradeMargin);
        if (tryGrade(normalV)) combined = true;
        for (let gx = D.maxGrade + 0.0005; gx <= D.maxGradeException + 1e-9 && !combined; gx += 0.0005) {
          const local = new Float64Array(n);
          for (let i = 0; i < n; i++) local[i] = near[i] ? gx - D.gradeMargin : D.maxGrade - D.gradeMargin;
          if (tryGrade(local)) { combined = true; this.gradeNotes.push(`${a.id}: grade up to ${(gx * 100).toFixed(2)} % near its structures (no legal profile at ${(D.maxGrade * 100).toFixed(1)} % exists for this alignment and these station levels)`); break; }
          if (tryGrade(new Float64Array(n).fill(gx - D.gradeMargin))) { combined = true; this.gradeNotes.push(`${a.id}: grade up to ${(gx * 100).toFixed(2)} % (no legal profile at ${(D.maxGrade * 100).toFixed(1)} % exists for this alignment and these station levels)`); break; }
        }
      }
    }
    if (!combined && !bandOk(lo, up, step, gv)) {
      // the two station levels and the river decks between them need a steeper line than the normal limit
      gv.fill(D.maxGradeException - D.gradeMargin);
      if (!bandOk(lo, up, step, gv)) this.issues.push(`${a.id}: platform levels and river decks cannot be joined by a ${(D.maxGradeException * 100).toFixed(1)} % grade`);
    }
    for (const w of windows) {
      if (combined) break;
      if (w.kind === 'free') continue;
      const options: Window['kind'][] = w.kind === 'over' ? ['over', 'under'] : w.kind === 'under' ? ['under', 'over'] : ['under-bridge', 'over'];
      let chosen: Window['kind'] | null = null;
      const tryOptions = (): void => {
        for (const opt of options) {
          const l2 = Float64Array.from(lo);
          const u2 = Float64Array.from(up);
          apply(w, opt, l2, u2);
          if (bandOk(l2, u2, step, gv)) {
            chosen = opt;
            lo.set(l2);
            up.set(u2);
            return;
          }
        }
      };
      tryOptions();
      if (!chosen) {
        // exception: a steeper section (up to 3.5 %, as on passenger lines with banking power) within 320 m of the window
        const i0 = Math.max(0, Math.floor((w.a - 320) / step));
        const i1 = Math.min(n - 2, Math.ceil((w.b + 320) / step));
        const saved = gv.slice(i0, i1 + 1);
        for (let i = i0; i <= i1; i++) gv[i] = Math.max(gv[i], D.maxGradeException - D.gradeMargin);
        tryOptions();
        if (!chosen) gv.set(saved, i0);
      }
      if (chosen) w.kind = chosen;
      else {
        this.issues.push(`${a.id}: ${w.kind} window at s=${w.a.toFixed(0)}-${w.b.toFixed(0)} m cannot reach its clearance even with a ${(D.maxGradeException * 100).toFixed(1)} % grade`);
        w.kind = 'free';
      }
    }
    let design: Float64Array = solveProfile(hs, lo, up, step, gv).design;
    // a steeper grade only where the first solution really needed it (the profile otherwise follows the ground at the exception grade)
    if (combined) {
      const normalEff = D.maxGrade - D.gradeMargin;
      for (let pass = 0; pass < 3 && gv.some((v) => v > normalEff + 1e-9); pass++) {
        const gv2 = new Float64Array(n).fill(normalEff);
        for (let i = 0; i < n - 1; i++) {
          if (Math.abs(design[i + 1] - design[i]) / step > normalEff + 1e-6) for (let j = Math.max(0, i - 2); j <= Math.min(n - 1, i + 2); j++) gv2[j] = Math.max(gv2[j], gv[j]);
        }
        if (!bandOk(lo, up, step, gv2)) break;
        design = solveProfile(hs, lo, up, step, gv2).design;
        gv.set(gv2);
      }
    }
    // structures, validated against the true formation width
    let tg = this.tags(a, design, windows, sa, sb);
    for (let pass = 0; pass < 4; pass++) {
      const extra = this.validateFormation(a, design, tg.tag);
      if (extra.length === 0) break;
      for (const e of extra) windows.push({ a: e.a - 10, b: e.b + 10, kind: 'free', zones: [] });
      tg = this.tags(a, design, windows, sa, sb);
    }
    const dz = new Float32Array(design);
    let maxGrade = 0;
    for (let i = 1; i < n; i++) maxGrade = Math.max(maxGrade, Math.abs(dz[i] - dz[i - 1]) / Math.max(1, a.cum[i] - a.cum[i - 1]));
    return {
      id: a.id,
      from: a.from,
      to: a.to,
      xs: a.xs,
      zs: a.zs,
      ground: a.ground,
      design: dz,
      water: a.water,
      cum: a.cum,
      length: L,
      segments: this.segmentsOf(a.cum, tg.tag, tg.why),
      minRadius: a.minRadius,
      maxGrade,
      wetShare: a.wet.reduce((p, q) => p + q, 0) / n,
      zoneA: a.zoneA,
      zoneB: a.zoneB,
    };
  }

  /** Structure tag per sample (0 ground, 1 tunnel, 2 bridge, 3 cut & cover) and the reason. */
  private tags(a: Aligned, design: Float64Array, windows: Window[], sa: RailStation, sb: RailStation): { tag: Uint8Array; why: RailSegmentWhy[] } {
    const n = a.xs.length;
    const step = D.step;
    const L = a.cum[n - 1];
    const tag = new Uint8Array(n);
    const why: RailSegmentWhy[] = new Array<RailSegmentWhy>(n).fill('open');
    const put = (i0: number, i1: number, t: number, w: RailSegmentWhy, onlyGround = false): void => {
      for (let i = Math.max(0, i0); i <= Math.min(n - 1, i1); i++) {
        if (onlyGround && tag[i] !== 0) continue;
        tag[i] = t;
        why[i] = w;
      }
    };
    // 1. tunnels: deep cutting for a long run
    markRuns(n, (i) => a.ground[i] - design[i] > D.tunnelCut, Math.ceil(D.tunnelMinLen / step), tag, 1);
    for (let i = 0; i < n; i++) if (tag[i] === 1) why[i] = 'hill';
    // 2. rivers
    for (let i = 0; i < n; i++) if (a.wet[i]) put(i - 3, i + 3, 2, 'water');
    // 3. valleys: high fill for a long run
    const before = Uint8Array.from(tag);
    markRuns(n, (i) => design[i] - a.ground[i] > D.bridgeFill, Math.ceil(D.bridgeMinLen / step), tag, 2);
    for (let i = 0; i < n; i++) if (tag[i] === 2 && before[i] !== 2) why[i] = 'valley';
    // 4. windows (road crossings, roads running alongside, junction pads, road bridges)
    for (const w of windows) {
      const i0 = Math.floor(w.a / step);
      const i1 = Math.ceil(w.b / step);
      if (w.kind === 'under') put(i0, i1, 3, 'underpass', true);
      else put(i0, i1, 2, w.kind === 'over' ? 'overpass' : w.kind === 'under-bridge' ? 'underpass' : 'conflict');
    }
    // 4b. a "viaduct" that the long section put far BELOW the ground (a line running down a cutting beside / under a road) is really
    // a box or tunnel: the ground above it stays as it is (road slopes, hills), nothing is trimmed.
    for (let q = 0; q < n; q++) {
      if (tag[q] === 2 && (why[q] === 'conflict' || why[q] === 'underpass') && a.ground[q] - design[q] > 3.5) {
        tag[q] = a.ground[q] - design[q] > D.tunnelCut ? 1 : 3;
      }
    }
    // 5. stations
    for (let i = 0; i < n; i++) {
      const st = a.cum[i] <= a.zoneA + 1e-6 ? sa : a.cum[i] >= L - a.zoneB - 1e-6 ? sb : null;
      if (st) {
        tag[i] = st.elevated ? 2 : 0;
        why[i] = 'station';
      }
    }
    // 6. two viaducts with a short embankment between them are one viaduct
    let i = 0;
    while (i < n) {
      if (tag[i] !== 2) {
        i++;
        continue;
      }
      let j = i;
      while (j + 1 < n && tag[j + 1] === 2) j++;
      let k = j + 1;
      while (k < n && tag[k] === 0 && why[k] !== 'station') k++;
      if (k < n && tag[k] === 2 && (k - j - 1) * step < D.mergeGap) for (let q = j + 1; q < k; q++) {
        tag[q] = 2;
        why[q] = 'valley';
      }
      i = j + 1;
    }
    return { tag, why };
  }

  private segmentsOf(cum: Float64Array, tag: Uint8Array, why: RailSegmentWhy[]): RailSegment[] {
    const n = tag.length;
    const KIND: RailSegmentKind[] = ['ground', 'tunnel', 'bridge', 'cutcover'];
    const PRI = [1, 2, 4, 3]; // bridge > cut & cover > tunnel > ground
    const kinds: RailSegmentKind[] = [];
    const whys: RailSegmentWhy[] = [];
    for (let j = 0; j < n - 1; j++) {
      const t = PRI[tag[j]] >= PRI[tag[j + 1]] ? j : j + 1;
      kinds.push(KIND[tag[t]]);
      whys.push(why[t]);
    }
    const out: RailSegment[] = [];
    let s = 0;
    for (let j = 1; j <= kinds.length; j++) {
      if (j === kinds.length || kinds[j] !== kinds[s] || whys[j] !== whys[s]) {
        out.push({ kind: kinds[s], why: whys[s], s0: cum[s], s1: cum[j] });
        s = j;
      }
    }
    return out;
  }

  /**
   * True formation check: on every stretch that is built on the ground, the embankment / cutting (flat top + slopes) is probed
   * across its real width. Anything that touches a road, a pad, a road bridge or water is returned (it becomes a viaduct).
   */
  private validateFormation(a: Aligned, design: Float64Array, tag: Uint8Array): { a: number; b: number }[] {
    const n = a.xs.length;
    const L = a.cum[n - 1];
    const out: { a: number; b: number }[] = [];
    let cur: { a: number; b: number } | null = null;
    for (let s = 0; s <= L; s += SCAN) {
      const p = this.pointAt(a, s);
      const i = p.i;
      const t = Math.max(0, Math.min(1, (s - a.cum[i]) / (a.cum[i + 1] - a.cum[i] || 1)));
      if (tag[i] !== 0 || tag[Math.min(n - 1, i + 1)] !== 0) continue;
      if (s <= a.zoneA + 1e-6 || s >= L - a.zoneB - 1e-6) continue; // station approaches: handled by elevateStations
      const dh = design[i] + (design[i + 1] - design[i]) * t - D.ballast - (a.ground[i] + (a.ground[i + 1] - a.ground[i]) * t);
      const slope = dh > 0 ? D.fillSlope : D.cutSlope;
      const E = D.formationHalf + Math.min(D.slopeMax, Math.abs(dh) * slope);
      const nx = -p.dz;
      const nz = p.dx;
      let hit = false;
      for (const u of [0, D.formationHalf * 0.5, D.formationHalf, (D.formationHalf + E) / 2, E]) {
        for (const sg of u === 0 ? [1] : [-1, 1]) {
          const x = p.x + nx * u * sg;
          const z = p.z + nz * u * sg;
          if (this.ctx.roadBlocked(x, z) || this.wetAt(x, z)) hit = true;
        }
        if (hit) break;
      }
      if (!hit) continue;
      if (cur && s - cur.b <= 14) cur.b = s;
      else {
        cur = { a: s, b: s };
        out.push(cur);
      }
    }
    return out;
  }

  /* ---------------------------------------------------------------- crossings + piers + checks */

  private segmentAt(e: RailEdge, s: number): RailSegment {
    return e.segments.find((q) => s >= q.s0 - 1e-6 && s <= q.s1 + 1e-6) ?? e.segments[e.segments.length - 1];
  }

  /** Every place where a road crosses a railway and how the crossing was resolved (decided by the long section, never "same level"). */
  private findCrossings(): void {
    for (const e of this.edges) {
      for (const c of this.crossOf.get(e.id) ?? []) {
        const seg = this.segmentAt(e, c.s);
        let kind: CrossingKind;
        let i = 0;
        while (i < e.cum.length - 2 && e.cum[i + 1] < c.s) i++;
        const t = (c.s - e.cum[i]) / (e.cum[i + 1] - e.cum[i] || 1);
        const dz = e.design[i] + (e.design[i + 1] - e.design[i]) * t;
        if (seg.kind === 'tunnel') kind = 'rail-tunnel';
        else if (seg.kind === 'cutcover') kind = 'road-over-rail';
        else if (seg.kind === 'bridge') kind = dz > c.y ? 'rail-over-road' : 'rail-under-bridge';
        else {
          kind = 'road-over-rail';
          this.issues.push(`${e.id}: road ${c.road.name} crosses at grade at s=${c.s.toFixed(0)} m`);
        }
        this.crossings.push({ x: c.x, z: c.z, edgeId: e.id, s: c.s, roadId: c.road.id, roadName: c.road.name, roadTier: c.road.tier, kind });
      }
    }
  }

  /**
   * Viaduct piers: spans of ~30 m (prestressed concrete box girder), every pier moved along the line to ground that is free of
   * roads, pads and road bridges. Where no free ground exists for 46..90 m (over a big junction, a wide street, a road bridge) the
   * span is a STEEL through-girder (no pier at all); longer than that is reported as an issue.
   */
  readonly steelSpans: { edgeId: string; s0: number; s1: number }[] = [];

  private placePiers(): void {
    const free = (e: RailEdge, s: number): boolean => {
      const p = this.pointAt(e, s);
      return this.ctx.pierFree(p.x, p.z, D.pierSize / 2, D.pierRoadGap);
    };
    for (const e of this.edges) {
      for (const seg of e.segments) {
        if (seg.kind !== 'bridge') continue;
        const len = seg.s1 - seg.s0;
        const spans = Math.max(1, Math.ceil(len / D.spanNormal));
        const supports: number[] = [seg.s0];
        for (let k = 1; k < spans; k++) {
          const target = seg.s0 + (len * k) / spans;
          let found = -1;
          for (let off = 0; off <= 15 && found < 0; off += 1.5) {
            for (const sg of off === 0 ? [1] : [1, -1]) {
              const s = target + off * sg;
              if (s <= supports[supports.length - 1] + 12 || s >= seg.s1 - 4) continue;
              if (free(e, s)) {
                found = s;
                break;
              }
            }
          }
          if (found >= 0) supports.push(found);
        }
        supports.push(seg.s1);
        // too long a span: split it at the free ground that makes the two halves most equal; if none, it becomes a steel span
        for (let q = 0; q < supports.length - 1; ) {
          const gap = supports[q + 1] - supports[q];
          if (gap <= D.spanMax) {
            q++;
            continue;
          }
          let bestS = -1;
          let bestScore = gap;
          for (let s = supports[q] + 14; s <= supports[q + 1] - 14; s += 1.5) {
            const score = Math.max(s - supports[q], supports[q + 1] - s);
            if (score < bestScore && free(e, s)) {
              bestScore = score;
              bestS = s;
            }
          }
          if (bestS >= 0) supports.splice(q + 1, 0, bestS);
          else {
            if (gap <= D.spanSteelMax) this.steelSpans.push({ edgeId: e.id, s0: supports[q], s1: supports[q + 1] });
            else this.issues.push(`${e.id}: viaduct span of ${gap.toFixed(0)} m at s=${supports[q].toFixed(0)} m (no free pier ground; steel limit ${D.spanSteelMax} m)`);
            q++;
          }
        }
        for (let q = 1; q < supports.length - 1; q++) {
          const s = supports[q];
          const p = this.pointAt(e, s);
          this.terrain.sampleNatural(p.x, p.z, this.sc);
          const t = Math.max(0, Math.min(1, (s - e.cum[p.i]) / (e.cum[p.i + 1] - e.cum[p.i] || 1)));
          this.piers.push({ edgeId: e.id, s, x: p.x, z: p.z, baseY: this.sc.h, deckY: e.design[p.i] + (e.design[p.i + 1] - e.design[p.i]) * t, dx: p.dx, dz: p.dz });
        }
      }
    }
  }

  /** STAGE 13: join the inner ends of two lines of a station by a Hermite curve whenever the curve is gentle enough for a train. */
  private buildLinks(): void {
    for (const st of this.stations) {
      const arr = st.arrivals;
      for (let i = 0; i < arr.length; i++) {
        for (let j = i + 1; j < arr.length; j++) {
          const A = arr[i], B = arr[j];
          const pa = [st.x + Math.cos(A.bearing) * D.endR, st.z + Math.sin(A.bearing) * D.endR];
          const pb = [st.x + Math.cos(B.bearing) * D.endR, st.z + Math.sin(B.bearing) * D.endR];
          // a train arrives on A heading to the station centre (-bearing) and leaves on B heading away from it (+bearing)
          const ta = [-Math.cos(A.bearing), -Math.sin(A.bearing)];
          const tb = [Math.cos(B.bearing), Math.sin(B.bearing)];
          const chord = Math.hypot(pb[0] - pa[0], pb[1] - pa[1]);
          const n = Math.max(8, Math.ceil(chord / 10));
          // the tangent length decides the shape: take the gentlest curve
          let best: { xs: Float64Array; zs: Float64Array; len: number; minR: number } | null = null;
          for (let f = 0.3; f <= 1.21; f += 0.05) {
            const k = chord * f;
            const xs = new Float64Array(n + 1), zs = new Float64Array(n + 1);
            for (let q = 0; q <= n; q++) {
              const t = q / n, t2 = t * t, t3 = t2 * t;
              const h00 = 2 * t3 - 3 * t2 + 1, h10 = t3 - 2 * t2 + t, h01 = -2 * t3 + 3 * t2, h11 = t3 - t2;
              xs[q] = h00 * pa[0] + h10 * k * ta[0] + h01 * pb[0] + h11 * k * tb[0];
              zs[q] = h00 * pa[1] + h10 * k * ta[1] + h01 * pb[1] + h11 * k * tb[1];
            }
            let len = 0, minR = Infinity;
            for (let q = 1; q <= n; q++) len += Math.hypot(xs[q] - xs[q - 1], zs[q] - zs[q - 1]);
            for (let q = 1; q < n; q++) {
              const x1 = xs[q] - xs[q - 1], z1 = zs[q] - zs[q - 1], x2 = xs[q + 1] - xs[q], z2 = zs[q + 1] - zs[q];
              const cross = Math.abs(x1 * z2 - z1 * x2);
              const l1 = Math.hypot(x1, z1), l2 = Math.hypot(x2, z2), l3 = Math.hypot(xs[q + 1] - xs[q - 1], zs[q + 1] - zs[q - 1]);
              const r = cross > 1e-9 ? (l1 * l2 * l3) / (2 * cross) : Infinity;
              if (r < minR) minR = r;
            }
            // a curve that loops back on itself is not a railway curve
            let loop = false;
            for (let q = 1; q <= n && !loop; q++) {
              const dxq = xs[q] - xs[q - 1], dzq = zs[q] - zs[q - 1];
              if (dxq * (xs[n] - xs[0]) + dzq * (zs[n] - zs[0]) < -1e-6 && Math.abs(Math.atan2(tb[1], tb[0]) - Math.atan2(ta[1], ta[0])) < 2.6) loop = true;
            }
            if (!loop && (!best || minR > best.minR)) best = { xs, zs, len, minR };
          }
          if (!best) continue;
          const { xs, zs, len, minR } = best;
          if (minR < D.linkMinRadius) continue;
          this.links.push({ id: `${st.id}:${A.edgeId}~${B.edgeId}`, station: st.id, a: { edgeId: A.edgeId, end: A.end }, b: { edgeId: B.edgeId, end: B.end }, xs, zs, length: len, minRadius: minR, level: st.level, elevated: st.elevated, edge: null as unknown as RailEdge });
          const link = this.links[this.links.length - 1];
          link.edge = this.linkEdge(link);
          if (st.elevated) this.placeLinkPiers(link);
        }
      }
    }
  }

  /** A link as a flat one-segment edge (a viaduct deck in an elevated station, else ground). */
  private linkEdge(l: RailLink): RailEdge {
    const n = l.xs.length;
    const cum = new Float64Array(n);
    for (let i = 1; i < n; i++) cum[i] = cum[i - 1] + Math.hypot(l.xs[i] - l.xs[i - 1], l.zs[i] - l.zs[i - 1]);
    const ground = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      this.terrain.sampleNatural(l.xs[i], l.zs[i], this.sc);
      ground[i] = this.sc.h;
    }
    return {
      id: l.id, from: l.a.edgeId, to: l.b.edgeId, xs: l.xs, zs: l.zs, ground, design: new Float32Array(n).fill(l.level), water: new Float32Array(n).fill(NaN),
      cum, length: cum[n - 1], segments: [{ kind: l.elevated ? 'bridge' : 'ground', why: 'station', s0: 0, s1: cum[n - 1] }], minRadius: l.minRadius, maxGrade: 0, wetShare: 0,
      // the whole link counts as station track (wide deck, masts 9 m out)
      zoneA: cum[n - 1], zoneB: 0,
    };
  }

  /** Viaduct piers under an elevated station link: on free ground only (never on a road / junction / road bridge). */
  private placeLinkPiers(l: RailLink): void {
    const e = l.edge;
    const free = (s: number): boolean => {
      const p = this.pointAt(e, s);
      return this.ctx.pierFree(p.x, p.z, D.pierSize / 2, D.pierRoadGap);
    };
    const spans = Math.max(1, Math.ceil(e.length / D.spanNormal));
    const supports: number[] = [0];
    for (let k = 1; k < spans; k++) {
      const target = (e.length * k) / spans;
      for (let off = 0; off <= 15; off += 1.5) {
        let ok = false;
        for (const sg of off === 0 ? [1] : [1, -1]) {
          const s = target + off * sg;
          if (s <= supports[supports.length - 1] + 12 || s >= e.length - 12) continue;
          if (free(s)) { supports.push(s); ok = true; break; }
        }
        if (ok) break;
      }
    }
    supports.push(e.length);
    for (let q = 0; q < supports.length - 1; q++) {
      const gap = supports[q + 1] - supports[q];
      if (gap > D.spanMax) this.issues.push(`${l.id}: station link span of ${gap.toFixed(0)} m at s=${supports[q].toFixed(0)} m (no free pier ground)`);
    }
    for (let q = 1; q < supports.length - 1; q++) {
      const p = this.pointAt(e, supports[q]);
      this.terrain.sampleNatural(p.x, p.z, this.sc);
      this.piers.push({ edgeId: l.id, s: supports[q], x: p.x, z: p.z, baseY: this.sc.h, deckY: l.level, dx: p.dx, dz: p.dz });
    }
  }

  /** Final checks that are about the whole network (everything per line is already solved): facilities, lines too close, arrivals. */
  private checkClearances(): void {
    for (const e of this.edges) {
      let bad = 0;
      for (let i = 0; i < e.xs.length; i++) if (this.ctx.facilityAt(e.xs[i], e.zs[i], 20)) bad++;
      if (bad) this.issues.push(`${e.id}: ${bad} track samples inside the airport / seaport grounds`);
    }
    const far = (x: number, z: number): boolean => this.stations.every((s) => Math.hypot(x - s.x, z - s.z) > D.stationFlat + 150);
    for (let a = 0; a < this.edges.length; a++) {
      for (let b = a + 1; b < this.edges.length; b++) {
        const A = this.edges[a];
        const B = this.edges[b];
        let best = Infinity;
        for (let i = 0; i < A.xs.length; i += 1) {
          if (!far(A.xs[i], A.zs[i])) continue;
          for (let j = 0; j < B.xs.length; j += 1) {
            const d = Math.hypot(A.xs[i] - B.xs[j], A.zs[i] - B.zs[j]);
            if (d < best && far(B.xs[j], B.zs[j])) best = d;
          }
        }
        if (best < D.lineGap) this.issues.push(`${A.id} and ${B.id} come within ${best.toFixed(0)} m of each other outside a station`);
      }
    }
    const gap = ((D.minArrivalGap - 0.5) * Math.PI) / 180;
    for (const st of this.stations) {
      for (let i = 0; i < st.arrivals.length; i++) {
        for (let j = i + 1; j < st.arrivals.length; j++) {
          const d = Math.abs(Math.atan2(Math.sin(st.arrivals[i].bearing - st.arrivals[j].bearing), Math.cos(st.arrivals[i].bearing - st.arrivals[j].bearing)));
          if (d < gap) this.issues.push(`${st.id}: lines ${st.arrivals[i].edgeId} and ${st.arrivals[j].edgeId} arrive only ${((d * 180) / Math.PI).toFixed(1)} deg apart`);
        }
      }
    }
  }

  private resample(p: number[][], step: number): number[][] {
    const out: number[][] = [[p[0][0], p[0][1]]];
    let carry = 0;
    for (let i = 1; i < p.length; i++) {
      const dx = p[i][0] - p[i - 1][0];
      const dz = p[i][1] - p[i - 1][1];
      const len = Math.hypot(dx, dz);
      if (len < 1e-6) continue;
      let t = step - carry;
      while (t <= len) {
        out.push([p[i - 1][0] + (dx * t) / len, p[i - 1][1] + (dz * t) / len]);
        t += step;
      }
      carry = len - (t - step);
    }
    const last = p[p.length - 1];
    const o = out[out.length - 1];
    if (Math.hypot(last[0] - o[0], last[1] - o[1]) > step * 0.3) out.push([last[0], last[1]]);
    else out[out.length - 1] = [last[0], last[1]];
    return out;
  }
}

/* ------------------------------------------------------------------ helpers */

interface AlignedCross {
  /** Road surface height at the crossing (m). */
  y: number;
  s: number;
  x: number;
  z: number;
  road: RoadSpec;
  i: number;
  onBridge: boolean;
}

/** A line after the plan-view work (before the long section). */
interface Aligned {
  id: string;
  from: string;
  to: string;
  xs: Float64Array;
  zs: Float64Array;
  cum: Float64Array;
  ground: Float32Array;
  water: Float32Array;
  wet: Uint8Array;
  minRadius: number;
  zoneA: number;
  zoneB: number;
  cross: AlignedCross[];
}



function circumRadius(ax: number, az: number, bx: number, bz: number, cx: number, cz: number): number {
  const ab = Math.hypot(bx - ax, bz - az);
  const bc = Math.hypot(cx - bx, cz - bz);
  const ca = Math.hypot(ax - cx, az - cz);
  const area2 = Math.abs((bx - ax) * (cz - az) - (bz - az) * (cx - ax));
  return area2 < 1e-6 ? Infinity : (ab * bc * ca) / (2 * area2);
}

function markRuns(n: number, test: (i: number) => boolean, minSamples: number, tag: Uint8Array, value: number): void {
  let i = 0;
  while (i < n) {
    if (!test(i)) {
      i++;
      continue;
    }
    let j = i;
    while (j < n && test(j)) j++;
    if (j - i >= minSamples) for (let q = Math.max(0, i - 2); q < Math.min(n, j + 2); q++) tag[q] = value;
    i = j;
  }
}

function segIntersect(ax: number, az: number, bx: number, bz: number, cx: number, cz: number, dx: number, dz: number): { x: number; z: number; t: number } | null {
  const r1x = bx - ax;
  const r1z = bz - az;
  const r2x = dx - cx;
  const r2z = dz - cz;
  const den = r1x * r2z - r1z * r2x;
  if (Math.abs(den) < 1e-9) return null;
  const t = ((cx - ax) * r2z - (cz - az) * r2x) / den;
  const u = ((cx - ax) * r1z - (cz - az) * r1x) / den;
  if (t < 0 || t > 1 || u < 0 || u > 1) return null;
  return { x: ax + r1x * t, z: az + r1z * t, t };
}
