import { Config } from '../core/Config';
import { chunkOriginX, chunkOriginZ } from '../world/WorldGrid';
import { buildRoadMask, buildRoadMesh, type RoadMeshData } from '../roads/RoadMesh';
import { buildRailMesh, type RailMeshData } from '../rail/RailMesh';
import { TunnelHoles, terrainTrianglesWithHoles } from '../rail/RailTunnel';
import { buildPortMesh, getPortLayout, type PortMeshData } from '../port';
import type { TerrainGenerator } from './TerrainGenerator';

/** Water surface for one chunk (rivers, lakes, sea). Vertices sit on the same grid as the terrain. */
export interface WaterMeshData {
  /** (n+1)^2 vertices; y = water level. */
  positions: Float32Array;
  normals: Float32Array;
  /** Water depth below the surface (negative on dry vertices at the shore -> transparent edge). */
  depth: Float32Array;
  /** Flow velocity (x,z) in m/s per vertex. */
  flow: Float32Array;
  indices: Uint16Array;
  minY: number;
  maxY: number;
}

export interface ChunkMeshData {
  /** (n+1)^2 heights, row-major [z][x]. Used for Rapier heightfield colliders. */
  heights: Float32Array;
  /** Chunk-local vertex positions: (n+1)^2 grid vertices followed by 4*(n+1) skirt vertices. */
  positions: Float32Array;
  normals: Float32Array;
  minHeight: number;
  maxHeight: number;
  /** null when the chunk has no water at all. */
  water: WaterMeshData | null;
  roadMask: Float32Array | null;
  road: RoadMeshData | null;
  /** STAGE 12: railway (ballast, rails, sleepers, overhead line, viaducts, portals, platforms) for LOD0-2, or null. */
  rail: RailMeshData | null;
  /** STAGE 14: sea port (quays, cranes, containers, ships, tanks ...) for LOD0-2, or null. */
  port: PortMeshData | null;
  /** Index buffer without the triangles that cut through a railway tunnel / box (LOD0 only); null = use the shared one. */
  holeIndices: Uint16Array | Uint32Array | null;
}

const holesOf = new WeakMap<TerrainGenerator, TunnelHoles>();
function tunnelHoles(gen: TerrainGenerator): TunnelHoles {
  let h = holesOf.get(gen);
  if (!h) {
    h = new TunnelHoles(gen.rail);
    holesOf.set(gen, h);
  }
  return h;
}

/**
 * Samples the terrain for one chunk and builds vertex buffers (pure maths; runs inside the worker).
 * Normals use a 1-sample padded border, so they are continuous across chunk edges.
 * Skirts: a strip of vertices hanging `skirtDepth` metres below every border; hides LOD cracks.
 */
export function buildChunkMeshData(
  gen: TerrainGenerator,
  cx: number,
  cz: number,
  n: number,
  skirtDepth: number,
  lod: number,
): ChunkMeshData {
  const S = Config.world.chunkSize;
  const step = S / n;
  const ox = chunkOriginX(cx);
  const oz = chunkOriginZ(cz);

  // Padded height grid: indices -1 .. n+1
  const pn = n + 3;
  const vn = n + 1;
  const vcount = vn * vn;
  const padded = new Float32Array(pn * pn);
  const level = new Float32Array(vcount).fill(NaN);
  const flowX = new Float32Array(vcount);
  const flowZ = new Float32Array(vcount);
  const sc = gen.makeSample();
  for (let j = 0; j < pn; j++) {
    const z = oz + (j - 1) * step;
    for (let i = 0; i < pn; i++) {
      gen.sample(ox + (i - 1) * step, z, sc);
      padded[j * pn + i] = sc.h;
      if (i >= 1 && i <= n + 1 && j >= 1 && j <= n + 1) {
        const k = (j - 1) * vn + (i - 1);
        level[k] = sc.water;
        flowX[k] = sc.fx;
        flowZ[k] = sc.fz;
      }
    }
  }

  const total = vcount + 4 * vn;
  const heights = new Float32Array(vcount);
  const positions = new Float32Array(total * 3);
  const normals = new Float32Array(total * 3);
  let minH = Infinity;
  let maxH = -Infinity;

  for (let j = 0; j < vn; j++) {
    for (let i = 0; i < vn; i++) {
      const h = padded[(j + 1) * pn + (i + 1)];
      const k = j * vn + i;
      heights[k] = h;
      if (h < minH) minH = h;
      if (h > maxH) maxH = h;
      positions[k * 3] = i * step;
      positions[k * 3 + 1] = h;
      positions[k * 3 + 2] = j * step;

      const hl = padded[(j + 1) * pn + i];
      const hr = padded[(j + 1) * pn + i + 2];
      const hu = padded[j * pn + i + 1];
      const hd = padded[(j + 2) * pn + i + 1];
      const nx = (hl - hr) / (2 * step);
      const nz = (hu - hd) / (2 * step);
      const inv = 1 / Math.sqrt(nx * nx + 1 + nz * nz);
      normals[k * 3] = nx * inv;
      normals[k * 3 + 1] = inv;
      normals[k * 3 + 2] = nz * inv;
    }
  }

  // Skirt vertices: north (j=0), south (j=n), west (i=0), east (i=n)
  const skirt = (slot: number, topOf: (k: number) => number) => {
    for (let k = 0; k < vn; k++) {
      const top = topOf(k);
      const dst = vcount + slot * vn + k;
      positions[dst * 3] = positions[top * 3];
      positions[dst * 3 + 1] = positions[top * 3 + 1] - skirtDepth;
      positions[dst * 3 + 2] = positions[top * 3 + 2];
      normals[dst * 3] = normals[top * 3];
      normals[dst * 3 + 1] = normals[top * 3 + 1];
      normals[dst * 3 + 2] = normals[top * 3 + 2];
    }
  };
  skirt(0, (k) => k);
  skirt(1, (k) => n * vn + k);
  skirt(2, (k) => k * vn);
  skirt(3, (k) => k * vn + n);
  const water = buildWater(n, step, heights, level, flowX, flowZ);
  minH -= skirtDepth;

  const roadMask = buildRoadMask(gen.roads, cx, cz, n, total);
  // lattice heights for the road ribbon: the chunk's own padded grid where it reaches, the generator beyond it
  const outside = new Map<number, number>();
  const lattice = (li: number, lj: number): number => {
    if (li >= -1 && li <= n + 1 && lj >= -1 && lj <= n + 1) return padded[(lj + 1) * pn + (li + 1)];
    const key = (li + 4096) * 8192 + (lj + 4096);
    let h = outside.get(key);
    if (h === undefined) {
      gen.sample(ox + li * step, oz + lj * step, sc);
      h = sc.h;
      outside.set(key, h);
    }
    return h;
  };
  const road = buildRoadMesh(gen.roads, cx, cz, lod, lattice, step);
  const rail = buildRailMesh(gen.rail, cx, cz, lod, (x, z) => {
    gen.sample(x, z, sc);
    return sc.h;
  });
  const port = buildPortMesh(getPortLayout(), gen.portForm.gates, cx, cz, lod, (x, z) => {
    gen.sample(x, z, sc);
    return sc.h;
  });
  // The earth must not fill the mouth of a tunnel: LOD0 chunks that a tunnel passes get their own index buffer without the cut triangles.
  let holeIndices: Uint16Array | Uint32Array | null = null;
  if (lod === 0) {
    const kept = terrainTrianglesWithHoles(tunnelHoles(gen), ox, oz, step, n, heights);
    if (kept) {
      const shared = buildIndices(n);
      const skirtStart = n * n * 6;
      const all = vcount + 4 * vn > 65535 ? new Uint32Array(kept.length + shared.length - skirtStart) : new Uint16Array(kept.length + shared.length - skirtStart);
      all.set(kept, 0);
      all.set(shared.subarray(skirtStart), kept.length);
      holeIndices = all;
    }
  }
  return { heights, positions, normals, minHeight: minH, maxHeight: maxH, water, roadMask, road, rail, port, holeIndices };
}

/** Water exists where the ground is below the water level. Quads touching a wet vertex are emitted. */
function buildWater(
  n: number,
  step: number,
  heights: Float32Array,
  level: Float32Array,
  flowX: Float32Array,
  flowZ: Float32Array,
): WaterMeshData | null {
  const vn = n + 1;
  const vcount = vn * vn;
  const wet = new Uint8Array(vcount);
  let any = false;
  for (let k = 0; k < vcount; k++) {
    if (!Number.isNaN(level[k]) && heights[k] < level[k] - 0.02) {
      wet[k] = 1;
      any = true;
    }
  }
  if (!any) return null;

  // Vertices without their own level (dry, away from water) borrow the average of defined neighbours.
  const lv = new Float32Array(level);
  for (let j = 0; j < vn; j++) {
    for (let i = 0; i < vn; i++) {
      const k = j * vn + i;
      if (!Number.isNaN(lv[k])) continue;
      let sum = 0;
      let cnt = 0;
      for (let dj = -1; dj <= 1; dj++) {
        for (let di = -1; di <= 1; di++) {
          const ii = i + di;
          const jj = j + dj;
          if (ii < 0 || jj < 0 || ii >= vn || jj >= vn) continue;
          const v = level[jj * vn + ii];
          if (!Number.isNaN(v)) {
            sum += v;
            cnt++;
          }
        }
      }
      if (cnt > 0) lv[k] = sum / cnt;
    }
  }

  const idx: number[] = [];
  for (let j = 0; j < n; j++) {
    for (let i = 0; i < n; i++) {
      const a = j * vn + i;
      const b = (j + 1) * vn + i;
      const c = j * vn + i + 1;
      const d = (j + 1) * vn + i + 1;
      if (!(wet[a] || wet[b] || wet[c] || wet[d])) continue;
      if (Number.isNaN(lv[a]) || Number.isNaN(lv[b]) || Number.isNaN(lv[c]) || Number.isNaN(lv[d])) continue;
      idx.push(a, b, c, c, b, d);
    }
  }
  if (idx.length === 0) return null;

  const positions = new Float32Array(vcount * 3);
  const normals = new Float32Array(vcount * 3);
  const depth = new Float32Array(vcount);
  const flow = new Float32Array(vcount * 2);
  let minY = Infinity;
  let maxY = -Infinity;
  const L = (i: number, j: number): number => {
    const ii = Math.min(vn - 1, Math.max(0, i));
    const jj = Math.min(vn - 1, Math.max(0, j));
    const v = lv[jj * vn + ii];
    return Number.isNaN(v) ? 0 : v;
  };
  for (let j = 0; j < vn; j++) {
    for (let i = 0; i < vn; i++) {
      const k = j * vn + i;
      const y = Number.isNaN(lv[k]) ? 0 : lv[k];
      positions[k * 3] = i * step;
      positions[k * 3 + 1] = y;
      positions[k * 3 + 2] = j * step;
      depth[k] = y - heights[k];
      flow[k * 2] = flowX[k];
      flow[k * 2 + 1] = flowZ[k];
      const nx = (L(i - 1, j) - L(i + 1, j)) / (2 * step);
      const nz = (L(i, j - 1) - L(i, j + 1)) / (2 * step);
      const inv = 1 / Math.sqrt(nx * nx + 1 + nz * nz);
      normals[k * 3] = nx * inv;
      normals[k * 3 + 1] = inv;
      normals[k * 3 + 2] = nz * inv;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
  }
  return { positions, normals, depth, flow, indices: new Uint16Array(idx), minY, maxY };
}

const indexCache = new Map<number, Uint16Array | Uint32Array>();

/**
 * Triangle indices for a chunk with n x n cells + skirts. Identical for every chunk of the same LOD,
 * so the array is built once and cached. All triangles wind counter-clockwise seen from outside.
 */
export function buildIndices(n: number): Uint16Array | Uint32Array {
  const cached = indexCache.get(n);
  if (cached) return cached;

  const vn = n + 1;
  const vcount = vn * vn;
  const triCount = n * n * 2 + 4 * n * 2;
  const idx = vcount + 4 * vn > 65535 ? new Uint32Array(triCount * 3) : new Uint16Array(triCount * 3);
  let p = 0;
  const tri = (a: number, b: number, c: number) => {
    idx[p++] = a;
    idx[p++] = b;
    idx[p++] = c;
  };

  // Ground: a=(i,j) b=(i,j+1) c=(i+1,j) d=(i+1,j+1); faces +Y.
  for (let j = 0; j < n; j++) {
    for (let i = 0; i < n; i++) {
      const a = j * vn + i;
      const b = (j + 1) * vn + i;
      const c = j * vn + i + 1;
      const d = (j + 1) * vn + i + 1;
      tri(a, b, c);
      tri(c, b, d);
    }
  }

  // Skirts. `flip` chooses the winding so the visible side faces away from the chunk.
  const skirtStrip = (slot: number, topOf: (k: number) => number, flip: boolean) => {
    for (let k = 0; k < n; k++) {
      const t0 = topOf(k);
      const t1 = topOf(k + 1);
      const b0 = vcount + slot * vn + k;
      const b1 = b0 + 1;
      if (!flip) {
        tri(t0, t1, b0);
        tri(t1, b1, b0);
      } else {
        tri(t0, b0, t1);
        tri(t1, b0, b1);
      }
    }
  };
  skirtStrip(0, (k) => k, false); // north  (-z)
  skirtStrip(1, (k) => n * vn + k, true); // south (+z)
  skirtStrip(2, (k) => k * vn, true); // west  (-x)
  skirtStrip(3, (k) => k * vn + n, false); // east  (+x)

  indexCache.set(n, idx);
  return idx;
}
