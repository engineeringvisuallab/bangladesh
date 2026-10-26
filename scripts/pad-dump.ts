import { writeFileSync } from 'node:fs';
import { TerrainGenerator } from '../src/terrain/TerrainGenerator';
import { Config } from '../src/core/Config';
import { buildRoadMesh } from '../src/roads/RoadMesh';
import { worldToChunkCoord, chunkOriginX, chunkOriginZ } from '../src/world/WorldGrid';
const g = new TerrainGenerator(Config.world.seed);
const R = g.roads;
const want = process.argv.slice(2).map(Number);
const out: any[] = [];
for (const id of want) {
  const p = R.pads[id];
  const tris: number[][] = [];
  const cs = new Set<string>();
  for (let dx = -2; dx <= 2; dx++) for (let dz = -2; dz <= 2; dz++) {
    const { cx, cz } = worldToChunkCoord(p.x + dx * 250, p.z + dz * 250);
    const key = cx + ',' + cz;
    if (cs.has(key)) continue; cs.add(key);
    const m = buildRoadMesh(R, cx, cz, 1);
    if (!m) continue;
    const ox = chunkOriginX(cx), oz = chunkOriginZ(cz);
    for (let i = 0; i < m.indices.length; i += 3) {
      const t: number[] = [];
      for (let k = 0; k < 3; k++) { const v = m.indices[i + k]; t.push(m.positions[v * 3] + ox, m.positions[v * 3 + 2] + oz); }
      const v0 = m.indices[i];
      t.push(m.info[v0 * 4], m.info[v0 * 4 + 2]);
      tris.push(t);
    }
  }
  out.push({ id, x: p.x, z: p.z, kind: p.kind, tris });
}
writeFileSync('/tmp/pads.json', JSON.stringify(out));
