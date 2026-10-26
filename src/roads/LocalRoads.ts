import { Config } from '../core/Config';
import { CityPlan, SITE_TEMPLATES } from '../city/CityPlan';
import type { Area } from '../city/CityPlan';
import type { TerrainSample } from '../terrain/Lakes';
import type { CitySite } from '../terrain/TerrainGenerator';
import type { RoadSpec } from './RoadTypes';
import { evlabKeepout } from '../evlab/EVLabSite';
import { mallKeepout } from '../mall/MallSite';
import { libraryKeepout } from '../library/LibrarySite';
import { protoKeepout } from '../buildings/ProtoSite';
import { infraKeepout } from '../engineering/InfraSites';
import { airportKeepout, seaAirportKeepout } from '../airport/AirportSite';
import { armyKeepout } from '../army/ArmySite';
import { agroKeepout } from '../agro/AgroSite';

/**
 * STAGE 10B - LOCAL STREETS (tier 4).
 *
 * For every area of a city site that has a street grid (CityPlan `grid`):
 *   1. a LATTICE of nodes (block size from the plan) is laid out, rotated so the blocks sit along the main roads;
 *   2. a lattice edge becomes a street only if the whole edge lies inside its area, on dry, gentle ground, away from other
 *      roads (their asphalt + shoulder + clearance), junction pads of tiers 1-3 and bridges;
 *   3. street groups that do not touch each other are joined by straight CONNECTORS (to a neighbouring group, or - as a
 *      T-junction at ~90 degrees - to a vertex of a tier 1-3 road); groups that cannot be joined are dropped, so every
 *      street is reachable from a main road;
 *   4. extra connectors link nodes that lie close to a main road (frontage streets).
 * Every street piece runs from one junction to the next (one RoadSpec per block side). The junction pad system then
 * builds the intersections (Junctions.ts), exactly as for the district links.
 *
 * Pure function of the seed, the finished tier 1-3 roads and the natural terrain: same result in every thread.
 */
type Natural = (x: number, z: number, out: TerrainSample) => void;

const L = Config.city.localRoads;

export interface LocalStreet {
  name: string;
  areaId: string;
  pts: number[][];
  /** Surface heights at the first / last point. */
  endY: [number, number];
  /** Surface height knots [distance along the street (m), y]: the junction heights; the surface is linear in between. */
  knots: number[][];
  halfWidth: number;
  lanes: number;
  speedKmh: number;
  connector: boolean;
}

export interface LocalAreaStat {
  areaId: string;
  nodes: number;
  streets: number;
  lengthM: number;
  /** Lattice edges rejected: [outside, water, road, bridge, grade]. */
  rejected: number[];
}

export interface LocalPlanResult {
  streets: LocalStreet[];
  stats: LocalAreaStat[];
  /** Number of lattice street groups that could not be joined to the network and were removed. */
  droppedGroups: number;
  /** Grid rotation of the site (rad). */
  angle: number;
}

interface Node {
  x: number;
  z: number;
  y: number;
  area: Area;
  deg: number;
  /** The node is the T-junction point on a tier 1-3 road: the street stays level there for `mainPlateau` metres. */
  mainEnd?: boolean;
}

interface Edge {
  a: number;
  b: number;
  area: Area;
  connector: boolean;
  /** Connector to a main road: the road id, otherwise -1. */
  main: number;
  y0: number;
  y1: number;
}

const CELL = 48;
const cellKey = (cx: number, cz: number): number => (cx + 2048) * 4096 + (cz + 2048);

/** Spatial hash of segments with "extent" (half width + shoulder) and an owner id. */
class SegIndex {
  private ax: number[] = [];
  private az: number[] = [];
  private bx: number[] = [];
  private bz: number[] = [];
  private ext: number[] = [];
  private owner: number[] = [];
  private cells = new Map<number, number[]>();

  add(ax: number, az: number, bx: number, bz: number, ext: number, owner: number): void {
    const id = this.ax.length;
    this.ax.push(ax);
    this.az.push(az);
    this.bx.push(bx);
    this.bz.push(bz);
    this.ext.push(ext);
    this.owner.push(owner);
    const r = ext + 2;
    for (let cz = Math.floor((Math.min(az, bz) - r) / CELL); cz <= Math.floor((Math.max(az, bz) + r) / CELL); cz++) {
      for (let cx = Math.floor((Math.min(ax, bx) - r) / CELL); cx <= Math.floor((Math.max(ax, bx) + r) / CELL); cx++) {
        const k = cellKey(cx, cz);
        const a = this.cells.get(k);
        if (a) a.push(id);
        else this.cells.set(k, [id]);
      }
    }
  }

  /** Is the point (x, z) at least `ext + margin` away from every segment (their own `ext` added), skipping the given owners? */
  free(x: number, z: number, ext: number, margin: (owner: number) => number, skip?: (owner: number, d: number) => boolean): boolean {
    const reach = 90;
    for (let cz = Math.floor((z - reach) / CELL); cz <= Math.floor((z + reach) / CELL); cz++) {
      for (let cx = Math.floor((x - reach) / CELL); cx <= Math.floor((x + reach) / CELL); cx++) {
        const a = this.cells.get(cellKey(cx, cz));
        if (!a) continue;
        for (const id of a) {
          const dx = this.bx[id] - this.ax[id];
          const dz = this.bz[id] - this.az[id];
          const l2 = dx * dx + dz * dz || 1;
          let t = ((x - this.ax[id]) * dx + (z - this.az[id]) * dz) / l2;
          t = t < 0 ? 0 : t > 1 ? 1 : t;
          const d = Math.hypot(x - (this.ax[id] + dx * t), z - (this.az[id] + dz * t));
          const need = this.ext[id] + ext + margin(this.owner[id]);
          if (d < need && !(skip && skip(this.owner[id], d))) return false;
        }
      }
    }
    return true;
  }
}

class PointIndex {
  private cells = new Map<number, number[]>();
  readonly x: number[] = [];
  readonly z: number[] = [];
  readonly tag: number[] = [];

  add(x: number, z: number, tag: number): number {
    const id = this.x.length;
    this.x.push(x);
    this.z.push(z);
    this.tag.push(tag);
    const k = cellKey(Math.floor(x / CELL), Math.floor(z / CELL));
    const a = this.cells.get(k);
    if (a) a.push(id);
    else this.cells.set(k, [id]);
    return id;
  }

  /** All point ids within r metres. */
  near(x: number, z: number, r: number): number[] {
    const out: number[] = [];
    for (let cz = Math.floor((z - r) / CELL); cz <= Math.floor((z + r) / CELL); cz++) {
      for (let cx = Math.floor((x - r) / CELL); cx <= Math.floor((x + r) / CELL); cx++) {
        const a = this.cells.get(cellKey(cx, cz));
        if (!a) continue;
        for (const id of a) if (Math.hypot(this.x[id] - x, this.z[id] - z) <= r) out.push(id);
      }
    }
    return out;
  }

  any(x: number, z: number, r: number): boolean {
    return this.near(x, z, r).length > 0;
  }
}

/** Grid rotation: where the tier-1 roads near the hub run (circular mean of 4 x angle, so 0 and 90 degrees count the same). */
function siteAngle(site: CitySite, roads: RoadSpec[]): number {
  let sx = 0;
  let sz = 0;
  for (const r of roads) {
    if (r.tier !== 1) continue;
    for (let i = 1; i < r.xs.length; i++) {
      const d = Math.hypot(r.xs[i] - site.x, r.zs[i] - site.z);
      if (d < 120 || d > 420) continue;
      const th = Math.atan2(r.zs[i] - r.zs[i - 1], r.xs[i] - r.xs[i - 1]);
      sx += Math.cos(4 * th);
      sz += Math.sin(4 * th);
    }
  }
  if (Math.hypot(sx, sz) < 1e-6) return 0;
  const a = Math.atan2(sz, sx) / 4; // (-45, 45] degrees
  return Number.isFinite(a) ? a : 0;
}

export function planLocalStreets(sites: CitySite[], natural: Natural, roads: RoadSpec[], junctionPoints: number[][], siteIdx: number): LocalPlanResult {
  const plan = new CityPlan(sites);
  const site = sites[siteIdx];
  const sc: TerrainSample = { h: 0, water: NaN, fx: 0, fz: 0 };
  const result: LocalPlanResult = { streets: [], stats: [], droppedGroups: 0, angle: 0 };
  const areas = plan.areas.filter((a) => a.site === siteIdx && a.grid);
  if (areas.length === 0 || !SITE_TEMPLATES[siteIdx]) return result;

  const dry = (x: number, z: number, margin: number): boolean => {
    natural(x, z, sc);
    const w = sc.water;
    return Number.isNaN(w) ? sc.h > 2 : sc.h > w + margin && sc.h > 2;
  };
  const ground = (x: number, z: number): number => {
    natural(x, z, sc);
    return sc.h;
  };

  // ---------- what is already there: segments of tier 1-3 roads, bridges, junctions ----------
  const segs = new SegIndex();
  const bridgePts = new PointIndex();
  const junc = new PointIndex();
  const mainVerts = new PointIndex(); // tag = road id * 100000 + vertex index
  const tAttach: number[][] = []; // where local connectors have joined a main road (spacing)
  for (const r of roads) {
    for (let i = 0; i < r.xs.length - 1; i++) segs.add(r.xs[i], r.zs[i], r.xs[i + 1], r.zs[i + 1], r.halfWidth + r.shoulder, -(r.id + 1));
    for (let i = 0; i < r.xs.length; i++) {
      if (r.bridgeOf[i] >= 0) bridgePts.add(r.xs[i], r.zs[i], r.id);
      if (!r.closed || r.kind !== 'roundabout') mainVerts.add(r.xs[i], r.zs[i], r.id * 100000 + i);
    }
    if (!r.closed) {
      junc.add(r.xs[0], r.zs[0], r.id);
      junc.add(r.xs[r.xs.length - 1], r.zs[r.xs.length - 1], r.id);
    }
  }
  for (const p of junctionPoints) junc.add(p[0], p[1], -1);

  result.angle = siteAngle(site, roads);
  const U = [Math.cos(result.angle), Math.sin(result.angle)];
  const V = [-U[1], U[0]];

  const nodes: Node[] = [];
  const edges: Edge[] = [];
  const nodeIdx = new PointIndex();
  const incident = new Map<number, number[]>(); // node -> edge ids
  const edgeSkipOwners = (a: number, b: number): Set<number> => {
    const s = new Set<number>();
    for (const n of [a, b]) for (const e of incident.get(n) ?? []) s.add(e);
    return s;
  };
  const addEdge = (e: Edge): void => {
    const id = edges.length;
    edges.push(e);
    for (const n of [e.a, e.b]) {
      nodes[n].deg++;
      const l = incident.get(n);
      if (l) l.push(id);
      else incident.set(n, [id]);
    }
    segs.add(nodes[e.a].x, nodes[e.a].z, nodes[e.b].x, nodes[e.b].z, e.area.grid!.halfWidth + L.sidewalk, id);
  };
  const marginFor = (owner: number): number => (owner < 0 ? L.clearMain : L.clearLocal);

  const inArea = (a: Area, x: number, z: number, m: number): boolean => {
    if (plan.areaAt(x, z)?.id !== a.id) return false;
    if (m <= 0) return true;
    return (
      plan.areaAt(x + m, z)?.id === a.id &&
      plan.areaAt(x - m, z)?.id === a.id &&
      plan.areaAt(x, z + m)?.id === a.id &&
      plan.areaAt(x, z - m)?.id === a.id
    );
  };

  /** Ground test for a street point: dry on the carriageway and both footpaths + a margin. */
  const wetAt = (x: number, z: number, dx: number, dz: number, hw: number): boolean => {
    const off = hw + L.sidewalk + 2;
    if (!dry(x, z, L.wetMargin)) return true;
    if (!dry(x - dz * off, z + dx * off, L.wetMargin)) return true;
    if (!dry(x + dz * off, z - dx * off, L.wetMargin)) return true;
    return false;
  };

  /** Shared point test. Returns 0 ok, 1 outside, 2 water, 3 road, 4 bridge. */
  const pointState = (
    x: number,
    z: number,
    dx: number,
    dz: number,
    hw: number,
    area: Area | null,
    skip: (owner: number, d: number) => boolean,
    keepout: boolean,
  ): number => {
    if (evlabKeepout(x, z) || mallKeepout(x, z) || libraryKeepout(x, z) || protoKeepout(x, z) || infraKeepout(x, z) || airportKeepout(x, z) || seaAirportKeepout(x, z) || armyKeepout(x, z) || agroKeepout(x, z)) return 1; // EVLab campus / City Mall / City Library plots: no local streets here
    if (area && !inArea(area, x, z, L.areaMargin)) return 1;
    if (wetAt(x, z, dx, dz, hw)) return 2;
    if (bridgePts.any(x, z, L.bridgeKeepout)) return 4;
    if (keepout && junc.any(x, z, L.junctionKeepout)) return 3;
    if (!segs.free(x, z, hw + L.sidewalk, marginFor, skip)) return 3;
    return 0;
  };

  const stat = new Map<string, LocalAreaStat>();
  const rej = (a: Area, k: number): void => {
    stat.get(a.id)!.rejected[k - 1]++;
  };

  // ---------- 1+2. lattice per area ----------
  for (const area of areas) {
    const g = area.grid!;
    const st: LocalAreaStat = { areaId: area.id, nodes: 0, streets: 0, lengthM: 0, rejected: [0, 0, 0, 0, 0] };
    stat.set(area.id, st);
    let cx0 = site.x;
    let cz0 = site.z;
    let R: number;
    if (area.shape.t === 'rect') {
      cx0 = site.x + (area.shape.x0 + area.shape.x1) / 2;
      cz0 = site.z + (area.shape.z0 + area.shape.z1) / 2;
      R = Math.hypot(area.shape.x1 - area.shape.x0, area.shape.z1 - area.shape.z0) / 2;
    } else {
      R = area.shape.r1;
    }
    const ni = Math.ceil(R / g.blockX) + 1;
    const nj = Math.ceil(R / g.blockZ) + 1;
    const lattice = new Map<number, number>(); // (i, j) -> node id
    const key = (i: number, j: number): number => (i + 512) * 1024 + (j + 512);
    const nodeAt = (i: number, j: number): number => {
      const k = key(i, j);
      const have = lattice.get(k);
      if (have !== undefined) return have;
      // half-block offset: the centre of the area is the centre of a block (small areas still get a full block ring)
      const x = cx0 + (i + 0.5) * g.blockX * U[0] + (j + 0.5) * g.blockZ * V[0];
      const z = cz0 + (i + 0.5) * g.blockX * U[1] + (j + 0.5) * g.blockZ * V[1];
      let id = -1;
      if (inArea(area, x, z, L.areaMargin)) {
        // a node is valid when the ground and the surroundings of an intersection (about 30 m) are fine
        const ok = pointState(x, z, U[0], U[1], g.halfWidth, area, () => false, true) === 0 && pointState(x, z, V[0], V[1], g.halfWidth, area, () => false, true) === 0;
        if (ok) {
          id = nodes.length;
          nodes.push({ x, z, y: ground(x, z), area, deg: 0 });
          nodeIdx.add(x, z, id);
        }
      }
      lattice.set(k, id);
      return id;
    };
    const tryEdge = (a: number, b: number): void => {
      if (a < 0 || b < 0) return;
      const A = nodes[a];
      const B = nodes[b];
      const len = Math.hypot(B.x - A.x, B.z - A.z);
      if (len < L.minEdge) return;
      const dx = (B.x - A.x) / len;
      const dz = (B.z - A.z) / len;
      if (Math.abs(B.y - A.y) / len > L.maxGrade) {
        rej(area, 5);
        return;
      }
      const skipO = edgeSkipOwners(a, b);
      // never run closer than 30 m to a node that is not an end of this edge: that would be an unplanned junction
      const n = Math.max(2, Math.ceil(len / L.sampleStep));
      let prev = ground(A.x, A.z);
      for (let k = 1; k < n; k++) {
        const t = k / n;
        const x = A.x + (B.x - A.x) * t;
        const z = A.z + (B.z - A.z) * t;
        const s = pointState(x, z, dx, dz, g.halfWidth, area, (o) => skipO.has(o), true);
        if (s) {
          rej(area, s);
          return;
        }
        const h = ground(x, z);
        if (Math.abs(h - prev) / (len / n) > L.maxGrade * 1.6) {
          rej(area, 5);
          return;
        }
        prev = h;
      }
      addEdge({ a, b, area, connector: false, main: -1, y0: A.y, y1: B.y });
    };
    for (let j = -nj; j <= nj; j++) {
      for (let i = -ni; i <= ni; i++) {
        const a = nodeAt(i, j);
        if (a < 0) continue;
        tryEdge(a, nodeAt(i + 1, j));
        tryEdge(a, nodeAt(i, j + 1));
      }
    }
  }

  // ---------- 3. connect the street groups to the network ----------
  const par: number[] = [];
  const find = (a: number): number => {
    while (par[a] !== a) {
      par[a] = par[par[a]];
      a = par[a];
    }
    return a;
  };
  const rebuild = (): { comp: Int32Array; mainLinked: Set<number> } => {
    par.length = nodes.length;
    for (let i = 0; i < nodes.length; i++) par[i] = i;
    for (const e of edges) par[find(e.a)] = find(e.b);
    const comp = new Int32Array(nodes.length);
    for (let i = 0; i < nodes.length; i++) comp[i] = find(i);
    const mainLinked = new Set<number>();
    for (const e of edges) if (e.main >= 0) mainLinked.add(comp[e.a]);
    return { comp, mainLinked };
  };

  const mainOk = (roadId: number, vi: number): boolean => {
    const r = roads[roadId];
    if (r.kind === 'roundabout' || r.closed) return false;
    for (let k = Math.max(0, vi - 8); k <= Math.min(r.xs.length - 1, vi + 8); k++) if (r.bridgeOf[k] >= 0) return false;
    if (vi < 12 || vi > r.xs.length - 13) return false; // not near the end of a road (that is a junction already)
    if (r.hNat[vi] < 2) return false;
    return true;
  };
  const tAttachFree = (x: number, z: number): boolean => {
    if (junc.any(x, z, L.mainTSpacing)) return false;
    // no street junction (pad) of the lattice within reach of the new T pad: the two pads would overlap
    for (const id of nodeIdx.near(x, z, L.mixedPadSpacing + 6)) if (nodes[id].deg > 0) return false;
    for (const p of tAttach) if (Math.hypot(p[0] - x, p[1] - z) < L.mainTSpacing) return false;
    return true;
  };

  /** Checks the straight line from node `a` to (bx, bz) as a street of the given width. Targets: a main vertex or another node. */
  const lineOk = (a: number, bx: number, bz: number, hw: number, endNode: number, endMain: number): boolean => {
    const A = nodes[a];
    const len = Math.hypot(bx - A.x, bz - A.z);
    if (len < L.minConnect || len > L.maxConnect) return false;
    const dx = (bx - A.x) / len;
    const dz = (bz - A.z) / len;
    const skipO = edgeSkipOwners(a, endNode);
    const n = Math.max(3, Math.ceil(len / L.sampleStep));
    for (let k = 1; k < n; k++) {
      const t = k / n;
      const z = A.z + (bz - A.z) * t;
      const xx = A.x + (bx - A.x) * t;
      const dA = t * len;
      const dB = len - dA;
      const skip = (o: number): boolean => {
        // the street leaves node a / reaches its end: the edges that meet there are close by, and so is the road it joins
        if (skipO.has(o) && (dA < 40 || dB < 40)) return true;
        if (endMain >= 0 && o === -(endMain + 1) && dB < 46) return true;
        return false;
      };
      const s = pointState(xx, z, dx, dz, hw, null, skip, dA > 6 && (endMain < 0 ? dB > 6 : dB > 90));
      if (s) return false;
    }
    if (endMain < 0 && endNode >= 0) {
      // the new street must not pass another node closely (that node would be an unplanned junction)
      for (const id of nodeIdx.near((A.x + bx) / 2, (A.z + bz) / 2, len / 2)) {
        if (id === a || id === endNode) continue;
        const N = nodes[id];
        const t = ((N.x - A.x) * dx + (N.z - A.z) * dz) / len;
        if (t < 0 || t > 1) continue;
        const d = Math.abs((N.x - A.x) * dz - (N.z - A.z) * dx);
        if (d < L.clearLocal + hw) return false;
      }
    }
    return true;
  };

  const addConnector = (a: number, b: number, mainRoad: number, bx: number, bz: number, by: number): void => {
    const A = nodes[a];
    let bi = b;
    if (bi < 0) {
      // a new node on the main road (end point of the connector)
      bi = nodes.length;
      nodes.push({ x: bx, z: bz, y: by, area: A.area, deg: 0, mainEnd: true });
      tAttach.push([bx, bz]);
    }
    addEdge({ a, b: bi, area: A.area, connector: true, main: mainRoad, y0: A.y, y1: by });
  };

  /** Best connector from group `c` to the main roads (kind 0) or to a node of another group (kind 1). */
  const bestConnector = (comp: Int32Array, c: number, onlyMain: boolean): { a: number; b: number; road: number; x: number; z: number; y: number; len: number } | null => {
    let best: { a: number; b: number; road: number; x: number; z: number; y: number; len: number } | null = null;
    for (let a = 0; a < nodes.length; a++) {
      if (comp[a] !== c || nodes[a].deg === 0 || nodes[a].deg > 3) continue;
      const A = nodes[a];
      const hw = A.area.grid!.halfWidth;
      // main road vertices
      for (const id of mainVerts.near(A.x, A.z, L.maxConnect)) {
        const roadId = Math.floor(mainVerts.tag[id] / 100000);
        const vi = mainVerts.tag[id] % 100000;
        const r = roads[roadId];
        if (!mainOk(roadId, vi)) continue;
        const vx = r.xs[vi];
        const vz = r.zs[vi];
        const len = Math.hypot(vx - A.x, vz - A.z);
        if (best && len >= best.len) continue;
        if (len < L.minConnect || !tAttachFree(vx, vz)) continue;
        const tx = r.xs[vi + 1] - r.xs[vi - 1];
        const tz = r.zs[vi + 1] - r.zs[vi - 1];
        const tl = Math.hypot(tx, tz) || 1;
        if (Math.abs(((vx - A.x) * tx + (vz - A.z) * tz) / (len * tl)) > L.maxCosSkew) continue;
        if (Math.abs(r.ys[vi] - A.y) / Math.max(1, len - L.mainPlateau) > L.maxGrade) continue;
        if (!lineOk(a, vx, vz, hw, -1, roadId)) continue;
        best = { a, b: -1, road: roadId, x: vx, z: vz, y: r.ys[vi], len };
      }
      if (onlyMain) continue;
      for (const id of nodeIdx.near(A.x, A.z, L.maxConnect)) {
        if (comp[id] === c || nodes[id].deg === 0) continue;
        const B = nodes[id];
        const len = Math.hypot(B.x - A.x, B.z - A.z);
        if (best && len >= best.len) continue;
        if (len < L.minConnect * 0.75 || Math.abs(B.y - A.y) / len > L.maxGrade) continue;
        if (!lineOk(a, B.x, B.z, hw, id, -1)) continue;
        best = { a, b: id, road: -1, x: B.x, z: B.z, y: B.y, len };
      }
    }
    return best;
  };

  let droppedGroups = 0;
  const dropped = new Set<number>();
  for (let guard = 0; guard < 4000; guard++) {
    const { comp, mainLinked } = rebuild();
    // smallest unlinked group first
    const size = new Map<number, number>();
    for (let i = 0; i < nodes.length; i++) if (nodes[i].deg > 0 && !dropped.has(comp[i])) size.set(comp[i], (size.get(comp[i]) ?? 0) + 1);
    const open = [...size.keys()].filter((c) => !mainLinked.has(c)).sort((p, q) => size.get(p)! - size.get(q)!);
    if (open.length === 0) break;
    // the group with the shortest possible connector goes first (it may join another open group and become bigger)
    const c = open[0];
    let con = bestConnector(comp, c, false);
    if (!con) con = bestConnector(comp, c, true);
    if (!con) {
      dropped.add(c);
      droppedGroups++;
      continue;
    }
    addConnector(con.a, con.b, con.road, con.x, con.z, con.y);
  }

  // ---------- 4. extra connectors from nodes beside a main road ----------
  for (let a = 0, n0 = nodes.length; a < n0; a++) {
    const A = nodes[a];
    if (A.deg === 0 || A.deg > 3) continue;
    const hw = A.area.grid!.halfWidth;
    let best: { road: number; vi: number; len: number } | null = null;
    for (const id of mainVerts.near(A.x, A.z, L.extraConnect)) {
      const roadId = Math.floor(mainVerts.tag[id] / 100000);
      const vi = mainVerts.tag[id] % 100000;
      if (!mainOk(roadId, vi)) continue;
      const r = roads[roadId];
      const len = Math.hypot(r.xs[vi] - A.x, r.zs[vi] - A.z);
      if (len < L.minConnect || (best && len >= best.len) || !tAttachFree(r.xs[vi], r.zs[vi])) continue;
      const tx = r.xs[vi + 1] - r.xs[vi - 1];
      const tz = r.zs[vi + 1] - r.zs[vi - 1];
      const tl = Math.hypot(tx, tz) || 1;
      if (Math.abs(((r.xs[vi] - A.x) * tx + (r.zs[vi] - A.z) * tz) / (len * tl)) > L.maxCosSkew) continue;
      if (Math.abs(r.ys[vi] - A.y) / Math.max(1, len - L.mainPlateau) > L.maxGrade) continue;
      if (!lineOk(a, r.xs[vi], r.zs[vi], hw, -1, roadId)) continue;
      best = { road: roadId, vi, len };
    }
    if (best) {
      const r = roads[best.road];
      addConnector(a, -1, best.road, r.xs[best.vi], r.zs[best.vi], r.ys[best.vi]);
    }
  }

  // ---------- result: drop removed groups, merge straight runs, make streets ----------
  const { comp } = rebuild();
  const keepNode = (i: number): boolean => nodes[i].deg > 0 && !dropped.has(comp[i]);
  const kept: number[] = [];
  edges.forEach((e, id) => {
    if (keepNode(e.a) && keepNode(e.b)) kept.push(id);
  });
  const inc = new Map<number, number[]>();
  for (const id of kept) for (const n of [edges[id].a, edges[id].b]) (inc.get(n) ?? inc.set(n, []).get(n)!).push(id);
  const sameStreet = (p: Edge, q: Edge): boolean => p.area.grid!.halfWidth === q.area.grid!.halfWidth && p.area.grid!.lanes === q.area.grid!.lanes && p.area.grid!.speedKmh === q.area.grid!.speedKmh;
  /** The edge that continues edge `id` straight on through node `n` (exactly two edges meet there), or -1. */
  const straightOn = (id: number, n: number): number => {
    const l = inc.get(n)!;
    if (l.length !== 2) return -1;
    const o = l[0] === id ? l[1] : l[0];
    const e = edges[id];
    const f = edges[o];
    if (!sameStreet(e, f)) return -1;
    const eo = e.a === n ? e.b : e.a;
    const fo = f.a === n ? f.b : f.a;
    const ux = nodes[n].x - nodes[eo].x;
    const uz = nodes[n].z - nodes[eo].z;
    const vx = nodes[fo].x - nodes[n].x;
    const vz = nodes[fo].z - nodes[n].z;
    return (ux * vx + uz * vz) / (Math.hypot(ux, uz) * Math.hypot(vx, vz)) > 0.995 ? o : -1;
  };
  const used = new Set<number>();
  let idx = 1;
  for (const start of kept) {
    if (used.has(start)) continue;
    // walk backwards to the beginning of the run, then forwards
    let first = start;
    let from = edges[start].a;
    for (let guard = 0; guard < 200; guard++) {
      const prev = straightOn(first, from);
      if (prev < 0 || used.has(prev) || prev === start) break;
      first = prev;
      from = edges[prev].a === from ? edges[prev].b : edges[prev].a;
    }
    const chain: number[] = [];
    const order: number[] = [from];
    let cur = first;
    let at = from;
    for (let guard = 0; guard < 200; guard++) {
      chain.push(cur);
      used.add(cur);
      const nxt = edges[cur].a === at ? edges[cur].b : edges[cur].a;
      order.push(nxt);
      at = nxt;
      const more = straightOn(cur, at);
      if (more < 0 || used.has(more)) break;
      cur = more;
    }
    const pts: number[][] = [];
    const knots: number[][] = [];
    let dist = 0;
    for (let q = 0; q < order.length - 1; q++) {
      const A = nodes[order[q]];
      const B = nodes[order[q + 1]];
      const len = Math.hypot(B.x - A.x, B.z - A.z);
      const n = Math.max(1, Math.round(len / 6));
      if (q === 0) {
        knots.push([0, A.y]);
        if (A.mainEnd) knots.push([Math.min(L.mainPlateau, len * 0.5), A.y]);
      }
      for (let k = q === 0 ? 0 : 1; k <= n; k++) pts.push([A.x + ((B.x - A.x) * k) / n, A.z + ((B.z - A.z) * k) / n]);
      if (B.mainEnd) knots.push([dist + len - Math.min(L.mainPlateau, len * 0.5), B.y]);
      dist += len;
      knots.push([dist, B.y]);
    }
    const e0 = edges[chain[0]];
    const g = e0.area.grid!;
    result.streets.push({
      name: `L${idx++}`,
      areaId: e0.area.id,
      pts,
      endY: [knots[0][1], knots[knots.length - 1][1]],
      knots,
      halfWidth: g.halfWidth,
      lanes: g.lanes,
      speedKmh: g.speedKmh,
      connector: chain.some((c) => edges[c].connector),
    });
    const st = stat.get(e0.area.id)!;
    st.streets++;
    st.lengthM += dist;
  }
  for (let i = 0; i < nodes.length; i++) if (keepNode(i)) stat.get(nodes[i].area.id)!.nodes++;
  result.stats = [...stat.values()];
  result.droppedGroups = droppedGroups;
  return result;
}
