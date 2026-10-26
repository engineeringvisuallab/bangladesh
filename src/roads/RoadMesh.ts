import { Config } from '../core/Config';
import { chunkOriginX, chunkOriginZ } from '../world/WorldGrid';
import type { RoadNetwork } from './RoadNetwork';
import type { PadSpec } from './RoadTypes';

/** Asphalt ribbon of one chunk (chunk-local coordinates). Built inside the worker. */
export interface RoadMeshData {
  positions: Float32Array;
  normals: Float32Array;
  /** Per vertex: x = metres across the road (+ left), y = metres along it, z = asphalt half width, w = distance to the nearest road end. */
  info: Float32Array;
  indices: Uint16Array | Uint32Array;
}

/** The ribbon floats this far above the terrain per LOD (coarse terrain triangles cut corners, so LOD1 needs more). */
const LIFT = [0.08, 0.3];
/** LOD0 only: the ribbon is built ON the physics heightfield, so it only needs a hair of lift against z-fighting (polygonOffset does the rest). */
const LIFT_PHYSICS = 0.025;

/** Height of the physics heightfield (chunk lattice index li, lj; may lie outside the chunk). */
export type LatticeHeight = (li: number, lj: number) => number;

/**
 * Road ribbon for chunk (cx, cz). Every road segment is built exactly once, by the chunk that holds its midpoint,
 * so neighbouring chunks never draw the same asphalt twice. Only LOD0 and LOD1 get a ribbon; farther away the
 * road is drawn by the terrain shader (see RoadNetwork.maskAt).
 *
 * LOD0 (the LOD the physics colliders are made from) follows the SAME heightfield the Rapier collider uses: the ribbon is
 * subdivided to the lattice spacing along and across the road and every vertex takes the interpolated collider height
 * (+2.5 cm). So a wheel or a foot resting on the collider is on the visible surface - never inside the road, never floating.
 * Bridge decks keep their own height (the deck, not the ground, is the surface there).
 */
export function buildRoadMesh(roads: RoadNetwork, cx: number, cz: number, lod: number, lattice?: LatticeHeight, step = 0): RoadMeshData | null {
  if (lod >= LIFT.length) return null;
  const segs = roads.ownedSegments(cx, cz);
  const pads = roads.ownedPads(cx, cz);
  if (segs.length === 0 && pads.length === 0) return null;
  const ox = chunkOriginX(cx);
  const oz = chunkOriginZ(cz);
  const exact = lod === 0 && lattice !== undefined && step > 0;
  const lift = exact ? LIFT_PHYSICS : LIFT[lod];

  /** Collider height at chunk-local (lx, lz): average of the two possible triangle diagonals of the heightfield cell. */
  const field = (lx: number, lz: number): number => {
    const fx = lx / step;
    const fz = lz / step;
    const ix = Math.floor(fx);
    const iz = Math.floor(fz);
    const tx = fx - ix;
    const tz = fz - iz;
    const a = lattice!(ix, iz);
    const b = lattice!(ix + 1, iz);
    const c = lattice!(ix, iz + 1);
    const d = lattice!(ix + 1, iz + 1);
    const d1 = tx + tz <= 1 ? a + (b - a) * tx + (c - a) * tz : d + (b - d) * (1 - tz) + (c - d) * (1 - tx);
    const d2 = tx >= tz ? a + (b - a) * tx + (d - b) * tz : a + (d - c) * tx + (c - a) * tz;
    return (d1 + d2) * 0.5;
  };

  // vertex budget
  const plan: { s: number; pieces: number; cols: number }[] = [];
  let vcount = 0;
  let icount = 0;
  for (const s of segs) {
    const r = roads.segmentRoad(s);
    const i = roads.segmentPoint(s);
    const j = (i + 1) % r.xs.length;
    const segLen = Math.hypot(r.xs[j] - r.xs[i], r.zs[j] - r.zs[i]);
    const half = r.halfWidth + r.shoulder;
    const pieces = exact ? Math.max(1, Math.ceil(segLen / (step * 0.5))) : 1;
    const cols = exact ? Math.max(3, Math.ceil((2 * half) / (step * 0.5)) + 1) : 2;
    plan.push({ s, pieces, cols });
    vcount += (pieces + 1) * cols;
    icount += pieces * (cols - 1) * 6;
  }
  // junction pads (engineered intersections): asphalt fan + gravel border + paint quads, built as plain arrays (small)
  const padPos: number[] = [];
  const padInfo: number[] = [];
  const padIdx: number[] = [];
  for (const pad of pads) addPad(pad, ox, oz, lift, padPos, padInfo, padIdx, vcount);
  const segV = vcount;
  vcount += padPos.length / 3;
  icount += padIdx.length;
  const positions = new Float32Array(vcount * 3);
  const normals = new Float32Array(vcount * 3);
  const info = new Float32Array(vcount * 4);
  const indices = vcount > 65535 ? new Uint32Array(icount) : new Uint16Array(icount);

  let v = 0;
  let q = 0;
  for (const { s, pieces, cols } of plan) {
    const r = roads.segmentRoad(s);
    const i = roads.segmentPoint(s);
    const n = r.xs.length;
    const j = (i + 1) % n;
    const half = r.halfWidth + r.shoulder;
    const segLen = Math.hypot(r.xs[j] - r.xs[i], r.zs[j] - r.zs[i]);
    const onDeck = r.bridgeOf[i] >= 0 || r.bridgeOf[j] >= 0;
    const base = v;
    for (let k = 0; k <= pieces; k++) {
      const t = k / pieces;
      const cxm = r.xs[i] + (r.xs[j] - r.xs[i]) * t;
      const czm = r.zs[i] + (r.zs[j] - r.zs[i]) * t;
      const nxm = r.nx[i] + (r.nx[j] - r.nx[i]) * t;
      const nzm = r.nz[i] + (r.nz[j] - r.nz[i]) * t;
      const ym = r.ys[i] + (r.ys[j] - r.ys[i]) * t;
      const sAlong = r.cum[i] + segLen * t;
      const endD = r.closed ? 999 : Math.min(sAlong, r.length - sAlong);
      for (let c = 0; c < cols; c++) {
        const u = half * (1 - (2 * c) / (cols - 1)); // +half (left) ... -half (right)
        const lx = cxm + nxm * u - ox;
        const lz = czm + nzm * u - oz;
        positions[v * 3] = lx;
        positions[v * 3 + 1] = (exact && !onDeck ? field(lx, lz) : ym) + lift;
        positions[v * 3 + 2] = lz;
        normals[v * 3 + 1] = 1;
        info[v * 4] = u;
        info[v * 4 + 1] = sAlong;
        // local streets (tier 4) are flagged for the shader by +100: footpath + kerb instead of gravel shoulder, own markings
        info[v * 4 + 2] = r.earth ? r.halfWidth + 2000 : r.tier === 4 ? r.halfWidth + 100 : r.halfWidth;
        info[v * 4 + 3] = endD;
        v++;
      }
    }
    for (let k = 0; k < pieces; k++) {
      for (let c = 0; c < cols - 1; c++) {
        const a0 = base + k * cols + c;
        const a1 = a0 + 1;
        const b0 = a0 + cols;
        const b1 = b0 + 1;
        indices[q++] = a0;
        indices[q++] = a1;
        indices[q++] = b0;
        indices[q++] = b0;
        indices[q++] = a1;
        indices[q++] = b1;
      }
    }
  }
  for (let i = 0; i < padPos.length; i++) positions[segV * 3 + i] = padPos[i];
  for (let i = 0; i < padPos.length / 3; i++) normals[(segV + i) * 3 + 1] = 1;
  for (let i = 0; i < padInfo.length; i++) info[segV * 4 + i] = padInfo[i];
  for (let i = 0; i < padIdx.length; i++) indices[q + i] = padIdx[i];
  void Config;
  return { positions, normals, info, indices };
}

/**
 * One junction pad as triangles. Heights come straight from the pad plane (the terrain is exactly that plane inside the pad),
 * so no lattice lookup is needed. Vertex info follows the ribbon convention (x across, y along, z = half width / paint, w = end distance):
 *   asphalt: huge half width, no lines (w = 0); gravel border: |x| beyond the half width; paint quads: z = -1 white / -2 yellow.
 */
function addPad(pad: PadSpec, ox: number, oz: number, lift: number, pos: number[], info: number[], idx: number[], base: number): void {
  // pads where only local streets meet (no road of tier 1-3) are drawn in the local style: the shader knows them by the larger half width
  const HW = pad.arms.every((a) => a.kind === 'local') ? 1100 : 1000;
  const o = pad.outline;
  const g = pad.gravel;
  const nv = o.length / 2;
  const planeY = (x: number, z: number): number => pad.y + pad.a * (x - pad.x) + pad.b * (z - pad.z);
  const vert = (x: number, z: number, y: number, u: number, sAlong: number, hw: number): number => {
    const i = (pos.length / 3);
    pos.push(x - ox, y, z - oz);
    info.push(u, sAlong, hw, 0);
    return base + i;
  };
  // Every pad triangle must face UP. The road material is double-sided and Lambert lighting flips the normal of a back face, so a
  // triangle wound the wrong way would be lit from below = nearly black (that was the "black junctions"). Order each one by its real normal.
  const tri = (a: number, b: number, c: number): void => {
    const A = (a - base) * 3, B = (b - base) * 3, C = (c - base) * 3;
    const nyUp = (pos[B + 2] - pos[A + 2]) * (pos[C] - pos[A]) - (pos[B] - pos[A]) * (pos[C + 2] - pos[A + 2]); // y of (B-A) x (C-A), negated
    if (nyUp >= 0) idx.push(a, b, c);
    else idx.push(a, c, b);
  };
  // asphalt fan from the centre
  const c = vert(pad.x, pad.z, planeY(pad.x, pad.z) + lift, 0, 0, HW);
  const ring: number[] = [];
  for (let k = 0; k < nv; k++) ring.push(vert(o[k * 2], o[k * 2 + 1], planeY(o[k * 2], o[k * 2 + 1]) + lift, o[k * 2] - pad.x, o[k * 2 + 1] - pad.z, HW));
  for (let k = 0; k < nv; k++) tri(c, ring[k], ring[(k + 1) % nv]);
  // gravel border
  for (let k = 0; k < nv; k++) {
    const k2 = (k + 1) % nv;
    const a0 = vert(o[k * 2], o[k * 2 + 1], planeY(o[k * 2], o[k * 2 + 1]) + lift, HW + 1, o[k * 2 + 1] - pad.z, HW);
    const a1 = vert(o[k2 * 2], o[k2 * 2 + 1], planeY(o[k2 * 2], o[k2 * 2 + 1]) + lift, HW + 1, o[k2 * 2 + 1] - pad.z, HW);
    const b0 = vert(g[k * 2], g[k * 2 + 1], planeY(g[k * 2], g[k * 2 + 1]) + lift, HW + 1, g[k * 2 + 1] - pad.z, HW);
    const b1 = vert(g[k2 * 2], g[k2 * 2 + 1], planeY(g[k2 * 2], g[k2 * 2 + 1]) + lift, HW + 1, g[k2 * 2 + 1] - pad.z, HW);
    tri(a0, a1, b0);
    tri(b0, a1, b1);
  }
  // paint (zebra bars, stop lines): a little above the asphalt
  const m = pad.marks;
  const paintLift = lift + (lift > 0.1 ? 0.06 : 0.035);
  for (let q = 0; q + 9 <= m.length; q += 9) {
    const kind = m[q];
    const v: number[] = [];
    for (let c4 = 0; c4 < 4; c4++) {
      const x = m[q + 1 + c4 * 2];
      const z = m[q + 2 + c4 * 2];
      v.push(vert(x, z, planeY(x, z) + paintLift, 0, 0, kind));
    }
    tri(v[0], v[1], v[2]);
    tri(v[0], v[2], v[3]);
  }
}

/** Per-vertex road coverage (asphalt, asphalt+shoulder) for the terrain shader, or null if no road touches the chunk. */
export function buildRoadMask(roads: RoadNetwork, cx: number, cz: number, n: number, totalVertices: number): Float32Array | null {
  const S = Config.world.chunkSize;
  const ox = chunkOriginX(cx);
  const oz = chunkOriginZ(cz);
  if (!roads.touchesArea(ox - 8, oz - 8, ox + S + 8, oz + S + 8)) return null;
  const step = S / n;
  const vn = n + 1;
  const mask = new Float32Array(totalVertices * 2);
  const out = new Float32Array(2);
  let any = false;
  for (let j = 0; j < vn; j++) {
    for (let i = 0; i < vn; i++) {
      roads.maskAt(ox + i * step, oz + j * step, step, out);
      if (out[1] > 0) any = true;
      const k = j * vn + i;
      mask[k * 2] = out[0];
      mask[k * 2 + 1] = out[1];
    }
  }
  if (!any) return null;
  // skirts hang under the border vertices: same colour
  const vcount = vn * vn;
  const copy = (slot: number, topOf: (k: number) => number) => {
    for (let k = 0; k < vn; k++) {
      const d = vcount + slot * vn + k;
      const t = topOf(k);
      mask[d * 2] = mask[t * 2];
      mask[d * 2 + 1] = mask[t * 2 + 1];
    }
  };
  copy(0, (k) => k);
  copy(1, (k) => n * vn + k);
  copy(2, (k) => k * vn);
  copy(3, (k) => k * vn + n);
  return mask;
}
