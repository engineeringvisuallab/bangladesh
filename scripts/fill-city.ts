// STEP 1 - CITY AUTO-FILL (Central Metropolis, site 0). Generates src/buildings/PlacementsFill.ts.
// Re-uses the EXISTING building models (src/buildings/models) many times: each building gets its own `seed`, so colours / variants differ.
// Position only (same as Placements.ts): terrain pad / collision come later. The 55 hand placed buildings of Placements.ts are NOT touched:
// the fill treats them as obstacles.
//
//   npx tsx scripts/fill-city.ts          (writes src/buildings/PlacementsFill.ts, prints statistics)
//   npx tsx scripts/fill-city.ts --dry    (statistics only)
//
// How it works (deterministic: same seed -> same city):
//   1. FRONTAGE pass: walk along every street (tier 2-4, not highways, not on bridges) of site 0, both sides, and line up buildings
//      along the kerb: setback from the road edge, small gap between neighbours, front facing the street.
//   2. FILL pass: the gaps inside blocks get a jittered grid of extra buildings, facing the nearest street.
//   3. Which model? CityPlan area (src/city/CityPlan.ts) -> its building list + floor range + density. Big institutional models are capped.
//   4. A spot is accepted only if: whole footprint inside site 0's plan, dry land, <= SLOPE m of height difference, no road / shoulder /
//      railway / existing site (mall, EVLab, library, plants, airport ...) under it and no overlap with any other building (SAT test).
import { writeFileSync } from 'node:fs';
import { Config } from '../src/core/Config';
import { TerrainGenerator } from '../src/terrain/TerrainGenerator';
import { CityPlan, type Area } from '../src/city/CityPlan';
import { BUILDING_PLACEMENTS } from '../src/buildings/Placements';
import { libraryKeepout } from '../src/library/LibrarySite';
import { mallKeepout } from '../src/mall/MallSite';
import { evlabKeepout } from '../src/evlab/EVLabSite';
import { protoKeepout } from '../src/buildings/ProtoSite';
import { infraKeepout } from '../src/engineering/InfraSites';
import { airportKeepout } from '../src/airport/AirportSite';
import { agroKeepout } from '../src/agro/AgroSite';
import { SIZES as BASE_SIZES, FILL_SIZES } from './_sizes-data';
const SIZES: Record<string, [number, number]> = { ...BASE_SIZES, ...FILL_SIZES };

const DRY = process.argv.includes('--dry');

// ---- tunables --------------------------------------------------------------------------------------------------------------------
const REGION_R = 820; // only buildings whose centre is closer than this to the site hub (m)
const SLOPE = 2.0; // max height difference under a footprint (m)
const MARGIN = 1.5; // clear ground (no road / water / keep-out) around the footprint (m)
/** Setback from the road edge to the building front (m), by area density 1..5. */
const SETBACK: Record<number, [number, number]> = { 1: [10, 20], 2: [7, 14], 3: [5, 9], 4: [3.5, 6], 5: [3, 5] };
/** Gap between neighbours along the street (m), by density. */
const GAP: Record<number, [number, number]> = { 1: [18, 40], 2: [10, 22], 3: [5, 12], 4: [2.5, 6], 5: [2, 4] };
/** Min clear distance between two buildings (m), by density (also used by the fill pass). */
const MINSEP: Record<number, number> = { 1: 8, 2: 5, 3: 3.5, 4: 2.2, 5: 1.5 };
/** Chance of a fill-pass building per 14 m grid cell, by density. */
const FILL_P: Record<number, number> = { 1: 0.03, 2: 0.14, 3: 0.4, 4: 0.75, 5: 0.95 };
const FILL_STEP = 14;

// ---- model table (same ids / floors / cityId as src/buildings/models/registry.ts; registry itself cannot be imported headless: textures) ----
interface M { id: string; cityId?: string; floors: number }
const MODELS: M[] = [
  { id: 'house-tin', cityId: 'house-tin', floors: 1 }, { id: 'house-brick-2', cityId: 'house-brick', floors: 2 }, { id: 'house-brick-3', cityId: 'house-brick', floors: 3 },
  { id: 'row-house', cityId: 'row-house', floors: 3 }, { id: 'villa', cityId: 'villa', floors: 2 }, { id: 'apartment-mid', cityId: 'apartment-mid', floors: 7 },
  { id: 'apartment-high', cityId: 'apartment-high', floors: 13 }, { id: 'tower-residential', cityId: 'tower-residential', floors: 31 },
  { id: 'dormitory', cityId: 'dormitory', floors: 4 }, { id: 'labor-quarters', cityId: 'labor-quarters', floors: 2 },
  { id: 'shop-row', cityId: 'shop-row', floors: 2 }, { id: 'pharmacy', cityId: 'pharmacy', floors: 1 }, { id: 'restaurant', cityId: 'restaurant', floors: 1 },
  { id: 'petrol-pump', cityId: 'petrol-pump', floors: 1 }, { id: 'bank', cityId: 'bank', floors: 2 }, { id: 'supermarket', cityId: 'supermarket', floors: 1 },
  { id: 'mall', cityId: 'mall', floors: 4 }, { id: 'cinema', cityId: 'cinema', floors: 2 }, { id: 'office-mid', cityId: 'office-mid', floors: 8 },
  { id: 'office-tower', cityId: 'office-tower', floors: 33 }, { id: 'hotel-3star', cityId: 'hotel', floors: 8 }, { id: 'hotel-5star', cityId: 'hotel', floors: 22 },
  { id: 'primary-school', cityId: 'primary-school', floors: 1 }, { id: 'high-school', cityId: 'high-school', floors: 3 }, { id: 'college', cityId: 'college', floors: 4 },
  { id: 'university-building', cityId: 'university-building', floors: 6 }, { id: 'engineering-lab', cityId: 'engineering-lab', floors: 3 },
  { id: 'hospital', cityId: 'hospital', floors: 8 }, { id: 'clinic', cityId: 'clinic', floors: 2 }, { id: 'diagnostic', cityId: 'diagnostic', floors: 4 },
  { id: 'mosque', cityId: 'mosque', floors: 2 }, { id: 'temple', cityId: 'temple', floors: 2 }, { id: 'church', cityId: 'church', floors: 3 }, { id: 'eidgah', cityId: 'eidgah', floors: 1 },
  { id: 'fire_station', cityId: 'fire-station', floors: 2 }, { id: 'post_office', cityId: 'post-office', floors: 2 },
  // compact models (src/buildings/models/compact.ts): small footprint, many floors - they fill the blocks the big models leave empty
  { id: 'slim-tower-20', cityId: 'office-tower', floors: 20 }, { id: 'slim-tower-30', cityId: 'office-tower', floors: 30 }, { id: 'office-slim-12', cityId: 'office-mid', floors: 12 },
  { id: 'mixed-use-6', cityId: 'office-mid', floors: 6 }, { id: 'hotel-boutique', cityId: 'hotel', floors: 12 }, { id: 'bank-compact', cityId: 'bank', floors: 3 },
  { id: 'apt-slim-9', cityId: 'apartment-mid', floors: 9 }, { id: 'apt-slim-14', cityId: 'apartment-high', floors: 14 }, { id: 'townhouse-3', cityId: 'house-brick', floors: 3 },
  { id: 'shop-house-3', cityId: 'shop-row', floors: 3 }, { id: 'shop-house-4', cityId: 'shop-row', floors: 4 },
];
/** Max copies of a model in the fill (institutions are rare / unique: the hand placed one already exists, or the game has its own: City Mall, police prototype ...). */
const CAP: Record<string, number> = {
  mall: 0, hospital: 2, 'hotel-5star': 2, 'university-building': 2, college: 1, 'engineering-lab': 1, 'high-school': 2, 'primary-school': 3, eidgah: 0,
  mosque: 5, temple: 2, church: 2, cinema: 2, supermarket: 5, 'petrol-pump': 4, fire_station: 1, post_office: 1, bank: 6, diagnostic: 3, clinic: 4, dormitory: 3,
  'labor-quarters': 0, 'tower-residential': 14, pharmacy: 14, restaurant: 14, 'office-tower': 14, bank: 10,
};
const byCity = new Map<string, M[]>();
for (const m of MODELS) if (m.cityId) { if (!byCity.has(m.cityId)) byCity.set(m.cityId, []); byCity.get(m.cityId)!.push(m); }

// ---- world ------------------------------------------------------------------------------------------------------------------------
const gen = new TerrainGenerator(Config.world.seed);
const plan = new CityPlan(gen.sites);
const hub = gen.sites[0];
const s = gen.makeSample();
const blocked = (x: number, z: number): boolean => libraryKeepout(x, z) || mallKeepout(x, z) || evlabKeepout(x, z) || protoKeepout(x, z) || infraKeepout(x, z) || airportKeepout(x, z) || agroKeepout(x, z);

let seedState = (Config.world.seed ^ 0x9e3779b9) >>> 0;
const rnd = (): number => { seedState = (seedState + 0x6d2b79f5) >>> 0; let t = seedState; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
const between = (r: [number, number]): number => r[0] + (r[1] - r[0]) * rnd();

// ---- obstacles: spatial hash of rectangles ----------------------------------------------------------------------------------------
interface Rect { x: number; z: number; yaw: number; hw: number; hd: number }
const CELL = 64;
const hash = new Map<string, Rect[]>();
const key = (i: number, j: number): string => i + ',' + j;
function cellsOf(r: Rect, m: number): [number, number, number, number] {
  const rad = Math.hypot(r.hw, r.hd) + m;
  return [Math.floor((r.x - rad) / CELL), Math.floor((r.x + rad) / CELL), Math.floor((r.z - rad) / CELL), Math.floor((r.z + rad) / CELL)];
}
function addRect(r: Rect): void { const [i0, i1, j0, j1] = cellsOf(r, 0); for (let i = i0; i <= i1; i++) for (let j = j0; j <= j1; j++) { const k = key(i, j); (hash.get(k) ?? hash.set(k, []).get(k)!).push(r); } }
function satOverlap(a: Rect, b: Rect, m: number): boolean {
  const axes = [[Math.cos(a.yaw), -Math.sin(a.yaw)], [Math.sin(a.yaw), Math.cos(a.yaw)], [Math.cos(b.yaw), -Math.sin(b.yaw)], [Math.sin(b.yaw), Math.cos(b.yaw)]];
  const dx = b.x - a.x, dz = b.z - a.z;
  const ax = [axes[0], axes[1]], bx = [axes[2], axes[3]];
  for (const ax2 of axes) {
    const ra = Math.abs(a.hw * (ax2[0] * ax[0][0] + ax2[1] * ax[0][1])) + Math.abs(a.hd * (ax2[0] * ax[1][0] + ax2[1] * ax[1][1]));
    const rb = Math.abs(b.hw * (ax2[0] * bx[0][0] + ax2[1] * bx[0][1])) + Math.abs(b.hd * (ax2[0] * bx[1][0] + ax2[1] * bx[1][1]));
    if (Math.abs(dx * ax2[0] + dz * ax2[1]) > ra + rb + m) return false; // separating axis found
  }
  return true;
}
function hitsBuilding(r: Rect, m: number): boolean {
  const [i0, i1, j0, j1] = cellsOf(r, m);
  for (let i = i0; i <= i1; i++) for (let j = j0; j <= j1; j++) for (const o of hash.get(key(i, j)) ?? []) if (satOverlap(r, o, m)) return true;
  return false;
}
for (const p of BUILDING_PLACEMENTS) addRect({ x: p.x, z: p.z, yaw: p.yaw, hw: p.W / 2, hd: p.D / 2 });

// ---- roads ------------------------------------------------------------------------------------------------------------------------
const streets = gen.roads.roads.filter((r) => r.tier >= 2 && r.kind !== 'roundabout');
interface RP { x: number; z: number; nx: number; nz: number; edge: number }
const roadHash = new Map<string, RP[]>();
const hwHash = new Map<string, RP[]>(); // highways (tier 1): buildings keep >= HW_CLEAR m from the road edge, and never face them
const HW_CLEAR = 22;
for (const r of gen.roads.roads) {
  for (let i = 0; i < r.xs.length; i++) {
    if (r.bridgeOf[i] >= 0) continue;
    if (Math.hypot(r.xs[i] - hub.x, r.zs[i] - hub.z) > REGION_R + 200) continue;
    const p: RP = { x: r.xs[i], z: r.zs[i], nx: r.nx[i], nz: r.nz[i], edge: r.halfWidth + r.shoulder };
    const k = key(Math.floor(p.x / CELL), Math.floor(p.z / CELL));
    const h = r.tier === 1 ? hwHash : roadHash;
    (h.get(k) ?? h.set(k, []).get(k)!).push(p);
  }
}
function nearHighway(x: number, z: number): boolean {
  const i0 = Math.floor(x / CELL), j0 = Math.floor(z / CELL);
  for (let i = i0 - 1; i <= i0 + 1; i++) for (let j = j0 - 1; j <= j0 + 1; j++) for (const p of hwHash.get(key(i, j)) ?? []) if (Math.hypot(p.x - x, p.z - z) - p.edge < HW_CLEAR) return true;
  return false;
}
function nearestRoad(x: number, z: number, maxD: number): RP | null {
  let best: RP | null = null, bd = maxD;
  const c = Math.ceil(maxD / CELL);
  const i0 = Math.floor(x / CELL), j0 = Math.floor(z / CELL);
  for (let i = i0 - c; i <= i0 + c; i++) for (let j = j0 - c; j <= j0 + c; j++) for (const p of roadHash.get(key(i, j)) ?? []) {
    const d = Math.hypot(p.x - x, p.z - z) - p.edge;
    if (d < bd) { bd = d; best = p; }
  }
  return best;
}

// ---- checks -----------------------------------------------------------------------------------------------------------------------
function groundOk(x: number, z: number, W: number, D: number, yaw: number): boolean {
  const hw = W / 2 + MARGIN, hd = D / 2 + MARGIN;
  const c = Math.cos(yaw), sn = Math.sin(yaw);
  const nx = Math.ceil((2 * hw) / 3), nz = Math.ceil((2 * hd) / 3);
  let mn = 1e9, mx = -1e9;
  for (let i = 0; i <= nx; i++) for (let j = 0; j <= nz; j++) {
    const lx = -hw + (i / nx) * 2 * hw, lz = -hd + (j / nz) * 2 * hd;
    const px = x + lx * c + lz * sn, pz = z - lx * sn + lz * c;
    if (blocked(px, pz)) return false;
    if (gen.roads.surfaceAt(px, pz) !== 0) return false;
    if (gen.railForm.inCorridor(px, pz, 10)) return false;
    gen.sample(px, pz, s);
    if (s.water === s.water && s.h < s.water + 0.3) return false;
    mn = Math.min(mn, s.h); mx = Math.max(mx, s.h);
  }
  return mx - mn <= SLOPE;
}
/** The 4 footprint corners must all be inside the same site-0 plan (and not in a no-building area). */
function insidePlan(x: number, z: number, W: number, D: number, yaw: number): Area | null {
  const c = Math.cos(yaw), sn = Math.sin(yaw);
  let first: Area | null = null;
  for (const [a, b] of [[0, 0], [-1, -1], [1, -1], [1, 1], [-1, 1]]) {
    const px = x + (a * W / 2) * c + (b * D / 2) * sn, pz = z - (a * W / 2) * sn + (b * D / 2) * c;
    if (Math.hypot(px - hub.x, pz - hub.z) > REGION_R) return null;
    const ar = plan.areaAt(px, pz);
    if (!ar || ar.site !== 0) return null;
    if (!first) first = ar;
  }
  return first;
}

// ---- model choice -----------------------------------------------------------------------------------------------------------------
const used = new Map<string, number>();
function chooseModel(area: Area, W_MAX = 1e9): M | null {
  const list: { m: M; w: number }[] = [];
  const seen = new Set<string>();
  for (const cityId of area.buildings) for (const m of byCity.get(cityId) ?? []) {
    if (seen.has(m.id)) continue;
    seen.add(m.id);
    if ((used.get(m.id) ?? 0) >= (CAP[m.id] ?? 1e9)) continue;
    const [W, D] = SIZES[m.id];
    if (Math.max(W, D) > W_MAX) continue;
    const [lo, hi] = area.floors;
    let w = m.floors >= lo - 1 && m.floors <= hi + 3 ? 1 : 0.12;
    if (area.density >= 4) w *= 1 + m.floors / (area.kind === 'commercial' && area.density === 5 ? 9 : 18); // dense areas lean towards taller buildings (CBD: much more)
    if (area.kind === 'mixed' && m.floors <= 3 && m.id !== 'petrol-pump') w *= 1.6; // Step 5: shop strips = shop-row / restaurant / bank / pharmacy
    if (area.kind === 'residential' && area.density >= 4 && m.floors >= 7) w *= 1.8; // Step 4: flats zone = apartment blocks
    if (m.id === 'house-tin') w *= 0.35; // tin sheds only sparsely (suburb edge)
    if (W * D < 150) w *= 0.5; // tiny buildings fit everywhere: do not let them dominate
    list.push({ m, w });
  }
  const tot = list.reduce((a, b) => a + b.w, 0);
  if (tot <= 0) return null;
  let t = rnd() * tot;
  for (const e of list) { t -= e.w; if (t <= 0) return e.m; }
  return list[list.length - 1].m;
}

const fails = new Map<string, number>();
const dbg: string[] = [];
const fail = (a: Area, why: string, W = 0): false => {
  if (process.argv.includes('--debug') && a.id === 's0-cbd' && W) dbg.push(why + ' W' + W); const k = a.id + ':' + why; fails.set(k, (fails.get(k) ?? 0) + 1); return false; };
interface Out { id: string; x: number; z: number; yaw: number; W: number; D: number; zone: string; seed: number }
const out: Out[] = [];
function tryPlace(m: M, area: Area, x: number, z: number, yaw: number): boolean {
  const [W, D] = SIZES[m.id];
  const ar = insidePlan(x, z, W, D, yaw);
  if (!ar || ar.id !== area.id) return fail(area, 'plan', W);
  const r: Rect = { x, z, yaw, hw: W / 2, hd: D / 2 };
  if (hitsBuilding(r, MINSEP[area.density])) return fail(area, 'overlap', W);
  for (const [a, b] of [[0, 0], [-1, -1], [1, -1], [1, 1], [-1, 1]]) {
    const c = Math.cos(yaw), sn = Math.sin(yaw);
    if (nearHighway(x + (a * W / 2) * c + (b * D / 2) * sn, z - (a * W / 2) * sn + (b * D / 2) * c)) return fail(area, 'highway', W);
  }
  if (!groundOk(x, z, W, D, yaw)) return fail(area, 'ground', W);
  addRect(r);
  used.set(m.id, (used.get(m.id) ?? 0) + 1);
  out.push({ id: m.id, x: +x.toFixed(1), z: +z.toFixed(1), yaw: +yaw.toFixed(4), W, D, zone: area.id, seed: 1 + Math.floor(rnd() * 999999) });
  return true;
}

// ---- pass 1: frontage -------------------------------------------------------------------------------------------------------------
let frontage = 0;
const order = [...streets].sort((a, b) => a.tier - b.tier || a.id - b.id);
for (const r of order) {
  for (const side of [1, -1]) {
    let d = 4 + rnd() * 6;
    let guard = 0;
    while (d < r.length - 4 && guard++ < 4000) {
      // interpolate the road point at distance d
      let i = 0;
      while (i < r.cum.length - 2 && r.cum[i + 1] < d) i++;
      const f = (d - r.cum[i]) / Math.max(1e-6, r.cum[i + 1] - r.cum[i]);
      const rx = r.xs[i] + (r.xs[i + 1] - r.xs[i]) * f, rz = r.zs[i] + (r.zs[i + 1] - r.zs[i]) * f;
      let nx = (r.nx[i] + (r.nx[i + 1] - r.nx[i]) * f) * side, nz = (r.nz[i] + (r.nz[i + 1] - r.nz[i]) * f) * side;
      const nl = Math.hypot(nx, nz) || 1; nx /= nl; nz /= nl;
      if (r.bridgeOf[i] >= 0 || r.bridgeOf[i + 1] >= 0 || Math.hypot(rx - hub.x, rz - hub.z) > REGION_R) { d += 14; continue; }
      const probe = plan.areaAt(rx + nx * 18, rz + nz * 18);
      if (!probe || probe.site !== 0) { d += 12; continue; }
      // up to 3 models per spot: a big one first, then smaller ones if it does not fit (overlap / slope / road)
      let placedW = 0;
      for (let t = 0; t < 3 && !placedW; t++) {
        const m = chooseModel(probe, t === 0 ? 90 : t === 1 ? 40 : 28);
        if (!m) break;
        const [W, D] = SIZES[m.id];
        const setback = between(SETBACK[probe.density]);
        const off = r.halfWidth + r.shoulder + setback + D / 2;
        const cx = rx + nx * off, cz = rz + nz * off;
        const yaw = Math.atan2(-nx, -nz);
        // along-road axis of the building (local x) = (cos yaw, -sin yaw); put its edge at the cursor
        const ax = Math.cos(yaw), az = -Math.sin(yaw);
        const sgn = ax * (r.xs[Math.min(i + 1, r.xs.length - 1)] - r.xs[i]) + az * (r.zs[Math.min(i + 1, r.zs.length - 1)] - r.zs[i]) >= 0 ? 1 : -1;
        const px = cx + ax * sgn * (W / 2), pz = cz + az * sgn * (W / 2);
        if (tryPlace(m, probe, px, pz, yaw)) { frontage++; placedW = W; }
      }
      if (placedW) d += placedW + between(GAP[probe.density]);
      else d += 6 + rnd() * 4;
    }
  }
}

// ---- pass 2: fill the blocks ------------------------------------------------------------------------------------------------------
// The street plan of the city is sparse in places (a lattice edge is dropped when it touches water / a main road ...), so the blocks are
// filled from the streets inwards: candidate points sorted by distance to the nearest street, each tries up to 3 models.
let fill = 0;
const cands: { x: number; z: number; d: number; road: RP }[] = [];
for (let gx = hub.x - REGION_R; gx <= hub.x + REGION_R; gx += FILL_STEP) for (let gz = hub.z - REGION_R; gz <= hub.z + REGION_R; gz += FILL_STEP) {
  const x = gx + (rnd() - 0.5) * FILL_STEP, z = gz + (rnd() - 0.5) * FILL_STEP;
  const area = plan.areaAt(x, z);
  if (!area || area.site !== 0 || area.buildings.length === 0) continue;
  const road = nearestRoad(x, z, 150);
  if (!road) continue;
  cands.push({ x, z, d: Math.hypot(road.x - x, road.z - z), road });
}
cands.sort((a, b) => a.d - b.d);
if (process.argv.includes('--debug')) console.error('cbd cands', cands.filter((c) => plan.areaAt(c.x, c.z)?.id === 's0-cbd').length, 'total', cands.length);
for (const c of cands) {
  const area = plan.areaAt(c.x, c.z)!;
  if (rnd() > FILL_P[area.density]) continue;
  const yaw = Math.atan2(c.road.x - c.x, c.road.z - c.z);
  for (let t = 0; t < 3; t++) {
    const m = chooseModel(area, t === 0 ? 90 : t === 1 ? 40 : 28);
    if (!m) break;
    if (tryPlace(m, area, c.x, c.z, yaw)) { fill++; break; }
  }
}

// ---- output -----------------------------------------------------------------------------------------------------------------------
const perZone = new Map<string, number>();
const perModel = new Map<string, number>();
for (const o of out) { perZone.set(o.zone, (perZone.get(o.zone) ?? 0) + 1); perModel.set(o.id, (perModel.get(o.id) ?? 0) + 1); }
console.error(`placed ${out.length} (frontage ${frontage}, fill ${fill})`);
console.error('per zone  :', [...perZone].map(([k, v]) => `${k}=${v}`).join(' '));
console.error('fails     :', [...fails].filter(([k]) => /cbd|flats|arm-n/.test(k)).map(([k, v]) => `${k}=${v}`).join(' '));
if (process.argv.includes('--debug')) { const c = new Map<string, number>(); for (const d of dbg) c.set(d, (c.get(d) ?? 0) + 1); console.error('cbd fail detail', [...c].sort((a, b) => b[1] - a[1]).slice(0, 25).map(([k, v]) => k + '=' + v).join(' ')); }
console.error('streets   :', streets.length, 'in region', streets.filter((r) => Math.hypot(r.xs[0] - hub.x, r.zs[0] - hub.z) < REGION_R).length);
console.error('per model :', [...perModel].sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k}=${v}`).join(' '));

if (process.argv.includes('--dump')) {
  const roads = gen.roads.roads.filter((r) => Math.hypot(r.xs[0] - hub.x, r.zs[0] - hub.z) < 1200).map((r) => ({ t: r.tier, hw: r.halfWidth + r.shoulder, x: Array.from(r.xs), z: Array.from(r.zs) }));
  writeFileSync('/tmp/dump.json', JSON.stringify({ out, roads, old: BUILDING_PLACEMENTS }));
}
if (!DRY) {
  const rows = out.map((o) => `  { id: '${o.id}', x: ${o.x}, z: ${o.z}, yaw: ${o.yaw}, W: ${o.W}, D: ${o.D}, zone: '${o.zone}', seed: ${o.seed} },`);
  const text = `// GENERATED by scripts/fill-city.ts (Step 1: city auto-fill, central metropolis). DO NOT EDIT BY HAND: run \`npx tsx scripts/fill-city.ts\` again.
// The existing building models, repeated along the streets of site 0 (each with its own seed). Position only, like Placements.ts.
// ${out.length} buildings. The 55 hand placed buildings of Placements.ts are not part of this table.
import type { BuildingPlacement } from './Placements';

export const FILL_PLACEMENTS: readonly BuildingPlacement[] = [
${rows.join('\n')}
];
`;
  writeFileSync('src/buildings/PlacementsFill.ts', text);
  console.error('written src/buildings/PlacementsFill.ts');
}
