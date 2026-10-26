// Headless prototype-building (police station) test: flat pad on the field south of F6 / west of F5, no roads / trees / rocks / local streets on it,
// clear of the railway, not in water, close to the spawn, the footpath reaches the F6 road.
// npx tsx scripts/proto-building-test.ts
import { Config } from '../src/core/Config';
import { TerrainGenerator } from '../src/terrain/TerrainGenerator';
import { PROTO_PLOT, PROTO_POS, PROTO_PATH, PROTO_SIZE, protoKeepout } from '../src/buildings/ProtoSite';
import { libraryKeepout } from '../src/library/LibrarySite';
import { mallKeepout } from '../src/mall/MallSite';
import { evlabKeepout } from '../src/evlab/EVLabSite';
import { getWorldZoneAt } from '../src/city/WorldZones';

let fails = 0;
const ok = (c: boolean, m: string) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) fails++; };

const gen = new TerrainGenerator(Config.world.seed);
const S = gen.protoBuilding;
const P = PROTO_PLOT;
const s = gen.makeSample();
console.log('prototype building at', S.x, S.z, 'floorY', S.floorY.toFixed(2));

// 1. flat pad under the whole plot
let mn = 1e9, mx = -1e9, cnt = 0, wet = 0;
for (let x = P.x0; x <= P.x1; x += 2) for (let z = P.z0; z <= P.z1; z += 2) {
  cnt++;
  gen.sample(x, z, s);
  mn = Math.min(mn, s.h); mx = Math.max(mx, s.h);
  if (s.water === s.water && s.h < s.water + 0.2) wet++;
}
ok(mx - mn < 0.001, `terrain under the whole plot (${cnt} samples) is perfectly flat (range ${(mx - mn).toFixed(4)} m)`);
ok(Math.abs(mx - (S.floorY - 0.03)) < 0.001, 'pad is 3 cm below the floor');
ok(wet === 0, 'no water on the plot');
ok(Math.abs(S.floorY - gen.heightAt(S.x, S.z)) < 0.2, 'floor level is close to the natural ground (little cut / fill)');

// 2. the compound with an 8 m apron lies inside the plot
const inside = (x: number, z: number) => x >= P.x0 && x <= P.x1 && z >= P.z0 && z <= P.z1;
ok(inside(S.x - PROTO_SIZE.W / 2 - 8, S.z - PROTO_SIZE.D / 2 - 8) && inside(S.x + PROTO_SIZE.W / 2 + 8, S.z + PROTO_SIZE.D / 2 + 8), 'the compound plus an 8 m apron lies inside the plot');

// 3. gentle blend, no road on the plot, roads keep their own height
let maxSlope = 0;
for (let x = P.x0 - 20; x <= P.x1 + 20; x += 1) for (let z = P.z0 - 20; z <= P.z1 + 20; z += 1) {
  if (gen.roads.surfaceAt(x, z) !== 0 || gen.roads.surfaceAt(x + 1, z + 1) !== 0) continue;
  const h = gen.heightAt(x, z);
  maxSlope = Math.max(maxSlope, Math.abs(gen.heightAt(x + 1, z) - h), Math.abs(gen.heightAt(x, z + 1) - h));
}
ok(maxSlope < 0.25, `no steep step around the pad (max ${maxSlope.toFixed(3)} m per m)`);
let roadHits = 0;
for (let x = P.x0 - 2; x <= P.x1 + 2; x += 2) for (let z = P.z0 - 2; z <= P.z1 + 2; z += 2) if (gen.roads.surfaceAt(x, z) !== 0) roadHits++;
ok(roadHits === 0, `no road surface on the plot (${roadHits} hits)`);
let roadPts = 0;
for (const r of gen.roads.roads) for (let i = 0; i < r.xs.length; i++) if (S.near(r.xs[i], r.zs[i]) && gen.roads.surfaceAt(r.xs[i], r.zs[i]) !== 0) {
  if (Math.abs(gen.heightAt(r.xs[i], r.zs[i]) - r.ys[i]) > 0.02) roadPts++;
}
ok(roadPts === 0, 'roads keep their own height where they meet the pad skirt');

// 4. clear of rail, other sites; position
let rail = 0;
for (let x = P.x0 - 12; x <= P.x1 + 12; x += 4) for (let z = P.z0 - 12; z <= P.z1 + 12; z += 4) if (gen.railForm.inCorridor(x, z, 6)) rail++;
ok(rail === 0, 'clear of the railway corridor');
ok(!libraryKeepout(S.x, S.z) && !mallKeepout(S.x, S.z) && !evlabKeepout(S.x, S.z), 'does not overlap the library / mall / EVLab plots');
ok(Math.hypot(PROTO_POS.x, PROTO_POS.z) < 120, `close to the spawn crossing (${Math.hypot(PROTO_POS.x, PROTO_POS.z).toFixed(0)} m)`);
ok(S.contains(S.x, S.z) && S.contains(P.x0 + 1, P.z0 + 1) && !S.contains(P.x1 + 40, P.z1 + 40), 'contains(): plot yes, far away no (trees / rocks / grass keep out)');
ok(protoKeepout(S.x, S.z) && !protoKeepout(S.x + 300, S.z), 'local streets keep out of the plot');
const zone = getWorldZoneAt(S.x, S.z) as any;
console.log('zone:', zone?.id ?? zone?.zone?.id ?? JSON.stringify(zone).slice(0, 60));

// 5. footpath reaches the F6 road
let nearRoad = false;
for (let dz = -4; dz <= 4; dz += 1) if (gen.roads.surfaceAt(PROTO_PATH.x, PROTO_PATH.z0 + dz) !== 0) nearRoad = true;
ok(nearRoad, 'the footpath ends at the road');

console.log(fails === 0 ? '\nALL OK' : `\n${fails} FAILED`);
process.exit(fails === 0 ? 0 : 1);
