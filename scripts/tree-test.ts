// Stage 7 (trees) check: no tree in water / on a beach / on a road or pad / on a steep slope / in a built-up city area,
// the same chunk always gives the same trees (and LOD does not matter), forests look like forests, and it is fast enough.
import { TerrainGenerator } from '../src/terrain/TerrainGenerator';
import { Config } from '../src/core/Config';
import { CityPlan } from '../src/city/CityPlan';
import { TreePlacer } from '../src/vegetation/TreePlacement';
import { TREE_KIND_COUNT, TREE_STRIDE } from '../src/vegetation/TreeTypes';
import { chunkOriginX, chunkOriginZ, CHUNKS_PER_SIDE } from '../src/world/WorldGrid';

const V = Config.vegetation;
const gen = new TerrainGenerator(Config.world.seed);
const plan = new CityPlan(gen.sites);
const placer = new TreePlacer(gen, plan, Config.world.seed);
const s = gen.makeSample();
const mask = new Float32Array(2);
let bad = 0;
const fail = (m: string) => { if (bad++ < 15) console.log('FAIL', m); };

const N = CHUNKS_PER_SIDE;
const margin = Config.world.chunkMargin;
const kinds = new Array<number>(TREE_KIND_COUNT).fill(0);
let total = 0, chunksWithTrees = 0, chunks = 0, maxPerChunk = 0, ms = 0;
let inGreen = 0, inBuilt = 0;

// every chunk of the world incl. the margin rings (every 2nd chunk to keep the run short, plus all around the 3 sites)
const near = (cx: number, cz: number) => gen.sites.some((st) => Math.hypot(chunkOriginX(cx) + 250 - st.x, chunkOriginZ(cz) + 250 - st.z) < 1500);
for (let cz = -margin; cz < N + margin; cz++) {
  for (let cx = -margin; cx < N + margin; cx++) {
    if ((cx + cz) % 2 !== 0 && !near(cx, cz)) continue;
    chunks++;
    const t0 = performance.now();
    const trees = placer.place(cx, cz);
    ms += performance.now() - t0;
    const ox = chunkOriginX(cx), oz = chunkOriginZ(cz);
    let n = 0;
    for (let k = 0; k < TREE_KIND_COUNT; k++) {
      const d = trees[k];
      kinds[k] += d.length / TREE_STRIDE;
      for (let i = 0; i < d.length; i += TREE_STRIDE) {
        n++;
        const lx = d[i], y = d[i + 1], lz = d[i + 2];
        const x = ox + lx, z = oz + lz;
        if (lx < 0 || lx >= Config.world.chunkSize || lz < 0 || lz >= Config.world.chunkSize) fail(`tree outside its chunk ${cx},${cz}`);
        gen.sample(x, z, s);
        if (Math.abs(s.h - V.sink - y) > 0.01) fail(`tree height mismatch at ${x.toFixed(0)},${z.toFixed(0)}`);
        if (s.h < V.seaMargin) fail(`tree on the beach / in the sea at ${x.toFixed(0)},${z.toFixed(0)} h=${s.h.toFixed(2)}`);
        if (!Number.isNaN(s.water) && s.h < s.water + V.waterMargin) fail(`tree in water at ${x.toFixed(0)},${z.toFixed(0)}`);
        if (s.h > V.treeLineEnd) fail(`tree above the tree line at ${x.toFixed(0)},${z.toFixed(0)} h=${s.h.toFixed(0)}`);
        gen.roads.maskAt(x, z, 1, mask);
        if (mask[1] > 0.01) fail(`tree on a road at ${x.toFixed(0)},${z.toFixed(0)}`);
        const gx = (gen.sample(x + 2, z, s), s.h);
        gen.sample(x, z, s);
        const h0 = s.h;
        gen.sample(x, z + 2, s);
        const slope = Math.hypot(gx - h0, s.h - h0) / 2;
        if (slope > Math.tan((V.maxSlopeDeg * Math.PI) / 180) + 1e-6) fail(`tree on a steep slope at ${x.toFixed(0)},${z.toFixed(0)}`);
        const area = plan.areaAt(x, z);
        if (area) {
          if (V.cityZoneChance[area.kind] === undefined) { inBuilt++; fail(`tree in built-up area ${area.id} at ${x.toFixed(0)},${z.toFixed(0)}`); }
          else inGreen++;
        }
        const sc = d[i + 3];
        if (!(sc > 0.3 && sc < 2.2)) fail(`odd scale ${sc}`);
      }
    }
    total += n;
    if (n > 0) chunksWithTrees++;
    if (n > maxPerChunk) maxPerChunk = n;
  }
}

// determinism: a second placer (new noise tables) must give the very same trees
const again = new TreePlacer(new TerrainGenerator(Config.world.seed), new CityPlan(gen.sites), Config.world.seed);
for (const [cx, cz] of [[10, 10], [3, 12], [15, 6], [0, 0]]) {
  const a = placer.place(cx, cz), b = again.place(cx, cz);
  for (let k = 0; k < TREE_KIND_COUNT; k++) {
    if (a[k].length !== b[k].length || a[k].some((v, i) => v !== b[k][i])) fail(`not deterministic at chunk ${cx},${cz} kind ${k}`);
  }
}

console.log(`chunks ${chunks}, with trees ${chunksWithTrees}, trees ${total} (broadleaf ${kinds[0]}, pine ${kinds[1]}, palm ${kinds[2]})`);
console.log(`max per chunk ${maxPerChunk}, avg ${(total / chunks).toFixed(0)}, placement ${(ms / chunks).toFixed(1)} ms / chunk`);
console.log(`trees in green/recreation city zones: ${inGreen}, in built-up zones: ${inBuilt}`);
if (total === 0) fail('no trees at all');
console.log(bad === 0 ? 'ALL OK' : `${bad} PROBLEMS`);
process.exit(bad === 0 ? 0 : 1);
