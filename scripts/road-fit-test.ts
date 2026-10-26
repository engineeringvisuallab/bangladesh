// Visible road ribbon vs the physics heightfield (LOD0): npx tsx scripts/road-fit-test.ts
// For every sample on a road (asphalt + shoulder) we compare the built ribbon triangle height with the heightfield the Rapier collider uses.
//   sink = collider is ABOVE the visible surface (tyre / foot goes into the road)    float = ribbon is above the collider (hovering)
import { TerrainGenerator } from '../src/terrain/TerrainGenerator';
import { buildChunkMeshData } from '../src/terrain/TerrainMeshData';
import { Config } from '../src/core/Config';
import { chunkOriginX, chunkOriginZ, worldToChunkCoord } from '../src/world/WorldGrid';

const g = new TerrainGenerator(Config.world.seed);
const S = Config.world.chunkSize;
const n = Config.lod.vertsPerSide[0];
const step = S / n;
const cache = new Map<string, ReturnType<typeof buildChunkMeshData>>();
const chunk = (cx: number, cz: number) => {
  const k = cx + ',' + cz;
  let c = cache.get(k);
  if (!c) cache.set(k, (c = buildChunkMeshData(g, cx, cz, n, 8, 0)));
  return c;
};
/** Collider height (both triangle diagonals) from the chunk's own heights. */
function collider(x: number, z: number): [number, number] {
  const { cx, cz } = worldToChunkCoord(x, z);
  const m = chunk(cx, cz);
  const fx = (x - chunkOriginX(cx)) / step, fz = (z - chunkOriginZ(cz)) / step;
  const ix = Math.min(n - 1, Math.floor(fx)), iz = Math.min(n - 1, Math.floor(fz));
  const tx = fx - ix, tz = fz - iz, vn = n + 1;
  const a = m.heights[iz * vn + ix], b = m.heights[iz * vn + ix + 1], c = m.heights[(iz + 1) * vn + ix], d = m.heights[(iz + 1) * vn + ix + 1];
  const d1 = tx + tz <= 1 ? a + (b - a) * tx + (c - a) * tz : d + (b - d) * (1 - tz) + (c - d) * (1 - tx);
  const d2 = tx >= tz ? a + (b - a) * tx + (d - b) * tz : a + (d - c) * tx + (c - a) * tz;
  return [Math.min(d1, d2), Math.max(d1, d2)];
}
/** Ribbon height at (x, z): the highest ribbon triangle covering the point (null if none). */
function ribbon(x: number, z: number): number | null {
  const { cx, cz } = worldToChunkCoord(x, z);
  const rm = chunk(cx, cz).road;
  // the owning chunk of a segment can be a neighbour: search this chunk and its 8 neighbours
  let best: number | null = null;
  for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
    const r = chunk(cx + dx, cz + dz).road;
    if (!r) continue;
    const ox = chunkOriginX(cx + dx), oz = chunkOriginZ(cz + dz);
    const P = r.positions, I = r.indices;
    for (let t = 0; t < I.length; t += 3) {
      const ax = P[I[t] * 3] + ox, az = P[I[t] * 3 + 2] + oz, bx = P[I[t + 1] * 3] + ox, bz = P[I[t + 1] * 3 + 2] + oz, qx = P[I[t + 2] * 3] + ox, qz = P[I[t + 2] * 3 + 2] + oz;
      const det = (bz - qz) * (ax - qx) + (qx - bx) * (az - qz);
      if (Math.abs(det) < 1e-9) continue;
      const l1 = ((bz - qz) * (x - qx) + (qx - bx) * (z - qz)) / det;
      const l2 = ((qz - az) * (x - qx) + (ax - qx) * (z - qz)) / det;
      const l3 = 1 - l1 - l2;
      if (l1 < -1e-6 || l2 < -1e-6 || l3 < -1e-6) continue;
      const y = l1 * P[I[t] * 3 + 1] + l2 * P[I[t + 1] * 3 + 1] + l3 * P[I[t + 2] * 3 + 1];
      if (best === null || y > best) best = y;
    }
  }
  void rm;
  return best;
}

const stats: Record<string, { n: number; sink: number; float: number; bad: number; miss: number }> = {};
const errs: number[] = [];
const badList: string[] = [];
for (const r of g.roads.roads) {
  const st = (stats[r.kind] ??= { n: 0, sink: 0, float: 0, bad: 0, miss: 0 });
  for (let i = 2; i < r.xs.length - 2; i += 5) {
    let nearBridge = false;
    for (let k = -6; k <= 6; k++) if (r.bridgeOf[Math.max(0, Math.min(r.xs.length - 1, i + k))] >= 0) nearBridge = true;
    if (nearBridge) continue; // bridge decks have their own colliders (BridgePhysics)
    for (const u of [-r.halfWidth, -r.halfWidth * 0.5, 0, r.halfWidth * 0.5, r.halfWidth]) {
      const x = r.xs[i] + r.nx[i] * u, z = r.zs[i] + r.nz[i] * u;
      const rh = ribbon(x, z);
      if (rh === null) { st.miss++; continue; }
      const [lo, hi] = collider(x, z);
      const sink = hi - rh; // collider above visible surface
      const flt = rh - lo; // visible surface above collider
      st.n++;
      st.sink = Math.max(st.sink, sink);
      st.float = Math.max(st.float, flt);
      errs.push(Math.max(sink, flt));
      if (sink > 0.02 || flt > 0.08) { st.bad++; if (Math.max(sink, flt) > 0.5) badList.push(`${r.name} (${x.toFixed(0)}, ${z.toFixed(0)}) u=${u.toFixed(1)} sink ${sink.toFixed(3)} float ${flt.toFixed(3)}`); }
    }
  }
}
errs.sort((a, b) => a - b);
console.log('grid step', step.toFixed(2), 'm');
for (const [k, v] of Object.entries(stats)) console.log(k.padEnd(10), 'samples', v.n, 'worst sink', v.sink.toFixed(3), 'worst float', v.float.toFixed(3), 'out of tolerance', v.bad, 'no ribbon', v.miss);
console.log('error p50', errs[errs.length >> 1].toFixed(3), 'p95', errs[Math.floor(errs.length * 0.95)].toFixed(3), 'p99', errs[Math.floor(errs.length * 0.99)].toFixed(3), 'max', errs[errs.length - 1].toFixed(3));
console.log(badList.join('\n'));
