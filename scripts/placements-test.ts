// Headless test of the building placement table (src/buildings/Placements.ts): every model of the registry has exactly one spot
// (the police station has its own prototype), spots are on land, clear of main roads / railway / other sites / each other, and
// vegetation + local streets keep out of them.
// npx tsx scripts/placements-test.ts
import { readFileSync } from 'node:fs';
import { Config } from '../src/core/Config';
import { TerrainGenerator } from '../src/terrain/TerrainGenerator';
import { BUILDING_PLACEMENTS, placementContains, placementKeepout } from '../src/buildings/Placements';
import { libraryKeepout } from '../src/library/LibrarySite';
import { mallKeepout } from '../src/mall/MallSite';
import { evlabKeepout } from '../src/evlab/EVLabSite';
import { protoKeepout } from '../src/buildings/ProtoSite';
import { infraKeepout } from '../src/engineering/InfraSites';
import { airportKeepout } from '../src/airport/AirportSite';
import { agroKeepout } from '../src/agro/AgroSite';
import { getWorldZoneAt } from '../src/city/WorldZones';

let fails = 0;
const ok = (c: boolean, m: string) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) fails++; };

// 1. every registry model has exactly one placement (police_station = ProtoSite)
const reg = readFileSync('src/buildings/models/registry.ts', 'utf8');
const ids = [...reg.matchAll(/\{ id: '([^']+)'/g)].map((m) => m[1]);
const missing = ids.filter((id) => id !== 'police_station' && !BUILDING_PLACEMENTS.some((p) => p.id === id));
const extra = BUILDING_PLACEMENTS.filter((p) => !ids.includes(p.id)).map((p) => p.id);
const dup = BUILDING_PLACEMENTS.filter((p, i) => BUILDING_PLACEMENTS.findIndex((q) => q.id === p.id) !== i).map((p) => p.id);
ok(missing.length === 0, `every registry model (${ids.length}) is placed (missing: ${missing.join(', ') || 'none'})`);
ok(extra.length === 0 && dup.length === 0, `no unknown or duplicate ids (${[...extra, ...dup].join(', ') || 'none'})`);

const gen = new TerrainGenerator(Config.world.seed);
const s = gen.makeSample();
let bad = 0;
for (const p of BUILDING_PLACEMENTS) {
  const c = Math.cos(p.yaw), sn = Math.sin(p.yaw);
  let why = '';
  let mn = 1e9, mx = -1e9;
  const nx = Math.ceil(p.W / 3), nz = Math.ceil(p.D / 3);
  for (let i = 0; i <= nx && !why; i++) for (let j = 0; j <= nz && !why; j++) {
    const lx = -p.W / 2 + (i / nx) * p.W, lz = -p.D / 2 + (j / nz) * p.D;
    const x = p.x + lx * c + lz * sn, z = p.z - lx * sn + lz * c;
    if (gen.roads.surfaceAt(x, z) !== 0) why = 'road';
    else if (gen.railForm.inCorridor(x, z, 6)) why = 'rail';
    else if (libraryKeepout(x, z) || mallKeepout(x, z) || evlabKeepout(x, z) || protoKeepout(x, z) || infraKeepout(x, z) || airportKeepout(x, z) || agroKeepout(x, z)) why = 'other site';
    else {
      gen.sample(x, z, s);
      if (s.water === s.water && s.h < s.water + 0.3) why = 'water';
      mn = Math.min(mn, s.h); mx = Math.max(mx, s.h);
    }
  }
  if (!why && mx - mn > 14.5) why = `slope ${(mx - mn).toFixed(1)} m`;
  const hit = getWorldZoneAt(p.x, p.z);
  if (!why && hit.id !== p.zone) why = `zone ${hit.id} != ${p.zone}`;
  if (why) { bad++; console.log('  bad', p.id, p.x, p.z, why); }
}
ok(bad === 0, `all ${BUILDING_PLACEMENTS.length} spots: land, no main road / rail / site, right zone, slope ok`);

// 2. no two buildings overlap (axis-aligned bounding circles are a safe test)
let overlaps = 0;
for (let i = 0; i < BUILDING_PLACEMENTS.length; i++) for (let j = i + 1; j < BUILDING_PLACEMENTS.length; j++) {
  const a = BUILDING_PLACEMENTS[i], b = BUILDING_PLACEMENTS[j];
  if (Math.hypot(a.x - b.x, a.z - b.z) < Math.hypot(a.W, a.D) / 2 + Math.hypot(b.W, b.D) / 2 - 1 && placementContains(a.x, a.z, 0) && placementContains(b.x, b.z, 0)) {
    // circles touch: check the real rectangles via corners
    const c = Math.cos(a.yaw), sn = Math.sin(a.yaw);
    for (const [fx, fz] of [[-1, -1], [1, -1], [-1, 1], [1, 1], [0, 0]]) {
      const x = a.x + (fx * a.W) / 2 * c + (fz * a.D) / 2 * sn, z = a.z - (fx * a.W) / 2 * sn + (fz * a.D) / 2 * c;
      const cb = Math.cos(b.yaw), sb = Math.sin(b.yaw);
      const dx = x - b.x, dz = z - b.z;
      const lx = dx * cb - dz * sb, lz = dx * sb + dz * cb;
      if (Math.abs(lx) < b.W / 2 - 0.5 && Math.abs(lz) < b.D / 2 - 0.5) { overlaps++; console.log('  overlap', a.id, b.id); break; }
    }
  }
}
ok(overlaps === 0, 'no two building footprints overlap');

// 3. helpers
const p0 = BUILDING_PLACEMENTS[0];
ok(placementContains(p0.x, p0.z) && !placementContains(p0.x + 5000, p0.z), 'placementContains(): building yes, far away no');
ok(placementKeepout(p0.x + p0.W / 2 + 6, p0.z) || placementKeepout(p0.x, p0.z + p0.D / 2 + 6), 'local streets keep out around a building');

console.log(fails === 0 ? '\nALL OK' : `\n${fails} FAILED`);
process.exit(fails === 0 ? 0 : 1);
