// Headless test of the city fill table (src/buildings/PlacementsFill.ts, made by scripts/fill-city.ts):
// known model ids, on dry land, clear of roads / railway / other sites, not overlapping each other or the hand placed buildings,
// inside site 0, and placementContains() (trees / rocks / grass keep-out) sees every fill building.
// npx tsx scripts/fill-test.ts
import { Config } from '../src/core/Config';
import { TerrainGenerator } from '../src/terrain/TerrainGenerator';
import { BUILDING_PLACEMENTS, placementContains } from '../src/buildings/Placements';
import { FILL_PLACEMENTS } from '../src/buildings/PlacementsFill';
import { libraryKeepout } from '../src/library/LibrarySite';
import { mallKeepout } from '../src/mall/MallSite';
import { evlabKeepout } from '../src/evlab/EVLabSite';
import { protoKeepout } from '../src/buildings/ProtoSite';
import { infraKeepout } from '../src/engineering/InfraSites';
import { airportKeepout } from '../src/airport/AirportSite';
import { agroKeepout } from '../src/agro/AgroSite';
import { SIZES as BASE_SIZES, FILL_SIZES } from './_sizes-data';
const SIZES: Record<string, [number, number]> = { ...BASE_SIZES, ...FILL_SIZES };

let fails = 0;
const ok = (c: boolean, m: string) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) fails++; };

ok(FILL_PLACEMENTS.length > 0, `fill table has ${FILL_PLACEMENTS.length} buildings`);
ok(FILL_PLACEMENTS.every((p) => !!SIZES[p.id] && SIZES[p.id][0] === p.W && SIZES[p.id][1] === p.D), 'every fill building has a known model with the right footprint');
ok(FILL_PLACEMENTS.every((p) => typeof p.seed === 'number'), 'every fill building has a seed');

const gen = new TerrainGenerator(Config.world.seed);
const s = gen.makeSample();
const hub = gen.sites[0];
let bad = 0;
const why = new Map<string, number>();
const note = (k: string) => { why.set(k, (why.get(k) ?? 0) + 1); bad++; };
for (const p of FILL_PLACEMENTS) {
  const c = Math.cos(p.yaw), sn = Math.sin(p.yaw);
  let mn = 1e9, mx = -1e9, flagged = false;
  const nx = Math.ceil(p.W / 3), nz = Math.ceil(p.D / 3);
  for (let i = 0; i <= nx && !flagged; i++) for (let j = 0; j <= nz && !flagged; j++) {
    const lx = -p.W / 2 + (i / nx) * p.W, lz = -p.D / 2 + (j / nz) * p.D;
    const x = p.x + lx * c + lz * sn, z = p.z - lx * sn + lz * c;
    if (libraryKeepout(x, z) || mallKeepout(x, z) || evlabKeepout(x, z) || protoKeepout(x, z) || infraKeepout(x, z) || airportKeepout(x, z) || agroKeepout(x, z)) { note('site'); flagged = true; break; }
    if (gen.roads.surfaceAt(x, z) !== 0) { note('road'); flagged = true; break; }
    if (gen.railForm.inCorridor(x, z, 8)) { note('rail'); flagged = true; break; }
    gen.sample(x, z, s);
    if (s.water === s.water && s.h < s.water + 0.3) { note('water'); flagged = true; break; }
    mn = Math.min(mn, s.h); mx = Math.max(mx, s.h);
  }
  if (!flagged && mx - mn > 2.01) note('slope');
  if (Math.hypot(p.x - hub.x, p.z - hub.z) > 830) note('outside-site0');
}
ok(bad === 0, `all fill buildings on dry, flat land, clear of roads / rail / sites, inside site 0 (${[...why].map(([k, v]) => k + '=' + v).join(' ') || 'none'})`);

// overlap (separating axis test) fill vs fill and fill vs hand placed
interface R { x: number; z: number; yaw: number; hw: number; hd: number }
const rect = (p: { x: number; z: number; yaw: number; W: number; D: number }): R => ({ x: p.x, z: p.z, yaw: p.yaw, hw: p.W / 2, hd: p.D / 2 });
function overlap(a: R, b: R): boolean {
  const axes = [[Math.cos(a.yaw), -Math.sin(a.yaw)], [Math.sin(a.yaw), Math.cos(a.yaw)], [Math.cos(b.yaw), -Math.sin(b.yaw)], [Math.sin(b.yaw), Math.cos(b.yaw)]];
  const dx = b.x - a.x, dz = b.z - a.z;
  for (const t of axes) {
    const ra = Math.abs(a.hw * (t[0] * axes[0][0] + t[1] * axes[0][1])) + Math.abs(a.hd * (t[0] * axes[1][0] + t[1] * axes[1][1]));
    const rb = Math.abs(b.hw * (t[0] * axes[2][0] + t[1] * axes[2][1])) + Math.abs(b.hd * (t[0] * axes[3][0] + t[1] * axes[3][1]));
    if (Math.abs(dx * t[0] + dz * t[1]) > ra + rb) return false;
  }
  return true;
}
let ov = 0;
const fr = FILL_PLACEMENTS.map(rect);
for (let i = 0; i < fr.length; i++) {
  for (let j = i + 1; j < fr.length; j++) { if (Math.hypot(fr[i].x - fr[j].x, fr[i].z - fr[j].z) > 160) continue; if (overlap(fr[i], fr[j])) ov++; }
  for (const o of BUILDING_PLACEMENTS) if (Math.hypot(fr[i].x - o.x, fr[i].z - o.z) < 200 && overlap(fr[i], rect(o))) ov++;
}
ok(ov === 0, `no fill building overlaps another building (${ov})`);

// vegetation keep-out sees every fill building (centre + a corner)
let miss = 0;
for (const p of FILL_PLACEMENTS) {
  if (!placementContains(p.x, p.z, 0)) miss++;
  const c = Math.cos(p.yaw), sn = Math.sin(p.yaw);
  const lx = p.W / 2 - 0.5, lz = p.D / 2 - 0.5;
  if (!placementContains(p.x + lx * c + lz * sn, p.z - lx * sn + lz * c, 0)) miss++;
}
ok(miss === 0, `placementContains() covers every fill building (${miss} missed)`);
ok(!placementContains(hub.x + 5000, hub.z + 5000, 0), 'placementContains() is false far away from every building');

console.log(fails === 0 ? '\nALL OK' : `\n${fails} FAILED`);
process.exit(fails === 0 ? 0 : 1);
