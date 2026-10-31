import type { AreaPoly, RoadLine } from './RoadNetwork';

export interface MeshData {
  positions: Float32Array;
  normals: Float32Array;
  uvs: Float32Array;
  indices: Uint32Array;
}

/** Longest straight piece of road between two vertices (m). Shorter pieces follow a height-map; flat ground needs none, but later heights do. */
const MAX_STEP = 20;

/**
 * Flat ribbon along a road centre line, `width` wide, draped on the ground with `heightAt` (+ `lift` against z-fighting).
 * u = 0..1 across, v = distance along the road / `vMetres` (so a texture can repeat every `vMetres` metres).
 * All triangles face up (+y). Pure function.
 */
export function buildRibbon(road: RoadLine, heightAt: (x: number, z: number) => number, lift: number, vMetres: number): MeshData {
  // resample so that no piece is longer than MAX_STEP
  const px: number[] = [];
  const pz: number[] = [];
  const dist: number[] = [];
  let acc = 0;
  for (let i = 0; i < road.xs.length - 1; i++) {
    const len = Math.hypot(road.xs[i + 1] - road.xs[i], road.zs[i + 1] - road.zs[i]);
    const n = Math.max(1, Math.ceil(len / MAX_STEP));
    for (let k = 0; k < n; k++) {
      const t = k / n;
      px.push(road.xs[i] + (road.xs[i + 1] - road.xs[i]) * t);
      pz.push(road.zs[i] + (road.zs[i + 1] - road.zs[i]) * t);
      dist.push(acc + len * t);
    }
    acc += len;
  }
  px.push(road.xs[road.xs.length - 1]);
  pz.push(road.zs[road.zs.length - 1]);
  dist.push(acc);

  const n = px.length;
  const half = road.width / 2;
  const positions = new Float32Array(n * 2 * 3);
  const normals = new Float32Array(n * 2 * 3);
  const uvs = new Float32Array(n * 2 * 2);
  for (let i = 0; i < n; i++) {
    // direction = average of the incoming and outgoing segment (mitre), width corrected so the edges stay `half` away
    const a = Math.max(0, i - 1);
    const b = Math.min(n - 1, i + 1);
    let dx = px[b] - px[a];
    let dz = pz[b] - pz[a];
    const dl = Math.hypot(dx, dz) || 1;
    dx /= dl;
    dz /= dl;
    let lx = -dz;
    let lz = dx;
    let scale = 1;
    if (i > 0 && i < n - 1) {
      const d1x = px[i] - px[i - 1];
      const d1z = pz[i] - pz[i - 1];
      const d2x = px[i + 1] - px[i];
      const d2z = pz[i + 1] - pz[i];
      const c = (d1x * d2x + d1z * d2z) / ((Math.hypot(d1x, d1z) * Math.hypot(d2x, d2z)) || 1);
      scale = Math.min(2, 1 / Math.max(0.5, Math.sqrt((1 + c) / 2)));
    }
    for (let side = 0; side < 2; side++) {
      const s = side === 0 ? 1 : -1;
      const x = px[i] + lx * half * scale * s;
      const z = pz[i] + lz * half * scale * s;
      const o = (i * 2 + side) * 3;
      positions[o] = x;
      positions[o + 1] = heightAt(x, z) + lift;
      positions[o + 2] = z;
      normals[o + 1] = 1;
      uvs[(i * 2 + side) * 2] = side === 0 ? 0 : 1;
      uvs[(i * 2 + side) * 2 + 1] = dist[i] / vMetres;
    }
  }
  const indices = new Uint32Array((n - 1) * 6);
  let w = 0;
  for (let i = 0; i < n - 1; i++) {
    const l0 = i * 2;
    const r0 = l0 + 1;
    const l1 = l0 + 2;
    const r1 = l0 + 3;
    // choose the winding that faces +y (decided once from this quad)
    const ax = positions[r0 * 3] - positions[l0 * 3];
    const az = positions[r0 * 3 + 2] - positions[l0 * 3 + 2];
    const bx = positions[l1 * 3] - positions[l0 * 3];
    const bz = positions[l1 * 3 + 2] - positions[l0 * 3 + 2];
    const up = az * bx - ax * bz > 0; // y component of (r0-l0) x (l1-l0)
    if (up) indices.set([l0, r0, l1, r0, r1, l1], w);
    else indices.set([l0, l1, r0, r0, l1, r1], w);
    w += 6;
  }
  return { positions, normals, uvs, indices };
}

/** Convex polygon (apron) as a triangle fan, u/v = metres / `tileMetres` so a texture repeats. */
export function buildArea(area: AreaPoly, heightAt: (x: number, z: number) => number, lift: number, tileMetres: number): MeshData {
  const n = area.xs.length;
  const positions = new Float32Array(n * 3);
  const normals = new Float32Array(n * 3);
  const uvs = new Float32Array(n * 2);
  for (let i = 0; i < n; i++) {
    positions.set([area.xs[i], heightAt(area.xs[i], area.zs[i]) + lift, area.zs[i]], i * 3);
    normals[i * 3 + 1] = 1;
    uvs.set([area.xs[i] / tileMetres, area.zs[i] / tileMetres], i * 2);
  }
  let signed = 0; // polygon orientation in the x/z plane
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    signed += area.xs[i] * area.zs[j] - area.xs[j] * area.zs[i];
  }
  const indices = new Uint32Array((n - 2) * 3);
  for (let i = 1; i < n - 1; i++) {
    if (signed < 0) indices.set([0, i, i + 1], (i - 1) * 3);
    else indices.set([0, i + 1, i], (i - 1) * 3);
  }
  return { positions, normals, uvs, indices };
}
