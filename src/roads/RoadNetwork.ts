import { Config } from '../core/Config';
import { DISTRICT_LINKS, DISTRICT_LINK_SNAP, ISLAND_PLAN, MAIN_EDGES, MAIN_NODES, PRIMARY, SECONDARY } from './RoadPlan';
import type { TerrainSample } from '../terrain/Lakes';
import type { CitySite } from '../terrain/TerrainGenerator';
import { chunkKey, worldToChunkCoord } from '../world/WorldGrid';
import type { BridgeSpec, CulvertSpec, JunctionSpec, PadSpec, RoadInfo, RoadKind, RoadSpec, SurfaceKind } from './RoadTypes';
import { buildJunctionPads } from './Junctions';
import { planLocalStreets } from './LocalRoads';
import type { LocalAreaStat } from './LocalRoads';

/** Natural terrain WITHOUT roads (hills, rivers, lakes, sea). Roads are planned on top of this. */
export type NaturalSampler = (x: number, z: number, out: TerrainSample) => void;

const smoothstep = (a: number, b: number, x: number): number => {
  const t = x <= a ? 0 : x >= b ? 1 : (x - a) / (b - a);
  return t * t * (3 - 2 * t);
};

const KIND = {
  highway: { halfWidth: 7, shoulder: 2.2, lanes: 4, speedKmh: 100, maxGrade: 0.08, step: 8 },
  local: { halfWidth: 4.5, shoulder: 1.3, lanes: 2, speedKmh: 50, maxGrade: 0.1, step: 6 },
  arterial: { halfWidth: 5.5, shoulder: 1.6, lanes: 2, speedKmh: 70, maxGrade: 0.09, step: 8 },
  collector: { halfWidth: 4.8, shoulder: 1.4, lanes: 2, speedKmh: 50, maxGrade: 0.1, step: 8 },
  roundabout: { halfWidth: 4.5, shoulder: 1.3, lanes: 1, speedKmh: 30, maxGrade: 0.1, step: 3 },
} as const;
/** Radius (m) around the city centre inside which roads are not re-shaped (see nearCity). */
const NEAR_CITY = 0;
/** Earthen tracks keep this far (m) from the city centre (the railway and the city fill are fitted around it). */
const EARTH_MIN_CITY = 0;
/** Earthen (kacha) farm / village track. */
const KIND_EARTH = { halfWidth: 2.2, shoulder: 0.9, lanes: 1, speedKmh: 25, maxGrade: 0.12, step: 6 } as const;

/** Site layout (all inside the flat 600 m core of a city site). */
const CELL = 64;
const MAX_EMB = 40;
const BRIDGE_MIN_WET = 1; // wet width (m) from which a bridge is built. Every river crossing is a bridge: an embankment would dam the river
/** Fill higher than this (m) beside a river valley is replaced by a viaduct (a long bridge) instead of a huge earth dam. */
const VIADUCT_FILL = 7.5;
/** How far (m) from the road a river still counts as 'beside the road' for the viaduct rule. */
const VIADUCT_RIVER_REACH = 110;

interface RawRoad {
  /** 1 = main, 2 = primary, 3 = secondary, 4 = tertiary (see RoadPlan.ts). */
  tier: 1 | 2 | 3 | 4;
  kind: RoadKind;
  name: string;
  closed: boolean;
  pts: number[][];
  /** Open ring road: last point == first point; its ends are pinned to the same height. */
  loop?: boolean;
  /** Fixed surface heights at the first / last point (shared junction heights of the main network). */
  endY?: [number, number];
  /** Local streets: own cross-section (the plan gives each area its own street width) and the CityPlan area. */
  halfWidth?: number;
  shoulder?: number;
  lanes?: number;
  speedKmh?: number;
  areaId?: string;
  /** Local streets: surface height knots [distance along (m), y], linear in between. */
  knots?: number[][];
  /** Places where this road crosses another one (heights are matched there). */
  cross?: number[][];
  /** Earthen track (see KIND_EARTH). */
  earth?: boolean;
}

/**
 * Procedural road network (deterministic: same seed -> same roads, in the main thread and in every worker).
 *
 * It is built TIER BY TIER (Config.roads.activeTier, plan data in RoadPlan.ts) so the network grows stage by stage:
 *  Tier 1  MAIN roads: outer ring freeway + central N-S and E-W freeways, routed with A* over a coarse grid
 *          (grade + water penalties, sea forbidden) through waypoints that are snapped to good ground.
 *  Every road gets a smooth height PROFILE: moving average of the ground, then a grade limit
 *  (max 8 % on highways) that balances cut and fill, with extra clearance over water.
 *  Wet stretches >= 18 m become bridges (beam < 60 m, arch above); shorter ones become culverts.
 *  `apply()` cuts and fills the terrain along the roads (called from TerrainGenerator.sample()).
 */
export class RoadNetwork {
  readonly roads: RoadSpec[] = [];
  readonly bridges: BridgeSpec[] = [];
  readonly culverts: CulvertSpec[] = [];
  readonly junctions: JunctionSpec[] = [];
  /** Engineered intersections (flat pads with kerb returns), see Junctions.ts. */
  pads: PadSpec[] = [];
  /** Why a junction cluster did not get a pad (debug / tests). */
  padSkipped: string[] = [];
  private trim = new Map<number, Uint8Array>();
  private padCells = new Map<number, number[]>();
  private chunkPads = new Map<string, number[]>();
  /** Where the main roads meet, after snapping (id -> [x, z]). */
  readonly mainNodes = new Map<string, number[]>();
  /** Heights of the main junction nodes (id -> surface height), identical for every road that ends there. */
  private nodeY = new Map<string, number>();
  /** How many A* searches found no path (the road then falls back to a straight line). Must be 0. */
  routeFallbacks = 0;
  /** Indices (RoadPlan.DISTRICT_LINKS) of links that were dropped: no real path, or the finished road overlapped another road at a different height. */
  readonly droppedLinks: { index: number; why: string }[] = [];
  /** Links that only fit after a repair (built from the other end / cut before a conflict and joined to the road in the way). */
  readonly repairedLinks: number[] = [];
  /** Stage 10B: per area, how many local streets were built (and why lattice streets were rejected). */
  readonly localStats: LocalAreaStat[] = [];
  /** Local street groups that could not be joined to a main road and were removed. */
  localDropped = 0;
  /** Island bridge / island roads: what was built, and anything that did not fit (debug / tests). */
  readonly islandInfo: { built: string[]; issues: string[] } = { built: [], issues: [] };
  /** Rotation (rad) of the street grid of each city site that has local streets. */
  readonly localAngle = new Map<number, number>();

  // --- flat segment arrays (fast lookup, identical in every thread) ---
  private segRoad: Int32Array = new Int32Array(0);
  private segPt: Int32Array = new Int32Array(0);
  private sax = new Float64Array(0);
  private saz = new Float64Array(0);
  private sbx = new Float64Array(0);
  private sbz = new Float64Array(0);
  private say = new Float64Array(0);
  private sby = new Float64Array(0);
  private sea = new Float32Array(0);
  private seb = new Float32Array(0);
  private shw = new Float32Array(0);
  private score = new Float32Array(0);
  private sbridge = new Uint8Array(0);
  private searth = new Uint8Array(0);
  /** Number of earthen tracks (stats). */
  earthTracks = 0;
  private cells = new Map<number, Int32Array>();
  private chunkSegs = new Map<string, number[]>();

  /** Names of the diagonal arterials by angle (45 SE, 135 SW, 225 NW, 315 NE): the middle ring attaches to them. */
  private diagonals: Record<number, string> = {};

  private scratch: TerrainSample = { h: 0, water: NaN, fx: 0, fz: 0 };

  constructor(
    private sites: CitySite[],
    private natural: NaturalSampler,
  ) {
    // tier by tier: a tier is planned AFTER the previous one is built, so it can attach to the finished roads
    const tiers: ((out: RawRoad[]) => void)[] = [(o) => this.layoutMain(o), (o) => this.layoutPrimary(o), (o) => this.layoutSecondary(o), (o) => this.layoutLocal(o)];
    for (let k = 0; k < Math.min(Config.roads.activeTier, tiers.length); k++) {
      const raws: RawRoad[] = [];
      tiers[k](raws);
      // tier 2/3 roads are checked like the district links: a road that runs along another road, loops back onto it or crosses it
      // at a different height is cut back and joined with a T junction (see addRepaired)
      for (const r of raws) (k === 1 || k === 2 ? this.addRepaired(r) : this.addRoad(r));
      // the district links attach to the FINISHED roads of tiers 1-3, so they are planned after them
      if (k === 2) {
        this.layoutDistrictLinks();
        if (Config.roads.island) this.layoutIsland();
      }
    }
    const pr = buildJunctionPads(this.roads, this.natural);
    this.pads = pr.pads;
    this.padSkipped = pr.skipped;
    this.trim = pr.trimmed;
    // junction records inside a pad are the pad centre (height = pad plane)
    for (const j of this.junctions) {
      for (const p of this.pads) {
        if (Math.hypot(j.x - p.x, j.z - p.z) < p.rCore) {
          j.x = p.x;
          j.z = p.z;
          j.y = p.y;
          break;
        }
      }
    }
    this.layoutEarthen();
    this.buildSegments();
  }

  get segmentCount(): number {
    return this.segRoad.length;
  }

  get stats(): { roads: number; highwayKm: number; localKm: number; bridges: number; culverts: number; junctions: number } {
    let hw = 0;
    let lo = 0;
    for (const r of this.roads) {
      if (r.kind === 'highway') hw += r.length;
      else lo += r.length;
    }
    return {
      roads: this.roads.length,
      highwayKm: hw / 1000,
      localKm: lo / 1000,
      bridges: this.bridges.length,
      culverts: this.culverts.length,
      junctions: this.junctions.length,
    };
  }

  // =====================================================================================
  // Layout: which roads exist (centrelines in the plan view)
  // =====================================================================================
  // =====================================================================================
  // TIER 4: LOCAL streets of the city areas (Stage 10B). Planner: LocalRoads.ts
  // =====================================================================================
  private layoutLocal(out: RawRoad[]): void {
    const jp = this.junctions.map((j) => [j.x, j.z]);
    for (const si of Config.city.localRoads.sites) {
      if (si >= this.sites.length) continue;
      const res = planLocalStreets(this.sites, this.natural, this.roads, jp, si);
      this.localStats.push(...res.stats);
      this.localDropped += res.droppedGroups;
      this.localAngle.set(si, res.angle);
      for (const s of res.streets) {
        out.push({
          tier: 4,
          kind: 'local',
          name: s.name,
          closed: false,
          pts: s.pts,
          endY: s.endY,
          halfWidth: s.halfWidth,
          shoulder: Config.city.localRoads.sidewalk,
          lanes: s.lanes,
          speedKmh: s.speedKmh,
          areaId: s.areaId,
          knots: s.knots,
        });
      }
    }
  }

  // =====================================================================================
  // TIER 1: MAIN roads (freeways). Plan data: RoadPlan.ts
  // =====================================================================================
  private layoutMain(out: RawRoad[]): void {
    // 1. junction nodes, moved to the nearest flat dry ground (city-site nodes sit on the site hub)
    for (const n of MAIN_NODES) {
      const p = n.site !== undefined ? this.findHub(this.sites[n.site]) : this.snapPoint(n.x, n.z, n.snap);
      this.mainNodes.set(n.id, p);
      // the junction height is the natural ground height there (nodes are on flat ground), shared by every road that ends at it
      let hs = 0;
      let hn = 0;
      for (const rad of [0, 40, 80]) {
        const k = rad === 0 ? 1 : 8;
        for (let q = 0; q < k; q++) {
          const a = (q / k) * Math.PI * 2;
          this.natural(p[0] + rad * Math.cos(a), p[1] + rad * Math.sin(a), this.scratch);
          hs += this.scratch.h;
          hn++;
        }
      }
      hs /= hn;
      this.nodeY.set(n.id, hs);
      this.junctions.push({ x: p[0], z: p[1], y: hs, type: n.type });
    }
    const nodePts = [...this.mainNodes.values()];
    // 2. edges: A* between the snapped via points, then smoothed
    const done: number[][] = [];
    for (const e of MAIN_EDGES) {
      const a = this.mainNodes.get(e.from)!;
      const b = this.mainNodes.get(e.to)!;
      const wp: number[][] = [a, ...e.via.map(([x, z]) => this.snapPoint(x, z, 420)), b];
      const poly: number[][] = [a];
      for (let k = 0; k < wp.length - 1; k++) poly.push(...this.route(wp[k][0], wp[k][1], wp[k + 1][0], wp[k + 1][1], done, nodePts).slice(1));
      const pts = this.smoothRoute(poly, false); // the main highways keep their original shape (the railway and the city plan are fitted to them)
      done.push(...pts);
      out.push({ tier: 1, kind: 'highway', name: e.name, closed: false, pts, endY: [this.nodeY.get(e.from)!, this.nodeY.get(e.to)!] });
    }
  }

  // =====================================================================================
  // TIER 2: PRIMARY roads (arterials). Plan data: RoadPlan.ts (PRIMARY)
  // =====================================================================================
  /** Vertex of the named main road(s) nearest to (x, z), with its surface height. */
  private nearestOnRoads(names: string[], x: number, z: number): { p: number[]; y: number } {
    let best = Infinity;
    let res = { p: [x, z], y: 0 };
    for (const r of this.roads) {
      if (!names.includes(r.name)) continue;
      for (let i = 0; i < r.xs.length; i++) {
        const d = (r.xs[i] - x) ** 2 + (r.zs[i] - z) ** 2;
        if (d < best) {
          best = d;
          res = { p: [r.xs[i], r.zs[i]], y: r.ys[i] };
        }
      }
    }
    return res;
  }

  /** Natural ground height around a point (80 m average), used as the shared height of a free junction. */
  private groundAround(p: number[]): number {
    let hs = 0;
    let hn = 0;
    for (const rad of [0, 40, 80]) {
      const k = rad === 0 ? 1 : 8;
      for (let q = 0; q < k; q++) {
        const a = (q / k) * Math.PI * 2;
        this.natural(p[0] + rad * Math.cos(a), p[1] + rad * Math.sin(a), this.scratch);
        hs += this.scratch.h;
        hn++;
      }
    }
    return hs / hn;
  }

  private layoutPrimary(out: RawRoad[]): void {
    const C = this.mainNodes.get('C')!;
    const mainPts: number[][] = [];
    for (const r of this.roads) for (let i = 0; i < r.xs.length; i += 4) mainPts.push([r.xs[i], r.zs[i]]);
    const done: number[][] = [...mainPts];
    const free: number[][] = [];
    let pi = 1;
    const add = (a: { p: number[]; y: number }, b: { p: number[]; y: number }, via: number[][]): void => {
      const wp = [a.p, ...via, b.p];
      const poly: number[][] = [a.p];
      for (let k = 0; k < wp.length - 1; k++) poly.push(...this.route(wp[k][0], wp[k][1], wp[k + 1][0], wp[k + 1][1], done, free).slice(1));
      const pts = this.smoothRoute(poly);
      done.push(...pts);
      out.push({ tier: 2, kind: 'arterial', name: `P${pi++}`, closed: false, pts, endY: [a.y, b.y] });
    };

    // 1. inner ring: 8 nodes (even = on a main road, odd = free diagonal nodes)
    const R = PRIMARY.ringRadius;
    const ring: { p: number[]; y: number }[] = [];
    for (let k = 0; k < 8; k++) {
      const ang = k * 45;
      const rad = (ang * Math.PI) / 180;
      const tx = C[0] + R * Math.cos(rad);
      const tz = C[1] + R * Math.sin(rad);
      let node: { p: number[]; y: number };
      if (k % 2 === 0) {
        node = this.nearestOnRoads([PRIMARY.spokes[ang]], tx, tz);
        this.junctions.push({ x: node.p[0], z: node.p[1], y: node.y, type: '4way' });
      } else {
        const p = this.snapPoint(tx, tz, 250);
        node = { p, y: this.groundAround(p) };
        this.junctions.push({ x: p[0], z: p[1], y: node.y, type: 'T' });
      }
      free.push(node.p);
      ring.push(node);
    }
    // arcs follow the ideal circle: hints every 15 degrees, each moved to good ground, so the ring stays round
    for (let k = 0; k < 8; k++) {
      const via: number[][] = [];
      for (const da of [15, 30]) {
        const rad = ((k * 45 + da) * Math.PI) / 180;
        via.push(this.snapPoint(C[0] + R * Math.cos(rad), C[1] + R * Math.sin(rad), 150));
      }
      add(ring[k], ring[(k + 1) % 8], via);
    }

    // 2. radial arterials from the diagonal nodes to the outer ring freeway
    for (const rd of PRIMARY.radials) {
      const from = ring[rd.angle / 45];
      const to = this.nearestOnRoads([rd.road], rd.x, rd.z);
      this.junctions.push({ x: to.p[0], z: to.p[1], y: to.y, type: 'T' });
      free.push(to.p);
      this.diagonals[rd.angle] = `P${pi}`;
      add(from, to, []);
    }

    // 3. NW diagonal -> city site 1, then site 1 -> N-S freeway beside city site 2
    const hub = this.findHub(this.sites[PRIMARY.nwSite]);
    const hubNode = { p: hub, y: this.groundAround(hub) };
    this.junctions.push({ x: hub[0], z: hub[1], y: hubNode.y, type: 'T' });
    free.push(hub);
    this.diagonals[225] = `P${pi}`;
    add(ring[225 / 45], hubNode, []);
    const link = this.nearestOnRoads([PRIMARY.siteLink.road], PRIMARY.siteLink.x, PRIMARY.siteLink.z);
    this.junctions.push({ x: link.p[0], z: link.p[1], y: link.y, type: 'T' });
    free.push(link.p);
    add(hubNode, link, []);
  }

  // =====================================================================================
  // TIER 3: SECONDARY roads (collectors). Plan data: RoadPlan.ts (SECONDARY)
  // =====================================================================================
  private layoutSecondary(out: RawRoad[]): void {
    const C = this.mainNodes.get('C')!;
    const done: number[][] = [];
    for (const r of this.roads) for (let i = 0; i < r.xs.length; i += 4) done.push([r.xs[i], r.zs[i]]);
    const free: number[][] = [];
    let ci = 1;
    const add = (a: { p: number[]; y: number }, b: { p: number[]; y: number }, via: number[][]): void => {
      const wp = [a.p, ...via, b.p];
      const poly: number[][] = [a.p];
      for (let k = 0; k < wp.length - 1; k++) poly.push(...this.route(wp[k][0], wp[k][1], wp[k + 1][0], wp[k + 1][1], done, free).slice(1));
      const pts = this.smoothRoute(poly);
      done.push(...pts);
      out.push({ tier: 3, kind: 'collector', name: `S${ci++}`, closed: false, pts, endY: [a.y, b.y] });
    };
    // middle ring: 8 nodes, each on an existing road (4 main spokes + 4 diagonal arterials)
    const R = SECONDARY.ringRadius;
    const ring: { p: number[]; y: number }[] = [];
    for (let k = 0; k < 8; k++) {
      const ang = k * 45;
      const rad = (ang * Math.PI) / 180;
      const roads = k % 2 === 0 ? [PRIMARY.spokes[ang]] : [this.diagonals[ang]];
      const node = this.nearestOnRoads(roads, C[0] + R * Math.cos(rad), C[1] + R * Math.sin(rad));
      this.junctions.push({ x: node.p[0], z: node.p[1], y: node.y, type: '4way' });
      free.push(node.p);
      ring.push(node);
    }
    for (let k = 0; k < 8; k++) {
      const via: number[][] = [];
      for (const da of [15, 30]) {
        const rad = ((k * 45 + da) * Math.PI) / 180;
        via.push(this.snapPoint(C[0] + R * Math.cos(rad), C[1] + R * Math.sin(rad), 200));
      }
      add(ring[k], ring[(k + 1) % 8], via);
    }
    // site 2 -> outer ring freeway
    const hub = this.findHub(this.sites[SECONDARY.siteLink.site]);
    const a = this.nearestOnRoads(['F4'], hub[0], hub[1]);
    const b = this.nearestOnRoads([SECONDARY.siteLink.road], SECONDARY.siteLink.x, SECONDARY.siteLink.z);
    this.junctions.push({ x: a.p[0], z: a.p[1], y: a.y, type: 'T' }, { x: b.p[0], z: b.p[1], y: b.y, type: 'T' });
    free.push(a.p, b.p);
    add(a, b, []);
  }

  /** Remaining collectors of the reference map (RoadPlan.ts DISTRICT_LINKS), routed with the same A* + smoothing as every other tier. */
  private layoutDistrictLinks(): void {
    const done: number[][] = [];
    for (const r of this.roads) for (let i = 0; i < r.xs.length; i += 4) done.push([r.xs[i], r.zs[i]]);
    const free: number[][] = [];
    /** Free ends already used by an earlier link (shared village hubs / meeting points). */
    const ends: { p: number[]; y: number }[] = [];
    const nodeFor = (x: number, z: number): { p: number[]; y: number } => {
      let best = Infinity;
      let node: { p: number[]; y: number } | null = null;
      for (const r of this.roads) {
        if (r.kind === 'roundabout') continue;
        for (let i = 0; i < r.xs.length; i++) {
          // never join a road on a bridge, over water, or within ~60 m of a bridge end
          if (r.bridgeOf[i] >= 0 || r.hNat[i] < 2 || r.bridgeOf[Math.max(0, i - 8)] >= 0 || r.bridgeOf[Math.min(r.xs.length - 1, i + 8)] >= 0) continue;
          const d = Math.hypot(r.xs[i] - x, r.zs[i] - z);
          if (d < best) {
            best = d;
            node = { p: [r.xs[i], r.zs[i]], y: r.ys[i] };
          }
        }
      }
      if (node && best <= DISTRICT_LINK_SNAP) {
        this.junctions.push({ x: node.p[0], z: node.p[1], y: node.y, type: 'T' });
        free.push(node.p);
        return node;
      }
      for (const e of ends) if (Math.hypot(e.p[0] - x, e.p[1] - z) < 260) return e;
      let p = this.snapPoint(x, z, 250);
      if (!this.dry(p[0], p[1], 2)) p = this.nearestDry(x, z);
      const e = { p, y: this.groundAround(p) };
      this.junctions.push({ x: p[0], z: p[1], y: e.y, type: 'T' });
      free.push(p);
      ends.push(e);
      return e;
    };
    let ci = 10;
    for (let li = 0; li < DISTRICT_LINKS.length; li++) {
      const link = DISTRICT_LINKS[li];
      const j0 = this.junctions.length;
      const f0 = free.length;
      const e0 = ends.length;
      const undo = (): void => {
        this.junctions.length = j0;
        free.length = f0;
        ends.length = e0;
      };
      const a = nodeFor(link[0][0], link[0][1]);
      const b = nodeFor(link[link.length - 1][0], link[link.length - 1][1]);
      if (Math.hypot(a.p[0] - b.p[0], a.p[1] - b.p[1]) < 200) {
        undo();
        this.droppedLinks.push({ index: li, why: 'ends meet' });
        continue;
      }
      const via = link.slice(1, -1).map(([x, z]) => this.snapPoint(x, z, 200));
      const wp = [a.p, ...via, b.p];
      const poly: number[][] = [a.p];
      const fb = this.routeFallbacks;
      for (let k = 0; k < wp.length - 1; k++) poly.push(...this.route(wp[k][0], wp[k][1], wp[k + 1][0], wp[k + 1][1], done, free).slice(1));
      if (this.routeFallbacks > fb) {
        // no real path (mountain / sea in the way): drop this link instead of drawing a straight line over the terrain
        this.routeFallbacks = fb;
        undo();
        this.droppedLinks.push({ index: li, why: 'no path (mountain / sea)' });
        continue;
      }
      let pts = this.smoothRoute(poly);
      // a route that visits a snapped via point and comes back (a spike / loop) is cut short: the road never doubles back on itself
      const noLoops = this.removeLoops(pts);
      if (noLoops.length !== pts.length) pts = this.smoothRoute(noLoops);
      // build it, then check the finished profile: a road that overlaps itself or another road at a different height
      // (a hairpin stacked on itself, an at-grade crossing over a cutting) cannot be physically consistent.
      // Instead of dropping the link we REPAIR it: start from the other end, or stop just before the conflict and
      // join the road that is in the way with a T junction (or end in a village hub).
      // A link that crosses another road is split there: both halves end on that road (a 4-way junction at the crossing).
      const queue: { pts: number[][]; endA: number; endB: number }[] = [{ pts, endA: a.y, endB: b.y }];
      let builtAny = false;
      let repaired = false;
      while (queue.length > 0) {
        const piece = queue.shift()!;
        let cur = piece.pts;
        let endA = piece.endA;
        let endB = piece.endB;
        let reversed = false;
        let built = false;
        for (let attempt = 0; attempt < 5 && !built; attempt++) {
          const nr = this.roads.length;
          const nb = this.bridges.length;
          const nc = this.culverts.length;
          // where it crosses / touches an existing road, the surface heights are matched there (no step, no cliff in the junction)
          const cross: number[][] = [];
          for (const o of this.roads) {
            for (let j = 0; j < o.xs.length; j += 2) {
              let hit = false;
              for (let i = 0; i < cur.length; i += 2) {
                if (Math.abs(cur[i][0] - o.xs[j]) < 9 && Math.abs(cur[i][1] - o.zs[j]) < 9) {
                  hit = true;
                  break;
                }
              }
              if (hit && !cross.some((c) => Math.hypot(c[0] - o.xs[j], c[1] - o.zs[j]) < 45)) cross.push([o.xs[j], o.zs[j]]);
            }
          }
          this.addRoad({ tier: 3, kind: 'collector', name: `S${ci}`, closed: false, pts: cur, endY: [endA, endB], cross });
          const bad = this.firstConflict(this.roads[nr]);
          if (!bad && this.endsMismatch(this.roads[nr], endA, endB)) {
            // the grade limit could not reach the height of the road it joins (a cliff in the junction): skip this piece
            this.roads.length = nr;
            this.bridges.length = nb;
            this.culverts.length = nc;
            repaired = true;
            break;
          }
          if (!bad) {
            built = true;
            break;
          }
          this.roads.length = nr;
          this.bridges.length = nb;
          this.culverts.length = nc;
          repaired = true;
          if (bad.i < 30 && !reversed) {
            // the trouble is at the START (the link runs along the road it leaves): build it from the other end instead
            cur = cur.slice().reverse();
            [endA, endB] = [endB, endA];
            reversed = true;
            continue;
          }
          const keep = bad.i - 8; // stop ~65 m before the conflict
          if (bad.other) {
            let bj = 0;
            let bd = Infinity;
            const last = cur[Math.max(0, keep)];
            for (let j = 0; j < bad.other.xs.length; j++) {
              const d = Math.hypot(bad.other.xs[j] - last[0], bad.other.zs[j] - last[1]);
              if (d < bd) {
                bd = d;
                bj = j;
              }
            }
            const jp = [bad.other.xs[bj], bad.other.zs[bj]];
            // the second half: from the junction on, after the road has left the other road again
            let k = bad.i + 2;
            while (k < cur.length && Math.hypot(cur[k][0] - jp[0], cur[k][1] - jp[1]) < 40) k++;
            if (cur.length - k >= 25) queue.push({ pts: [jp, ...cur.slice(k)], endA: bad.other.ys[bj], endB });
            if (keep < 12) break; // first half shorter than ~100 m: skip it
            cur = [...cur.slice(0, keep + 1), jp];
            endB = bad.other.ys[bj];
            this.junctions.push({ x: jp[0], z: jp[1], y: endB, type: 'T' });
          } else {
            // a hairpin on itself: the road simply ends in a village hub
            if (keep < 25) break; // less than ~200 m would be left: not a road
            cur = cur.slice(0, keep + 1);
            const last = cur[cur.length - 1];
            endB = this.groundAround(last);
            this.junctions.push({ x: last[0], z: last[1], y: endB, type: 'T' });
          }
        }
        if (built) {
          builtAny = true;
          ci++;
          done.push(...cur);
        }
      }
      if (!builtAny) {
        undo();
        this.droppedLinks.push({ index: li, why: 'overlaps a road at another height' });
        continue;
      }
      if (repaired) this.repairedLinks.push(li);
    }
  }

  // =====================================================================================
  // THE ISLAND: long bridge from the mainland + the island's own road network (RoadPlan.ISLAND_PLAN)
  // =====================================================================================
  private layoutIsland(): void {
    const I = Config.terrain.island;
    const P = ISLAND_PLAN;
    const info = this.islandInfo;
    const TAU = Math.PI * 2;
    const groundOk = (x: number, z: number, minH: number): boolean => {
      this.natural(x, z, this.scratch);
      const w = this.scratch.water;
      return this.scratch.h >= minH && (Number.isNaN(w) || this.scratch.h > w + 2);
    };

    // 1. shore radius of the island in 72 directions (first point that is not dry high ground), smoothed along the circle
    const NA = 72;
    const raw = new Float64Array(NA);
    for (let k = 0; k < NA; k++) {
      const a = (k / NA) * TAU;
      let r = 40;
      while (r < 1600 && groundOk(I.x + r * Math.cos(a), I.z + r * Math.sin(a), P.minGround)) r += 10;
      raw[k] = r;
    }
    const shore = new Float64Array(NA);
    for (let k = 0; k < NA; k++) {
      let sum = 0;
      for (let d = -3; d <= 3; d++) sum += Math.min(raw[(k + d + NA * 2) % NA], raw[k] * 1.25);
      shore[k] = Math.min(raw[k], sum / 7);
    }
    const shoreAt = (a: number): number => {
      const f = (((a % TAU) + TAU) % TAU) / TAU * NA;
      const i0 = Math.floor(f) % NA;
      const t = f - Math.floor(f);
      return shore[i0] * (1 - t) + shore[(i0 + 1) % NA] * t;
    };

    // 2. the mainland end: join an existing road, then the straight line from the island to it gives the coast point
    let join: { p: number[]; y: number } | null = null;
    let bestD = Infinity;
    for (const r of this.roads) {
      if (r.kind === 'roundabout' || r.tier > 3) continue;
      for (let i = 0; i < r.xs.length; i++) {
        if (r.bridgeOf[i] >= 0 || r.hNat[i] < 3 || r.bridgeOf[Math.max(0, i - 8)] >= 0 || r.bridgeOf[Math.min(r.xs.length - 1, i + 8)] >= 0) continue;
        const d = Math.hypot(r.xs[i] - P.join[0], r.zs[i] - P.join[1]);
        if (d < bestD) {
          bestD = d;
          join = { p: [r.xs[i], r.zs[i]], y: r.ys[i] };
        }
      }
    }
    if (!join || bestD > P.joinReach) {
      info.issues.push(`no mainland road within ${P.joinReach} m of the bridge start (nearest ${bestD.toFixed(0)} m)`);
      return;
    }
    // island node 0 faces the coast hint
    const a0 = Math.atan2(P.coast[1] - I.z, P.coast[0] - I.x);
    const nodeAngle = (k: number): number => a0 + (k * Math.PI) / 2;
    const ringR = (a: number): number => shoreAt(a) * P.ringShare;
    const ringPt = (a: number, rr = ringR(a)): number[] => [I.x + rr * Math.cos(a), I.z + rr * Math.sin(a)];
    const nodes = [0, 1, 2, 3].map((k) => ringPt(nodeAngle(k)));
    const centre = [I.x, I.z];
    // all nodes must stand on dry high ground
    for (const [i, p] of [...nodes, centre].entries()) {
      if (!groundOk(p[0], p[1], P.minGround + 1)) {
        info.issues.push(`island node ${i} is not on dry ground (${p[0].toFixed(0)}, ${p[1].toFixed(0)})`);
        return;
      }
    }
    // coast point = last dry point on the line from island node 0 back to the mainland join, backed off 40 m
    const dirToJoin = Math.atan2(join.p[1] - nodes[0][1], join.p[0] - nodes[0][0]);
    let coastD = 0;
    let seenSea = false;
    for (let d = 20; d < Math.hypot(join.p[0] - nodes[0][0], join.p[1] - nodes[0][1]); d += 10) {
      const x = nodes[0][0] + d * Math.cos(dirToJoin);
      const z = nodes[0][1] + d * Math.sin(dirToJoin);
      if (!groundOk(x, z, 2.2)) seenSea = true;
      else if (seenSea) {
        coastD = d;
        break;
      }
    }
    if (coastD === 0) {
      info.issues.push('the line from the island to the mainland never reaches dry mainland ground');
      return;
    }
    const landing = [nodes[0][0] + (coastD + 40) * Math.cos(dirToJoin), nodes[0][1] + (coastD + 40) * Math.sin(dirToJoin)];

    // node heights = mean natural ground around the node (like the main junction nodes)
    const nodeHeight = (p: number[]): number => {
      let hs = 0;
      let hn = 0;
      for (const rad of [0, 30, 60]) {
        const k = rad === 0 ? 1 : 8;
        for (let q = 0; q < k; q++) {
          const a = (q / k) * TAU;
          this.natural(p[0] + rad * Math.cos(a), p[1] + rad * Math.sin(a), this.scratch);
          hs += this.scratch.h;
          hn++;
        }
      }
      return hs / hn;
    };
    const yN = nodes.map(nodeHeight);
    const yC = nodeHeight(centre);

    // 3. the island roads first (the bridge pins its island end to node 0), then the bridge
    const done: number[][] = [];
    for (const r of this.roads) for (let i = 0; i < r.xs.length; i += 4) done.push([r.xs[i], r.zs[i]]);
    const tryAdd = (raw: RawRoad, label: string): boolean => {
      const nr = this.roads.length;
      const nb = this.bridges.length;
      const nc = this.culverts.length;
      this.addRoad(raw);
      const bad = this.firstConflict(this.roads[nr]);
      if (bad) {
        info.issues.push(`${label}: overlaps ${bad.other ? bad.other.name : 'itself'} near point ${bad.i}`);
        this.roads.length = nr;
        this.bridges.length = nb;
        this.culverts.length = nc;
        return false;
      }
      info.built.push(label);
      return true;
    };

    // ring arcs (arterial): points every 7.5 degrees at the ring radius, then smoothed
    for (let k = 0; k < 4; k++) {
      const pts: number[][] = [];
      for (let q = 0; q <= 12; q++) {
        const a = nodeAngle(k) + (q / 12) * (Math.PI / 2);
        pts.push(q === 0 ? nodes[k] : q === 12 ? nodes[(k + 1) % 4] : ringPt(a));
      }
      tryAdd({ tier: 2, kind: 'arterial', name: `IR${k + 1}`, closed: false, pts: this.smoothRoute(pts), endY: [yN[k], yN[(k + 1) % 4]] }, `IR${k + 1}`);
    }
    // spokes (collector): ring node -> island centre, straight
    for (let k = 0; k < 4; k++) {
      const pts: number[][] = [];
      for (let q = 0; q <= 4; q++) pts.push([nodes[k][0] + ((centre[0] - nodes[k][0]) * q) / 4, nodes[k][1] + ((centre[1] - nodes[k][1]) * q) / 4]);
      tryAdd({ tier: 3, kind: 'collector', name: `IS${k + 1}`, closed: false, pts: this.smoothRoute(pts), endY: [yN[k], yC] }, `IS${k + 1}`);
    }
    for (let k = 0; k < 4; k++) this.junctions.push({ x: nodes[k][0], z: nodes[k][1], y: yN[k], type: k === 0 ? '4way' : 'T' });
    this.junctions.push({ x: centre[0], z: centre[1], y: yC, type: '4way' });

    // the bridge: A* over land from the mainland road to the coast, then a straight line over the strait to node 0
    this.junctions.push({ x: join.p[0], z: join.p[1], y: join.y, type: 'T' });
    const free: number[][] = [join.p];
    const poly: number[][] = [join.p];
    const fb = this.routeFallbacks;
    poly.push(...this.route(join.p[0], join.p[1], landing[0], landing[1], done, free).slice(1));
    if (this.routeFallbacks > fb) {
      this.routeFallbacks = fb;
      info.issues.push('no land route from the mainland road to the coast: straight line used for the approach');
      poly.length = 1;
      poly.push(landing);
    }
    const lastLand = poly[poly.length - 1];
    const strait = Math.hypot(nodes[0][0] - lastLand[0], nodes[0][1] - lastLand[1]);
    const nStr = Math.max(1, Math.round(strait / 120));
    for (let q = 1; q <= nStr; q++) poly.push([lastLand[0] + ((nodes[0][0] - lastLand[0]) * q) / nStr, lastLand[1] + ((nodes[0][1] - lastLand[1]) * q) / nStr]);
    let pts = this.smoothRoute(poly);
    const noLoops = this.removeLoops(pts);
    if (noLoops.length !== pts.length) pts = this.smoothRoute(noLoops);
    const cross: number[][] = [];
    tryAdd({ tier: 2, kind: 'highway', name: 'IB', closed: false, pts, endY: [join.y, yN[0]], cross }, 'IB');
  }

  /** Cuts out loops: if the road comes back within 14 m of a point it passed > 80 m earlier, everything between is removed. */
  private removeLoops(pts: number[][]): number[][] {
    const out = pts.map((p) => [p[0], p[1]]);
    for (let i = 0; i < out.length; i++) {
      let acc = 0;
      for (let j = i + 1; j < out.length; j++) {
        acc += Math.hypot(out[j][0] - out[j - 1][0], out[j][1] - out[j - 1][1]);
        if (acc > 80 && Math.hypot(out[j][0] - out[i][0], out[j][1] - out[i][1]) < 14) {
          out.splice(i + 1, j - i);
          break;
        }
      }
    }
    return out;
  }

  /** Surface heights of an earthen track: follows the (smoothed) ground, starts at the height of the road it leaves. */
  private buildEarthProfile(r: RoadSpec, startY?: number): void {
    const n = r.xs.length;
    const h = new Float64Array(n);
    for (let i = 0; i < n; i++) {
      this.natural(r.xs[i], r.zs[i], this.scratch);
      r.hNat[i] = this.scratch.h;
      h[i] = this.scratch.h;
    }
    const sm = new Float64Array(n);
    for (let i = 0; i < n; i++) {
      let a = 0;
      let c = 0;
      for (let k = -4; k <= 4; k++) {
        const q = Math.min(n - 1, Math.max(0, i + k));
        a += h[q];
        c++;
      }
      sm[i] = a / c;
    }
    const y0 = startY ?? sm[0];
    const maxStep = 0.09 * r.step;
    r.ys[0] = y0;
    for (let i = 1; i < n; i++) {
      const t = Math.min(1, r.cum[i] / 40);
      const target = y0 + (sm[i] - y0) * t;
      r.ys[i] = Math.min(r.ys[i - 1] + maxStep, Math.max(r.ys[i - 1] - maxStep, target));
    }
  }

  /**
   * Earthen (kacha) tracks: narrow dirt roads that leave the secondary / primary roads sideways into the countryside, to farms and
   * villages. They run on dry, gentle ground, keep clear of every other road, junction and city site and are added after the
   * junction pads (they get no pad: the track simply ends at the edge of the road it leaves).
   */
  private layoutEarthen(): void {
    const CELL_E = 40;
    const grid = new Map<number, { x: number; z: number; id: number }[]>();
    const put = (x: number, z: number, id: number): void => {
      const k = (Math.floor(x / CELL_E) + 1024) * 4096 + (Math.floor(z / CELL_E) + 1024);
      let a = grid.get(k);
      if (!a) grid.set(k, (a = []));
      a.push({ x, z, id });
    };
    for (const r of this.roads) for (let i = 0; i < r.xs.length; i++) put(r.xs[i], r.zs[i], r.id);
    const near = (x: number, z: number, rad: number, ignore: number, ignoreRad: number): boolean => {
      const c = Math.ceil(rad / CELL_E);
      const cx = Math.floor(x / CELL_E);
      const cz = Math.floor(z / CELL_E);
      for (let dz = -c; dz <= c; dz++) {
        for (let dx = -c; dx <= c; dx++) {
          const a = grid.get((cx + dx + 1024) * 4096 + (cz + dz + 1024));
          if (!a) continue;
          for (const p of a) {
            const lim = p.id === ignore ? ignoreRad : rad;
            if (Math.hypot(p.x - x, p.z - z) < lim) return true;
          }
        }
      }
      return false;
    };
    const rnd = (a: number, b: number): number => {
      const v = Math.sin(a * 127.1 + b * 311.7 + 17.3) * 43758.5453;
      return v - Math.floor(v);
    };
    const MAX_TRACKS = 400;
    let made = 0;
    const parents = this.roads.filter((r) => (r.tier === 2 || r.tier === 3) && !r.earth && r.kind !== 'roundabout');
    for (const par of parents) {
      const n = par.xs.length;
      for (let i = 12; i < n - 12 && made < MAX_TRACKS; i += Math.max(10, Math.round(110 / par.step))) {
        if (rnd(par.id + 1, i) > 0.9) continue;
        if (par.cum[i] < 100 || par.length - par.cum[i] < 100) continue;
        if (this.sites[0] && Math.hypot(par.xs[i] - this.sites[0].x, par.zs[i] - this.sites[0].z) < EARTH_MIN_CITY) continue;
        let onBridge = false;
        for (let k = i - 8; k <= i + 8; k++) if (par.bridgeOf[Math.min(n - 1, Math.max(0, k))] >= 0) onBridge = true;
        if (onBridge) continue;
        const firstSide = rnd(par.id + 7, i) < 0.5 ? -1 : 1;
        for (const side of [firstSide, -firstSide]) {
          const off = par.halfWidth + par.shoulder + 1.4;
          const sx = par.xs[i] + par.nx[i] * side * off;
          const sz = par.zs[i] + par.nz[i] * side * off;
          if (this.pads.some((p) => Math.hypot(p.x - sx, p.z - sz) < p.rCore + 90)) continue;
          if (this.sites.some((q) => Math.hypot(q.x - sx, q.z - sz) < q.blendRadius + 120)) continue;
          if (!this.dry(sx, sz, 1.5)) continue;
          // walk out sideways with a gentle wander
          let heading = Math.atan2(par.nz[i] * side, par.nx[i] * side) + (rnd(par.id + 3, i) - 0.5) * 0.5;
          const target = 140 + rnd(par.id + 5, i) * 420;
          const pts: number[][] = [[sx, sz]];
          let x = sx;
          let z = sz;
          this.natural(x, z, this.scratch);
          let hPrev = this.scratch.h;
          const hist: number[] = [hPrev];
          let drift = (rnd(par.id + 9, i) - 0.5) * 0.02;
          for (let d = 6; d <= target; d += 6) {
            drift += (rnd(par.id + d, i) - 0.5) * 0.012;
            drift = Math.max(-0.03, Math.min(0.03, drift));
            heading += drift;
            const nx2 = x + Math.cos(heading) * 6;
            const nz2 = z + Math.sin(heading) * 6;
            if (!this.dry(nx2, nz2, 1.5) || !this.dry(nx2 + Math.sin(heading) * 3.5, nz2 - Math.cos(heading) * 3.5, 1) || !this.dry(nx2 - Math.sin(heading) * 3.5, nz2 + Math.cos(heading) * 3.5, 1)) break;
            if (this.sites.some((q) => Math.hypot(q.x - nx2, q.z - nz2) < q.blendRadius + 80)) break;
            if (this.pads.some((p) => Math.hypot(p.x - nx2, p.z - nz2) < p.rCore + 40)) break;
            if (near(nx2, nz2, 20, par.id, d < 45 ? 0 : 32)) break;
            this.natural(nx2, nz2, this.scratch);
            // slope over ~24 m (single steps may be rougher: the profile is smoothed)
            hist.push(this.scratch.h);
            const back = hist[Math.max(0, hist.length - 5)];
            if (Math.abs(this.scratch.h - hPrev) / 6 > 0.2 || Math.abs(this.scratch.h - back) / (6 * Math.min(4, hist.length - 1)) > 0.09) break;
            hPrev = this.scratch.h;
            x = nx2;
            z = nz2;
            pts.push([x, z]);
          }
          if (pts.length < 16) continue; // shorter than ~90 m: not worth a road
          const id = this.roads.length;
          this.addRoad({ tier: 3, kind: 'local', name: `E${made + 1}`, closed: false, pts, earth: true, endY: [par.ys[i], par.ys[i]], lanes: 1 });
          made++;
          for (let q = 0; q < pts.length; q++) put(pts[q][0], pts[q][1], id);
          break; // one track per spot
        }
      }
    }
    this.earthTracks = made;
  }

  /** True when the grade-limited profile could not reach the pinned end heights (a step / cliff where the road joins another). */
  private endsMismatch(r: RoadSpec, endA: number, endB: number): boolean {
    const n = r.ys.length;
    return Math.abs(r.ys[0] - endA) > 0.8 || Math.abs(r.ys[n - 1] - endB) > 0.8;
  }

  /** Heights are matched where a new road touches / crosses an existing one: the crossing points of `cur` with the finished roads. */
  private crossPoints(cur: number[][]): number[][] {
    const cross: number[][] = [];
    for (const o of this.roads) {
      for (let j = 0; j < o.xs.length; j += 2) {
        let hit = false;
        for (let i = 0; i < cur.length; i += 2) {
          if (Math.abs(cur[i][0] - o.xs[j]) < 9 && Math.abs(cur[i][1] - o.zs[j]) < 9) {
            hit = true;
            break;
          }
        }
        if (hit && !cross.some((c) => Math.hypot(c[0] - o.xs[j], c[1] - o.zs[j]) < 45)) cross.push([o.xs[j], o.zs[j]]);
      }
    }
    return cross;
  }

  /**
   * addRoad + conflict repair (same idea as the district links): when the finished road runs along another road, loops back onto it
   * or overlaps it at another height, it is built from the other end or cut ~65 m before the conflict and joined to the
   * road in the way with a T junction. If nothing sensible is left, the road is added unchanged (other roads refer to it by name).
   */
  private addRepaired(raw: RawRoad): void {
    if (!raw.endY || raw.closed || raw.loop || (raw.pts.some((q) => this.nearCity(q[0], q[1])) && !['P5', 'P6'].includes(raw.name))) {
      this.addRoad(raw);
      return;
    }
    const nr0 = this.roads.length;
    const queue: { pts: number[][]; endA: number; endB: number; name: string }[] = [{ pts: raw.pts, endA: raw.endY[0], endB: raw.endY[1], name: raw.name }];
    let parts = 0;
    while (queue.length > 0) {
      const piece = queue.shift()!;
      let cur = piece.pts;
      let endA = piece.endA;
      let endB = piece.endB;
      let reversed = false;
      let built = false;
      for (let attempt = 0; attempt < 5 && !built; attempt++) {
        const nr = this.roads.length;
        const nb = this.bridges.length;
        const nc = this.culverts.length;
        this.addRoad({ ...raw, name: piece.name, pts: cur, endY: [endA, endB], cross: this.crossPoints(cur) });
        const bad = this.firstConflict(this.roads[nr]);
        if (!bad && this.endsMismatch(this.roads[nr], endA, endB)) {
          this.roads.length = nr;
          this.bridges.length = nb;
          this.culverts.length = nc;
          break;
        }
        if (!bad) {
          built = true;
          break;
        }
        this.roads.length = nr;
        this.bridges.length = nb;
        this.culverts.length = nc;
        if (bad.i < 30 && !reversed) {
          cur = cur.slice().reverse();
          [endA, endB] = [endB, endA];
          reversed = true;
          continue;
        }
        const keep = bad.i - 8;
        if (!bad.other) break; // a hairpin on itself: handled by cutSelfCrossings, leave the rest to the fallback below
        let bj = 0;
        let bd = Infinity;
        const last = cur[Math.max(0, keep)];
        for (let j = 0; j < bad.other.xs.length; j++) {
          const d = Math.hypot(bad.other.xs[j] - last[0], bad.other.zs[j] - last[1]);
          if (d < bd) {
            bd = d;
            bj = j;
          }
        }
        const jp = [bad.other.xs[bj], bad.other.zs[bj]];
        let k = bad.i + 2;
        while (k < cur.length && Math.hypot(cur[k][0] - jp[0], cur[k][1] - jp[1]) < 40) k++;
        if (cur.length - k >= 25) queue.push({ pts: [jp, ...cur.slice(k)], endA: bad.other.ys[bj], endB, name: `${raw.name}${String.fromCharCode(97 + parts + queue.length)}` });
        if (keep < 12) break;
        cur = [...cur.slice(0, keep + 1), jp];
        endB = bad.other.ys[bj];
        this.junctions.push({ x: jp[0], z: jp[1], y: endB, type: 'T' });
      }
      if (built) parts++;
    }
    if (parts === 0) {
      this.roads.length = nr0;
      this.addRoad(raw);
    }
  }

  /** First place (point index) where road `r` overlaps itself (other = null) or another road at a different height. */
  private firstConflict(r: RoadSpec): { i: number; other: RoadSpec | null; j: number } | null {
    const n = r.xs.length;
    const END = 48; // metres near both ends are junction zones: heights are pinned to the road it joins there
    for (let i = 0; i < n; i++) {
      if (r.cum[i] < END || r.length - r.cum[i] < END) continue;
      for (let j = i + 1; j < n; j++) {
        if (r.cum[j] - r.cum[i] < 70) continue;
        if (Math.hypot(r.xs[i] - r.xs[j], r.zs[i] - r.zs[j]) < 12) return { i, other: null, j };
      }
      for (const o of this.roads) {
        if (o === r) continue;
        for (let j = 0; j < o.xs.length; j++) {
          if (Math.abs(o.xs[j] - r.xs[i]) > 14 || Math.abs(o.zs[j] - r.zs[i]) > 14) continue;
          const dd = Math.hypot(o.xs[j] - r.xs[i], o.zs[j] - r.zs[i]);
          if (dd > 14) continue;
          if (r.bridgeOf[i] >= 0 || o.bridgeOf[j] >= 0) continue; // a bridge deck over a road is a real overpass
          // two roads running ALONG each other (shallow angle) are not a junction: they would be ribbons stacked on each other
          {
            const i0 = Math.max(0, i - 1);
            const i1 = Math.min(n - 1, i + 1);
            const j0 = Math.max(0, j - 1);
            const j1 = Math.min(o.xs.length - 1, j + 1);
            const ax = r.xs[i1] - r.xs[i0];
            const az = r.zs[i1] - r.zs[i0];
            const bx = o.xs[j1] - o.xs[j0];
            const bz = o.zs[j1] - o.zs[j0];
            const al = Math.hypot(ax, az);
            const bl = Math.hypot(bx, bz);
            if ((!this.nearCity(r.xs[i], r.zs[i]) || r.name === 'P6') && o.tier >= r.tier && o.tier <= 3 && al > 0 && bl > 0 && Math.abs(ax * bx + az * bz) / (al * bl) > 0.82) {
              // only a LONG common stretch (>= ~70 m: the next 8 points all stay within 14 m of the same road) is a duplicate road
              let long = true;
              for (let k = i + 1; k <= i + 8 && long; k++) {
                if (k >= n) {
                  long = false;
                  break;
                }
                let dmin = Infinity;
                for (let q = Math.max(0, j - 14); q < Math.min(o.xs.length, j + 14); q++) dmin = Math.min(dmin, Math.hypot(o.xs[q] - r.xs[k], o.zs[q] - r.zs[k]));
                if (dmin > 14) long = false;
              }
              if (long) return { i, other: o, j };
            } // (a road may approach a more important one at a shallow angle: that is its designed junction)
          }
          if (dd > 9) continue;
          // ignore the places where this road legitimately joins the other one (its own ends)
          // allowed height difference grows with the distance (10 % slope between the two centre lines, plus 0.8 m of tolerance)
          if (Math.abs(o.ys[j] - r.ys[i]) > 0.8 + 0.1 * dd) return { i, other: o, j };
        }
      }
    }
    return null;
  }

  /** Nearest dry point (>= 2 m above the water) around (x, z), searched in growing rings up to 700 m. Used for road ends near the coast. */
  private nearestDry(x: number, z: number): number[] {
    for (let r = 30; r <= 700; r += 30) {
      const n = Math.max(8, Math.round(r / 12));
      for (let k = 0; k < n; k++) {
        const a = (k / n) * Math.PI * 2;
        const px = x + r * Math.cos(a);
        const pz = z + r * Math.sin(a);
        if (Math.abs(px) < 4500 && Math.abs(pz) < 4500 && this.dry(px, pz, 2) && this.dry(px + 20, pz, 1.5) && this.dry(px - 20, pz, 1.5) && this.dry(px, pz + 20, 1.5) && this.dry(px, pz - 20, 1.5)) return [px, pz];
      }
    }
    return [x, z];
  }

  /** Nearest good road ground around (x, z): dry, flat and low (within `radius` m). Returns the input if nothing is better. */
  private snapPoint(x: number, z: number, radius: number): number[] {
    const hAt = (px: number, pz: number): number => {
      this.natural(px, pz, this.scratch);
      return this.scratch.h;
    };
    let best = [x, z];
    let bestCost = Infinity;
    const STEP = 40;
    for (let dz = -radius; dz <= radius; dz += STEP) {
      for (let dx = -radius; dx <= radius; dx += STEP) {
        const d = Math.hypot(dx, dz);
        if (d > radius) continue;
        const px = x + dx;
        const pz = z + dz;
        if (Math.abs(px) > 4500 || Math.abs(pz) > 4500) continue;
        if (!this.dry(px, pz, 4) || !this.dry(px + 24, pz, 3) || !this.dry(px - 24, pz, 3) || !this.dry(px, pz + 24, 3) || !this.dry(px, pz - 24, 3)) continue;
        const h = hAt(px, pz);
        const slope = Math.hypot(hAt(px + 30, pz) - hAt(px - 30, pz), hAt(px, pz + 30) - hAt(px, pz - 30)) / 60;
        const cost = slope * 800 + h * 0.3 + d * 0.2;
        if (cost < bestCost) {
          bestCost = cost;
          best = [px, pz];
        }
      }
    }
    return best;
  }


  /** True if (x, z) is clear of water (margin = metres the ground must stay above the water surface). */
  private dry(x: number, z: number, margin: number): boolean {
    this.natural(x, z, this.scratch);
    const w = this.scratch.water;
    return Number.isNaN(w) ? this.scratch.h > 2 : this.scratch.h > w + margin && this.scratch.h > 2;
  }

  /** Centre of the roundabout: the site centre if its surroundings are dry, else the nearest dry spot (spiral search). */
  private findHub(s: CitySite): number[] {
    const ok = (x: number, z: number): boolean => {
      for (const r of [0, 22, 44, 66]) {
        const n = r === 0 ? 1 : 12;
        for (let k = 0; k < n; k++) {
          const a = (k / n) * Math.PI * 2;
          if (!this.dry(x + r * Math.cos(a), z + r * Math.sin(a), 2.5)) return false;
        }
      }
      return true;
    };
    if (ok(s.x, s.z)) return [s.x, s.z];
    for (let r = 40; r <= 320; r += 40) {
      for (let k = 0; k < 16; k++) {
        const a = (k / 16) * Math.PI * 2;
        const x = s.x + r * Math.cos(a);
        const z = s.z + r * Math.sin(a);
        if (ok(x, z)) return [x, z];
      }
    }
    return [s.x, s.z];
  }

  /** A* over a coarse grid. Cost = distance x (1 + grade penalty + water penalty). Sea is forbidden. */
  private route(sx: number, sz: number, gx: number, gz: number, avoid: number[][], free: number[][] = [], relaxed = false): number[][] {
    const fbBefore = this.routeFallbacks;
    const STEP = 48;
    const LIM = 4800;
    const N = Math.floor((2 * LIM) / STEP) + 1;
    const hgt = new Float32Array(N * N).fill(NaN);
    const wet = new Uint8Array(N * N); // 1 = river/lake, 2 = sea
    // cells close to an earlier highway are expensive (two highways must not run on top of each other),
    // except near the city sites where all highways have to converge.
    const taken = new Uint8Array(N * N);
    for (const [ax, az] of avoid) {
      if (this.sites.some((q) => Math.hypot(q.x - ax, q.z - az) < 800) || free.some((q) => Math.hypot(q[0] - ax, q[1] - az) < 500)) continue;
      const ci = Math.round((ax + 4800) / 48);
      const cj = Math.round((az + 4800) / 48);
      for (let dj = -2; dj <= 2; dj++) for (let di = -2; di <= 2; di++) {
        const i = ci + di;
        const j = cj + dj;
        if (i >= 0 && j >= 0 && i < N && j < N) taken[j * N + i] = 1;
      }
    }
    const cx = (i: number) => -LIM + i * STEP;
    const info = (i: number, j: number): number => {
      const k = j * N + i;
      if (Number.isNaN(hgt[k])) {
        this.natural(cx(i), cx(j), this.scratch);
        hgt[k] = this.scratch.h;
        const w = this.scratch.water;
        wet[k] = this.scratch.h < 2 ? 2 : !Number.isNaN(w) && this.scratch.h < w + 0.3 ? 1 : 0;
      }
      return k;
    };
    const near = (v: number) => Math.max(0, Math.min(N - 1, Math.round((v + LIM) / STEP)));
    const si = near(sx);
    const sj = near(sz);
    const gi = near(gx);
    const gj = near(gz);
    const g = new Float32Array(N * N).fill(Infinity);
    const parent = new Int32Array(N * N).fill(-1);
    const closed = new Uint8Array(N * N);
    // binary heap (lazy deletion)
    const hk: number[] = [];
    const hv: number[] = [];
    const push = (key: number, v: number) => {
      let i = hk.length;
      hk.push(key);
      hv.push(v);
      while (i > 0) {
        const p = (i - 1) >> 1;
        if (hk[p] <= hk[i]) break;
        [hk[p], hk[i]] = [hk[i], hk[p]];
        [hv[p], hv[i]] = [hv[i], hv[p]];
        i = p;
      }
    };
    const pop = (): number => {
      const top = hv[0];
      const lk = hk.pop()!;
      const lv = hv.pop()!;
      if (hk.length > 0) {
        hk[0] = lk;
        hv[0] = lv;
        let i = 0;
        for (;;) {
          const l = 2 * i + 1;
          const r = l + 1;
          let m = i;
          if (l < hk.length && hk[l] < hk[m]) m = l;
          if (r < hk.length && hk[r] < hk[m]) m = r;
          if (m === i) break;
          [hk[m], hk[i]] = [hk[i], hk[m]];
          [hv[m], hv[i]] = [hv[i], hv[m]];
          i = m;
        }
      }
      return top;
    };
    const heur = (i: number, j: number) => {
      const dx = Math.abs(i - gi);
      const dz = Math.abs(j - gj);
      return STEP * (dx + dz - 0.5858 * Math.min(dx, dz));
    };

    const s0 = info(si, sj);
    g[s0] = 0;
    push(heur(si, sj), s0);
    const goal = gj * N + gi;
    const DIRS = [
      [1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1],
    ];
    let found = false;
    while (hk.length > 0) {
      const k = pop();
      if (closed[k]) continue;
      closed[k] = 1;
      if (k === goal) {
        found = true;
        break;
      }
      const i = k % N;
      const j = (k - i) / N;
      for (const [di, dj] of DIRS) {
        const ni = i + di;
        const nj = j + dj;
        if (ni < 0 || nj < 0 || ni >= N || nj >= N) continue;
        const nk = info(ni, nj);
        if (closed[nk] || (wet[nk] === 2 && nk !== goal)) continue;
        const dist = STEP * (di !== 0 && dj !== 0 ? Math.SQRT2 : 1);
        const gr = Math.abs(hgt[nk] - hgt[k]) / dist;
        if (gr > (relaxed ? 0.45 : 0.2)) continue;
        let f = 1;
        if (gr > 0.04) f += ((gr - 0.04) / 0.04) ** 2 * 1.2;
        if (gr > 0.1) f += relaxed ? 3 + (gr - 0.1) * 40 : 8;
        if (wet[nk] === 1) f += 18;
        if (taken[nk]) f += 30;
        const ng = g[k] + dist * f;
        if (ng < g[nk]) {
          g[nk] = ng;
          parent[nk] = k;
          push(ng + heur(ni, nj), nk);
        }
      }
    }
    if (!found && !relaxed) {
      const again = this.route(sx, sz, gx, gz, avoid, free, true);
      if (this.routeFallbacks === fbBefore) return again;
      return again;
    }
    if (!found) {
      this.routeFallbacks++;
      return [[sx, sz], [gx, gz]];
    } // no path: straight line (still gets bridges / cut & fill)
    const cells: number[][] = [];
    for (let k = goal; k !== -1; k = parent[k]) {
      const i = k % N;
      cells.push([cx(i), cx((k - i) / N)]);
    }
    cells.reverse();
    cells[0] = [sx, sz];
    cells[cells.length - 1] = [gx, gz];
    return cells;
  }

  /** Relax the grid-aligned A* zigzag into a smooth curve (Laplacian smoothing + Catmull-Rom), keep both ends fixed. */
  /**
   * Cuts out every self-crossing loop / hook of a polyline: where segment i crosses a later segment j, the vertices in between are
   * replaced by the crossing point. A road that crosses itself would make a ribbon overlap (brown terrain patches, "why is there
   * a loop?"), so no road may keep such a loop.
   */
  /** The planned city (site 0: buildings, local streets, railway) was fitted to the road network around it: roads near it keep their original shape. */
  private nearCity(x: number, z: number): boolean {
    const hub = this.sites[0];
    return !!hub && Math.hypot(x - hub.x, z - hub.z) < NEAR_CITY;
  }

  private cutSelfCrossings(poly: number[][]): number[][] {
    if (poly.some((q) => this.nearCity(q[0], q[1]))) return poly.map((v) => [v[0], v[1]]);
    let out = poly.map((v) => [v[0], v[1]]);
    // A bulb that exists only to CLIMB a hill gradually (a real switchback) is kept: cutting it would make the grade impossible.
    const hAt = (x: number, z: number): number => {
      this.natural(x, z, this.scratch);
      return this.scratch.h;
    };
    const climbOk = (a: number[], b: number[]): boolean => Math.abs(hAt(a[0], a[1]) - hAt(b[0], b[1])) <= 0.04 * Math.max(30, Math.hypot(a[0] - b[0], a[1] - b[1]));
    for (let guard = 0; guard < 40; guard++) {
      let hit: { i: number; j: number; x: number; z: number } | null = null;
      for (let i = 0; i < out.length - 1 && !hit; i++) {
        const ax = out[i][0], az = out[i][1], bx = out[i + 1][0], bz = out[i + 1][1];
        for (let j = i + 2; j < out.length - 1; j++) {
          const cx = out[j][0], cz = out[j][1], dx = out[j + 1][0], dz = out[j + 1][1];
          const d = (bx - ax) * (dz - cz) - (bz - az) * (dx - cx);
          if (Math.abs(d) < 1e-9) continue;
          const t = ((cx - ax) * (dz - cz) - (cz - az) * (dx - cx)) / d;
          const u = ((cx - ax) * (bz - az) - (cz - az) * (bx - ax)) / d;
          if (t < 0 || t > 1 || u < 0 || u > 1) continue;
          if (!climbOk(out[i], out[j])) continue;
          hit = { i, j, x: ax + (bx - ax) * t, z: az + (bz - az) * t };
          break;
        }
      }
      if (!hit) break;
      out = [...out.slice(0, hit.i + 1), [hit.x, hit.z], ...out.slice(hit.j + 1)];
    }
    // hairpins / U-turn bulbs: the road leaves a point, wanders 150-700 m and comes back close to it (the plain of Bangladesh has no
    // switchbacks). The bulb is replaced by the direct line.
    for (let guard = 0; guard < 40; guard++) {
      const cum: number[] = [0];
      for (let i = 1; i < out.length; i++) cum.push(cum[i - 1] + Math.hypot(out[i][0] - out[i - 1][0], out[i][1] - out[i - 1][1]));
      let cut: [number, number] | null = null;
      for (let i = 0; i < out.length - 1 && !cut; i++) {
        for (let j = out.length - 1; j > i + 1; j--) {
          const along = cum[j] - cum[i];
          if (along < 150) break;
          if (along > 1500) continue;
          const d = Math.hypot(out[j][0] - out[i][0], out[j][1] - out[i][1]);
          if (d < Math.max(60, along * 0.22) && climbOk(out[i], out[j])) {
            cut = [i, j];
            break;
          }
          // a U-turn: the road turns back on itself (headings at i and j point against each other) and the straight line is much shorter
          if (d < along * 0.38) {
            const a0 = out[Math.max(0, i - 1)];
            const a1 = out[Math.min(out.length - 1, i + 1)];
            const b0 = out[Math.max(0, j - 1)];
            const b1 = out[Math.min(out.length - 1, j + 1)];
            const ax = a1[0] - a0[0], az = a1[1] - a0[1], bx = b1[0] - b0[0], bz = b1[1] - b0[1];
            const al = Math.hypot(ax, az), bl = Math.hypot(bx, bz);
            if (al > 0 && bl > 0 && (ax * bx + az * bz) / (al * bl) < 0 && climbOk(out[i], out[j])) {
              cut = [i, j];
              break;
            }
          }
        }
      }
      if (!cut) break;
      out = [...out.slice(0, cut[0] + 1), ...out.slice(cut[1])];
    }
    return out;
  }

  private smoothRoute(poly0: number[][], cut = true): number[][] {
    const poly = cut ? this.cutSelfCrossings(poly0) : poly0;
    const p = poly.map((v) => [v[0], v[1]]);
    for (let it = 0; it < 10; it++) {
      for (let i = 2; i < p.length - 2; i++) {
        p[i][0] = 0.25 * p[i - 1][0] + 0.5 * p[i][0] + 0.25 * p[i + 1][0];
        p[i][1] = 0.25 * p[i - 1][1] + 0.5 * p[i][1] + 0.25 * p[i + 1][1];
      }
    }
    const dense: number[][] = [];
    for (let i = 0; i < p.length - 1; i++) {
      const p0 = p[Math.max(0, i - 1)];
      const p1 = p[i];
      const p2 = p[i + 1];
      const p3 = p[Math.min(p.length - 1, i + 2)];
      for (let k = 0; k < 12; k++) {
        const t = k / 12;
        const t2 = t * t;
        const t3 = t2 * t;
        const f = (a: number, b: number, c: number, d: number) =>
          0.5 * (2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (-a + 3 * b - 3 * c + d) * t3);
        dense.push([f(p0[0], p1[0], p2[0], p3[0]), f(p0[1], p1[1], p2[1], p3[1])]);
      }
    }
    dense.push(p[p.length - 1]);
    return this.resample(cut ? this.cutSelfCrossings(dense) : dense, KIND.highway.step);
  }

  /** Points every `step` metres along a polyline. */
  private resample(poly: number[][], step: number): number[][] {
    const out: number[][] = [poly[0]];
    let carry = 0;
    for (let i = 0; i < poly.length - 1; i++) {
      const [ax, az] = poly[i];
      const [bx, bz] = poly[i + 1];
      const len = Math.hypot(bx - ax, bz - az);
      let d = step - carry;
      while (d <= len) {
        const t = d / len;
        out.push([ax + (bx - ax) * t, az + (bz - az) * t]);
        d += step;
      }
      carry = len - (d - step);
    }
    const last = poly[poly.length - 1];
    const prev = out[out.length - 1];
    if (Math.hypot(last[0] - prev[0], last[1] - prev[1]) > step * 0.3) out.push(last);
    else out[out.length - 1] = last;
    return out;
  }

  // =====================================================================================
  // One road: arrays, height profile, bridges and culverts
  // =====================================================================================
  private addRoad(raw: RawRoad): void {
    const K = raw.earth ? KIND_EARTH : KIND[raw.kind];
    const n = raw.pts.length;
    const id = this.roads.length;
    const xs = new Float64Array(n);
    const zs = new Float64Array(n);
    for (let i = 0; i < n; i++) {
      xs[i] = raw.pts[i][0];
      zs[i] = raw.pts[i][1];
    }
    const cum = new Float64Array(n);
    for (let i = 1; i < n; i++) cum[i] = cum[i - 1] + Math.hypot(xs[i] - xs[i - 1], zs[i] - zs[i - 1]);
    const length = cum[n - 1] + (raw.closed ? Math.hypot(xs[0] - xs[n - 1], zs[0] - zs[n - 1]) : 0);
    const nx = new Float32Array(n);
    const nz = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const ip = raw.closed ? (i + n - 1) % n : Math.max(0, i - 1);
      const inx = raw.closed ? (i + 1) % n : Math.min(n - 1, i + 1);
      let tx = xs[inx] - xs[ip];
      let tz = zs[inx] - zs[ip];
      const l = Math.hypot(tx, tz) || 1;
      tx /= l;
      tz /= l;
      nx[i] = tz; // left normal (x right, z south -> left of travel direction)
      nz[i] = -tx;
    }
    const road: RoadSpec = {
      id,
      tier: raw.tier,
      kind: raw.kind,
      name: raw.name,
      earth: raw.earth,
      closed: raw.closed,
      step: K.step,
      halfWidth: raw.halfWidth ?? K.halfWidth,
      shoulder: raw.shoulder ?? K.shoulder,
      lanes: raw.lanes ?? K.lanes,
      speedKmh: raw.speedKmh ?? K.speedKmh,
      maxGrade: raw.tier === 4 ? Config.city.localRoads.rampGrade : K.maxGrade,
      xs,
      zs,
      ys: new Float64Array(n),
      hNat: new Float32Array(n),
      nx,
      nz,
      cum,
      length,
      bridgeOf: new Int16Array(n).fill(-1),
      areaId: raw.areaId,
    };
    this.roads.push(road);
    if (raw.earth) {
      this.buildEarthProfile(road, raw.endY?.[0]);
      return;
    }
    if (raw.tier === 4 && raw.endY) {
      this.buildLocalProfile(road, raw.endY, raw.knots);
      return;
    }
    this.buildProfile(road, raw);
  }

  /**
   * Local streets (Stage 10B) lie on dry, gentle ground (checked by the planner): the surface is the straight line between the
   * two junction heights. That keeps every intersection pad consistent with the streets that meet in it (no ramps that fight
   * the neighbouring pad) and the terrain only needs a small cut / fill.
   */
  private buildLocalProfile(r: RoadSpec, endY: [number, number], knots?: number[][]): void {
    const n = r.xs.length;
    const total = Math.max(1e-6, r.cum[n - 1]);
    const kn = knots && knots.length >= 2 ? knots : [[0, endY[0]], [total, endY[1]]];
    const kScale = total / Math.max(1e-6, kn[kn.length - 1][0]);
    let k = 0;
    for (let i = 0; i < n; i++) {
      this.natural(r.xs[i], r.zs[i], this.scratch);
      r.hNat[i] = this.scratch.h;
      const s = r.cum[i];
      while (k < kn.length - 2 && kn[k + 1][0] * kScale < s) k++;
      const s0 = kn[k][0] * kScale;
      const s1 = kn[k + 1][0] * kScale;
      const t = s1 > s0 ? Math.min(1, Math.max(0, (s - s0) / (s1 - s0))) : 0;
      r.ys[i] = kn[k][1] + (kn[k + 1][1] - kn[k][1]) * t;
    }
  }

  private buildProfile(r: RoadSpec, raw: RawRoad, viaducts?: { a: number; b: number }[]): void {
    const nb0 = this.bridges.length;
    const nc0 = this.culverts.length;
    const n = r.xs.length;
    const ds = r.step;
    const h0 = new Float64Array(n);
    const lev = new Float64Array(n).fill(NaN);
    const wet = new Uint8Array(n);
    // Wet test: the centre line AND both road edges, at the point and half way to its neighbours. A river that only
    // touches the shoulder, or slips between two points of the centre line, still needs a bridge (otherwise the road
    // embankment buries the channel = a dam).
    const reachU = r.halfWidth + r.shoulder + 1.5;
    for (let i = 0; i < n; i++) {
      this.natural(r.xs[i], r.zs[i], this.scratch);
      h0[i] = this.scratch.h;
      r.hNat[i] = this.scratch.h;
      const w = this.scratch.water;
      if (!Number.isNaN(w)) {
        lev[i] = w;
        if (this.scratch.h < w + 0.3) wet[i] = 1;
      }
      for (const tt of [-0.5, 0, 0.5]) {
        const j = Math.min(n - 1, Math.max(0, i + (tt < 0 ? -1 : tt > 0 ? 1 : 0)));
        const px = tt === 0 ? r.xs[i] : (r.xs[i] + r.xs[j]) / 2;
        const pz = tt === 0 ? r.zs[i] : (r.zs[i] + r.zs[j]) / 2;
        for (const u of [-reachU, 0, reachU]) {
          if (tt === 0 && u === 0) continue;
          this.natural(px + r.nx[i] * u, pz + r.nz[i] * u, this.scratch);
          const w2 = this.scratch.water;
          if (Number.isNaN(w2)) continue;
          if (Number.isNaN(lev[i]) || w2 > lev[i]) lev[i] = w2;
          if (this.scratch.h < w2 + 0.3) wet[i] = 1;
        }
      }
    }

    const lo = new Float64Array(n).fill(-Infinity);
    const base = Float64Array.from(h0);
    const zones: { a: number; b: number }[] = [];
    if (!r.closed) {
      // wet runs -> candidate zones
      const E = Math.ceil(16 / ds);
      for (let i = 0; i < n; ) {
        if (!wet[i]) {
          i++;
          continue;
        }
        let j = i;
        while (j + 1 < n && wet[j + 1]) j++;
        const wetLen = (j - i + 1) * ds;
        if (wetLen >= BRIDGE_MIN_WET) {
          const a = Math.max(0, i - E);
          const b = Math.min(n - 1, j + E);
          const prev = zones[zones.length - 1];
          if (prev && a <= prev.b + 1) prev.b = b;
          else zones.push({ a, b });
        } else {
          // culvert: fill the gap, road stays on an embankment
          const a = Math.max(0, i - 1);
          const b = Math.min(n - 1, j + 1);
          for (let k = a; k <= b; k++) base[k] = base[a] + ((base[b] - base[a]) * (k - a)) / Math.max(1, b - a);
          let wl = -Infinity;
          for (let k = i; k <= j; k++) wl = Math.max(wl, lev[k]);
          const m = (i + j) >> 1;
          this.culverts.push({ id: this.culverts.length, roadId: r.id, x: r.xs[m], z: r.zs[m], widthM: wetLen, roadY: 0, waterY: wl });
        }
        i = j + 1;
      }
      // viaducts (high fill beside a river valley): extra zones, merged with the wet zones
      if (viaducts) {
        for (const v of viaducts) zones.push({ a: v.a, b: v.b });
        zones.sort((p, q) => p.a - q.a);
        for (let k = 1; k < zones.length; ) {
          if (zones[k].a <= zones[k - 1].b + 1) {
            zones[k - 1].b = Math.max(zones[k - 1].b, zones[k].b);
            zones.splice(k, 1);
          } else k++;
        }
      }
      for (const z of zones) {
        for (let k = z.a; k <= z.b; k++) base[k] = base[z.a] + ((base[z.b] - base[z.a]) * (k - z.a)) / Math.max(1, z.b - z.a);
      }
    }

    // moving average (wraps on closed roads)
    const W = r.kind === 'roundabout' ? 14 : Math.max(2, Math.round(90 / ds));
    const sm = new Float64Array(n);
    for (let i = 0; i < n; i++) {
      let s = 0;
      let c = 0;
      for (let k = -W; k <= W; k++) {
        let j = i + k;
        if (r.closed) j = (j + n * 4) % n;
        else if (j < 0 || j >= n) continue;
        s += base[j];
        c++;
      }
      sm[i] = s / c;
    }
    for (const z of zones) {
      for (let k = z.a; k <= z.b; k++) sm[k] = sm[z.a] + ((sm[z.b] - sm[z.a]) * (k - z.a)) / Math.max(1, z.b - z.a);
    }

    // minimum heights: clearance over water (bridges) / above water level (culverts, low banks)
    const bridgeIds: number[] = [];
    for (const z of zones) {
      let peak = -Infinity;
      for (let k = z.a; k <= z.b; k++) if (!Number.isNaN(lev[k])) peak = Math.max(peak, lev[k]);
      if (!Number.isFinite(peak)) peak = Math.min(sm[z.a], sm[z.b]);
      let wetN = 0;
      for (let k = z.a; k <= z.b; k++) if (wet[k]) wetN++;
      const wetSpan = wetN * ds;
      // a dry viaduct has no wet span, but still needs piers: its "span" is the deck length minus the two approaches
      const spanM = Math.max(wetSpan, (z.b - z.a) * ds - 32);
      const type = wetSpan < 60 ? 'beam' : 'arch';
      const clearance = type === 'beam' ? 3.5 : 6;
      for (let k = z.a; k <= z.b; k++) lo[k] = peak + clearance;
      const id = this.bridges.length;
      bridgeIds.push(id);
      for (let k = z.a; k <= z.b; k++) r.bridgeOf[k] = id;
      const maxSpan = type === 'beam' ? 25 : 100;
      const piers = Math.max(0, Math.ceil(spanM / maxSpan) - 1);
      this.bridges.push({
        id,
        roadId: r.id,
        i0: z.a,
        i1: z.b,
        type,
        spanM,
        lengthM: (z.b - z.a) * ds,
        deckHalfWidth: r.halfWidth + r.shoulder + 0.3,
        waterY: peak,
        clearanceM: clearance,
        material: type === 'beam' ? 'prestressed-concrete' : 'steel',
        maxLoadT: type === 'beam' ? 40 : 60,
        maxSpanM: piers === 0 ? spanM : spanM / (piers + 1),
        centerX: r.xs[(z.a + z.b) >> 1],
        centerZ: r.zs[(z.a + z.b) >> 1],
      });
    }
    for (let i = 0; i < n; i++) {
      if (r.bridgeOf[i] < 0 && !Number.isNaN(lev[i]) && sm[i] < lev[i] + 1.5) lo[i] = Math.max(lo[i], lev[i] + 1.5);
    }

    // grade limit: balance of "raise low points" (fill) and "lower high points" (cut), then re-impose the minimums
    // 4 % slack: resampled points on tight bends are slightly closer than `ds` (chord < arc), which would otherwise break the limit
    const g = r.maxGrade * ds * 0.96;
    const clampRaise = (y: Float64Array): Float64Array => {
      const o = Float64Array.from(y);
      if (r.closed) return o;
      for (let i = n - 1; i > 0; i--) if (o[i] - o[i - 1] > g) o[i - 1] = o[i] - g;
      for (let i = 1; i < n; i++) if (o[i - 1] - o[i] > g) o[i] = o[i - 1] - g;
      return o;
    };
    const clampLower = (y: Float64Array): Float64Array => {
      const o = Float64Array.from(y);
      if (r.closed) return o;
      for (let i = 1; i < n; i++) if (o[i] - o[i - 1] > g) o[i] = o[i - 1] + g;
      for (let i = n - 1; i > 0; i--) if (o[i - 1] - o[i] > g) o[i - 1] = o[i] + g;
      return o;
    };
    const withMin = (y: Float64Array) => y.map((v, i) => Math.max(v, lo[i]));
    const up = clampRaise(withMin(sm));
    const dn = clampLower(withMin(sm));
    const mid = withMin(up.map((v, i) => (v + dn[i]) / 2));
    const fin = clampRaise(mid);
    // crossings with finished roads: pull the profile to the other road's surface height around the crossing (smooth over 70 m),
    // BEFORE the grade envelope below, so the grade limit still holds afterwards
    if (!r.closed && raw.endY) {
      for (const c of raw.cross ?? []) {
        const t = this.nearestRoadHeight(c[0], c[1], r.id);
        if (t === null) continue;
        let bi = 0;
        let bd = Infinity;
        for (let i = 0; i < n; i++) {
          const d = (r.xs[i] - c[0]) ** 2 + (r.zs[i] - c[1]) ** 2;
          if (d < bd) {
            bd = d;
            bi = i;
          }
        }
        if (bd > 400) continue;
        const delta = t - fin[bi];
        for (let i = Math.max(0, bi - 12); i <= Math.min(n - 1, bi + 12); i++) fin[i] += delta * (1 - smoothstep(0, 70, Math.abs(i - bi) * ds));
      }
    }
    if (raw.endY) {
      // fixed junction heights: clamp the profile into the envelope of all grade-limited lines through both end points
      // (min/max of g-Lipschitz functions stay g-Lipschitz, so the grade limit survives and both ends hit the node height exactly)
      const [yA, yB] = raw.endY;
      for (let i = 0; i < n; i++) {
        const da = r.maxGrade * r.cum[i];
        const db = r.maxGrade * (r.cum[n - 1] - r.cum[i]);
        const lowB = Math.max(yA - da, yB - db);
        const upB = Math.min(yA + da, yB + db);
        fin[i] = Math.min(Math.max(fin[i], lowB), Math.max(lowB, upB));
      }
    }
    if (!r.closed) {
      // final safety pass with the TRUE distances between points (chords on tight bends are shorter than the nominal step)
      const fixA = !!raw.endY;
      for (let it = 0; it < 6; it++) {
        for (let i = 1; i < n; i++) {
          if (i === n - 1 && fixA) break;
          const gi = r.maxGrade * (r.cum[i] - r.cum[i - 1]) * 0.995;
          fin[i] = Math.min(Math.max(fin[i], fin[i - 1] - gi), fin[i - 1] + gi);
        }
        for (let i = n - 2; i >= 0; i--) {
          if (i === 0 && fixA) break;
          const gi = r.maxGrade * (r.cum[i + 1] - r.cum[i]) * 0.995;
          fin[i] = Math.min(Math.max(fin[i], fin[i + 1] - gi), fin[i + 1] + gi);
        }
      }
    }
    for (let i = 0; i < n; i++) r.ys[i] = fin[i];

    // pin both ends to the roads they join (so junctions have no height step)
    if (!r.closed && !raw.endY) {
      for (const end of [0, n - 1] as const) {
        const t = raw.loop ? (end === n - 1 ? r.ys[0] : null) : this.nearestRoadHeight(r.xs[end], r.zs[end], r.id);
        if (t !== null) this.pinAt(r, end, t, 100);
      }
      for (const c of raw.cross ?? []) {
        const t = this.nearestRoadHeight(c[0], c[1], r.id);
        if (t === null) continue;
        let bi = 0;
        let bd = Infinity;
        for (let i = 0; i < n; i++) {
          const d = (r.xs[i] - c[0]) ** 2 + (r.zs[i] - c[1]) ** 2;
          if (d < bd) {
            bd = d;
            bi = i;
          }
        }
        if (bd < 400) this.pinAt(r, bi, t, 70);
      }
    }
    for (const c of this.culverts) if (c.roadId === r.id) c.roadY = this.heightAlong(r, c.x, c.z);
    for (const j of this.junctions) if (j.y === 0) j.y = this.nearestRoadHeight(j.x, j.z, -1) ?? 0;

    // High fill next to a river valley would be a huge earth dam across the valley: build a viaduct there instead
    // (a second pass of the same function with those stretches added as bridge zones).
    if (!viaducts && !r.closed) {
      const flagged: number[] = [];
      for (let i = 0; i < n; i++) {
        if (r.bridgeOf[i] >= 0 || r.ys[i] - r.hNat[i] <= VIADUCT_FILL) continue;
        if (this.riverBeside(r, i)) flagged.push(i);
      }
      if (flagged.length > 0) {
        const extra: { a: number; b: number }[] = [];
        for (const i of flagged) {
          const last = extra[extra.length - 1];
          if (last && i - last.b <= 8 + 3) last.b = Math.min(n - 1, i + 3);
          else extra.push({ a: Math.max(0, i - 3), b: Math.min(n - 1, i + 3) });
        }
        this.bridges.length = nb0;
        this.culverts.length = nc0;
        r.bridgeOf.fill(-1);
        this.buildProfile(r, raw, extra);
      }
    }
  }

  /** True if a river / lake / sea channel lies within VIADUCT_RIVER_REACH of road point `i` (either side). */
  private riverBeside(r: RoadSpec, i: number): boolean {
    for (const u of [-110, -75, -45, -20, 20, 45, 75, 110]) {
      if (Math.abs(u) > VIADUCT_RIVER_REACH) continue;
      this.natural(r.xs[i] + r.nx[i] * u, r.zs[i] + r.nz[i] * u, this.scratch);
      const w = this.scratch.water;
      if (!Number.isNaN(w) && this.scratch.h < w + 0.5 && this.scratch.h > 2) return true;
    }
    return false;
  }

  /** Shift the profile so that point `idx` has height `target`; the shift fades out over `L` metres . */
  private pinAt(r: RoadSpec, idx: number, target: number, L: number): void {
    const delta = target - r.ys[idx];
    const n = r.ys.length;
    const reach = Math.ceil(L / r.step);
    const lo = Math.max(0, idx - reach);
    const hi = Math.min(n - 1, idx + reach);
    for (let i = lo; i <= hi; i++) {
      r.ys[i] += delta * (1 - smoothstep(0, L, Math.abs(i - idx) * r.step));
    }
  }

  /** Height of an ALREADY BUILT road within 6 m of (x, z), or null. */
  private nearestRoadHeight(x: number, z: number, exceptId: number): number | null {
    let best = 36;
    let y: number | null = null;
    for (const r of this.roads) {
      if (r.id === exceptId) continue;
      for (let i = 0; i < r.xs.length; i++) {
        const d = (r.xs[i] - x) ** 2 + (r.zs[i] - z) ** 2;
        if (d < best) {
          best = d;
          y = r.ys[i];
        }
      }
    }
    return y;
  }

  private heightAlong(r: RoadSpec, x: number, z: number): number {
    let best = Infinity;
    let y = 0;
    for (let i = 0; i < r.xs.length; i++) {
      const d = (r.xs[i] - x) ** 2 + (r.zs[i] - z) ** 2;
      if (d < best) {
        best = d;
        y = r.ys[i];
      }
    }
    return y;
  }

  // =====================================================================================
  // Spatial index
  // =====================================================================================
  private buildSegments(): void {
    let total = 0;
    for (const r of this.roads) total += r.closed ? r.xs.length : r.xs.length - 1;
    this.segRoad = new Int32Array(total);
    this.segPt = new Int32Array(total);
    this.sax = new Float64Array(total);
    this.saz = new Float64Array(total);
    this.sbx = new Float64Array(total);
    this.sbz = new Float64Array(total);
    this.say = new Float64Array(total);
    this.sby = new Float64Array(total);
    this.sea = new Float32Array(total);
    this.seb = new Float32Array(total);
    this.shw = new Float32Array(total);
    this.score = new Float32Array(total);
    this.sbridge = new Uint8Array(total);
    this.searth = new Uint8Array(total);

    const temp = new Map<number, number[]>();
    const S = Config.world.chunkSize;
    let s = 0;
    const emb = (r: RoadSpec, i: number) => (r.bridgeOf[i] >= 0 ? 6 : Math.min(MAX_EMB, Math.max(6, Math.abs(r.ys[i] - r.hNat[i]) * 2.4 + 5)));
    for (const r of this.roads) {
      const m = r.closed ? r.xs.length : r.xs.length - 1;
      for (let i = 0; i < m; i++, s++) {
        const j = (i + 1) % r.xs.length;
        this.segRoad[s] = r.id;
        this.segPt[s] = i;
        this.sax[s] = r.xs[i];
        this.saz[s] = r.zs[i];
        this.sbx[s] = r.xs[j];
        this.sbz[s] = r.zs[j];
        this.say[s] = r.ys[i];
        this.sby[s] = r.ys[j];
        this.sea[s] = emb(r, i);
        this.seb[s] = emb(r, j);
        this.shw[s] = r.halfWidth;
        this.score[s] = r.halfWidth + r.shoulder;
        this.searth[s] = r.earth ? 1 : 0;
        this.sbridge[s] = r.bridgeOf[i] >= 0 && r.bridgeOf[i] === r.bridgeOf[j] ? 1 : 0;

        const reach = this.score[s] + Math.max(this.sea[s], this.seb[s]) + 2;
        const x0 = Math.min(r.xs[i], r.xs[j]) - reach;
        const x1 = Math.max(r.xs[i], r.xs[j]) + reach;
        const z0 = Math.min(r.zs[i], r.zs[j]) - reach;
        const z1 = Math.max(r.zs[i], r.zs[j]) + reach;
        for (let cz = Math.floor(z0 / CELL); cz <= Math.floor(z1 / CELL); cz++) {
          for (let cx = Math.floor(x0 / CELL); cx <= Math.floor(x1 / CELL); cx++) {
            const k = (cx + 512) * 1024 + (cz + 512);
            let a = temp.get(k);
            if (!a) temp.set(k, (a = []));
            a.push(s);
          }
        }
        // each segment belongs to the chunk that holds its midpoint (the ribbon mesh is built there, once);
        // segments inside a junction stub are replaced by the junction pad and get no ribbon
        const tr = this.trim.get(r.id);
        if (!(tr && tr[i] && tr[j])) {
          const { cx, cz } = worldToChunkCoord((r.xs[i] + r.xs[j]) / 2, (r.zs[i] + r.zs[j]) / 2);
          const ck = chunkKey(cx, cz);
          let l = this.chunkSegs.get(ck);
          if (!l) this.chunkSegs.set(ck, (l = []));
          l.push(s);
        }
      }
    }
    void S;
    // junction pads: spatial cells (terrain levelling) and owning chunk (mesh)
    for (const p of this.pads) {
      const reach = p.rCore + p.emb + 2;
      for (let cz = Math.floor((p.z - reach) / CELL); cz <= Math.floor((p.z + reach) / CELL); cz++) {
        for (let cx = Math.floor((p.x - reach) / CELL); cx <= Math.floor((p.x + reach) / CELL); cx++) {
          const k = (cx + 512) * 1024 + (cz + 512);
          let a = this.padCells.get(k);
          if (!a) this.padCells.set(k, (a = []));
          a.push(p.id);
          // the pad area must be known to touchesArea / the mask even if no road segment cell covers it
          if (!temp.has(k)) temp.set(k, []);
        }
      }
      const { cx, cz } = worldToChunkCoord(p.x, p.z);
      const ck = chunkKey(cx, cz);
      let l = this.chunkPads.get(ck);
      if (!l) this.chunkPads.set(ck, (l = []));
      l.push(p.id);
    }
    for (const [k, a] of temp) this.cells.set(k, Int32Array.from(a));
    for (const c of this.culverts) c.roadY = Math.round(c.roadY * 100) / 100;
  }

  private cellOf(x: number, z: number): Int32Array | undefined {
    return this.cells.get((Math.floor(x / CELL) + 512) * 1024 + (Math.floor(z / CELL) + 512));
  }

  // =====================================================================================
  // Queries
  // =====================================================================================

  /**
   * Cut & fill: pulls the terrain height towards the road surface near a road.
   * Inside the road + shoulder the ground IS the road surface; beyond that an embankment blends it back
   * (embankment width grows with the cut/fill depth, 1 : 2.4 slopes). Bridges leave the ground alone (only banks that would poke through the deck are trimmed).
   */
  apply(x: number, z: number, out: TerrainSample): void {
    const segs = this.cellOf(x, z);
    if (!segs) return;
    // RIVER PROTECTION: wet ground (river, lake, sea) is never filled or cut by a road. Every wet crossing is a bridge,
    // so the water keeps flowing and the road can never dam it.
    if (!Number.isNaN(out.water) && out.h < out.water + 0.3) return;
    let bw = 0;
    let by = 0;
    let bd = Infinity;
    let carve = Infinity;
    let carveW = 0;
    // JUNCTION PLATEAU: inside a pad the terrain IS the pad plane (wins over every road strip); outside it blends back like an embankment
    const pl = this.padCells.get((Math.floor(x / CELL) + 512) * 1024 + (Math.floor(z / CELL) + 512));
    if (pl) {
      for (let q = 0; q < pl.length; q++) {
        const p = this.pads[pl[q]];
        const d = Math.hypot(x - p.x, z - p.z);
        if (d >= p.rCore + p.emb) continue;
        const w = 1 - smoothstep(p.rCore, p.rCore + p.emb, d);
        if (w > bw + 1e-6) {
          bw = w;
          bd = w >= 1 - 1e-6 ? -1 : d;
          by = p.y + p.a * (x - p.x) + p.b * (z - p.z);
        }
      }
    }
    for (let q = 0; q < segs.length; q++) {
      const s = segs[q];
      const abx = this.sbx[s] - this.sax[s];
      const abz = this.sbz[s] - this.saz[s];
      const l2 = abx * abx + abz * abz;
      let t = l2 > 0 ? ((x - this.sax[s]) * abx + (z - this.saz[s]) * abz) / l2 : 0;
      t = t < 0 ? 0 : t > 1 ? 1 : t;
      const d = Math.hypot(x - (this.sax[s] + abx * t), z - (this.saz[s] + abz * t));
      const core = this.score[s];
      if (this.sbridge[s]) {
        // Under a bridge deck the ground is left alone (the valley / river stays) - but the ground may never touch the slab:
        // anything higher than 0.7 m below the deck surface is carved away (smoothly, over a few metres).
        const deck = this.say[s] + (this.sby[s] - this.say[s]) * t - 0.7;
        if (out.h > deck && d < core + 5) {
          const cw = 1 - smoothstep(core + 0.5, core + 5, d);
          if (cw > carveW) {
            carveW = cw;
            carve = deck;
          }
        }
        continue;
      }
      const e = this.sea[s] + (this.seb[s] - this.sea[s]) * t;
      if (d >= core + e) continue;
      const w = 1 - smoothstep(core, core + e, d);
      // strongest pull wins; inside the road surface (w = 1 for several segments) the nearest segment decides
      if (w > bw + 1e-6 || (w > bw - 1e-6 && d < bd)) {
        bw = w;
        bd = d;
        by = this.say[s] + (this.sby[s] - this.say[s]) * t;
      }
    }
    if (bw > 0) out.h += (by - out.h) * bw;
    // where a normal (on-ground) road also claims the cell, that road wins: the abutment must meet the road surface exactly
    carveW *= 1 - bw;
    if (carveW > 0 && out.h > carve) out.h -= (out.h - carve) * carveW;
  }

  /** Nearest road segment to (x, z) within its width: returns [segment, distance] or null. */
  private nearest(x: number, z: number, reach: number): { s: number; d: number } | null {
    const segs = this.cellOf(x, z);
    if (!segs) return null;
    let bs = -1;
    let bd = Infinity;
    for (let q = 0; q < segs.length; q++) {
      const s = segs[q];
      const abx = this.sbx[s] - this.sax[s];
      const abz = this.sbz[s] - this.saz[s];
      const l2 = abx * abx + abz * abz;
      let t = l2 > 0 ? ((x - this.sax[s]) * abx + (z - this.saz[s]) * abz) / l2 : 0;
      t = t < 0 ? 0 : t > 1 ? 1 : t;
      const d = Math.hypot(x - (this.sax[s] + abx * t), z - (this.saz[s] + abz * t));
      if (d < bd) {
        bd = d;
        bs = s;
      }
    }
    return bs >= 0 && bd <= this.score[bs] + reach ? { s: bs, d: bd } : null;
  }

  /** Tyre surface under (x, z): asphalt on the road, gravel on the shoulder, 0 = natural ground. */
  surfaceAt(x: number, z: number): SurfaceKind {
    if (this.padAt(x, z)) return 1;
    const n = this.nearest(x, z, 0);
    if (!n) return 0;
    return n.d <= this.shw[n.s] && !this.searth[n.s] ? 1 : 2;
  }

  /** Engineering info card data for the road under (x, z), or null (Stage 11 will show this in the UI). */
  infoAt(x: number, z: number): RoadInfo | null {
    const n = this.nearest(x, z, 0);
    if (!n) return null;
    const r = this.roads[this.segRoad[n.s]];
    const bi = r.bridgeOf[this.segPt[n.s]];
    return {
      roadId: r.id,
      name: r.name,
      kind: r.kind,
      surface: n.d <= this.shw[n.s] && !r.earth ? 1 : 2,
      widthM: r.halfWidth * 2,
      lanes: r.lanes,
      speedKmh: r.speedKmh,
      material: 'asphalt',
      bridge: bi >= 0 ? this.bridges[bi] : null,
    };
  }

  /** Surface height of the road under (x, z) if it is within the asphalt (any road, bridges included), else null. */
  roadHeightAt(x: number, z: number): number | null {
    const pad = this.padAt(x, z);
    if (pad) return pad.y + pad.a * (x - pad.x) + pad.b * (z - pad.z);
    const n = this.nearest(x, z, 0);
    if (!n || n.d > this.shw[n.s]) return null;
    const s = n.s;
    const abx = this.sbx[s] - this.sax[s];
    const abz = this.sbz[s] - this.saz[s];
    const l2 = abx * abx + abz * abz;
    let t = l2 > 0 ? ((x - this.sax[s]) * abx + (z - this.saz[s]) * abz) / l2 : 0;
    t = t < 0 ? 0 : t > 1 ? 1 : t;
    return this.say[s] + (this.sby[s] - this.say[s]) * t;
  }

  /**
   * Road coverage for terrain colouring: out[0] = asphalt, out[1] = asphalt + gravel shoulder (0..1).
   * `step` = vertex spacing of the terrain LOD; coarse LODs get a wider, softer road so it stays visible.
   */
  maskAt(x: number, z: number, step: number, out: Float32Array): void {
    out[0] = 0;
    out[1] = 0;
    const segs = this.cellOf(x, z);
    if (!segs) return;
    const soft = Math.max(1.2, step * 0.6);
    if (this.pads.length > 0) {
      const pad = this.padAt(x, z);
      if (pad) {
        out[0] = 1;
        out[1] = 1;
      }
    }
    for (let q = 0; q < segs.length; q++) {
      const s = segs[q];
      const abx = this.sbx[s] - this.sax[s];
      const abz = this.sbz[s] - this.saz[s];
      const l2 = abx * abx + abz * abz;
      let t = l2 > 0 ? ((x - this.sax[s]) * abx + (z - this.saz[s]) * abz) / l2 : 0;
      t = t < 0 ? 0 : t > 1 ? 1 : t;
      const d = Math.hypot(x - (this.sax[s] + abx * t), z - (this.saz[s] + abz * t));
      const a = 1 - smoothstep(this.shw[s] * 0.9, this.shw[s] + soft, d);
      const b = 1 - smoothstep(this.score[s] * 0.95, this.score[s] + soft, d);
      if (a > out[0] && !this.searth[s]) out[0] = a; // an earthen track is not painted as asphalt in the far terrain
      if (b > out[1]) out[1] = b;
    }
  }

  /** True if any road (or its embankment) can touch the chunk area. Cheap pre-check for the worker. */
  touchesArea(x0: number, z0: number, x1: number, z1: number): boolean {
    for (let cz = Math.floor(z0 / CELL); cz <= Math.floor(z1 / CELL); cz++) {
      for (let cx = Math.floor(x0 / CELL); cx <= Math.floor(x1 / CELL); cx++) {
        if (this.cells.has((cx + 512) * 1024 + (cz + 512))) return true;
      }
    }
    return false;
  }

  /** The junction pad whose asphalt covers (x, z), or null. */
  padAt(x: number, z: number): PadSpec | null {
    if (this.pads.length === 0) return null;
    const pl = this.padCells.get((Math.floor(x / CELL) + 512) * 1024 + (Math.floor(z / CELL) + 512));
    if (!pl) return null;
    for (const id of pl) {
      const p = this.pads[id];
      if (Math.hypot(x - p.x, z - p.z) > p.rCore) continue;
      const o = p.outline;
      let inside = false;
      for (let i = 0, j = o.length - 2; i < o.length; j = i, i += 2) {
        const xi = o[i];
        const zi = o[i + 1];
        const xj = o[j];
        const zj = o[j + 1];
        if (zi > z !== zj > z && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) inside = !inside;
      }
      if (inside) return p;
    }
    return null;
  }

  /** Pads whose mesh is built by chunk (cx, cz). */
  ownedPads(cx: number, cz: number): PadSpec[] {
    const ids = this.chunkPads.get(chunkKey(cx, cz));
    return ids ? ids.map((i) => this.pads[i]) : [];
  }

  /** Segment ids whose ribbon is built by chunk (cx, cz). */
  ownedSegments(cx: number, cz: number): number[] {
    return this.chunkSegs.get(chunkKey(cx, cz)) ?? [];
  }

  // --- segment accessors for the ribbon builder ---
  segmentRoad(s: number): RoadSpec {
    return this.roads[this.segRoad[s]];
  }
  segmentPoint(s: number): number {
    return this.segPt[s];
  }
}
