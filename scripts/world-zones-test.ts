// Stage 11A check: every point of the 10 x 10 km map has exactly one named zone, every zone / kind / facility area has a Bangla name,
// every zone is reachable, the sea zone matches the real sea, airport and seaport sit on usable ground.
import { TerrainGenerator } from '../src/terrain/TerrainGenerator';
import { Config } from '../src/core/Config';
import { AIRPORT, SEAPORT, WORLD_ZONES, WORLD_ZONE_COLOR, WORLD_ZONE_IDS, getWorldZoneAt, rasterizeWorldZones } from '../src/city/WorldZones';
import { bn } from '../src/i18n/bn';

let bad = 0;
const fail = (m: string) => { bad++; console.log('FAIL', m); };
const seen = new Set<string>();
for (const z of WORLD_ZONES) { if (seen.has(z.id)) fail(`duplicate id ${z.id}`); seen.add(z.id); }
for (const id of WORLD_ZONE_IDS) if (!bn.worldZones.names[id]) fail(`no Bangla name for zone ${id}`);
for (const k of Object.keys(WORLD_ZONE_COLOR)) if (!bn.worldZones.kind[k]) fail(`no Bangla name for kind ${k}`);
for (const f of [AIRPORT, SEAPORT]) for (const a of f.areas) if (!bn.worldZones.facility[a.id]) fail(`no Bangla name for ${a.id}`);

// coverage + reachability + area per kind (100 m cells)
const r = rasterizeWorldZones(100);
const count = new Map<string, number>();
for (const id of r.ids) count.set(WORLD_ZONE_IDS[id], (count.get(WORLD_ZONE_IDS[id]) ?? 0) + 1);
for (const id of WORLD_ZONE_IDS) if (!count.get(id)) fail(`zone ${id} is never reached (covered by other zones)`);
const byKind = new Map<string, number>();
r.ids.forEach((id) => byKind.set(r.kinds[id], (byKind.get(r.kinds[id]) ?? 0) + 1));
console.log('area per kind (km2):');
for (const [k, v] of [...byKind.entries()].sort((a, b) => b[1] - a[1])) console.log(`  ${k.padEnd(12)} ${(v / 100).toFixed(1).padStart(6)}  ${bn.worldZones.kind[k]}`);
for (const k of ['residential', 'industrial', 'airport', 'seaport', 'commercial', 'farmland', 'forest', 'mountain', 'sea', 'coast', 'wetland', 'logistics']) if (!byKind.get(k)) fail(`no ${k} area on the map`);
const tiny = [...count.entries()].filter(([, v]) => v < 3).map(([k]) => k);
if (tiny.length) console.log('very small zones (< 0.03 km2):', tiny.join(', '));

// terrain checks
const g = new TerrainGenerator(Config.world.seed);
const sc = g.makeSample();
let seaMismatch = 0, seaTotal = 0;
for (let x = -4950; x <= 4950; x += 150) for (let z = 1500; z <= 4950; z += 50) {
  g.sampleNatural(x, z, sc);
  const sea = !Number.isNaN(sc.water) && sc.h <= sc.water && sc.water === Config.terrain.seaLevel;
  if (sea) {
    const zn = getWorldZoneAt(x, z);
    if (zn.id.startsWith('island')) continue; // the island's own zones (hills + beach) include some shallow water around it
    seaTotal++;
    if (zn.kind !== 'sea' && zn.kind !== 'seaport' && zn.kind !== 'airport') seaMismatch++; // the sea airport stands in the sea
  }
}
console.log(`\nsea cells outside the sea zone: ${seaMismatch}/${seaTotal}`);
if (seaMismatch > seaTotal * 0.06) fail('sea zone does not follow the real coast');

function stat(x0: number, z0: number, x1: number, z1: number) {
  let n = 0, wet = 0, lo = 1e9, hi = -1e9, sum = 0;
  for (let x = x0; x <= x1; x += 50) for (let z = z0; z <= z1; z += 50) {
    g.sampleNatural(x, z, sc); n++; sum += sc.h; lo = Math.min(lo, sc.h); hi = Math.max(hi, sc.h);
    if (!Number.isNaN(sc.water) && sc.h <= sc.water + 0.3) wet++;
  }
  return { wet: Math.round((wet / n) * 100), lo: Math.round(lo), hi: Math.round(hi), mean: Math.round(sum / n) };
}
const ap = stat(AIRPORT.x0, AIRPORT.z0, AIRPORT.x1, AIRPORT.z1);
console.log('airport ground:', ap, '(a later stage grades it flat)');
if (ap.wet > 6) fail(`airport is ${ap.wet}% water`);
const rw = AIRPORT.areas[0];
if (rw.x1 - rw.x0 < 1300) fail('runway shorter than 1.3 km (the airport module has a 1.4 km runway)');
const land = stat(SEAPORT.x0, SEAPORT.z0, SEAPORT.x1, 2800);
const basin = stat(SEAPORT.x0, 2900, SEAPORT.x1, SEAPORT.z1);
console.log('seaport land:', land, ' harbour basin:', basin);
if (land.wet > 5) fail('seaport land is wet');
if (basin.wet < 85) fail(`harbour basin only ${basin.wet}% water`);

// sample lookups
for (const [n, x, z] of [['centre', 0, 0], ['runway', 2000, -3780], ['container', 1900, 2750], ['open sea', 0, 4500], ['west mountain', -4500, -1800]] as const) {
  const h = getWorldZoneAt(x, z);
  console.log(`${n.padEnd(14)} -> ${(h.area ? bn.worldZones.facility[h.area.id] + ' / ' : '') + bn.worldZones.names[h.id]} [${h.kind}]`);
}
console.log(bad ? `\n${bad} FAILURES` : '\nALL OK');
process.exit(bad ? 1 : 0);
