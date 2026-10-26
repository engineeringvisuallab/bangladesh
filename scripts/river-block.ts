// Diagnostic: where do roads / embankments bury river water?  npx tsx scripts/river-block.ts
import { TerrainGenerator } from '../src/terrain/TerrainGenerator';
import { Config } from '../src/core/Config';
const g = new TerrainGenerator(Config.world.seed);
const R = g.roads;
const a = g.makeSample(); const b = g.makeSample();
let blocked = 0, total = 0;
const hits: Record<string, number> = {};
const seen = new Set<string>();
for (const r of R.roads) {
  for (let i = 0; i < r.xs.length; i += 2) {
    for (let du = -60; du <= 60; du += 6) for (let dv = -60; dv <= 60; dv += 6) {
      const x = r.xs[i] + r.nx[i] * du + (r.nz[i]) * dv * -1 ;
      const z = r.zs[i] + r.nz[i] * du + (-r.nx[i]) * dv * -1;
      const k = Math.round(x/6)+','+Math.round(z/6);
      if (seen.has(k)) continue; seen.add(k);
      g.sampleNatural(x, z, a);
      if (Number.isNaN(a.water) || a.h > a.water - 0.2 || a.h < 2) continue; // not river bed
      total++;
      g.sample(x, z, b);
      if (b.h > a.water + 0.2) { blocked++; hits[r.name] = (hits[r.name] ?? 0) + 1; }
    }
  }
}
console.log('river cells near roads', total, 'buried', blocked, (100*blocked/Math.max(1,total)).toFixed(1)+'%');
console.log(Object.entries(hits).sort((p,q)=>q[1]-p[1]).slice(0,15));
console.log('culverts', R.culverts.length, 'bridges', R.bridges.length, 'junctions', R.junctions.length, 'roads', R.roads.length);
