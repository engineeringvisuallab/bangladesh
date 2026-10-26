// Engineering areas check: every area has a real, usable boundary.
//   * unique ids, Bangla names, group colours, inside the map, no two areas overlap;
//   * clear of the airport, seaport, library, EV lab, mall, agro site and of every railway station / line;
//   * the ground matches what the area is for: dry gentle land, shore (land + water), lake side, open sea, hill;
//   * getWorldZoneAt() returns the area for its centre and corners, and the rest of the map is unchanged;
//   * prints how much main road runs through each area (information: later stages route around or use it).
import { TerrainGenerator } from '../src/terrain/TerrainGenerator';
import { Config } from '../src/core/Config';
import { AIRPORT, SEAPORT, getWorldZoneAt } from '../src/city/WorldZones';
import { ENGINEERING_AREAS, ENGINEERING_GROUP_COLOR } from '../src/city/EngineeringZones';
import { RoadHash, buildFenceLayout } from '../src/city/EngineeringFence';
import { INFRA_PLACEMENTS } from '../src/engineering/InfraSites';
import { LIBRARY_PLOT } from '../src/library/LibrarySite';
import { EVLAB_PLOT, EVLAB_FENCE } from '../src/evlab/EVLabSite';
import { MALL_PLOT } from '../src/mall/MallSite';
import { AGRO_POS, AGRO_PAD } from '../src/agro/AgroSite';
import { STATIONS } from '../src/rail/RailPlan';
import { bn } from '../src/i18n/bn';

let bad = 0;
const fail = (m: string) => { bad++; console.log('FAIL', m); };
const half = Config.world.size / 2;
type R = { x0: number; z0: number; x1: number; z1: number };
const hit = (a: R, b: R, m = 0) => a.x0 < b.x1 + m && a.x1 > b.x0 - m && a.z0 < b.z1 + m && a.z1 > b.z0 - m;

const g = new TerrainGenerator(Config.world.seed);
const sc = g.makeSample(), s2 = g.makeSample();

// the thermal plant is built INSIDE its own engineering area (eng-thermal-power): it is not an obstacle for that area
const infra: [string, R][] = INFRA_PLACEMENTS.filter((p) => p.id !== 'thermal' && p.id !== 'grid' && p.id !== 'mech' && p.id !== 'dam' && p.id !== 'chem' && p.id !== 'auto' && p.id !== 'renew' && p.id !== 'vehicle' && p.id !== 'tech').map((p) => {
  const r = Math.hypot(Math.max(Math.abs(p.rect.x0), Math.abs(p.rect.x1)), Math.max(Math.abs(p.rect.z0), Math.abs(p.rect.z1))) + p.blend;
  return [p.id, { x0: p.x - r, x1: p.x + r, z0: p.z - r, z1: p.z + r }];
});
const fixed: [string, R][] = [
  ...infra,
  ['airport', AIRPORT], ['seaport', SEAPORT], ['library', LIBRARY_PLOT], ['evlab', EVLAB_PLOT], ['mall', MALL_PLOT],
  ['evlab-fence', { x0: Math.min(...EVLAB_FENCE.map((p) => p[0])), x1: Math.max(...EVLAB_FENCE.map((p) => p[0])), z0: Math.min(...EVLAB_FENCE.map((p) => p[1])), z1: Math.max(...EVLAB_FENCE.map((p) => p[1])) }],
  ['agro', { x0: AGRO_POS.x + AGRO_PAD.x0, x1: AGRO_POS.x + AGRO_PAD.x1, z0: AGRO_POS.z + AGRO_PAD.z0, z1: AGRO_POS.z + AGRO_PAD.z1 }],
];

console.log('area                 size (m)    ground  wet%  slope  relief  main road in (m)  rail clear (m)');
const ids = new Set<string>();
const hash = new RoadHash(g.roads.roads);
let fenceTotal = 0, solidTotal = 0, gapTotal = 0;
for (const a of ENGINEERING_AREAS) {
  if (ids.has(a.id)) fail(`duplicate id ${a.id}`);
  ids.add(a.id);
  if (!bn.worldZones.names[a.id]) fail(`no Bangla name for ${a.id}`);
  if (!ENGINEERING_GROUP_COLOR[a.group] || !bn.worldZones.engineeringGroup[a.group]) fail(`${a.id}: group ${a.group} has no colour / Bangla name`);
  if (a.branches.length === 0) fail(`${a.id}: no engineering branch listed`);
  if (!(a.x1 - a.x0 >= 300 && a.z1 - a.z0 >= 250)) fail(`${a.id}: too small`);
  if (a.x0 < -half || a.x1 > half || a.z0 < -half || a.z1 > half) fail(`${a.id}: outside the map`);
  for (const b of ENGINEERING_AREAS) if (b !== a && b.id > a.id && hit(a, b, 40)) fail(`${a.id} touches / overlaps ${b.id}`);
  for (const [n, r] of fixed) if (hit(a, r, 30)) fail(`${a.id} overlaps ${n}`);
  for (const s of STATIONS) {
    const d = Math.hypot(Math.max(a.x0 - s.x, s.x - a.x1, 0), Math.max(a.z0 - s.z, s.z - a.z1, 0));
    if (d < s.radius) fail(`${a.id} is inside the station area of ${s.id}`);
  }

  // terrain
  let n = 0, wet = 0, sl = 0, lo = 1e9, hi = -1e9;
  for (let z = a.z0 + 25; z < a.z1; z += 50) for (let x = a.x0 + 25; x < a.x1; x += 50) {
    g.sampleNatural(x, z, sc); g.sampleNatural(x + 10, z, s2); const hx = s2.h; g.sampleNatural(x, z + 10, s2);
    n++; sl += Math.hypot(hx - sc.h, s2.h - sc.h) / 10; lo = Math.min(lo, sc.h); hi = Math.max(hi, sc.h);
    if (!Number.isNaN(sc.water) && sc.h <= sc.water + 0.5) wet++;
  }
  const wetP = wet / n, slope = sl / n, relief = hi - lo;
  switch (a.ground) {
    case 'land': if (wetP > 0.03) fail(`${a.id}: ${(wetP * 100).toFixed(0)}% water`); if (slope > 0.16 || relief > 60) fail(`${a.id}: ground too rough (slope ${slope.toFixed(2)}, relief ${relief.toFixed(0)} m)`); break;
    case 'shore': if (wetP < 0.12 || wetP > 0.75) fail(`${a.id}: shore area needs 12-75% water, has ${(wetP * 100).toFixed(0)}%`); break;
    case 'lake': if (wetP < 0.05 || wetP > 0.5) fail(`${a.id}: lake-side area needs 5-50% water, has ${(wetP * 100).toFixed(0)}%`); break;
    case 'sea': if (wetP < 0.97) fail(`${a.id}: open-sea area is only ${(wetP * 100).toFixed(0)}% water`); break;
    case 'hill': if (wetP > 0.1) fail(`${a.id}: hill area is ${(wetP * 100).toFixed(0)}% water`); break;
  }

  // railway lines
  let railMin = 1e9;
  for (const e of g.rail.edges) for (let i = 0; i < e.xs.length; i++) {
    const dx = Math.max(a.x0 - e.xs[i], e.xs[i] - a.x1, 0), dz = Math.max(a.z0 - e.zs[i], e.zs[i] - a.z1, 0);
    railMin = Math.min(railMin, Math.hypot(dx, dz));
  }
  if (railMin < 20) fail(`${a.id}: a railway line runs through / touches it`);

  // main roads (information only)
  let roadM = 0;
  for (const r of g.roads.roads) for (let i = 0; i < r.xs.length; i++) if (r.xs[i] >= a.x0 && r.xs[i] < a.x1 && r.zs[i] >= a.z0 && r.zs[i] < a.z1) roadM += r.step;

  // boundary fence (prototype): closed all round, open only where a road crosses
  const lay = buildFenceLayout(a, hash);
  const covered = lay.visual.reduce((t, p) => t + Math.hypot(p.bx - p.ax, p.bz - p.az), 0);
  if (Math.abs(covered + lay.gapLength - lay.perimeter) > 4) fail(`${a.id}: fence + road gaps (${Math.round(covered + lay.gapLength)} m) do not add up to the perimeter (${lay.perimeter} m)`);
  if (lay.gapLength > lay.perimeter * 0.2) fail(`${a.id}: ${Math.round(lay.gapLength)} m of the fence is open for roads (more than 20%)`);
  if (lay.visual.length < 20 || lay.solid.length < 10) fail(`${a.id}: fence has too few pieces`);
  for (const r of g.roads.roads) for (let i = 0; i < r.xs.length; i++) {
    const x = r.xs[i], z = r.zs[i];
    const onEdge = (Math.abs(x - a.x0) < 1 || Math.abs(x - a.x1) < 1) && z > a.z0 && z < a.z1 || (Math.abs(z - a.z0) < 1 || Math.abs(z - a.z1) < 1) && x > a.x0 && x < a.x1;
    if (onEdge && lay.visual.some((p) => Math.hypot((p.ax + p.bx) / 2 - x, (p.az + p.bz) / 2 - z) < 2)) fail(`${a.id}: fence stands on road ${r.name} at ${Math.round(x)},${Math.round(z)}`);
  }
  fenceTotal += lay.visual.length; solidTotal += lay.solid.length; gapTotal += lay.gapLength;

  // lookup
  for (const [x, z] of [[(a.x0 + a.x1) / 2, (a.z0 + a.z1) / 2], [a.x0 + 1, a.z0 + 1], [a.x1 - 1, a.z1 - 1]]) {
    const h = getWorldZoneAt(x, z);
    if (h.id !== a.id || h.kind !== 'engineering') fail(`${a.id}: getWorldZoneAt(${x},${z}) -> ${h.id}/${h.kind}`);
  }
  const lbl = `${((a.x1 - a.x0))}x${(a.z1 - a.z0)}`;
  console.log(`${a.id.padEnd(20)} ${lbl.padEnd(10)}  ${a.ground.padEnd(6)} ${(wetP * 100).toFixed(0).padStart(4)} ${slope.toFixed(3).padStart(6)} ${relief.toFixed(0).padStart(6)}  ${String(Math.round(roadM)).padStart(10)}        ${railMin > 1e8 ? 'far' : Math.round(railMin)}`);
}

// the rest of the map is unchanged
for (const [n, x, z, id] of [['centre', 0, 0, 'metro-core'], ['runway', 2000, -3780, 'airport'], ['container', 1900, 2750, 'seaport'], ['open sea', 0, 4500, 'sea-south']] as const) {
  if (getWorldZoneAt(x, z).id !== id) fail(`${n} no longer ${id}`);
}
console.log(`\n${ENGINEERING_AREAS.length} engineering areas; fence: ${fenceTotal} panels, ${solidTotal} colliders, ${Math.round(gapTotal)} m left open where roads cross`);
console.log(bad ? `${bad} FAILURES` : 'ALL OK');
process.exit(bad ? 1 : 0);
