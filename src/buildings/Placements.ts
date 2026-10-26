// POSITIONS of every building model (src/buildings/models) in the open world. POSITION ONLY: no terrain pad, no collision yet;
// the surface merge (flat pad, blend, colliders) comes later. The police station has its own full prototype in ProtoSite.ts.
// Pure numbers (no three.js / DOM), so vegetation and street planning can use it too.
//
// Each row: model id (registry.ts), world x / z of the footprint centre (x = east, z = south), yaw (the model front = local +z turns to face the
// nearest main road, or the sea for the coast models), footprint W x D (m, incl. the yard / compound), zone id it stands in.
// The table was made by scripts/place-buildings.ts (picks land that is flat enough, with no main road, railway, water or other site under the
// footprint, in a zone that suits the building: huts in villages, towers in the metro core, schools on the campus, resorts on the island ...).
// To move one building: change its x / z / yaw here, nothing else.
export interface BuildingPlacement {
  id: string;
  x: number;
  z: number;
  yaw: number;
  W: number;
  D: number;
  zone: string;
  /** Model variant seed (colours etc.). Only the city fill (PlacementsFill.ts) sets it; hand placed buildings use 0. */
  seed?: number;
}

import { FILL_PLACEMENTS } from './PlacementsFill';

export const BUILDING_PLACEMENTS: readonly BuildingPlacement[] = [
  { id: 'mud-hut', x: -2300, z: -1520, yaw: 0, W: 9, D: 7, zone: 'village-west' },
  { id: 'bamboo-hut', x: -2260, z: -1560, yaw: 0, W: 8, D: 8, zone: 'village-west' },
  { id: 'house-tin', x: -2180, z: -1400, yaw: 0, W: 11, D: 12, zone: 'village-west' },
  { id: 'house-semi-pucca', x: -2160, z: -1460, yaw: 0, W: 11, D: 12, zone: 'village-west' },
  { id: 'house-brick-2', x: -680, z: 680, yaw: 0, W: 13, D: 16, zone: 'sw-homes' },
  { id: 'house-brick-3', x: 960, z: 100, yaw: 0, W: 13, D: 16, zone: 'east-homes' },
  { id: 'row-house', x: 920, z: 80, yaw: -1.5708, W: 21, D: 10, zone: 'east-homes' },
  { id: 'villa', x: 660, z: 700, yaw: 3.1416, W: 24, D: 28, zone: 'se-dense' },
  { id: 'apartment-mid', x: 220, z: 20, yaw: 0, W: 18, D: 13, zone: 'metro-core' },
  { id: 'apartment-high', x: 300, z: 80, yaw: -3.1416, W: 27, D: 20, zone: 'metro-core' },
  { id: 'tower-residential', x: 20, z: -260, yaw: 1.5708, W: 45, D: 45, zone: 'metro-core' },
  { id: 'dormitory', x: -1860, z: -940, yaw: 0, W: 33, D: 33, zone: 'nw-university' },
  { id: 'labor-quarters', x: -980, z: 80, yaw: 0, W: 40, D: 11, zone: 'west-homes' },
  { id: 'village-bazaar', x: 2920, z: -900, yaw: -1.5708, W: 64, D: 48, zone: 'village-east' },
  { id: 'baganbari', x: 820, z: 440, yaw: -1.5708, W: 52, D: 52, zone: 'central-lake' },
  { id: 'shop-row', x: 20, z: 200, yaw: 1.5708, W: 26, D: 11, zone: 'metro-core' },
  { id: 'pharmacy', x: -20, z: 140, yaw: 1.5708, W: 9, D: 11, zone: 'metro-core' },
  { id: 'restaurant', x: -200, z: 220, yaw: -3.1416, W: 24, D: 26, zone: 'metro-core' },
  { id: 'petrol-pump', x: 800, z: -540, yaw: 1.5708, W: 30, D: 24, zone: 'ne-business' },
  { id: 'bank', x: 40, z: 140, yaw: 0, W: 26, D: 24, zone: 'metro-core' },
  { id: 'supermarket', x: -180, z: 960, yaw: 3.1416, W: 33, D: 36, zone: 'south-bazaar' },
  { id: 'mall', x: -80, z: 960, yaw: 3.1416, W: 61, D: 60, zone: 'south-bazaar' },
  { id: 'cinema', x: 120, z: -280, yaw: -1.5708, W: 27, D: 35, zone: 'metro-core' },
  { id: 'office-mid', x: -200, z: 160, yaw: -3.1416, W: 27, D: 26, zone: 'metro-core' },
  { id: 'office-tower', x: -280, z: 80, yaw: 3.1416, W: 45, D: 45, zone: 'metro-core' },
  { id: 'hotel-3star', x: -260, z: 940, yaw: 3.1416, W: 39, D: 32, zone: 'south-bazaar' },
  { id: 'hotel-5star', x: -100, z: 320, yaw: -1.5708, W: 80, D: 70, zone: 'metro-core' },
  { id: 'primary-school', x: 940, z: 20, yaw: -1.5708, W: 40, D: 36, zone: 'east-homes' },
  { id: 'high-school', x: -1500, z: -2380, yaw: 1.5708, W: 56, D: 60, zone: 'nw-campus' },
  { id: 'college', x: -1440, z: -2620, yaw: -1.5708, W: 70, D: 46, zone: 'nw-campus' },
  { id: 'university-building', x: -1260, z: -2500, yaw: 0, W: 70, D: 54, zone: 'nw-campus' },
  { id: 'engineering-lab', x: -1340, z: -2700, yaw: -1.5708, W: 64, D: 50, zone: 'nw-campus' },
  { id: 'hospital', x: 300, z: -160, yaw: 3.1416, W: 80, D: 62, zone: 'metro-core' },
  { id: 'clinic', x: -720, z: 640, yaw: 3.1416, W: 22, D: 25, zone: 'sw-homes' },
  { id: 'diagnostic', x: 760, z: -620, yaw: 3.1416, W: 24, D: 18, zone: 'ne-business' },
  { id: 'mosque', x: 600, z: 780, yaw: -1.5708, W: 48, D: 52, zone: 'se-dense' },
  { id: 'temple', x: -940, z: 280, yaw: 1.5708, W: 40, D: 44, zone: 'west-homes' },
  { id: 'church', x: -540, z: 820, yaw: 3.1416, W: 36, D: 52, zone: 'sw-homes' },
  { id: 'eidgah', x: -960, z: 180, yaw: 1.5708, W: 72, D: 54, zone: 'west-homes' },
  { id: 'overwater_villas', x: -580, z: 4140, yaw: 0, W: 76, D: 80, zone: 'island-beach' },
  { id: 'cliff_mansion', x: 900, z: 2800, yaw: 0, W: 64, D: 70, zone: 'south-beach' },
  { id: 'marina', x: -740, z: 4540, yaw: 0, W: 84, D: 80, zone: 'island-beach' },
  { id: 'beach_resort', x: -660, z: 4400, yaw: 0, W: 100, D: 110, zone: 'island-beach' },
  { id: 'tropical_villa', x: -2220, z: 4080, yaw: 0, W: 56, D: 56, zone: 'island-beach' },
  { id: 'lighthouse', x: -2140, z: 4160, yaw: 0, W: 56, D: 56, zone: 'island-beach' },
  { id: 'village_farm', x: 1900, z: -1320, yaw: -1.5708, W: 124, D: 108, zone: 'east-farms' },
  { id: 'hill_farm', x: -1220, z: -1780, yaw: 1.5708, W: 104, D: 112, zone: 'center-hills' },
  { id: 'union_parishad', x: 2980, z: -980, yaw: 0, W: 44, D: 40, zone: 'village-east' },
  { id: 'upazila_complex', x: -2500, z: -860, yaw: 3.1416, W: 90, D: 70, zone: 'west-farms' },
  { id: 'fire_station', x: -180, z: 80, yaw: 3.1416, W: 54, D: 46, zone: 'metro-core' },
  { id: 'post_office', x: 280, z: 0, yaw: -1.5708, W: 38, D: 34, zone: 'metro-core' },
  { id: 'district_court', x: 160, z: 300, yaw: -3.1416, W: 80, D: 66, zone: 'metro-core' },
  { id: 'dc_office', x: -100, z: 180, yaw: -1.5708, W: 96, D: 76, zone: 'metro-core' },
  { id: 'city_hall', x: 200, z: 120, yaw: 0, W: 100, D: 84, zone: 'metro-core' },
];

/** Keep-out radius around a footprint centre (half diagonal). */
const radius = (p: BuildingPlacement): number => Math.hypot(p.W, p.D) / 2;

/** Is (x, y) inside the footprint (+ margin) of placement p? */
function insideOf(p: BuildingPlacement, x: number, z: number, margin: number): boolean {
  const dx = x - p.x, dz = z - p.z;
  if (dx * dx + dz * dz > (radius(p) + margin) * (radius(p) + margin)) return false;
  const c = Math.cos(p.yaw), s = Math.sin(p.yaw);
  const lx = dx * c - dz * s, lz = dx * s + dz * c; // into the model's own frame
  return Math.abs(lx) <= p.W / 2 + margin && Math.abs(lz) <= p.D / 2 + margin;
}

// The city fill has hundreds of buildings, so those are looked up through a grid (cells of 64 m) instead of a loop over all of them.
const FILL_CELL = 64;
let fillGrid: Map<number, BuildingPlacement[]> | null = null;
const cellKey = (i: number, j: number): number => (i + 4096) * 8192 + (j + 4096);
function getFillGrid(): Map<number, BuildingPlacement[]> {
  if (fillGrid) return fillGrid;
  const g = new Map<number, BuildingPlacement[]>();
  for (const p of FILL_PLACEMENTS) {
    const r = radius(p);
    for (let i = Math.floor((p.x - r) / FILL_CELL); i <= Math.floor((p.x + r) / FILL_CELL); i++) {
      for (let j = Math.floor((p.z - r) / FILL_CELL); j <= Math.floor((p.z + r) / FILL_CELL); j++) {
        const k = cellKey(i, j);
        const list = g.get(k);
        if (list) list.push(p); else g.set(k, [p]);
      }
    }
  }
  fillGrid = g;
  return g;
}

/** Is (x, z) on a placed building's footprint (+ margin)? Cheap: used by trees / rocks / grass so nothing grows through a building. */
export function placementContains(x: number, z: number, margin = 0): boolean {
  for (const p of BUILDING_PLACEMENTS) if (insideOf(p, x, z, margin)) return true;
  if (FILL_PLACEMENTS.length === 0) return false;
  // a footprint reaches at most ~ 130 m from its centre and cells list every footprint that touches them (radius is already in the cells)
  const list = getFillGrid().get(cellKey(Math.floor(x / FILL_CELL), Math.floor(z / FILL_CELL)));
  if (list) for (const p of list) if (insideOf(p, x, z, margin)) return true;
  // a margin can reach into the neighbour cell
  if (margin > 0) {
    const i = Math.floor(x / FILL_CELL), j = Math.floor(z / FILL_CELL);
    for (let di = -1; di <= 1; di++) for (let dj = -1; dj <= 1; dj++) {
      if (di === 0 && dj === 0) continue;
      const l2 = getFillGrid().get(cellKey(i + di, j + dj));
      if (l2) for (const p of l2) if (insideOf(p, x, z, margin)) return true;
    }
  }
  return false;
}

/** NOT plugged into LocalRoads yet (that would move the street + railway plan; the solver already keeps the spots clear of every existing street). For the surface merge: streets keep out of a building + 12 m. */
export function placementKeepout(x: number, z: number): boolean {
  return placementContains(x, z, 12);
}
