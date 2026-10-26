// Stage 12: the railway mesh builds for every chunk, is finite, sane in size, and sits on the designed track.
import { TerrainGenerator } from '../src/terrain/TerrainGenerator';
import { Config } from '../src/core/Config';
import { buildRailMesh } from '../src/rail/RailMesh';
import { chunkOriginX, chunkOriginZ, CHUNKS_PER_SIDE, worldToChunkCoord } from '../src/world/WorldGrid';
import { RAIL_DESIGN as D } from '../src/rail/RailPlan';
let bad = 0;
const fail = (m: string) => { bad++; console.log('FAIL', m); };
const gen = new TerrainGenerator(Config.world.seed);
const sc = gen.makeSample();
const ground = (x: number, z: number) => { gen.sample(x, z, sc); return sc.h; };
let chunks = 0, verts = [0, 0, 0], tris = 0, maxV = 0, t0 = Date.now();
for (let lod = 0; lod <= 3; lod++) {
  for (let cz = 0; cz < CHUNKS_PER_SIDE; cz++) for (let cx = 0; cx < CHUNKS_PER_SIDE; cx++) {
    const m = buildRailMesh(gen.rail, cx, cz, lod, ground);
    if (lod === 3 && m) fail(`LOD3 chunk ${cx},${cz} has a railway mesh`);
    if (!m) continue;
    if (lod === 0) chunks++;
    const nv = m.positions.length / 3;
    if (lod < 3) verts[lod] += nv;
    maxV = Math.max(maxV, nv);
    tris += m.indices.length / 3;
    for (let i = 0; i < m.positions.length; i++) if (!Number.isFinite(m.positions[i]) || !Number.isFinite(m.normals[i]) || !Number.isFinite(m.colors[i])) { fail(`NaN in chunk ${cx},${cz} lod ${lod}`); break; }
    if (m.positions.length !== m.normals.length || m.positions.length !== m.colors.length) fail('attribute length mismatch');
    for (let i = 0; i < m.indices.length; i++) if (m.indices[i] >= nv) { fail('index out of range'); break; }
    // chunk-local coordinates stay near the chunk (500 m + the 130 m a platform / viaduct can reach over the edge)
    for (let i = 0; i < m.positions.length; i += 3) if (m.positions[i] < -200 || m.positions[i] > Config.world.chunkSize + 200 || m.positions[i + 2] < -200 || m.positions[i + 2] > Config.world.chunkSize + 200) { fail(`vertex far outside chunk ${cx},${cz}`); break; }
  }
}
console.log(`${chunks} chunks carry railway; vertices LOD0/1/2: ${verts.join(' / ')}; largest chunk mesh ${maxV} vertices; ${(Date.now() - t0)} ms`);
if (maxV > 400000) fail('a chunk mesh is far too big');
// the ballast top of a chunk-local mesh must lie on the designed height: probe one straight ground interval
const e = gen.rail.edges.find((q) => q.id === 'east-2')!;
const i = e.xs.findIndex((_, k) => k > 40 && e.segments.find((g) => e.cum[k] >= g.s0 && e.cum[k] <= g.s1)!.kind === 'ground');
const c = { cx: Math.floor((e.xs[i] + Config.world.size / 2) / Config.world.chunkSize), cz: Math.floor((e.zs[i] + Config.world.size / 2) / Config.world.chunkSize) };
const m = buildRailMesh(gen.rail, c.cx, c.cz, 0, ground)!;
let near = false;
for (let k = 0; k < m.positions.length; k += 3) {
  const x = m.positions[k] + chunkOriginX(c.cx), z = m.positions[k + 2] + chunkOriginZ(c.cz);
  if (Math.hypot(x - e.xs[i], z - e.zs[i]) < 1.5 && Math.abs(m.positions[k + 1] - e.design[i]) < 0.45) { near = true; break; }
}
if (!near) fail('no mesh vertex at the designed height near the track');
// STEP 4: every switch has blades (tapered rail tops 0.22 m above the ballast) and a frog (0.21 m); every diamond has four crossing noses (0.21 m)
{
  const D2 = D;
  const meshAt = (x: number, z: number, lod: number) => {
    const c = worldToChunkCoord(x, z);
    return { m: buildRailMesh(gen.rail, c.cx, c.cz, lod, ground), c };
  };
  const has = (x: number, z: number, y: number, r: number, tol: number, lod = 0): boolean => {
    const { m, c } = meshAt(x, z, lod);
    if (!m) return false;
    for (let k = 0; k < m.positions.length; k += 3) {
      if (Math.hypot(m.positions[k] + chunkOriginX(c.cx) - x, m.positions[k + 2] + chunkOriginZ(c.cz) - z) < r && Math.abs(m.positions[k + 1] - y) < tol) return true;
    }
    return false;
  };
  let sw = 0, dm = 0;
  for (const s of gen.rail.switches) {
    const sp = (a: Float64Array, q: number) => [a[Math.floor(q) * 2], a[Math.floor(q) * 2 + 1]];
    const fa = sp(s.stock, s.frogS), fb = sp(s.div, s.frogS);
    if (!has((fa[0] + fb[0]) / 2, (fa[1] + fb[1]) / 2, s.level + 0.21, 1.6, 0.012)) fail(`switch ${s.id}: no frog in the mesh`);
    // a blade rail: on the diverging route 2 m from the toe, offset half a gauge
    const b = sp(s.div, 2), b2 = sp(s.div, 3);
    let tx = b2[0] - b[0], tz = b2[1] - b[1];
    const l = Math.hypot(tx, tz) || 1;
    tx /= l; tz /= l;
    let found = false;
    for (const rs of [-1, 1]) if (has(b[0] + -tz * rs * D2.gauge / 2, b[1] + tx * rs * D2.gauge / 2, s.level + 0.22, 0.5, 0.012)) found = true;
    if (!found) fail(`switch ${s.id}: no switch blade in the mesh`);
    sw++;
  }
  for (const d of gen.rail.diamonds) {
    for (let k = 0; k < 4; k++) if (!has(d.corners[k * 2], d.corners[k * 2 + 1], d.level + 0.21, 0.9, 0.012)) { fail(`diamond ${d.id}: crossing nose ${k} missing in the mesh`); break; }
    dm++;
  }
  // the details are LOD0 only: the same chunk at LOD1 must be smaller
  const probe = gen.rail.diamonds[0] ?? gen.rail.switches[0];
  if (probe) {
    const c = worldToChunkCoord((probe as any).x, (probe as any).z);
    const m0 = buildRailMesh(gen.rail, c.cx, c.cz, 0, ground)!, m1 = buildRailMesh(gen.rail, c.cx, c.cz, 1, ground)!;
    if (m1.positions.length >= m0.positions.length) fail('LOD1 mesh is not smaller than LOD0 around a switch / diamond');
  }
  console.log(`switch / diamond mesh: ${sw} switches and ${dm} diamonds found in the LOD0 meshes`);
}
console.log(bad ? `${bad} FAILURES` : 'RAIL MESH OK');
process.exit(bad ? 1 : 0);
