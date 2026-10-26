import { stationAccesses, type StationAccess } from './StationAccess';
import { BOARD } from './StationSigns';
import { chunkKey, chunkOriginX, chunkOriginZ, worldToChunkCoord } from '../world/WorldGrid';
import { RAIL_DESIGN as D } from './RailPlan';
import type { RailEdge, RailNetwork } from './RailNetwork';
import type { RailDiamond, RailSwitch } from './RailSwitches';
import { OUTER_HALF, TUNNEL, isLined, portalTop, tunnelHeight } from './RailTunnel';

/** Railway geometry of one chunk (chunk-local coordinates, vertex colours). Built inside the worker. */
export interface RailMeshData {
  positions: Float32Array;
  normals: Float32Array;
  colors: Float32Array;
  /** Per vertex: how much the surface lights itself (tunnel lining and lamps), 0 = only the scene light. */
  glow: Float32Array;
  indices: Uint16Array | Uint32Array;
}

type V = [number, number, number];

const C = {
  ballast: [0.4, 0.38, 0.36] as V,
  sleeper: [0.55, 0.54, 0.52] as V,
  rail: [0.52, 0.54, 0.58] as V,
  concrete: [0.64, 0.63, 0.6] as V,
  concreteDark: [0.5, 0.49, 0.47] as V,
  steel: [0.34, 0.4, 0.47] as V,
  mast: [0.52, 0.53, 0.55] as V,
  wire: [0.08, 0.08, 0.09] as V,
  platform: [0.72, 0.71, 0.68] as V,
  canopy: [0.86, 0.88, 0.92] as V,
  dark: [0.02, 0.02, 0.025] as V,
  stop: [0.75, 0.15, 0.1] as V,
  subst: [0.7, 0.66, 0.55] as V,
  yellow: [0.9, 0.78, 0.15] as V,
  blade: [0.8, 0.8, 0.76] as V,
  frog: [0.2, 0.22, 0.26] as V,
  lining: [0.74, 0.73, 0.69] as V,
  liningRoof: [0.66, 0.66, 0.64] as V,
  lamp: [1.0, 0.93, 0.78] as V,
  emerg: [0.55, 1.0, 0.7] as V,
  sign: [0.1, 0.32, 0.75] as V,
  tactile: [0.85, 0.7, 0.12] as V,
  clip: [0.46, 0.23, 0.11] as V,
  coping: [0.82, 0.81, 0.78] as V,
  joint: [0.58, 0.57, 0.55] as V,
  fascia: [0.15, 0.25, 0.42] as V,
  wood: [0.45, 0.3, 0.18] as V,
  bin: [0.12, 0.4, 0.2] as V,
  white: [0.95, 0.95, 0.95] as V,
  lampWarm: [1.0, 0.82, 0.5] as V,
};

/**
 * SURFACE CLASS of a face, found from the colour constant it was emitted with. It rides in the `glow` attribute (glow + 4 * class, glow <= 1.5), so the
 * worker transfer and the mesh data stay exactly as they were; RailMaterial decodes it and paints a procedural texture on the face:
 * 1 ballast stones, 2 concrete (stains, formwork, tiles), 3 rail steel (shine + rust), 4 concrete sleeper, 5 painted metal, 6 wood, 7 tunnel lining tiles,
 * 8 rusty rail clip, 9 tactile bumps.
 */
const SURF = new Map<V, number>([
  [C.ballast, 1], [C.concrete, 2], [C.concreteDark, 2], [C.platform, 2], [C.subst, 2], [C.coping, 2], [C.joint, 2],
  [C.rail, 3], [C.sleeper, 4],
  [C.canopy, 5], [C.mast, 5], [C.steel, 5], [C.fascia, 5], [C.frog, 5],
  [C.wood, 6], [C.lining, 7], [C.liningRoof, 7], [C.clip, 8], [C.tactile, 9],
]);

/** Geometry collector: flat-coloured quads with their own normals. */
class Emit {
  pos: number[] = [];
  nrm: number[] = [];
  col: number[] = [];
  idx: number[] = [];
  glow: number[] = [];
  /** When set, every vertex gets `glowFn(x, y, z)` (world coordinates) as its self-light. */
  glowFn: ((x: number, y: number, z: number) => number) | null = null;
  constructor(private ox: number, private oz: number) {}

  quad(a: V, b: V, c: V, d: V, n: V, col: V): void {
    // wind counter-clockwise seen from the side the normal points to
    const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2];
    const vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
    const dot = (uy * vz - uz * vy) * n[0] + (uz * vx - ux * vz) * n[1] + (ux * vy - uy * vx) * n[2];
    const q = dot >= 0 ? [a, b, c, d] : [a, d, c, b];
    const base = this.pos.length / 3;
    for (const p of q) {
      this.pos.push(p[0] - this.ox, p[1], p[2] - this.oz);
      this.nrm.push(n[0], n[1], n[2]);
      this.col.push(col[0], col[1], col[2]);
      this.glow.push((this.glowFn ? this.glowFn(p[0], p[1], p[2]) : 0) + 4 * (SURF.get(col) ?? 0));
    }
    this.idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
  }

  /** Box centred at (cx, cy, cz); `a` = unit direction along (x, z), half sizes along / up / across. */
  box(cx: number, cy: number, cz: number, ax: number, az: number, hl: number, hh: number, hw: number, col: V, bottom = true): void {
    const wx = -az, wz = ax;
    const P = (l: number, h: number, w: number): V => [cx + ax * l + wx * w, cy + h, cz + az * l + wz * w];
    const lo = P(-hl, -hh, -hw), a1 = P(hl, -hh, -hw), a2 = P(hl, -hh, hw), a3 = P(-hl, -hh, hw);
    const b0 = P(-hl, hh, -hw), b1 = P(hl, hh, -hw), b2 = P(hl, hh, hw), b3 = P(-hl, hh, hw);
    this.quad(b0, b1, b2, b3, [0, 1, 0], col);
    if (bottom) this.quad(lo, a1, a2, a3, [0, -1, 0], col);
    this.quad(lo, a1, b1, b0, [-wx, 0, -wz], col);
    this.quad(a3, a2, b2, b3, [wx, 0, wz], col);
    this.quad(lo, a3, b3, b0, [-ax, 0, -az], col);
    this.quad(a1, a2, b2, b1, [ax, 0, az], col);
  }

  /** Beam from node A to node B (each: position + across unit vector). Section: across half width `hw`, from y offset `y0` to `y0 + h`. */
  beam(A: Node, B: Node, off: number, hw: number, y0: number, h: number, col: V, sides = true): void {
    const P = (n: Node, w: number, y: number): V => [n.x + n.wx * (off + w), n.y + y, n.z + n.wz * (off + w)];
    const t0 = P(A, -hw, y0 + h), t1 = P(A, hw, y0 + h), t2 = P(B, hw, y0 + h), t3 = P(B, -hw, y0 + h);
    this.quad(t0, t1, t2, t3, [0, 1, 0], col);
    if (!sides) return;
    const b0 = P(A, -hw, y0), b1 = P(A, hw, y0), b2 = P(B, hw, y0), b3 = P(B, -hw, y0);
    this.quad(b0, b3, t3, t0, [-A.wx, 0, -A.wz], col);
    this.quad(b1, b2, t2, t1, [A.wx, 0, A.wz], col);
    this.quad(b0, b1, t1, t0, [-A.tx, 0, -A.tz], col);
    this.quad(b3, b2, t2, t3, [A.tx, 0, A.tz], col);
    this.quad(b0, b1, b2, b3, [0, -1, 0], col);
  }

  data(): RailMeshData | null {
    if (this.idx.length === 0) return null;
    const n = this.pos.length / 3;
    return {
      positions: Float32Array.from(this.pos),
      normals: Float32Array.from(this.nrm),
      colors: Float32Array.from(this.col),
      glow: Float32Array.from(this.glow),
      indices: n > 65535 ? Uint32Array.from(this.idx) : Uint16Array.from(this.idx),
    };
  }
}

/** A point of a line with its frame (tangent t, across w = left of the direction of travel) and the design height. */
interface Node {
  x: number;
  y: number;
  z: number;
  tx: number;
  tz: number;
  wx: number;
  wz: number;
}

function nodeAt(e: RailEdge, i: number): Node {
  const n = e.xs.length;
  const a = Math.max(0, i - 1);
  const b = Math.min(n - 1, i + 1);
  let tx = e.xs[b] - e.xs[a];
  let tz = e.zs[b] - e.zs[a];
  const l = Math.hypot(tx, tz) || 1;
  tx /= l;
  tz /= l;
  return { x: e.xs[i], y: e.design[i], z: e.zs[i], tx, tz, wx: -tz, wz: tx };
}

function lerpNode(A: Node, B: Node, t: number): Node {
  let tx = A.tx + (B.tx - A.tx) * t;
  let tz = A.tz + (B.tz - A.tz) * t;
  const l = Math.hypot(tx, tz) || 1;
  tx /= l;
  tz /= l;
  return { x: A.x + (B.x - A.x) * t, y: A.y + (B.y - A.y) * t, z: A.z + (B.z - A.z) * t, tx, tz, wx: -tz, wz: tx };
}

/** Rusty rail clips: one flat plate over each rail foot on a sleeper (4 vertices each; the rails stand 0.04 above the sleeper top). */
function emitClips(em: Emit, f: Node, half: number): void {
  const y = f.y + 0.046;
  for (const tr of [-half, half]) {
    for (const rs of [-D.gauge / 2, D.gauge / 2]) {
      const cx = f.x + f.wx * (tr + rs), cz = f.z + f.wz * (tr + rs);
      const a = 0.09, w = 0.12;
      em.quad(
        [cx - f.tx * a - f.wx * w, y, cz - f.tz * a - f.wz * w], [cx + f.tx * a - f.wx * w, y, cz + f.tz * a - f.wz * w],
        [cx + f.tx * a + f.wx * w, y, cz + f.tz * a + f.wz * w], [cx - f.tx * a + f.wx * w, y, cz - f.tz * a + f.wz * w],
        [0, 1, 0], C.clip,
      );
    }
  }
}

/** Everything of the railway that one chunk owns (an element is built by the chunk that holds its reference point). */
interface Owned {
  intervals: { e: number; i: number }[];
  piers: number[];
  steel: number[];
  ends: { e: number; s: number; out: number; kind: 'tunnel' | 'cutcover' | 'abutment' }[];
  stations: { st: number; arr: number }[];
  switches: number[];
  diamonds: number[];
}
const index = new WeakMap<RailNetwork, Map<string, Owned>>();

/** Every track the mesh draws: the lines, then the station links (indices of `intervals` / `ends` point into this list). */
function trackEdges(rail: RailNetwork): RailEdge[] {
  return [...rail.edges, ...rail.links.map((l) => l.edge)];
}

function ownerIndex(rail: RailNetwork): Map<string, Owned> {
  const hit = index.get(rail);
  if (hit) return hit;
  const m = new Map<string, Owned>();
  const slot = (x: number, z: number): Owned => {
    const c = worldToChunkCoord(x, z);
    const k = chunkKey(c.cx, c.cz);
    let o = m.get(k);
    if (!o) {
      o = { intervals: [], piers: [], steel: [], ends: [], stations: [], switches: [], diamonds: [] };
      m.set(k, o);
    }
    return o;
  };
  trackEdges(rail).forEach((e, ei) => {
    for (let i = 0; i < e.xs.length - 1; i++) slot((e.xs[i] + e.xs[i + 1]) / 2, (e.zs[i] + e.zs[i + 1]) / 2).intervals.push({ e: ei, i });
    e.segments.forEach((sg, k) => {
      if (sg.kind === 'ground') return;
      const prev = e.segments[k - 1];
      const next = e.segments[k + 1];
      for (const [s, out, nb] of [[sg.s0, -1, prev], [sg.s1, 1, next]] as const) {
        if (!nb) continue; // the end of the line itself
        const p = rail.pointAt(e, s);
        if (sg.kind === 'bridge') {
          if (nb.kind === 'ground') slot(p.x, p.z).ends.push({ e: ei, s, out, kind: 'abutment' });
        } else if (!isLined(nb.kind)) slot(p.x, p.z).ends.push({ e: ei, s, out, kind: sg.kind }); // tunnel -> box etc. is one continuous tube: no head wall inside it
      }
    });
  });
  rail.piers.forEach((p, k) => slot(p.x, p.z).piers.push(k));
  rail.steelSpans.forEach((sp, k) => {
    const e = rail.edges.find((q) => q.id === sp.edgeId)!;
    const p = rail.pointAt(e, (sp.s0 + sp.s1) / 2);
    slot(p.x, p.z).steel.push(k);
  });
  rail.stations.forEach((st, si) => {
    st.arrivals.forEach((ar, ai) => {
      const e = rail.edges.find((q) => q.id === ar.edgeId)!;
      const p = rail.pointAt(e, ar.end === 'a' ? D.platform / 2 + 12 : e.length - D.platform / 2 - 12);
      slot(p.x, p.z).stations.push({ st: si, arr: ai });
    });
  });
  rail.switches.forEach((sw, k) => slot(sw.x, sw.z).switches.push(k));
  rail.diamonds.forEach((d, k) => slot(d.x, d.z).diamonds.push(k));
  index.set(rail, m);
  return m;
}

/** Is this railway chunk empty? (cheap test for the worker) */
export function railOwnsChunk(rail: RailNetwork, cx: number, cz: number): boolean {
  return ownerIndex(rail).has(chunkKey(cx, cz));
}

/**
 * Railway mesh of chunk (cx, cz): ballast, sleepers, rails, 25 kV overhead line (LOD0), viaduct decks, piers, steel spans, abutments,
 * tunnel / box portals, platforms with canopies, buffer stops and a traction substation per ground station.
 * LOD0 gets everything, LOD1 the track bed and structures, LOD2 only structures (so viaducts show from far away).
 */
export function buildRailMesh(rail: RailNetwork, cx: number, cz: number, lod: number, groundAt: (x: number, z: number) => number): RailMeshData | null {
  if (lod > 2) return null;
  const own = ownerIndex(rail).get(chunkKey(cx, cz));
  if (!own) return null;
  const em = new Emit(chunkOriginX(cx), chunkOriginZ(cz));
  const half = D.trackSpacing / 2;
  const tracks = trackEdges(rail);
  const kindAt = (e: RailEdge, m: number): string => e.segments.find((g) => m >= g.s0 && m <= g.s1)?.kind ?? 'ground';

  for (const { e: ei, i } of own.intervals) {
    const e = tracks[ei];
    const mid = (e.cum[i] + e.cum[i + 1]) / 2;
    const kind = kindAt(e, mid);
    if (kind === 'tunnel' || kind === 'cutcover') {
      if (lod <= 1) emitLined(em, e, i, kind, lod, half);
      continue;
    }
    const inA = e.cum[i + 1] <= e.zoneA + 1e-6;
    const inB = e.cum[i] >= e.length - e.zoneB - 1e-6;
    const st = inA || inB;
    const A = nodeAt(e, i);
    const B = nodeAt(e, i + 1);
    const len = e.cum[i + 1] - e.cum[i];
    const lift = lod === 0 ? 0 : 0.15;
    const bed = (n: Node): Node => ({ ...n, y: n.y + lift });
    const a = bed(A);
    const b = bed(B);
    if (kind === 'bridge') {
      const dh = st ? 9.6 : D.deckHalf;
      if (lod <= 2) {
        em.beam(A, B, 0, dh, -D.ballast - D.deckThick, D.deckThick, C.concrete); // girder
        if (lod <= 1) {
          for (const sg of [-1, 1]) em.beam(A, B, sg * (dh - 0.15), 0.15, -D.ballast, 1.0, C.concreteDark); // parapets
        }
      }
    }
    if (lod > 1) continue;
    // ballast bed (trapezoid on the ground, vertical skirt down to the formation so coarse terrain never shows a gap)
    em.beam(a, b, 0, D.ballastTop, -D.ballast, D.ballast, C.ballast, false);
    for (const sg of [-1, 1]) {
      const P = (n: Node, w: number, y: number): V => [n.x + n.wx * sg * w, n.y + y, n.z + n.wz * sg * w];
      const foot = kind === 'bridge' ? D.ballastTop : D.ballastFoot;
      const q = [P(a, D.ballastTop, 0), P(b, D.ballastTop, 0), P(b, foot, -D.ballast), P(a, foot, -D.ballast)] as const;
      em.quad(q[0], q[1], q[2], q[3], [sg * a.wx, 0.6, sg * a.wz], C.ballast);
      if (kind !== 'bridge') {
        const d = [P(a, foot, -D.ballast), P(b, foot, -D.ballast), P(b, foot, -D.ballast - 1.6), P(a, foot, -D.ballast - 1.6)] as const;
        em.quad(d[0], d[1], d[2], d[3], [sg * a.wx, 0, sg * a.wz], C.ballast);
      }
    }
    for (const tr of [-half, half]) {
      for (const rs of [-D.gauge / 2, D.gauge / 2]) em.beam(a, b, tr + rs, 0.036, 0.04, 0.17, C.rail);
    }
    if (lod > 0) continue;
    // sleepers every 0.65 m
    const n = Math.max(1, Math.round(len / 0.65));
    for (let k = 0; k < n; k++) {
      const t = (k + 0.5) / n;
      const f = lerpNode(A, B, t);
      for (const tr of [-half, half]) em.box(f.x + f.wx * tr, f.y - 0.1, f.z + f.wz * tr, f.tx, f.tz, 0.13, 0.14, 1.3, C.sleeper, false);
      emitClips(em, f, half);
    }
    // overhead line: contact wire + messenger wire over each track (25 kV 50 Hz AC)
    for (const tr of [-half, half]) {
      em.beam(A, B, tr, 0.02, D.contactHeight, 0.04, C.wire);
      em.beam(A, B, tr, 0.02, D.messengerHeight, 0.04, C.wire);
    }
    // masts every 50 m on both sides (+ a portal gantry over both tracks every 100 m)
    for (let s = Math.ceil(e.cum[i] / D.mastSpacing) * D.mastSpacing; s < e.cum[i + 1]; s += D.mastSpacing) {
      const f = lerpNode(A, B, (s - e.cum[i]) / (len || 1));
      const gantry = Math.round(s / D.mastSpacing) % 2 === 0;
      for (const sg of [-1, 1]) {
        const off = sg * (st ? 9.0 : 5.0);
        em.box(f.x + f.wx * off, f.y + 4.2, f.z + f.wz * off, f.tx, f.tz, 0.15, 4.4, 0.15, C.mast, false);
        if (!gantry) em.box(f.x + f.wx * sg * (half + (off * sg - half) / 2), f.y + D.messengerHeight + 0.4, f.z + f.wz * sg * (half + (off * sg - half) / 2), f.tx, f.tz, 0.09, 0.09, Math.abs(off - sg * half) / 2, C.mast, false);
      }
      if (gantry) em.box(f.x, f.y + D.messengerHeight + 0.5, f.z, f.tx, f.tz, 0.12, 0.2, st ? 9.2 : 5.2, C.mast, false);
    }
  }

  // viaduct piers: column + hammer-head cap under the deck
  for (const k of own.piers) {
    const p = rail.piers[k];
    const deckBottom = p.deckY - D.ballast - D.deckThick;
    const capH = 1.5;
    const st = rail.stations.some((s) => Math.hypot(s.x - p.x, s.z - p.z) < D.stationFlat + 40);
    const across = st ? 9.2 : 5.0;
    const colTop = deckBottom - capH;
    if (colTop - p.baseY > 0.2) em.box(p.x, (colTop + p.baseY - 1.2) / 2, p.z, p.dx, p.dz, 1.3, (colTop - p.baseY + 1.2) / 2, 2.2, C.concreteDark, false);
    em.box(p.x, deckBottom - capH / 2, p.z, p.dx, p.dz, 1.6, capH / 2, across, C.concrete);
    if (lod === 0 && colTop - p.baseY > 0.2) {
      // fluted column: vertical grooves on both faces across the track, a warm light strip down each corner (like the station piers of a metro viaduct)
      const cy = (colTop + p.baseY - 1.2) / 2, ch = (colTop - p.baseY + 1.2) / 2;
      for (const side of [-1, 1]) {
        for (let g = -4; g <= 4; g++) em.box(p.x + p.dx * side * 1.3 - p.dz * g * 0.45, cy, p.z + p.dz * side * 1.3 + p.dx * g * 0.45, p.dx, p.dz, 0.025, ch - 0.1, 0.07, C.joint, false);
      }
      em.glowFn = () => 1;
      for (const side of [-1, 1]) for (const cs of [-1, 1]) em.box(p.x + p.dx * side * 1.32 - p.dz * cs * 2.05, cy + ch * 0.25, p.z + p.dz * side * 1.32 + p.dx * cs * 2.05, p.dx, p.dz, 0.02, ch * 0.5, 0.05, C.lampWarm, false);
      em.glowFn = null;
    }
  }

  // steel through-girder spans (over a big junction / wide street / road bridge, no pier possible)
  for (const k of own.steel) {
    const sp = rail.steelSpans[k];
    const e = rail.edges.find((q) => q.id === sp.edgeId)!;
    const n = Math.max(2, Math.ceil((sp.s1 - sp.s0) / 8));
    const dh = rail.stations.some((s) => Math.hypot(s.x - rail.pointAt(e, sp.s0).x, s.z - rail.pointAt(e, sp.s0).z) < D.stationFlat + 40) ? 9.6 : D.deckHalf;
    const frame = (s: number): Node => {
      const p = rail.pointAt(e, s);
      const t = (s - e.cum[p.i]) / (e.cum[p.i + 1] - e.cum[p.i] || 1);
      return { x: p.x, y: e.design[p.i] + (e.design[p.i + 1] - e.design[p.i]) * t, z: p.z, tx: p.dx, tz: p.dz, wx: -p.dz, wz: p.dx };
    };
    for (let q = 0; q < n; q++) {
      const A = frame(sp.s0 + ((sp.s1 - sp.s0) * q) / n);
      const B = frame(sp.s0 + ((sp.s1 - sp.s0) * (q + 1)) / n);
      for (const sg of [-1, 1]) em.beam(A, B, sg * (dh - 0.3), 0.25, -D.ballast, 3.6, C.steel);
      if (q % 2 === 0) em.beam(A, B, 0, dh, -D.ballast - D.deckThick - 0.5, 0.5, C.steel); // lower deck plate
    }
  }

  // abutments (viaduct meets embankment) and portals (tunnel / box)
  for (const en of own.ends) {
    const e = tracks[en.e];
    const p = rail.pointAt(e, en.s);
    const t = (en.s - e.cum[p.i]) / (e.cum[p.i + 1] - e.cum[p.i] || 1);
    const y = e.design[p.i] + (e.design[p.i + 1] - e.design[p.i]) * t;
    const gnd = e.ground[p.i] + (e.ground[p.i + 1] - e.ground[p.i]) * t;
    const tx = p.dx * en.out;
    const tz = p.dz * en.out;
    if (en.kind === 'abutment') {
      const bottom = Math.min(gnd, y - D.ballast - D.deckThick) - 1.5;
      const top = y - D.ballast - 0.05;
      em.box(p.x - tx * 1.2, (top + bottom) / 2, p.z - tz * 1.2, p.dx, p.dz, 1.2, (top - bottom) / 2, D.deckHalf + 0.4, C.concrete);
    } else {
      // PORTAL: a concrete head wall on the open-line side of the mouth. Two wings either side of the opening, a lintel over it and an
      // approach slab; the opening is the full interior section (the terrain behind it is cut away - see RailTunnel / TerrainMeshData).
      const L = TUNNEL.portalLen;
      const H = tunnelHeight(en.kind === 'cutcover' ? 'cutcover' : 'tunnel');
      const base = y - D.ballast - 0.8;
      const top = portalTop(y, gnd, en.kind === 'cutcover' ? 'cutcover' : 'tunnel');
      const wingHalf = (TUNNEL.portalHalf - TUNNEL.inHalf) / 2;
      const cxp = p.x + tx * (L / 2);
      const czp = p.z + tz * (L / 2);
      for (const sg of [-1, 1]) {
        em.box(cxp - p.dz * sg * (TUNNEL.inHalf + wingHalf), (base + top) / 2, czp + p.dx * sg * (TUNNEL.inHalf + wingHalf), p.dx, p.dz, L / 2, (top - base) / 2, wingHalf, C.concrete);
      }
      if (top > y + H + 0.05) em.box(cxp, (y + H + top) / 2, czp, p.dx, p.dz, L / 2, (top - y - H) / 2, TUNNEL.inHalf, C.concrete);
      // approach floor (concrete, just under the formation level so it does not fight with the ground)
      em.box(cxp, y - D.ballast - TUNNEL.floorThick / 2 - 0.02, czp, p.dx, p.dz, L / 2, TUNNEL.floorThick / 2, TUNNEL.inHalf + 5, C.concreteDark);
      // two lamps over the mouth, lit day and night
      em.glowFn = () => 1;
      for (const sg of [-1, 1]) em.box(p.x + tx * 0.6 - p.dz * sg * (TUNNEL.inHalf - 0.6), y + H + 0.5, p.z + tz * 0.6 + p.dx * sg * (TUNNEL.inHalf - 0.6), p.dx, p.dz, 0.2, 0.12, 0.5, C.lamp, false);
      em.glowFn = null;
    }
  }

  // stations: platforms, canopies, buffer stops, traction substation
  for (const { st: si, arr: ai } of own.stations) {
    const st = rail.stations[si];
    const ar = st.arrivals[ai];
    const e = rail.edges.find((q) => q.id === ar.edgeId)!;
    const sgn = ar.end === 'a' ? 1 : -1;
    const s0 = ar.end === 'a' ? 0 : e.length;
    const mid = s0 + sgn * (12 + D.platform / 2);
    const p = rail.pointAt(e, mid);
    const y = st.level;
    const tx = p.dx;
    const tz = p.dz;
    const wx = -tz;
    const wz = tx;
    for (const sg of [-1, 1]) {
      const lat = sg * (half + 1.7 + 2.25);
      if (lod <= 1) {
        em.box(p.x + wx * lat, y + 0.2 + (0.76 - 1.2) / 2, p.z + wz * lat, tx, tz, D.platform / 2, 0.5 + 0.38 + 0.08, 2.25, C.platform);
        // canopy over the platform
        const clat = sg * (half + 1.7 + 2.9);
        if (lod === 0) {
          em.box(p.x + wx * clat, y + 4.8, p.z + wz * clat, tx, tz, D.platform / 2 - 15, 0.14, 3.2, C.canopy);
          for (let q = -D.platform / 2 + 20; q <= D.platform / 2 - 20; q += 15) {
            em.box(p.x + tx * q + wx * sg * (half + 1.7 + 4.1), y + 2.5, p.z + tz * q + wz * sg * (half + 1.7 + 4.1), tx, tz, 0.18, 2.3, 0.18, C.mast, false);
          }
          // yellow safety line
          em.box(p.x + wx * sg * (half + 1.7 + 0.25), y + 0.97, p.z + wz * sg * (half + 1.7 + 0.25), tx, tz, D.platform / 2, 0.01, 0.12, C.yellow, false);
          emitPlatformDetail(em, p, tx, tz, wx, wz, sg, half, y);
        }
      }
    }
    // the way up to the platforms: stairs with walls, gate shelter, signs (StationAccess; the very boxes RailPhysics makes solid)
    if (lod <= 1) for (const a of stationAccesses(rail, groundAt)) if (a.station === st.id && a.arrival === ai) emitAccess(em, a);
    // buffer stops: the line ends 70 m from the station centre
    // (an end that a station link continues has no buffer stop)
    const linked = rail.links.some((l) => (l.a.edgeId === ar.edgeId && l.a.end === ar.end) || (l.b.edgeId === ar.edgeId && l.b.end === ar.end));
    if (lod === 0 && !linked) {
      const eP = rail.pointAt(e, ar.end === 'a' ? 0.3 : e.length - 0.3);
      for (const tr of [-half, half]) em.box(eP.x - eP.dz * tr - eP.dx * sgn * -1.2, y + 0.6, eP.z + eP.dx * tr - eP.dz * sgn * -1.2, eP.dx, eP.dz, 0.5, 0.8, 0.9, C.stop);
    }
    // traction substation (25 kV) beside the first arrival of a ground station
    if (ai === 0 && !st.elevated && lod <= 1) {
      const sp = rail.pointAt(e, s0 + sgn * 60);
      const sx = sp.x + -sp.dz * 17.5;
      const sz = sp.z + sp.dx * 17.5;
      if (!rail.roadBlockedAt(sx, sz) && !rail.roadBlockedAt(sx + 6, sz + 6)) {
        const gy = groundAt(sx, sz);
        em.box(sx, gy + 2.0, sz, sp.dx, sp.dz, 4.0, 3.2, 2.5, C.subst);
        em.box(sx + sp.dx * 7, gy + 1.4, sz + sp.dz * 7, sp.dx, sp.dz, 1.2, 2.6, 1.2, C.steel);
      }
    }
  }
  // STEP 4: turnouts (switch blades, frog, check rails, long bearers, point machine) and diamond crossings of the station links
  if (lod === 0) {
    for (const k of own.switches) emitSwitch(em, rail.switches[k]);
    for (const k of own.diamonds) emitDiamond(em, rail.diamonds[k]);
  }
  return em.data();
}

/**
 * Lining of one 20 m interval of a tunnel / box: concrete floor, ballast + rails + sleepers + contact wire, two walls, the roof, and the lamps.
 * Cut into 3 m pieces so the self-light can change along the tube: a pool under every lamp, dim between (the lamps are lit day and night).
 */
function emitLined(em: Emit, e: RailEdge, i: number, kind: string, lod: number, half: number): void {
  const A = nodeAt(e, i);
  const B = nodeAt(e, i + 1);
  const seg = e.segments.find((g) => (e.cum[i] + e.cum[i + 1]) / 2 >= g.s0 && (e.cum[i] + e.cum[i + 1]) / 2 <= g.s1);
  const s0seg = seg ? seg.s0 : 0;
  const H = tunnelHeight(kind === 'cutcover' ? 'cutcover' : 'tunnel');
  const len = e.cum[i + 1] - e.cum[i];
  const n = Math.max(1, Math.ceil(len / (lod === 0 ? 3 : 6)));
  const thin = (e.ground[i] + e.ground[i + 1]) / 2 - (e.design[i] + e.design[i + 1]) / 2 < TUNNEL.thinCover;
  const roofHalf = thin ? TUNNEL.thinHalf : OUTER_HALF;
  const every = TUNNEL.lampEvery;
  // self-light along the tube: base 0.3, up to 0.85 right under a lamp
  const pool = (sRel: number): number => {
    const d = Math.abs((((sRel + every / 2) % every) + every) % every - every / 2);
    return 0.3 + 0.55 * Math.exp(-((d / 4) ** 2));
  };
  const W = TUNNEL.inHalf;
  for (let q = 0; q < n; q++) {
    const t0 = q / n, t1 = (q + 1) / n;
    const a = lerpNode(A, B, t0), b = lerpNode(A, B, t1);
    const sA = e.cum[i] + len * t0 - s0seg, sB = e.cum[i] + len * t1 - s0seg;
    const gA = pool(sA), gB = pool(sB);
    const tx = a.tx, tz = a.tz;
    const plen = Math.hypot(b.x - a.x, b.z - a.z) || 1;
    em.glowFn = (x, _y, z) => {
      const t = Math.max(0, Math.min(1, ((x - a.x) * tx + (z - a.z) * tz) / plen));
      return gA + (gB - gA) * t;
    };
    // floor slab: concrete, top at the formation level (what the open line stands on)
    em.beam(a, b, 0, roofHalf, -D.ballast - TUNNEL.floorThick, TUNNEL.floorThick - 0.02, C.concreteDark);
    // walls and roof (inner faces are the ones seen from the track)
    for (const sg of [-1, 1]) em.beam(a, b, sg * (W + TUNNEL.wall / 2), TUNNEL.wall / 2, -D.ballast - 0.3, H + TUNNEL.roof + D.ballast + 0.3, C.lining);
    em.beam(a, b, 0, roofHalf, H, TUNNEL.roof, C.liningRoof);
    // track bed (same as the open line)
    const lift = lod === 0 ? 0 : 0.15;
    const ba: Node = { ...a, y: a.y + lift }, bb: Node = { ...b, y: b.y + lift };
    em.beam(ba, bb, 0, D.ballastTop, -D.ballast, D.ballast, C.ballast, false);
    for (const tr of [-half, half]) for (const rs of [-D.gauge / 2, D.gauge / 2]) em.beam(ba, bb, tr + rs, 0.036, 0.04, 0.17, C.rail);
    if (lod > 0) continue;
    const m = Math.max(1, Math.round(plen / 0.65));
    for (let k = 0; k < m; k++) {
      const f = lerpNode(a, b, (k + 0.5) / m);
      for (const tr of [-half, half]) em.box(f.x + f.wx * tr, f.y - 0.1, f.z + f.wz * tr, f.tx, f.tz, 0.13, 0.14, 1.3, C.sleeper, false);
      emitClips(em, f, half);
    }
    for (const tr of [-half, half]) {
      em.beam(a, b, tr, 0.02, D.contactHeight, 0.04, C.wire);
      if (H > D.messengerHeight + 0.4) em.beam(a, b, tr, 0.02, D.messengerHeight, 0.04, C.wire);
    }
    // lamps: a row of linear fixtures under the roof, alternating sides, and a small green marker light low on the walls every 6 m
    em.glowFn = () => 1;
    const kLamp = Math.ceil((sA - every / 2 + 1e-6) / every);
    const sLamp = kLamp * every + every / 2;
    if (sLamp >= sA - 1e-6 && sLamp < sB - 1e-6) {
      const f = lerpNode(a, b, (sLamp - sA) / (sB - sA || 1));
      const side = kLamp % 2 === 0 ? 1 : -1;
      for (const lat of [side * 3.2, -side * 3.2]) em.box(f.x + f.wx * lat, f.y + H - 0.14, f.z + f.wz * lat, f.tx, f.tz, 0.9, 0.07, 0.22, C.lamp, false);
    }
    const kMark = Math.ceil((sA + 1e-6) / 6);
    const sMark = kMark * 6;
    if (sMark >= sA - 1e-6 && sMark < sB - 1e-6) {
      const f = lerpNode(a, b, (sMark - sA) / (sB - sA || 1));
      for (const sg of [-1, 1]) em.box(f.x + f.wx * sg * (W - 0.06), f.y + 1.25, f.z + f.wz * sg * (W - 0.06), f.tx, f.tz, 0.18, 0.06, 0.05, C.emerg, false);
    }
  }
  em.glowFn = null;
}

/** Point of a switch route (x, z pairs, one per metre) at distance s from the toe, with the unit direction of travel. */
function routePoint(a: Float64Array, s: number): { x: number; z: number; tx: number; tz: number } {
  const n = a.length / 2;
  const i = Math.max(0, Math.min(n - 2, Math.floor(s)));
  const t = Math.max(0, Math.min(1, s - i));
  let tx = a[(i + 1) * 2] - a[i * 2], tz = a[(i + 1) * 2 + 1] - a[i * 2 + 1];
  const l = Math.hypot(tx, tz) || 1;
  tx /= l;
  tz /= l;
  return { x: a[i * 2] + (a[(i + 1) * 2] - a[i * 2]) * t, z: a[i * 2 + 1] + (a[(i + 1) * 2 + 1] - a[i * 2 + 1]) * t, tx, tz };
}

function routeNode(a: Float64Array, s: number, y: number): Node {
  const p = routePoint(a, s);
  return { x: p.x, y, z: p.z, tx: p.tx, tz: p.tz, wx: -p.tz, wz: p.tx };
}

function emitSwitch(em: Emit, sw: RailSwitch): void {
  const y = sw.level;
  const g2 = D.gauge / 2;
  const reach = Math.min(sw.stock.length / 2 - 1, sw.frogS + 3);
  // long bearers under both routes (a little higher / lower than the normal sleepers so nothing is coplanar)
  for (let s = 0.65; s <= reach; s += 0.65) {
    const a = routeNode(sw.stock, s, y), b = routeNode(sw.div, s, y);
    const sep = Math.hypot(a.x - b.x, a.z - b.z);
    em.box((a.x + b.x) / 2, y - 0.1, (a.z + b.z) / 2, a.tx, a.tz, 0.13, 0.145, 1.3 + sep / 2, C.sleeper, false);
  }
  // switch blades: tapered rails of the diverging route, tip at the toe, a tiny gap to the stock rail at the tip
  const nb = Math.max(2, Math.round(sw.bladeLen));
  for (const rs of [-1, 1]) {
    for (let q = 0; q < nb; q++) {
      const s0 = 0.3 + (sw.bladeLen * q) / nb, s1 = 0.3 + (sw.bladeLen * (q + 1)) / nb;
      const A = routeNode(sw.div, s0, y), B = routeNode(sw.div, s1, y);
      const hw = 0.012 + (0.036 - 0.012) * ((q + 1) / nb);
      em.beam(A, B, rs * g2, hw, 0.05, 0.17, C.blade);
    }
  }
  // point machine (yellow box) beside the toe on the outer side of the track, and a thin throw rod across the bearers
  const T = routeNode(sw.stock, 2.5, y);
  em.box(T.x + T.wx * sw.track * 2.2, y + 0.3, T.z + T.wz * sw.track * 2.2, T.tx, T.tz, 0.45, 0.4, 0.3, C.yellow, false);
  em.box(T.x + T.wx * sw.track * 1.2, y + 0.06, T.z + T.wz * sw.track * 1.2, T.wx * sw.track, T.wz * sw.track, 1.0, 0.02, 0.03, C.steel, false);
  // frog: where the inner rails of the two routes meet (middle between both centre lines), with check rails opposite
  const fa = routeNode(sw.stock, sw.frogS, y), fb = routeNode(sw.div, sw.frogS, y);
  const fx = (fa.x + fb.x) / 2, fz = (fa.z + fb.z) / 2;
  em.box(fx, y + 0.11, fz, fa.tx, fa.tz, 1.5, 0.1, 0.12, C.frog, false);
  em.box(fx + fa.tx * 1.6, y + 0.11, fz + fa.tz * 1.6, fa.tx, fa.tz, 0.9, 0.1, 0.07, C.frog, false);
  for (const [A0, B0, side] of [[routeNode(sw.stock, sw.frogS - 2, y), routeNode(sw.stock, sw.frogS + 2, y), -sw.turn], [routeNode(sw.div, sw.frogS - 2, y), routeNode(sw.div, sw.frogS + 2, y), sw.turn]] as const) {
    em.beam(A0, B0, side * (g2 - 0.09), 0.03, 0.04, 0.12, C.rail);
  }
}

function emitDiamond(em: Emit, d: RailDiamond): void {
  const y = d.level;
  // crossing slab covering the diamond of the four rail crossings
  const nax = -d.az, naz = d.ax;
  let hl = 0, hw = 0;
  for (let k = 0; k < 4; k++) {
    const rx = d.corners[k * 2] - d.x, rz = d.corners[k * 2 + 1] - d.z;
    hl = Math.max(hl, Math.abs(rx * d.ax + rz * d.az));
    hw = Math.max(hw, Math.abs(rx * nax + rz * naz));
  }
  em.box(d.x, y + 0.03, d.z, d.ax, d.az, hl + 0.9, 0.03, hw + 0.5, C.frog, false);
  // raised crossing noses where a rail of one track crosses a rail of the other
  for (let k = 0; k < 4; k++) em.box(d.corners[k * 2], y + 0.11, d.corners[k * 2 + 1], d.ax, d.az, 0.7, 0.1, 0.13, C.frog, false);
}


/**
 * Platform furniture and finish for one side (sg) of a station, LOD 0 only: coping and tactile strip at the edge, tile joints, benches and bins,
 * canopy fascia, steel cross beams, column base plates, lamps under the roof (self-lit) and hanging station boards. Pictures only (no colliders):
 * everything stands at the back of the platform or above head height, away from the stairs and the edge.
 */
function emitPlatformDetail(em: Emit, p: { x: number; z: number }, tx: number, tz: number, wx: number, wz: number, sg: number, half: number, y: number): void {
  const top = y + 0.94;
  const e0 = half + 1.7;
  const P = D.platform;
  const at = (q: number, lat: number): [number, number] => [p.x + tx * q + wx * sg * lat, p.z + tz * q + wz * sg * lat];
  const put = (q: number, lat: number, cy: number, hl: number, hh: number, hw: number, col: V, bottom = false): void => {
    const [x, z] = at(q, lat);
    em.box(x, cy, z, tx, tz, hl, hh, hw, col, bottom);
  };
  // edge coping and the yellow tactile strip
  put(0, e0 + 0.12, top + 0.012, P / 2, 0.012, 0.12, C.coping);
  put(0, e0 + 0.62, top + 0.008, P / 2, 0.008, 0.38, C.tactile);
  // tile joints every 5 m
  for (let q = -P / 2 + 2.5; q < P / 2; q += 5) put(q, e0 + 2.75, top + 0.004, 0.035, 0.004, 1.75, C.joint);
  // columns: where the canopy posts are (every 15 m from 20 m inside the end)
  for (let q = -P / 2 + 20; q <= P / 2 - 20; q += 15) {
    put(q, e0 + 4.1, top + 0.05, 0.3, 0.05, 0.3, C.concrete);
    put(q, e0 + 2.9, y + 4.58, 0.14, 0.14, 3.2, C.mast); // cross beam under the roof
    if (q < P / 2 - 20) {
      // two benches per bay, at 3 m and 12 m after the column: the middle of the bay (7.5 m) belongs to the stair (StationAccess), keep it free
      for (const qc of [q + 3.0, q + 12.0]) {
        put(qc, e0 + 3.4, top + 0.46, 0.9, 0.03, 0.22, C.wood);
        put(qc, e0 + 3.62, top + 0.74, 0.9, 0.2, 0.03, C.wood);
        for (const dq of [-0.7, 0.7]) put(qc + dq, e0 + 3.4, top + 0.23, 0.04, 0.23, 0.18, C.mast);
      }
      put(q + 1.2, e0 + 3.7, top + 0.4, 0.22, 0.4, 0.22, C.bin);
    }
  }
  // canopy: dark fascia along both long edges (the roof slab is 6.4 m wide, 0.14 half thick)
  for (const d of [-1, 1]) put(0, e0 + 2.9 + d * 3.2, y + 4.8 + 0.12, P / 2 - 15, 0.24, 0.06, C.fascia);
  // lamps under the roof, self-lit
  em.glowFn = () => 1;
  for (let q = -P / 2 + 22.5; q <= P / 2 - 22; q += 7.5) put(q, e0 + 2.9, y + 4.64, 0.7, 0.025, 0.14, C.lamp);
  // hanging station boards (blue; the English + Bangla name is drawn on both faces by StationSignLayer) in the middle and near both ends
  for (const q of BOARD.qs(P)) put(q, e0 + BOARD.lat, y + BOARD.y, BOARD.hl, BOARD.hh, BOARD.hw, C.sign);
  em.glowFn = null;
  for (const q of BOARD.qs(P)) for (const d of [-1.2, 1.2]) put(q, e0 + BOARD.lat + d, y + 4.42, 0.02, 0.45, 0.02, C.mast);
}

/** One station access: treads, side walls, the gate shelter (roof on posts + sign) and the entrance sign at the foot. */
function emitAccess(em: Emit, a: StationAccess): void {
  for (const b of a.boxes) {
    const col = b.kind === 'tread' ? C.platform : b.kind === 'wall' ? C.concrete : b.kind === 'roof' ? C.canopy : b.kind === 'post' ? C.mast : C.sign;
    em.glowFn = b.kind === 'sign' ? () => 0.8 : null;
    em.box(b.x, b.y, b.z, b.ax, b.az, b.hl, b.hh, b.hw, col, b.kind !== 'tread');
    // finish (pictures only, no colliders): the roof gets a dark fascia on all four edges, steel rafters and a lamp under it; every post stands on a
    // base plate; every wall carries a handrail along its top
    const tx = -b.az, tz = b.ax; // across the stair
    if (b.kind === 'roof') {
      const fy = b.y + 0.1;
      for (const d of [-1, 1]) {
        em.box(b.x + tx * d * (b.hw - 0.03), fy, b.z + tz * d * (b.hw - 0.03), b.ax, b.az, b.hl, 0.1, 0.04, C.fascia, false);
        em.box(b.x + b.ax * d * (b.hl - 0.03), fy, b.z + b.az * d * (b.hl - 0.03), b.ax, b.az, 0.04, 0.1, b.hw, C.fascia, false);
      }
      for (const d of [-1.7, 0, 1.7]) em.box(b.x + b.ax * d, b.y - b.hh - 0.08, b.z + b.az * d, b.ax, b.az, 0.07, 0.08, b.hw - 0.05, C.mast, false);
      em.glowFn = () => 1;
      em.box(b.x, b.y - b.hh - 0.02, b.z, b.ax, b.az, 0.6, 0.02, 0.12, C.lamp, false);
      em.glowFn = null;
    } else if (b.kind === 'post') {
      em.box(b.x, b.y - b.hh + 0.03, b.z, b.ax, b.az, 0.17, 0.03, 0.17, C.concrete, false);
    } else if (b.kind === 'wall') {
      em.box(b.x, b.y + b.hh + 0.04, b.z, b.ax, b.az, b.hl, 0.03, 0.045, C.mast, false);
    }
  }
  em.glowFn = null;
}
