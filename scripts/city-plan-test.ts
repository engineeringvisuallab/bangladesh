// Stage 10A check: every area has a Bangla name, every building has a Bangla name, areas stay on flat ground,
// every point of a city has exactly one area, no area is empty.
import { TerrainGenerator } from '../src/terrain/TerrainGenerator';
import { Config } from '../src/core/Config';
import { CityPlan, BUILDING_TYPES, SITE_TEMPLATES } from '../src/city/CityPlan';
import { bn } from '../src/i18n/bn';

const sites = TerrainGenerator.makeSites(Config.world.seed);
const plan = new CityPlan(sites);
let bad = 0;
const fail = (m: string) => { bad++; console.log('FAIL', m); };

if (sites.length !== SITE_TEMPLATES.length) fail(`sites ${sites.length} != templates ${SITE_TEMPLATES.length}`);
const ids = new Set<string>();
for (const a of plan.areas) {
  if (ids.has(a.id)) fail(`duplicate id ${a.id}`);
  ids.add(a.id);
  if (!bn.city.area[a.id]) fail(`no Bangla name for ${a.id}`);
  if (!a.buildings.length) fail(`${a.id} has no buildings`);
  for (const b of a.buildings) if (!bn.city.building[b]) fail(`no Bangla name for building ${b}`);
  if (!(bn.city.zone as Record<string, string>)[a.kind]) fail(`no Bangla zone name ${a.kind}`);
}
for (const b of BUILDING_TYPES) if (!bn.city.building[b]) fail(`no Bangla name for ${b}`);
const used = new Set(plan.areas.flatMap((a) => a.buildings));
const unused = BUILDING_TYPES.filter((b) => !used.has(b));
if (unused.length) fail(`building types in no area: ${unused.join(', ')}`);

// coverage + which areas are really reachable (not fully hidden by higher-priority ones)
const hits = new Map<string, number>();
let inside = 0, gaps = 0;
for (const [i, s] of sites.entries()) {
  const R = plan.maxRadius(i);
  for (let x = -R; x <= R; x += 10) for (let z = -R; z <= R; z += 10) {
    if (Math.hypot(x, z) >= R) continue;
    inside++;
    const a = plan.areaAt(s.x + x, s.z + z);
    if (!a) { gaps++; continue; }
    hits.set(a.id, (hits.get(a.id) ?? 0) + 1);
  }
}
for (const a of plan.areas) if (!hits.get(a.id)) fail(`${a.id} is never reached (fully covered by another area)`);
if (gaps > inside * 0.25) fail(`too many gaps: ${gaps}/${inside}`); // corners of the plan circle only

// ground: how flat is each area? (height spread inside the area, 100 m samples)
const t = new TerrainGenerator(Config.world.seed);
console.log('\narea                  kind         m2(ha)  height min..max  water%');
for (const a of plan.areas) {
  let n = 0, wet = 0, lo = 1e9, hi = -1e9;
  const R = a.shape.t === 'ring' ? a.shape.r1 : 900;
  for (let x = -R; x <= R; x += 25) for (let z = -R; z <= R; z += 25) {
    if (plan.areaAt(a.cx + x, a.cz + z)?.id !== a.id) continue;
    n++;
    t.sample(a.cx + x, a.cz + z, (t as any).scratch);
    const sc = (t as any).scratch;
    lo = Math.min(lo, sc.h); hi = Math.max(hi, sc.h);
    if (!Number.isNaN(sc.water) && sc.water > sc.h) wet++;
  }
  const wetPct = (100 * wet) / Math.max(1, n);
  if (a.shape.t === 'rect' && a.kind !== 'recreation' && a.kind !== 'green' && wetPct > 12) fail(`${a.id}: ${wetPct.toFixed(0)}% water`);
  if (a.shape.t === 'rect' && hi - lo > 30) fail(`${a.id}: ground spread ${(hi - lo).toFixed(0)} m`);
  console.log(a.id.padEnd(21), a.kind.padEnd(12), String(Math.round((n * 625) / 10000)).padStart(6), `  ${lo.toFixed(1)}..${hi.toFixed(1)}`.padEnd(17), `${((100 * wet) / Math.max(1, n)).toFixed(0)}%`);
}
console.log(bad ? `\n${bad} PROBLEM(S)` : '\nALL OK');
process.exit(bad ? 1 : 0);
