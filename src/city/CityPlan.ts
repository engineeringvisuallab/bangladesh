/**
 * CITY MASTER PLAN (data only) - Stage 10A: WHICH AREA IS FOR WHAT. No building is placed here.
 *
 * The 3 flat city sites (TerrainGenerator.sites) are divided into AREAS (districts / zones). Every area has:
 *   - a kind (residential, commercial, industrial ...) and a density,
 *   - a shape (rectangle or ring) in SITE-LOCAL metres (x east, z south, site hub = 0,0),
 *   - the list of building types that may stand there (placed later, Stage 10B+),
 *   - a street grid (block size + road width) for the local roads of that area (Stage 10B).
 *
 * Areas are listed in PRIORITY order: the first area that contains a point wins. The last area of each site is a
 * big ring that catches everything else, so every point inside a city has exactly one area.
 * Area names are in i18n (`bn.city.area[id]`).
 */
import type { CitySite } from '../terrain';

export type ZoneKind =
  | 'residential'
  | 'commercial'
  | 'mixed'
  | 'industrial'
  | 'civic'
  | 'education'
  | 'health'
  | 'utility'
  | 'transport'
  | 'recreation'
  | 'green';

/** Minimap / overlay colour of each zone kind. */
export const ZONE_COLOR: Record<ZoneKind, string> = {
  residential: '#ffd54a',
  commercial: '#ff5a4d',
  mixed: '#ff9a3c',
  industrial: '#9a7bd6',
  civic: '#4aa3ff',
  education: '#37d6c4',
  health: '#ff7eb6',
  utility: '#b8c0c8',
  transport: '#e8e8e8',
  recreation: '#5fd16a',
  green: '#7bb661',
};

/** Every building type the city may get. Bangla names: `bn.city.building[id]`. */
export const BUILDING_TYPES = [
  // residential
  'house-tin', 'house-brick', 'villa', 'row-house', 'apartment-mid', 'apartment-high', 'tower-residential', 'dormitory', 'labor-quarters',
  // commercial
  'shop-row', 'bazaar-stall', 'supermarket', 'mall', 'office-mid', 'office-tower', 'bank', 'hotel', 'restaurant', 'petrol-pump', 'cinema', 'pharmacy',
  // industrial
  'factory-light', 'factory-heavy', 'garment-factory', 'warehouse', 'steel-mill', 'cement-plant', 'container-yard', 'workshop', 'cold-storage',
  // civic
  'city-hall', 'court', 'police-station', 'fire-station', 'post-office', 'library', 'museum', 'community-center',
  // education
  'primary-school', 'high-school', 'college', 'university-building', 'engineering-lab',
  // health
  'hospital', 'clinic', 'diagnostic',
  // religious
  'mosque', 'temple', 'church', 'eidgah', 'graveyard',
  // utility (civil / mechanical / electrical engineering)
  'power-plant', 'substation', 'water-treatment', 'water-tower', 'pumping-station', 'waste-plant', 'solar-farm', 'telecom-tower',
  // transport
  'bus-terminal', 'rail-station', 'parking-multistory', 'truck-terminal', 'taxi-stand', 'helipad',
  // recreation / green
  'park', 'playground', 'stadium', 'sports-complex', 'pond', 'garden', 'farm', 'farmhouse',
] as const;
export type BuildingId = (typeof BUILDING_TYPES)[number];

/** Local street grid of an area (the "R/A roads" of a residential area etc.). Built in Stage 10B. */
export interface StreetGrid {
  /** Distance between parallel streets (m) = block size. */
  blockX: number;
  blockZ: number;
  /** Half width of the asphalt (m). */
  halfWidth: number;
  lanes: number;
  speedKmh: number;
}

export type AreaShape =
  | { t: 'rect'; x0: number; z0: number; x1: number; z1: number }
  | { t: 'ring'; r0: number; r1: number };

export interface AreaTemplate {
  id: string;
  kind: ZoneKind;
  shape: AreaShape;
  /** 1 = very sparse ... 5 = very dense. */
  density: 1 | 2 | 3 | 4 | 5;
  /** Number of floors (min, max). */
  floors: readonly [number, number];
  buildings: readonly BuildingId[];
  grid: StreetGrid | null;
}

export interface Area extends AreaTemplate {
  /** Index of the city site (0 = centre, 1 = north-west, 2 = north). */
  site: number;
  /** World position of the site hub. */
  cx: number;
  cz: number;
}

const rect = (x0: number, z0: number, x1: number, z1: number): AreaShape => ({ t: 'rect', x0, z0, x1, z1 });
const ring = (r0: number, r1: number): AreaShape => ({ t: 'ring', r0, r1 });

const GRID = {
  home: { blockX: 90, blockZ: 60, halfWidth: 3.5, lanes: 2, speedKmh: 30 },
  homeBig: { blockX: 100, blockZ: 70, halfWidth: 4.5, lanes: 2, speedKmh: 30 },
  villa: { blockX: 110, blockZ: 80, halfWidth: 3.5, lanes: 2, speedKmh: 30 },
  shops: { blockX: 80, blockZ: 80, halfWidth: 5, lanes: 2, speedKmh: 30 },
  downtown: { blockX: 110, blockZ: 110, halfWidth: 7, lanes: 4, speedKmh: 40 },
  industry: { blockX: 160, blockZ: 120, halfWidth: 6, lanes: 2, speedKmh: 40 },
  campus: { blockX: 130, blockZ: 100, halfWidth: 4, lanes: 2, speedKmh: 30 },
  lane: { blockX: 120, blockZ: 120, halfWidth: 3.5, lanes: 2, speedKmh: 30 },
} satisfies Record<string, StreetGrid>;

const A = (
  id: string,
  kind: ZoneKind,
  shape: AreaShape,
  density: 1 | 2 | 3 | 4 | 5,
  floors: readonly [number, number],
  grid: StreetGrid | null,
  buildings: readonly BuildingId[],
): AreaTemplate => ({ id, kind, shape, density, floors, grid, buildings });

/**
 * SITE 0 - CENTRAL METROPOLIS (map centre, spawn). The two freeways cross at the middle and cut the city into 4 quarters:
 *   NE business centre (CBD) | NW government + university | SE dense flats + bazaar | SW homes + hospital + park.
 * Along the 4 freeway arms: shop strips. Around: suburbs, with the power / water / stadium / depot at the edge.
 */
const SITE0: readonly AreaTemplate[] = [
  A('s0-hub', 'transport', rect(-100, -100, 100, 100), 4, [1, 6], null, ['bus-terminal', 'rail-station', 'taxi-stand', 'parking-multistory', 'helipad', 'bank', 'restaurant']),
  A('s0-cbd', 'commercial', rect(100, -470, 470, -100), 5, [8, 40], GRID.downtown, ['office-tower', 'office-mid', 'bank', 'hotel', 'mall', 'restaurant', 'cinema', 'parking-multistory', 'tower-residential', 'telecom-tower']),
  A('s0-civic', 'civic', rect(-470, -470, -100, -290), 3, [2, 8], GRID.campus, ['city-hall', 'court', 'police-station', 'fire-station', 'post-office', 'community-center', 'park']),
  A('s0-edu', 'education', rect(-470, -290, -100, -100), 3, [2, 8], GRID.campus, ['university-building', 'engineering-lab', 'college', 'library', 'museum', 'dormitory', 'playground', 'mosque']),
  A('s0-flats', 'residential', rect(100, 100, 470, 320), 5, [5, 15], GRID.homeBig, ['apartment-mid', 'apartment-high', 'shop-row', 'supermarket', 'primary-school', 'mosque', 'clinic', 'pharmacy', 'playground']),
  A('s0-bazaar', 'commercial', rect(100, 320, 470, 470), 4, [1, 4], GRID.shops, ['bazaar-stall', 'shop-row', 'supermarket', 'restaurant', 'pharmacy', 'mosque', 'bank']),
  A('s0-homes', 'residential', rect(-470, 100, -100, 350), 3, [1, 6], GRID.home, ['house-brick', 'row-house', 'apartment-mid', 'primary-school', 'high-school', 'mosque', 'temple', 'church', 'playground', 'clinic', 'shop-row']),
  A('s0-hospital', 'health', rect(-470, 350, -290, 470), 3, [2, 10], GRID.campus, ['hospital', 'clinic', 'diagnostic', 'pharmacy', 'parking-multistory']),
  A('s0-park', 'recreation', rect(-290, 350, -100, 470), 1, [1, 2], GRID.lane, ['park', 'pond', 'garden', 'playground', 'sports-complex']),
  A('s0-arm-n', 'mixed', rect(-100, -470, 100, -100), 4, [2, 8], GRID.shops, ['shop-row', 'restaurant', 'office-mid', 'bank', 'hotel', 'petrol-pump', 'pharmacy']),
  A('s0-arm-s', 'mixed', rect(-100, 100, 100, 470), 4, [2, 8], GRID.shops, ['shop-row', 'restaurant', 'office-mid', 'bank', 'hotel', 'petrol-pump', 'pharmacy']),
  A('s0-arm-w', 'mixed', rect(-470, -100, -100, 100), 3, [2, 6], GRID.shops, ['shop-row', 'restaurant', 'office-mid', 'bank', 'petrol-pump', 'pharmacy', 'workshop']),
  A('s0-arm-e', 'mixed', rect(100, -100, 470, 100), 3, [2, 6], GRID.shops, ['shop-row', 'restaurant', 'office-mid', 'bank', 'petrol-pump', 'pharmacy', 'workshop']),
  A('s0-substation', 'utility', rect(50, 500, 230, 660), 1, [1, 4], null, ['substation', 'telecom-tower', 'solar-farm']),
  A('s0-water', 'utility', rect(-230, 500, -50, 660), 1, [1, 4], null, ['water-treatment', 'water-tower', 'pumping-station']),
  A('s0-stadium', 'recreation', rect(-455, 500, -265, 700), 2, [1, 4], GRID.lane, ['stadium', 'sports-complex', 'parking-multistory', 'park']),
  A('s0-depot', 'transport', rect(-95, -660, 95, -500), 2, [1, 3], GRID.industry, ['bus-terminal', 'truck-terminal', 'workshop', 'petrol-pump', 'warehouse']),
  A('s0-suburb', 'residential', ring(0, 760), 2, [1, 3], GRID.villa, ['house-brick', 'villa', 'house-tin', 'mosque', 'eidgah', 'primary-school', 'playground', 'shop-row', 'graveyard']),
  A('s0-green', 'green', ring(760, 950), 1, [1, 2], GRID.lane, ['farm', 'farmhouse', 'pond', 'garden', 'house-tin', 'graveyard']),
];

/**
 * SITE 1 - NORTH-WEST SATELLITE TOWN (home + study): town centre, homes all around, the engineering university campus
 * in the east, hospital + park in the south, solar farm in the west, green belt around.
 */
const SITE1: readonly AreaTemplate[] = [
  A('s1-centre', 'mixed', rect(-150, -150, 150, 150), 4, [1, 5], GRID.shops, ['bazaar-stall', 'shop-row', 'mosque', 'bank', 'post-office', 'bus-terminal', 'supermarket', 'restaurant', 'pharmacy']),
  A('s1-homes-nw', 'residential', rect(-430, -430, 0, -150), 3, [1, 5], GRID.home, ['house-brick', 'row-house', 'apartment-mid', 'primary-school', 'mosque', 'temple', 'playground', 'clinic', 'shop-row']),
  A('s1-villas-ne', 'residential', rect(0, -430, 430, -150), 2, [1, 3], GRID.villa, ['villa', 'house-brick', 'row-house', 'high-school', 'mosque', 'church', 'playground', 'garden']),
  A('s1-campus', 'education', rect(150, -150, 430, 280), 3, [2, 8], GRID.campus, ['university-building', 'engineering-lab', 'college', 'library', 'dormitory', 'high-school', 'playground', 'mosque', 'sports-complex']),
  A('s1-flats-w', 'residential', rect(-430, -150, -150, 280), 4, [4, 10], GRID.homeBig, ['apartment-mid', 'apartment-high', 'house-brick', 'row-house', 'shop-row', 'primary-school', 'mosque', 'pharmacy']),
  A('s1-hospital', 'health', rect(-150, 150, 150, 360), 3, [2, 8], GRID.campus, ['hospital', 'clinic', 'diagnostic', 'pharmacy', 'parking-multistory']),
  A('s1-park', 'recreation', rect(-150, 360, 150, 430), 1, [1, 2], GRID.lane, ['park', 'pond', 'garden', 'playground']),
  A('s1-sports', 'recreation', rect(150, 280, 430, 430), 2, [1, 3], GRID.lane, ['stadium', 'sports-complex', 'playground', 'park', 'eidgah']),
  A('s1-homes-sw', 'residential', rect(-430, 280, -150, 430), 2, [1, 3], GRID.villa, ['house-brick', 'villa', 'house-tin', 'mosque', 'primary-school', 'playground']),
  A('s1-solar', 'utility', rect(-100, 450, 100, 650), 1, [1, 2], null, ['solar-farm', 'substation', 'telecom-tower']),
  A('s1-suburb', 'residential', ring(0, 700), 2, [1, 3], GRID.villa, ['house-brick', 'villa', 'house-tin', 'mosque', 'primary-school', 'playground', 'graveyard']),
  A('s1-greenbelt', 'green', ring(700, 1000), 1, [1, 2], GRID.lane, ['farm', 'farmhouse', 'pond', 'garden', 'house-tin']),
];

/**
 * SITE 2 - NORTHERN INDUSTRIAL + LOGISTICS CITY. A river runs through the site (west -> hub -> south-east), so the town has two parts:
 * NORTH of the river: logistics hub, power plant, heavy industry (east), workers' flats (west).
 * SOUTH of the river (inside the V): homes (west), waste + water treatment (middle), light industry / garments (east).
 * a green buffer all around keeps factories away from the houses.
 */
const SITE2: readonly AreaTemplate[] = [
  A('s2-hub', 'transport', rect(-150, -300, 150, -110), 3, [1, 4], GRID.industry, ['truck-terminal', 'container-yard', 'rail-station', 'petrol-pump', 'warehouse', 'bus-terminal', 'restaurant']),
  A('s2-heavy', 'industrial', rect(150, -520, 560, -110), 3, [1, 6], GRID.industry, ['factory-heavy', 'steel-mill', 'cement-plant', 'warehouse', 'workshop', 'substation', 'fire-station']),
  A('s2-light', 'industrial', rect(110, 300, 360, 520), 3, [1, 4], GRID.industry, ['garment-factory', 'factory-light', 'warehouse', 'cold-storage', 'workshop', 'truck-terminal']),
  A('s2-power', 'utility', rect(-150, -520, 150, -300), 2, [1, 8], GRID.industry, ['power-plant', 'substation', 'water-treatment', 'pumping-station', 'telecom-tower']),
  A('s2-waste', 'utility', rect(-110, 150, 100, 400), 1, [1, 4], GRID.industry, ['waste-plant', 'water-treatment', 'pumping-station', 'water-tower', 'solar-farm']),
  A('s2-labour', 'residential', rect(-480, -420, -150, -110), 4, [3, 8], GRID.homeBig, ['labor-quarters', 'apartment-mid', 'dormitory', 'shop-row', 'bazaar-stall', 'mosque', 'primary-school', 'clinic', 'police-station', 'fire-station', 'playground']),
  A('s2-homes', 'residential', rect(-450, 130, -130, 420), 3, [1, 5], GRID.home, ['house-brick', 'row-house', 'apartment-mid', 'house-tin', 'mosque', 'temple', 'primary-school', 'high-school', 'playground', 'shop-row']),
  A('s2-green', 'green', ring(0, 950), 1, [1, 2], GRID.lane, ['farm', 'farmhouse', 'pond', 'garden', 'house-tin', 'solar-farm']),
];

export const SITE_TEMPLATES: readonly (readonly AreaTemplate[])[] = [SITE0, SITE1, SITE2];

/** Which area contains the local point (lx, lz) of a site template list? Priority = list order. */
function contains(s: AreaShape, lx: number, lz: number): boolean {
  if (s.t === 'rect') return lx >= s.x0 && lx < s.x1 && lz >= s.z0 && lz < s.z1;
  const r = Math.hypot(lx, lz);
  return r >= s.r0 && r < s.r1;
}

export class CityPlan {
  /** All areas of all sites (site 0 first), in priority order per site. */
  readonly areas: Area[] = [];
  private bySite: Area[][] = [];

  constructor(private sites: readonly CitySite[]) {
    sites.forEach((site, i) => {
      const list: Area[] = [];
      for (const t of SITE_TEMPLATES[i] ?? []) list.push({ ...t, site: i, cx: site.x, cz: site.z });
      this.bySite.push(list);
      this.areas.push(...list);
    });
  }

  /** Index of the city site whose planned area (blend radius) contains (x, z), or -1. */
  siteAt(x: number, z: number): number {
    for (let i = 0; i < this.sites.length; i++) {
      if (Math.hypot(x - this.sites[i].x, z - this.sites[i].z) < this.maxRadius(i)) return i;
    }
    return -1;
  }

  /** The planned area at world position (x, z), or null when outside every city. */
  areaAt(x: number, z: number): Area | null {
    const i = this.siteAt(x, z);
    if (i < 0) return null;
    const lx = x - this.sites[i].x;
    const lz = z - this.sites[i].z;
    for (const a of this.bySite[i]) if (contains(a.shape, lx, lz)) return a;
    return null;
  }

  /** Radius around the hub that is covered by the plan of a site (m). */
  maxRadius(site: number): number {
    let m = 0;
    for (const a of this.bySite[site] ?? []) {
      if (a.shape.t === 'ring') m = Math.max(m, a.shape.r1);
      else m = Math.max(m, Math.hypot(Math.max(Math.abs(a.shape.x0), Math.abs(a.shape.x1)), Math.max(Math.abs(a.shape.z0), Math.abs(a.shape.z1))));
    }
    return m;
  }
}
