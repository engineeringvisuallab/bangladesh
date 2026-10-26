import { Config } from '../src/core/Config';
import { TerrainGenerator } from '../src/terrain/TerrainGenerator';
import { EVLAB_PLOT, EVLAB_ROAD, EVLAB_SCALE } from '../src/evlab/EVLabSite';
import { MALL_PLOT } from '../src/mall/MallSite';
const gen = new TerrainGenerator(Config.world.seed);
const e = gen.evlab;
console.log('plot', EVLAB_PLOT, 'size', EVLAB_PLOT.x1 - EVLAB_PLOT.x0, 'x', EVLAB_PLOT.z1 - EVLAB_PLOT.z0, 'campus scale', EVLAB_SCALE, 'floorY', e.floorY.toFixed(2), 'mall floorY', gen.mall.floorY.toFixed(2));
let fails = 0; const ok = (c: boolean, m: string) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) fails++; };
// 1 flat under the whole fenced plot
let mn = 1e9, mx = -1e9;
for (let x = EVLAB_PLOT.x0; x <= EVLAB_PLOT.x1; x += 4) for (let z = EVLAB_PLOT.z0; z <= EVLAB_PLOT.z1; z += 4) { const h = gen.heightAt(x, z); mn = Math.min(mn, h); mx = Math.max(mx, h); }
ok(mx - mn < 0.001, `terrain under the whole plot is flat (range ${(mx - mn).toFixed(4)} m)`);
// 2 no main road / rail / bridge inside the plot + 8 m; no local road
let roadHits = 0, localHits = 0;
for (let x = EVLAB_PLOT.x0 - 8; x <= EVLAB_PLOT.x1 + 8; x += 3) for (let z = EVLAB_PLOT.z0 - 8; z <= EVLAB_PLOT.z1 + 8; z += 3) if (gen.roads.surfaceAt(x, z) !== 0) roadHits++;
ok(roadHits === 0, `no road surface on the plot + 8 m (${roadHits} hits)`);
for (const r of gen.roads.roads) if (r.kind === 'local') for (let i = 0; i < r.xs.length; i++) if (r.xs[i] > EVLAB_PLOT.x0 - 25 && r.xs[i] < EVLAB_PLOT.x1 + 25 && r.zs[i] > EVLAB_PLOT.z0 - 25 && r.zs[i] < EVLAB_PLOT.z1 + 25) localHits++;
ok(localHits === 0, `no local street within 25 m of the fence (${localHits})`);
// 3 gate -> F6
console.log('gate z=', e.gateZ, 'access road ends z=', EVLAB_ROAD.endZ);
ok(gen.roads.surfaceAt(e.x, 0) !== 0 && gen.roads.surfaceAt(e.x, e.gateZ + 4) === 0, 'F6 runs at z~0; the strip between the gate and F6 is free ground for the access road');
// 4 EVLab plot and mall plot are on opposite sides of the road and do not overlap
ok(EVLAB_PLOT.x1 < MALL_PLOT.x0 && e.x < gen.mall.x, 'EVLab is west, the mall is east (F4 runs between them)');
// 5 campus (600 m x scale) fits inside the plot
ok(600 * EVLAB_SCALE <= Math.min(EVLAB_PLOT.x1 - EVLAB_PLOT.x0, EVLAB_PLOT.z1 - EVLAB_PLOT.z0), 'the scaled 600 m campus fits inside the plot');
console.log(fails ? 'FAILED ' + fails : 'ALL OK');
process.exit(fails ? 1 : 0);
