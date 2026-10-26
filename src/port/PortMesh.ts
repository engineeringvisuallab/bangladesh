import { chunkOriginX, chunkOriginZ } from '../world/WorldGrid';
import type { PortGateRoad } from './PortFormation';
import { C, type PortLayout, type PortPart, type RGB } from './PortLayout';
import { PORT_DESIGN } from './PortPlan';

/** Port geometry of one chunk (chunk-local coordinates, vertex colours). Built inside the worker. Same layout as the railway mesh. */
export interface PortMeshData {
  positions: Float32Array;
  normals: Float32Array;
  colors: Float32Array;
  indices: Uint16Array | Uint32Array;
}

type V = [number, number, number];
const sub = (a: V, b: V): V => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const cross = (a: V, b: V): V => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const norm = (a: V): V => {
  const l = Math.hypot(a[0], a[1], a[2]) || 1;
  return [a[0] / l, a[1] / l, a[2] / l];
};

/** Geometry collector: flat-coloured polygons with their own normals. */
class Emit {
  pos: number[] = [];
  nrm: number[] = [];
  col: number[] = [];
  idx: number[] = [];
  constructor(private ox: number, private oz: number) {}

  private vert(p: V, n: V, c: RGB): void {
    this.pos.push(p[0] - this.ox, p[1], p[2] - this.oz);
    this.nrm.push(n[0], n[1], n[2]);
    this.col.push(c[0], c[1], c[2]);
  }

  /** Triangle, wound counter-clockwise seen from the side the normal points to. */
  tri(a: V, b: V, c: V, n: V, col: RGB): void {
    const g = cross(sub(b, a), sub(c, a));
    const flip = g[0] * n[0] + g[1] * n[1] + g[2] * n[2] < 0;
    const base = this.pos.length / 3;
    this.vert(a, n, col);
    this.vert(flip ? c : b, n, col);
    this.vert(flip ? b : c, n, col);
    this.idx.push(base, base + 1, base + 2);
  }

  /** Quad a-b-c-d (in order around its border) with a known normal. */
  quad(a: V, b: V, c: V, d: V, n: V, col: RGB): void {
    this.tri(a, b, c, n, col);
    this.tri(a, c, d, n, col);
  }

  /** Quad whose normal is computed and flipped to point away from the interior point `o`. */
  quadOut(a: V, b: V, c: V, d: V, o: V, col: RGB): void {
    let n = norm(cross(sub(b, a), sub(c, a)));
    const m: V = [(a[0] + c[0]) / 2 - o[0], (a[1] + c[1]) / 2 - o[1], (a[2] + c[2]) / 2 - o[2]];
    if (n[0] * m[0] + n[1] * m[1] + n[2] * m[2] < 0) n = [-n[0], -n[1], -n[2]];
    this.quad(a, b, c, d, n, col);
  }

  box(p: PortPart): void {
    const x0 = p.x - p.hx, x1 = p.x + p.hx, y0 = p.y - p.hy, y1 = p.y + p.hy, z0 = p.z - p.hz, z1 = p.z + p.hz;
    const c = p.c;
    this.quad([x0, y1, z0], [x1, y1, z0], [x1, y1, z1], [x0, y1, z1], [0, 1, 0], c);
    if (y0 > 6) this.quad([x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1], [0, -1, 0], c); // only raised boxes show their underside
    this.quad([x0, y0, z0], [x1, y0, z0], [x1, y1, z0], [x0, y1, z0], [0, 0, -1], c);
    this.quad([x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1], [0, 0, 1], c);
    this.quad([x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0], [-1, 0, 0], c);
    this.quad([x1, y0, z0], [x1, y0, z1], [x1, y1, z1], [x1, y1, z0], [1, 0, 0], c);
  }

  prism(p: PortPart, lod: number): void {
    const n = lod >= 1 ? Math.max(6, Math.round(p.n / 2)) : p.n;
    const y0 = p.y - p.hy, y1 = p.y + p.hy, r = p.hx;
    const ring = (y: number, k: number): V => [p.x + Math.cos((k / n) * Math.PI * 2) * r, y, p.z + Math.sin((k / n) * Math.PI * 2) * r];
    const top: V = [p.x, y1, p.z];
    for (let k = 0; k < n; k++) {
      const a = ring(y0, k), b = ring(y0, k + 1), c = ring(y1, k + 1), d = ring(y1, k);
      const am = (k + 0.5) / n * Math.PI * 2;
      this.quad(a, b, c, d, [Math.cos(am), 0, Math.sin(am)], p.c);
      this.tri(top, d, c, [0, 1, 0], p.c);
    }
  }

  /** Bar between A and B: rectangular section (half width hw across, half height hh). */
  bar(p: PortPart): void {
    const A: V = [p.x, p.y, p.z], B: V = [p.bx, p.by, p.bz];
    const d = norm(sub(B, A));
    let s = cross(d, [0, 1, 0]);
    if (Math.hypot(s[0], s[1], s[2]) < 1e-3) s = [1, 0, 0];
    s = norm(s);
    const v = norm(cross(s, d));
    const o: V = [(A[0] + B[0]) / 2, (A[1] + B[1]) / 2, (A[2] + B[2]) / 2];
    const corner = (P: V, a: number, b: number): V => [P[0] + s[0] * p.hx * a + v[0] * p.hy * b, P[1] + s[1] * p.hx * a + v[1] * p.hy * b, P[2] + s[2] * p.hx * a + v[2] * p.hy * b];
    const k: [number, number][] = [[-1, -1], [1, -1], [1, 1], [-1, 1]];
    for (let i = 0; i < 4; i++) {
      const [a0, b0] = k[i], [a1, b1] = k[(i + 1) % 4];
      this.quadOut(corner(A, a0, b0), corner(A, a1, b1), corner(B, a1, b1), corner(B, a0, b0), o, p.c);
    }
    this.quadOut(corner(A, -1, -1), corner(A, 1, -1), corner(A, 1, 1), corner(A, -1, 1), B, p.c);
    this.quadOut(corner(B, -1, -1), corner(B, 1, -1), corner(B, 1, 1), corner(B, -1, 1), A, p.c);
  }

  gable(p: PortPart): void {
    const x0 = p.x - p.hx, x1 = p.x + p.hx, z0 = p.z - p.hz, z1 = p.z + p.hz, ye = p.y, yr = p.y + p.hy;
    const o: V = [p.x, ye - 1, p.z];
    if (p.n === 0) {
      this.quadOut([x0, ye, z0], [x1, ye, z0], [x1, yr, p.z], [x0, yr, p.z], o, p.c);
      this.quadOut([x0, ye, z1], [x1, ye, z1], [x1, yr, p.z], [x0, yr, p.z], o, p.c);
      this.tri([x0, ye, z0], [x0, ye, z1], [x0, yr, p.z], [-1, 0, 0], p.c);
      this.tri([x1, ye, z0], [x1, ye, z1], [x1, yr, p.z], [1, 0, 0], p.c);
    } else {
      this.quadOut([x0, ye, z0], [x0, ye, z1], [p.x, yr, z1], [p.x, yr, z0], o, p.c);
      this.quadOut([x1, ye, z0], [x1, ye, z1], [p.x, yr, z1], [p.x, yr, z0], o, p.c);
      this.tri([x0, ye, z0], [x1, ye, z0], [p.x, yr, z0], [0, 0, -1], p.c);
      this.tri([x0, ye, z1], [x1, ye, z1], [p.x, yr, z1], [0, 0, 1], p.c);
    }
  }

  data(): PortMeshData | null {
    if (this.idx.length === 0) return null;
    const n = this.pos.length / 3;
    return {
      positions: Float32Array.from(this.pos),
      normals: Float32Array.from(this.nrm),
      colors: Float32Array.from(this.col),
      indices: n > 65535 ? Uint32Array.from(this.idx) : Uint16Array.from(this.idx),
    };
  }
}

/** Asphalt strip of a gate road: follows the ground (sampled every 4 m, both edges), with a dashed white centre line. */
function emitGateRoad(em: Emit, g: PortGateRoad, groundAt: (x: number, z: number) => number): void {
  const hw = 6.5;
  const steps = Math.max(1, Math.ceil((g.z1 - g.z0) / 4));
  for (let i = 0; i < steps; i++) {
    const za = g.z0 + ((g.z1 - g.z0) * i) / steps, zb = g.z0 + ((g.z1 - g.z0) * (i + 1)) / steps;
    const y = (x: number, z: number): number => groundAt(x, z) + 0.07;
    em.quad([g.x - hw, y(g.x - hw, za), za], [g.x + hw, y(g.x + hw, za), za], [g.x + hw, y(g.x + hw, zb), zb], [g.x - hw, y(g.x - hw, zb), zb], [0, 1, 0], C.asphalt);
    if (i % 2 === 0) {
      const ym = groundAt(g.x, za) + 0.1, yn = groundAt(g.x, zb) + 0.1;
      em.quad([g.x - 0.15, ym, za], [g.x + 0.15, ym, za], [g.x + 0.15, yn, zb], [g.x - 0.15, yn, zb], [0, 1, 0], C.white);
    }
  }
}

/**
 * Port geometry of chunk (cx, cz): the layout parts whose centre is in the chunk (LOD0-1 all, LOD2 without the small details; none beyond)
 * + the gate roads that start in the chunk. `groundAt` is only used for the gate roads.
 */
export function buildPortMesh(
  layout: PortLayout,
  gates: readonly PortGateRoad[],
  cx: number,
  cz: number,
  lod: number,
  groundAt: (x: number, z: number) => number,
): PortMeshData | null {
  if (lod > 2) return null;
  const em = new Emit(chunkOriginX(cx), chunkOriginZ(cz));
  for (const p of layout.partsInChunk(cx, cz)) {
    if (lod >= 2 && p.det) continue;
    if (p.k === 0) em.box(p);
    else if (p.k === 1) em.prism(p, lod);
    else if (p.k === 2) em.bar(p);
    else em.gable(p);
  }
  const x0 = chunkOriginX(cx), z0 = chunkOriginZ(cz), S = 500;
  for (const g of gates) {
    const zm = (g.z0 + g.z1) / 2;
    if (g.x >= x0 && g.x < x0 + S && zm >= z0 && zm < z0 + S) emitGateRoad(em, g, groundAt);
  }
  return em.data();
}

/** Re-exported so tests can quote the design deck level next to the meshes. */
export const PORT_DECK = PORT_DESIGN.deck;
