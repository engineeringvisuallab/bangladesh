// Generates the building placement table (src/buildings/Placements.ts BUILDING_PLACEMENTS). Position only: each model gets ONE spot in a zone
// that suits it: land, flat enough, no main road / railway / existing site under it, not in water, not touching another building.
// npx tsx scripts/place-buildings.ts   (prints the table; paste into Placements.ts)
import { Config } from '../src/core/Config';
import { TerrainGenerator } from '../src/terrain/TerrainGenerator';
import { getWorldZoneAt, type WorldZoneKind } from '../src/city/WorldZones';
import { libraryKeepout } from '../src/library/LibrarySite';
import { mallKeepout } from '../src/mall/MallSite';
import { evlabKeepout } from '../src/evlab/EVLabSite';
import { protoKeepout } from '../src/buildings/ProtoSite';
import { infraKeepout } from '../src/engineering/InfraSites';
import { airportKeepout } from '../src/airport/AirportSite';
import { agroKeepout } from '../src/agro/AgroSite';
import { SIZES } from './_sizes-data';

type K = WorldZoneKind;
const RULES: Record<string, { kinds: K[]; slope?: number; coast?: boolean }> = {
  'mud-hut': { kinds: ['village'] }, 'bamboo-hut': { kinds: ['village'] }, 'house-tin': { kinds: ['village'] }, 'house-semi-pucca': { kinds: ['village'] },
  'house-brick-2': { kinds: ['residential'] }, 'house-brick-3': { kinds: ['residential'] }, 'row-house': { kinds: ['residential'] }, villa: { kinds: ['residential'] },
  'apartment-mid': { kinds: ['residential', 'urban-core'] }, 'apartment-high': { kinds: ['urban-core', 'residential'] }, 'tower-residential': { kinds: ['urban-core'] },
  dormitory: { kinds: ['education'] }, 'labor-quarters': { kinds: ['industrial', 'residential'] },
  'village-bazaar': { kinds: ['village'] }, baganbari: { kinds: ['park'] },
  'shop-row': { kinds: ['commercial', 'urban-core'] }, pharmacy: { kinds: ['urban-core', 'commercial'] }, restaurant: { kinds: ['commercial', 'urban-core'] },
  'petrol-pump': { kinds: ['commercial'] }, bank: { kinds: ['urban-core'] }, supermarket: { kinds: ['commercial'] }, mall: { kinds: ['commercial'] },
  cinema: { kinds: ['urban-core'] }, 'office-mid': { kinds: ['urban-core'] }, 'office-tower': { kinds: ['urban-core'] }, 'hotel-3star': { kinds: ['commercial'] }, 'hotel-5star': { kinds: ['urban-core'] },
  'primary-school': { kinds: ['residential'] }, 'high-school': { kinds: ['education'] }, college: { kinds: ['education'] }, 'university-building': { kinds: ['education'] }, 'engineering-lab': { kinds: ['education'] },
  hospital: { kinds: ['civic', 'urban-core'], slope: 6 }, clinic: { kinds: ['residential'] }, diagnostic: { kinds: ['commercial'] },
  mosque: { kinds: ['residential'] }, temple: { kinds: ['residential'] }, church: { kinds: ['residential'] }, eidgah: { kinds: ['residential'] },
  overwater_villas: { kinds: ['coast'], coast: true }, cliff_mansion: { kinds: ['coast'], coast: true, slope: 14 }, marina: { kinds: ['coast'], coast: true },
  beach_resort: { kinds: ['coast'], coast: true }, tropical_villa: { kinds: ['coast'], coast: true }, lighthouse: { kinds: ['coast'], coast: true },
  village_farm: { kinds: ['farmland'], slope: 8 }, hill_farm: { kinds: ['forest', 'mountain'], slope: 14 },
  union_parishad: { kinds: ['village'] }, upazila_complex: { kinds: ['farmland', 'village'] }, fire_station: { kinds: ['urban-core'] }, post_office: { kinds: ['urban-core'] },
  district_court: { kinds: ['civic', 'urban-core'], slope: 6 }, dc_office: { kinds: ['civic', 'urban-core'], slope: 6 }, city_hall: { kinds: ['urban-core'] },
};

const gen = new TerrainGenerator(Config.world.seed);
const s = gen.makeSample();
const wet = (x: number, z: number): boolean => { gen.sample(x, z, s); return s.water === s.water && s.h < s.water + 0.3; };
const blocked = (x: number, z: number): boolean => libraryKeepout(x, z) || mallKeepout(x, z) || evlabKeepout(x, z) || protoKeepout(x, z) || infraKeepout(x, z) || airportKeepout(x, z) || agroKeepout(x, z);
const roadPts: { x: number; z: number }[] = [];
for (const r of gen.roads.roads) for (let i = 0; i < r.xs.length; i += 2) roadPts.push({ x: r.xs[i], z: r.zs[i] });

interface Placed { id: string; x: number; z: number; yaw: number; r: number }
const placed: Placed[] = [{ id: 'police_station', x: -72, z: 50, yaw: Math.PI, r: 60 }];

function evaluate(id: string, W: number, D: number, cx: number, cz: number, rule: (typeof RULES)[string], yaw: number): number | null {
  // returns ground range (m) or null if unusable. Footprint axis-aligned square of radius ~ half diagonal is overkill: use the rotated rect corners + samples
  // fine grid (3 m) over the footprint + 5 m: a railway or a road is only a few metres wide and must not slip between the samples
  const hw = W / 2 + 5, hd = D / 2 + 5;
  const c = Math.cos(yaw), sn = Math.sin(yaw);
  let mn = 1e9, mx = -1e9;
  const nx = Math.ceil((2 * hw) / 3), nz = Math.ceil((2 * hd) / 3);
  for (let i = 0; i <= nx; i++) for (let j = 0; j <= nz; j++) {
    const lx = -hw + (i / nx) * 2 * hw, lz = -hd + (j / nz) * 2 * hd;
    const x = cx + lx * c + lz * sn, z = cz - lx * sn + lz * c;
    if (blocked(x, z)) return null;
    if (gen.roads.surfaceAt(x, z) !== 0) return null;
    if (gen.railForm.inCorridor(x, z, 10)) return null;
    gen.sample(x, z, s);
    if (s.water === s.water && s.h < s.water + 0.3) return null;
    mn = Math.min(mn, s.h); mx = Math.max(mx, s.h);
  }
  const lim = rule.slope ?? 3;
  if (mx - mn > lim) return null;
  return mx - mn;
}

function nearestRoad(cx: number, cz: number): number | null {
  let best = 1e9, bx = 0, bz = 0;
  for (const p of roadPts) { const d = Math.hypot(p.x - cx, p.z - cz); if (d < best) { best = d; bx = p.x; bz = p.z; } }
  return best < 220 ? Math.atan2(bx - cx, bz - cz) : null;
}

const out: string[] = [];
// big buildings first so they get room
const order = Object.keys(RULES).sort((a, b) => SIZES[b][0] * SIZES[b][1] - SIZES[a][0] * SIZES[a][1]);
const result: Record<string, Placed & { zone: string; range: number }> = {};
for (const id of order) {
  const [W, D] = SIZES[id];
  const rule = RULES[id];
  const rad = Math.hypot(W, D) / 2 + 10;
  const cands: { x: number; z: number; d: number }[] = [];
  const step = 20;
  for (let x = -4800; x <= 4800; x += step) for (let z = -4800; z <= 4800; z += step) {
    const hit = getWorldZoneAt(x, z);
    if (!rule.kinds.includes(hit.kind)) continue;
    const pri = rule.kinds.indexOf(hit.kind) * 600;
    cands.push({ x, z, d: Math.hypot(x, z) + pri });
  }
  cands.sort((a, b) => a.d - b.d);
  let done = false;
  let tried = 0;
  for (const c of cands) {
    if (placed.some((p) => Math.hypot(p.x - c.x, p.z - c.z) < p.r + rad)) continue;
    let yaw: number;
    if (rule.coast) {
      yaw = 0; // front (+z) faces the sea in the south
      let seaDist = -1;
      for (let dz = 20; dz <= 140; dz += 20) if (wet(c.x, c.z + dz + D / 2)) { seaDist = dz; break; }
      if (seaDist < 0) continue;
    } else {
      yaw = nearestRoad(c.x, c.z) ?? 0;
      // snap to a multiple of 90 degrees so the building stands square to its street
      yaw = Math.round(yaw / (Math.PI / 2)) * (Math.PI / 2);
    }
    if (++tried > 4000) break;
    const rg = evaluate(id, W, D, c.x, c.z, rule, yaw);
    if (rg === null) continue;
    const zone = getWorldZoneAt(c.x, c.z).id;
    const p: Placed = { id, x: c.x, z: c.z, yaw, r: rad };
    placed.push(p);
    result[id] = { ...p, zone, range: rg };
    done = true;
    break;
  }
  if (!done) console.error('NO SPOT for', id, 'cands', cands.length);
}
for (const id of Object.keys(RULES)) {
  const r = result[id];
  if (!r) continue;
  out.push(`  { id: '${id}', x: ${r.x}, z: ${r.z}, yaw: ${+r.yaw.toFixed(4)}, W: ${SIZES[id][0]}, D: ${SIZES[id][1]}, zone: '${r.zone}' },`);
}
console.log(out.join('\n'));
console.error('placed', out.length, 'of', Object.keys(RULES).length);
