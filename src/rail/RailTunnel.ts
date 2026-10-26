import { RAIL_DESIGN as D } from './RailPlan';
import type { RailEdge, RailNetwork, RailSegmentKind } from './RailNetwork';

/**
 * TUNNELS AND BOXES (cut & cover) - one place for the numbers and the pure geometry, used by
 *   RailMesh        the lining, the lamps and the portals that are DRAWN,
 *   RailPhysics     the cuboids a car / person collides with (floor, walls, roof, portal blocks),
 *   TerrainPhysics  the Rapier terrain of the chunks the tunnels pass through (a trimesh with a hole),
 *   TerrainMeshData the same hole in the terrain that is DRAWN (so the earth does not fill the tunnel mouth).
 * Before this the hill stood untouched around the line: the ground collider closed the mouth and there was no floor, wall or light inside.
 *
 * Cross-section (all heights relative to the top of ballast = "design"; the terrain / floor is `D.ballast` lower):
 *   interior  inHalf (5.6 m) either side of the centre line (two tracks 4.5 m apart + clearance), `height` m high (7.6 m tunnel, 6.0 m box),
 *   lining    walls `wall` thick, roof `roof` thick, floor slab `floorThick` thick under the formation level.
 * Portal = a concrete head wall in front of the mouth (wings either side of the opening, a lintel above), `portalLen` m deep towards the open line.
 */
export const TUNNEL = {
  inHalf: 5.6,
  heightTunnel: 7.6,
  heightBox: 6.0,
  wall: 0.9,
  roof: 1.0,
  floorThick: 1.2,
  /** Where the cover is thinner than this (m above the rail) the roof slab is made wide: the terrain triangles around it are removed too. */
  thinCover: 14,
  thinHalf: 11,
  /** Portal head wall: half width of the whole face, depth towards the open line (a bit more than one terrain cell: the terrain hole has a fringe). */
  portalHalf: 15.5,
  portalLen: 4.6,
  /** Interior lamps: every `lampEvery` m (alternating the two sides), tunnel and box alike. */
  lampEvery: 12,
  pieceLen: 8,
} as const;

export const tunnelHeight = (kind: RailSegmentKind): number => (kind === 'cutcover' ? TUNNEL.heightBox : TUNNEL.heightTunnel);
export const isLined = (kind: RailSegmentKind | undefined): boolean => kind === 'tunnel' || kind === 'cutcover';
/** Outer half width of the lining (m). */
export const OUTER_HALF = TUNNEL.inHalf + TUNNEL.wall;

type Quat = { x: number; y: number; z: number; w: number };

/** Rotation that turns the local +Z axis into the direction (dx, dy, dz) with the local +Y staying up (yaw then pitch). */
export function aim(dx: number, dy: number, dz: number): Quat {
  const yaw = Math.atan2(dx, dz);
  const pitch = Math.asin(Math.max(-1, Math.min(1, dy)));
  const cy = Math.cos(yaw / 2), sy = Math.sin(yaw / 2);
  const cp = Math.cos(-pitch / 2), sp = Math.sin(-pitch / 2);
  return { w: cy * cp, x: cy * sp, y: sy * cp, z: -sy * sp };
}

/** One cuboid (world x / z, y up; half sizes; rotation). Same layout as the viaduct DeckBox. */
export interface ShellBox {
  x: number;
  y: number;
  z: number;
  hx: number;
  hy: number;
  hz: number;
  q: Quat;
  friction: number;
}

export interface Frame {
  x: number;
  y: number;
  z: number;
  dx: number;
  dz: number;
  /** Natural ground height under the point. */
  gnd: number;
}

export function frameAt(rail: RailNetwork, e: RailEdge, s: number): Frame {
  const p = rail.pointAt(e, s);
  const t = (s - e.cum[p.i]) / (e.cum[p.i + 1] - e.cum[p.i] || 1);
  return {
    x: p.x,
    y: e.design[p.i] + (e.design[p.i + 1] - e.design[p.i]) * t,
    z: p.z,
    dx: p.dx,
    dz: p.dz,
    gnd: e.ground[p.i] + (e.ground[p.i + 1] - e.ground[p.i]) * t,
  };
}

/** Every track the railway draws: the lines, then the station links. */
export function trackEdgesOf(rail: RailNetwork): RailEdge[] {
  return [...rail.edges, ...rail.links.map((l) => l.edge)];
}

export interface Lined {
  edge: number;
  kind: 'tunnel' | 'cutcover';
  s0: number;
  s1: number;
  /** A portal (head wall) stands at the start / at the end: the neighbour there is open line or a viaduct, not more lining. */
  portalA: boolean;
  portalB: boolean;
}

/** All tunnel / box segments of the network. */
export function linedSegments(rail: RailNetwork): Lined[] {
  const out: Lined[] = [];
  trackEdgesOf(rail).forEach((e, ei) => {
    e.segments.forEach((sg, k) => {
      if (sg.kind !== 'tunnel' && sg.kind !== 'cutcover') return;
      const prev = e.segments[k - 1];
      const next = e.segments[k + 1];
      out.push({ edge: ei, kind: sg.kind, s0: sg.s0, s1: sg.s1, portalA: !!prev && !isLined(prev.kind), portalB: !!next && !isLined(next.kind) });
    });
  });
  return out;
}

/** Interior height (m) + roof thickness above the top of ballast. */
export const roofTopAbove = (kind: RailSegmentKind): number => tunnelHeight(kind) + TUNNEL.roof;

/** Cuboids of the lining between s0 and s1 of a lined segment (pieces <= `pieceLen` m): floor, two walls, roof. */
export function shellBoxes(rail: RailNetwork, e: RailEdge, kind: 'tunnel' | 'cutcover', s0: number, s1: number): ShellBox[] {
  const out: ShellBox[] = [];
  const n = Math.max(1, Math.ceil((s1 - s0) / TUNNEL.pieceLen));
  const H = tunnelHeight(kind);
  for (let k = 0; k < n; k++) {
    const a = frameAt(rail, e, s0 + ((s1 - s0) * k) / n);
    const c = frameAt(rail, e, s0 + ((s1 - s0) * (k + 1)) / n);
    const dx = c.x - a.x, dy = c.y - a.y, dz = c.z - a.z;
    const len = Math.hypot(dx, dy, dz) || 1;
    const hl = len / 2 + 0.05;
    const q = aim(dx / len, dy / len, dz / len);
    const mx = (a.x + c.x) / 2, mz = (a.z + c.z) / 2, my = (a.y + c.y) / 2;
    const dl = Math.hypot(dx, dz) || 1;
    const wx = -dz / dl, wz = dx / dl;
    const thin = (a.gnd + c.gnd) / 2 - my < TUNNEL.thinCover;
    const floorTop = my - D.ballast;
    const roofTop = my + H + TUNNEL.roof;
    const half = thin ? TUNNEL.thinHalf : OUTER_HALF;
    // floor slab (its top is the formation level the open line runs on)
    out.push({ x: mx, y: floorTop - TUNNEL.floorThick / 2, z: mz, hx: half, hy: TUNNEL.floorThick / 2, hz: hl, q, friction: 1.0 });
    // walls: from under the floor to the top of the roof
    const wallBottom = floorTop - 0.3;
    for (const sg of [-1, 1]) {
      const lat = sg * (TUNNEL.inHalf + TUNNEL.wall / 2);
      out.push({ x: mx + wx * lat, y: (wallBottom + roofTop) / 2, z: mz + wz * lat, hx: TUNNEL.wall / 2, hy: (roofTop - wallBottom) / 2, hz: hl, q, friction: 0.3 });
    }
    // roof slab (wide where the cover is thin: the terrain is cut away round it)
    out.push({ x: mx, y: my + H + TUNNEL.roof / 2, z: mz, hx: half, hy: TUNNEL.roof / 2, hz: hl, q, friction: 0.8 });
  }
  return out;
}

/** Natural-ground height at the mouth, used to size the head wall. */
export function portalTop(y: number, gnd: number, kind: 'tunnel' | 'cutcover'): number {
  return Math.max(y + roofTopAbove(kind) + 1.4, Math.min(gnd + 1.0, y + 18));
}

/**
 * Head wall of one portal as cuboids. `out` = +1 when the open line lies ahead of s (end of the segment), -1 when behind it (start).
 * The block stands on the open-line side of the mouth: two wings (inHalf .. portalHalf), a lintel over the opening, and an approach floor slab.
 */
export function portalBoxes(rail: RailNetwork, e: RailEdge, kind: 'tunnel' | 'cutcover', s: number, out: -1 | 1): ShellBox[] {
  const f = frameAt(rail, e, s);
  const tx = f.dx * out, tz = f.dz * out;
  const wx = -f.dz, wz = f.dx;
  const q = aim(f.dx, 0, f.dz);
  const L = TUNNEL.portalLen;
  const cx = f.x + tx * (L / 2), cz = f.z + tz * (L / 2);
  const base = f.y - D.ballast - 0.8;
  const top = portalTop(f.y, f.gnd, kind);
  const H = tunnelHeight(kind);
  const boxes: ShellBox[] = [];
  const wingHalf = (TUNNEL.portalHalf - TUNNEL.inHalf) / 2;
  for (const sg of [-1, 1]) {
    const lat = sg * (TUNNEL.inHalf + wingHalf);
    boxes.push({ x: cx + wx * lat, y: (base + top) / 2, z: cz + wz * lat, hx: wingHalf, hy: (top - base) / 2, hz: L / 2, q, friction: 0.3 });
  }
  const lintelBottom = f.y + H;
  if (top > lintelBottom + 0.05) boxes.push({ x: cx, y: (lintelBottom + top) / 2, z: cz, hx: TUNNEL.inHalf, hy: (top - lintelBottom) / 2, hz: L / 2, q, friction: 0.3 });
  // approach floor: the terrain under the mouth is cut away, this slab takes over (top = formation level)
  boxes.push({ x: cx, y: f.y - D.ballast - TUNNEL.floorThick / 2, z: cz, hx: TUNNEL.inHalf + 5, hy: TUNNEL.floorThick / 2, hz: L / 2, q, friction: 1.0 });
  return boxes;
}

/* ---------------------------------------------------------------------------------------------------------------------------------------
 * Holes in the terrain
 * ------------------------------------------------------------------------------------------------------------------------------------- */

/** A piece of the lining as the terrain sees it: a rotated rectangle in plan and the height range that is "inside the structure". */
export interface HoleBox {
  x: number;
  z: number;
  /** unit direction along the track */
  dx: number;
  dz: number;
  hl: number;
  hw: number;
  yLo: number;
  yHi: number;
}

const CELL = 64;
const ckey = (cx: number, cz: number): number => (cx + 4096) * 8192 + (cz + 4096);

export class TunnelHoles {
  private cells = new Map<number, number[]>();
  readonly boxes: HoleBox[] = [];

  constructor(rail: RailNetwork) {
    const edges = trackEdgesOf(rail);
    for (const L of linedSegments(rail)) {
      const e = edges[L.edge];
      const H = tunnelHeight(L.kind);
      const n = Math.max(1, Math.ceil((L.s1 - L.s0) / TUNNEL.pieceLen));
      for (let k = 0; k < n; k++) {
        const a = frameAt(rail, e, L.s0 + ((L.s1 - L.s0) * k) / n);
        const c = frameAt(rail, e, L.s0 + ((L.s1 - L.s0) * (k + 1)) / n);
        const dl = Math.hypot(c.x - a.x, c.z - a.z) || 1;
        const thin = (a.gnd + c.gnd) / 2 - (a.y + c.y) / 2 < TUNNEL.thinCover;
        const b: HoleBox = {
          x: (a.x + c.x) / 2,
          z: (a.z + c.z) / 2,
          dx: (c.x - a.x) / dl,
          dz: (c.z - a.z) / dl,
          hl: dl / 2,
          hw: (thin ? TUNNEL.thinHalf : OUTER_HALF) + 0.1,
          yLo: Math.min(a.y, c.y) - D.ballast - TUNNEL.floorThick,
          yHi: Math.max(a.y, c.y) + H + TUNNEL.roof,
        };
        const id = this.boxes.push(b) - 1;
        const r = Math.hypot(b.hl, b.hw) + 1;
        for (let cz = Math.floor((b.z - r) / CELL); cz <= Math.floor((b.z + r) / CELL); cz++) {
          for (let cx = Math.floor((b.x - r) / CELL); cx <= Math.floor((b.x + r) / CELL); cx++) {
            const key = ckey(cx, cz);
            const list = this.cells.get(key);
            if (list) list.push(id);
            else this.cells.set(key, [id]);
          }
        }
      }
    }
  }

  get empty(): boolean {
    return this.boxes.length === 0;
  }

  /** Is the point (world metres) inside a tunnel / box (between the floor and the roof, over the full lining width)? */
  contains(x: number, y: number, z: number): boolean {
    for (const b of this.near(x - 1, z - 1, x + 1, z + 1)) {
      const rx = x - b.x, rz = z - b.z;
      const u = rx * b.dx + rz * b.dz;
      const w = -rx * b.dz + rz * b.dx;
      if (Math.abs(u) <= b.hl + 0.5 && Math.abs(w) <= b.hw && y >= b.yLo && y <= b.yHi + 0.3) return true;
    }
    return false;
  }

  /** Boxes that may touch the rectangle [x0, x1] x [z0, z1] (world metres). */
  near(x0: number, z0: number, x1: number, z1: number): HoleBox[] {
    const seen = new Set<number>();
    const out: HoleBox[] = [];
    for (let cz = Math.floor(z0 / CELL); cz <= Math.floor(z1 / CELL); cz++) {
      for (let cx = Math.floor(x0 / CELL); cx <= Math.floor(x1 / CELL); cx++) {
        const list = this.cells.get(ckey(cx, cz));
        if (!list) continue;
        for (const id of list) {
          if (seen.has(id)) continue;
          seen.add(id);
          out.push(this.boxes[id]);
        }
      }
    }
    return out;
  }
}

/**
 * Must the terrain triangle (world coordinates) be removed because it cuts through a tunnel / box?
 * Yes when it overlaps the structure in plan AND is not entirely above the roof (the hill over a deep tunnel stays) and not entirely
 * below the floor (ground under an embankment stays). Conservative: a mixed triangle is removed whole.
 */
export function triangleInHole(boxes: readonly HoleBox[], ax: number, ay: number, az: number, bx: number, by: number, bz: number, cx: number, cy: number, cz: number): boolean {
  const lo = Math.min(ay, by, cy);
  const hi = Math.max(ay, by, cy);
  for (const b of boxes) {
    if (lo > b.yHi) continue; // all vertices above the roof (lo is the lowest one)
    if (hi < b.yLo) continue;
    // plan view: separating axis test (box axes + the triangle's three edge normals)
    const px = [ax - b.x, bx - b.x, cx - b.x];
    const pz = [az - b.z, bz - b.z, cz - b.z];
    // along the track / across it (box axes)
    const u = [px[0] * b.dx + pz[0] * b.dz, px[1] * b.dx + pz[1] * b.dz, px[2] * b.dx + pz[2] * b.dz];
    if (Math.min(u[0], u[1], u[2]) > b.hl || Math.max(u[0], u[1], u[2]) < -b.hl) continue;
    const w = [-px[0] * b.dz + pz[0] * b.dx, -px[1] * b.dz + pz[1] * b.dx, -px[2] * b.dz + pz[2] * b.dx];
    if (Math.min(w[0], w[1], w[2]) > b.hw || Math.max(w[0], w[1], w[2]) < -b.hw) continue;
    // triangle edge normals in box space (u, w); the box is centred on the origin and projects to [-r, r]
    let apart = false;
    for (let k = 0; k < 3 && !apart; k++) {
      const k2 = (k + 1) % 3;
      const k3 = (k + 2) % 3;
      const nu = -(w[k2] - w[k]);
      const nw = u[k2] - u[k];
      const tEdge = nu * u[k] + nw * w[k];
      const t3 = nu * u[k3] + nw * w[k3];
      const r = Math.abs(nu) * b.hl + Math.abs(nw) * b.hw;
      if (t3 >= tEdge) {
        if (r < tEdge) apart = true;
      } else if (-r > tEdge) apart = true;
    }
    if (!apart) return true;
  }
  return false;
}

/**
 * The terrain grid of one chunk (n x n cells, `heights` = (n+1)^2 row-major [z][x], origin (ox, oz), cell `step`) without the triangles that
 * cut through a tunnel / box. Triangle layout = TerrainMeshData.buildIndices (a=(i,j) b=(i,j+1) c=(i+1,j) d=(i+1,j+1): a-b-c and c-b-d).
 * Returns the kept grid triangles (vertex indices j*(n+1)+i), or null when the chunk loses nothing.
 */
export function terrainTrianglesWithHoles(holes: TunnelHoles, ox: number, oz: number, step: number, n: number, heights: Float32Array): Uint32Array | null {
  const S = n * step;
  const boxes = holes.near(ox, oz, ox + S, oz + S);
  if (boxes.length === 0) return null;
  const vn = n + 1;
  const out = new Uint32Array(n * n * 6);
  let p = 0;
  let removed = 0;
  const diag = Math.hypot(step, step);
  const near: HoleBox[] = [];
  for (let j = 0; j < n; j++) {
    for (let i = 0; i < n; i++) {
      const x0 = ox + i * step, z0 = oz + j * step;
      const cxm = x0 + step / 2, czm = z0 + step / 2;
      near.length = 0;
      for (const b of boxes) if (Math.hypot(cxm - b.x, czm - b.z) < diag / 2 + Math.hypot(b.hl, b.hw) + 0.5) near.push(b);
      const a = j * vn + i, b2 = (j + 1) * vn + i, c = j * vn + i + 1, d = (j + 1) * vn + i + 1;
      const ha = heights[a], hb = heights[b2], hc = heights[c], hd = heights[d];
      const x1 = x0 + step, z1 = z0 + step;
      const cut1 = near.length > 0 && triangleInHole(near, x0, ha, z0, x0, hb, z1, x1, hc, z0);
      const cut2 = near.length > 0 && triangleInHole(near, x1, hc, z0, x0, hb, z1, x1, hd, z1);
      if (cut1) removed++;
      else {
        out[p++] = a;
        out[p++] = b2;
        out[p++] = c;
      }
      if (cut2) removed++;
      else {
        out[p++] = c;
        out[p++] = b2;
        out[p++] = d;
      }
    }
  }
  return removed === 0 ? null : out.slice(0, p);
}
