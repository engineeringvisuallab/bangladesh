// Dumps a top-down plan (terrain + water + roads) for inspection: npx tsx scripts/plan-dump.ts out.json
import { writeFileSync } from 'node:fs';
import { TerrainGenerator } from '../src/terrain/TerrainGenerator';
import { Config } from '../src/core/Config';

const g = new TerrainGenerator(Config.world.seed);
const N = 250; // 40 m per cell
const S = Config.world.size;
const h: number[] = [];
const w: number[] = [];
const sc = g.makeSample();
for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
  const x = -S / 2 + ((i + 0.5) / N) * S;
  const z = -S / 2 + ((j + 0.5) / N) * S;
  g.sampleNatural(x, z, sc);
  h.push(Math.round(sc.h));
  w.push(Number.isNaN(sc.water) || sc.h > sc.water ? 0 : 1);
}
const roads = g.roads.roads.map((r) => ({ name: r.name, kind: r.kind, pts: Array.from(r.xs, (x, i) => [Math.round(x), Math.round(r.zs[i])]), br: Array.from(r.bridgeOf) }));
writeFileSync(process.argv[2] ?? '/home/claude/out/plan.json', JSON.stringify({ N, S, h, w, roads, sites: g.sites, bridges: g.roads.bridges.map((b) => [b.centerX, b.centerZ]) }));
console.log('sites', g.sites);
