/**
 * WORLD ZONES (data only) - STAGE 11A: the WHOLE 10 km x 10 km map is divided into named, real-world-style areas
 * (city centre, residential, commercial, industrial, logistics, airport, seaport, farmland, villages, forest, mountain,
 * wetland, coast, sea ...). No building is placed here; later stages fill the areas.
 *
 * How a point finds its zone (`getWorldZoneAt`), first match wins:
 *   1. the AIRPORT and the SEAPORT (exact rectangles with their own sub-areas: runway, terminal, container yard ...),
 *   2. the SEA (south of the coast line table) - the harbour water of the seaport is part of the seaport,
 *   3. the nearest "district seed" (power diagram: borders are straight lines between seeds, so the map has real,
 *      irregular district borders instead of a square grid).
 * Every point of the map therefore has exactly one zone. Names are in i18n (`bn.worldZones`).
 * World coordinates: x east, z south, map centre = 0,0, the sea is in the south. Units: metres.
 */
import { Config } from '../core/Config';
import { createArmyPlan } from '../army/ArmyPlan';
import { airportPlanOf, SEA_AIRPORT_DEF } from '../airport/AirportSite';
import { localToWorld } from '../airport/AirportPlan';
import { ENGINEERING_AREAS, ENGINEERING_GROUP_COLOR, getEngineeringAreaAt } from './EngineeringZones';

export type WorldZoneKind =
  | 'urban-core'
  | 'commercial'
  | 'residential'
  | 'industrial'
  | 'logistics'
  | 'education'
  | 'civic'
  | 'utility'
  | 'airport'
  | 'army'
  | 'seaport'
  | 'farmland'
  | 'village'
  | 'forest'
  | 'mountain'
  | 'wetland'
  | 'park'
  | 'coast'
  | 'engineering'
  | 'sea';

/** Map colour of each zone kind (minimap overlay, HUD chip). */
export const WORLD_ZONE_COLOR: Record<WorldZoneKind, string> = {
  'urban-core': '#ff4d4d',
  commercial: '#ff8a3c',
  residential: '#ffd54a',
  industrial: '#9a7bd6',
  logistics: '#6f8fd6',
  education: '#37d6c4',
  civic: '#4aa3ff',
  utility: '#b8c0c8',
  airport: '#f4f4f4',
  army: '#6b7a3a',
  seaport: '#14336e',
  farmland: '#c9d46a',
  village: '#d9a066',
  forest: '#3d8b4f',
  mountain: '#8d8f99',
  wetland: '#4fb3a6',
  park: '#5fd16a',
  coast: '#e8d08a',
  engineering: '#ff3df0',
  sea: '#4a90c8',
};

/** Kinds that count as built-up land (used by the tour / later stages). */
export const BUILT_UP_KINDS: ReadonlySet<WorldZoneKind> = new Set<WorldZoneKind>([
  'urban-core', 'commercial', 'residential', 'industrial', 'logistics', 'education', 'civic', 'utility', 'airport', 'army', 'seaport', 'village', 'engineering',
]);

export interface WorldZone {
  id: string;
  kind: WorldZoneKind;
  /** Seed position and weight (m) of the district: a bigger weight claims more land. */
  x: number;
  z: number;
  w: number;
}

const Z = (id: string, kind: WorldZoneKind, x: number, z: number, w: number): WorldZone => ({ id, kind, x, z, w });

/** The district seeds. Order does not matter (nearest weighted seed wins). Every id has a Bangla name in `bn.worldZones.names`. */
export const WORLD_ZONES: readonly WorldZone[] = [
  // --- central metropolis (site 0): core + 8 districts around it ---
  Z('metro-core', 'urban-core', 0, 0, 900),
  Z('north-admin', 'civic', 0, -1500, 600),
  Z('ne-business', 'commercial', 1150, -1150, 620),
  Z('east-homes', 'residential', 1550, 60, 600),
  Z('se-dense', 'residential', 1150, 1150, 600),
  Z('south-bazaar', 'commercial', 0, 1550, 600),
  Z('sw-homes', 'residential', -1150, 1150, 600),
  Z('west-homes', 'residential', -1550, 0, 620),
  Z('nw-university', 'education', -1150, -1150, 600),
  // --- outer ring (between the middle ring road and the outer freeway) ---
  Z('east-works', 'industrial', 2350, -600, 650),
  Z('east-logistics', 'logistics', 2350, 600, 550),
  Z('east-suburb', 'residential', 2300, 1550, 500),
  Z('port-industry', 'industrial', 1650, 2150, 600),
  Z('south-suburb', 'residential', 450, 2250, 550),
  Z('south-utility', 'utility', -550, 2150, 450),
  Z('sw-newtown', 'residential', -1900, 1750, 650),
  Z('west-suburb', 'residential', -2450, 500, 500),
  Z('sw-medical', 'civic', -1700, 800, 300),
  Z('west-bazaar', 'commercial', -2300, -350, 300),
  Z('east-mall', 'commercial', 1900, 1000, 280),
  // --- north: industrial + logistics city (site 2) ---
  Z('north-heavy', 'industrial', 800, -3350, 650),
  Z('north-logistics', 'logistics', 200, -3400, 450),
  Z('north-power', 'utility', 50, -3900, 450),
  Z('north-labour', 'residential', -450, -3050, 450),
  Z('north-homes', 'residential', 250, -2550, 450),
  // --- north-west: satellite university town (site 1) ---
  Z('nw-town', 'residential', -2000, -2800, 600),
  Z('nw-campus', 'education', -1450, -2800, 350),
  Z('nw-solar', 'utility', -2100, -2150, 400),
  // --- farmland, forest, villages ---
  Z('west-farms', 'farmland', -3100, -900, 650),
  Z('sw-farms', 'farmland', -3300, 1900, 600),
  Z('east-farms', 'farmland', 2100, -1800, 550),
  Z('ne-farms', 'farmland', 3000, -1500, 500),
  Z('north-farms', 'farmland', 1500, -2600, 500),
  Z('nw-farms', 'farmland', -1300, -3600, 500),
  Z('center-hills', 'forest', -800, -1950, 500),
  Z('ne-forest', 'forest', 2400, -3000, 550),
  Z('nw-forest', 'forest', -3100, -3200, 600),
  Z('village-west', 'village', -2750, -1600, 320),
  Z('village-east', 'village', 3150, -700, 320),
  Z('village-sw', 'village', -3550, 600, 320),
  Z('village-ne', 'village', 3550, -2300, 300),
  // --- lakes and wetlands ---
  Z('west-lake', 'wetland', -2400, 150, 260),
  Z('central-lake', 'park', 1000, 400, 260),
  Z('north-lake', 'wetland', 800, -1750, 260),
  Z('nw-lake', 'wetland', -1200, -2850, 250),
  Z('ne-lake', 'wetland', 3300, -2900, 300),
  Z('east-lake', 'wetland', 3400, 450, 300),
  // --- coast ---
  Z('sw-beach', 'coast', -3000, 2800, 700),
  Z('river-delta', 'wetland', -300, 2800, 650),
  Z('south-beach', 'coast', 700, 2850, 450),
  Z('east-beach', 'coast', 3300, 2750, 700),
  Z('safari-park', 'park', 3000, 1900, 550),
  // --- mountain rim ---
  Z('nw-peaks', 'mountain', -4300, -4200, 1200),
  Z('north-ridge-west', 'mountain', -1300, -4500, 700),
  Z('north-ridge', 'mountain', -200, -4500, 700),
  Z('ne-peaks', 'mountain', 4300, -4200, 1200),
  Z('west-hills-north', 'mountain', -4400, -1800, 1100),
  Z('west-hills-south', 'mountain', -4400, 1200, 1000),
  Z('east-hills-north', 'mountain', 4400, -1500, 1100),
  Z('east-hills-south', 'mountain', 4400, 1300, 1000),
];

/* ------------------------------------------------------------------ coast + sea */

/**
 * Where the sea starts (z) for a given x: measured from the terrain (first water cell going south). The river mouth and lakes
 * near x = -500..0 are ignored. The sea itself is the zone 'sea-south'.
 */
const COAST: ReadonlyArray<readonly [number, number]> = [
  [-5000, 3000], [-4000, 2740], [-3500, 2920], [-3000, 2960], [-2500, 3020], [-2000, 2940], [-1500, 2940], [-1000, 2940],
  [-500, 3000], [0, 3000], [500, 3160], [1000, 2940], [1500, 2840], [2000, 2860], [2500, 3020], [3000, 3040], [3500, 2980],
  [4000, 3000], [4500, 3100], [5000, 3100],
];

/** z of the shoreline at x (piecewise linear). */
export function coastZ(x: number): number {
  if (x <= COAST[0][0]) return COAST[0][1];
  for (let i = 1; i < COAST.length; i++) {
    if (x <= COAST[i][0]) {
      const [x0, z0] = COAST[i - 1];
      const [x1, z1] = COAST[i];
      return z0 + ((z1 - z0) * (x - x0)) / (x1 - x0);
    }
  }
  return COAST[COAST.length - 1][1];
}

/* ------------------------------------------------------------------ facilities (airport, seaport) */

export type FacilityAreaKind =
  | 'runway' | 'taxiway' | 'apron' | 'terminal' | 'cargo' | 'hangar' | 'fuel' | 'parking' | 'tower' | 'grounds'
  | 'container' | 'bulk' | 'oil' | 'fishing' | 'admin' | 'quay' | 'basin'
  | 'military' | 'camp' | 'gate' | 'hq' | 'parade' | 'barracks' | 'tents' | 'depot' | 'motorpool' | 'helipad';

export interface FacilityArea {
  id: string;
  kind: FacilityAreaKind;
  x0: number;
  z0: number;
  x1: number;
  z1: number;
}

export interface Facility {
  id: 'airport' | 'airport-sea' | 'seaport' | 'army';
  kind: 'airport' | 'seaport' | 'army';
  /** Outer boundary (axis-aligned, metres). */
  x0: number;
  z0: number;
  x1: number;
  z1: number;
  /** Sub-areas, first match wins; the last one ('grounds' / 'quay') catches the rest. */
  areas: readonly FacilityArea[];
}

const FA = (id: string, kind: FacilityAreaKind, x0: number, z0: number, x1: number, z1: number): FacilityArea => ({ id, kind, x0, z0, x1, z1 });

/**
 * INTERNATIONAL AIRPORT - north-east, away from the dense city (noise), ~0.2 km north of the airport branch line and its station.
 * The rectangle is ONLY the land the airport module (src/airport) needs: one runway 09/27 (east-west, 1.4 km x 45 m), a parallel taxiway,
 * the apron + 4-gate terminal + parking on the SOUTH side (towards the station), hangars and the control tower. The ground is rolling
 * land: AirportSite levels the pad (cut and fill) and grades a 60 m skirt back to natural ground.
 */
export const AIRPORT: Facility = {
  id: 'airport',
  kind: 'airport',
  x0: 1680,
  z0: -4150,
  x1: 3320,
  z1: -3506,
  areas: [
    FA('airport-runway', 'runway', 1800, -4022.5, 3200, -3977.5),
    FA('airport-tower', 'tower', 2611.5, -3699.5, 2618.5, -3692.5),
    FA('airport-taxiway', 'taxiway', 1880, -3886, 3120, -3864),
    FA('airport-apron', 'apron', 2300, -3864, 2700, -3724),
    FA('airport-terminal', 'terminal', 2415, -3716, 2585, -3676),
    FA('airport-parking', 'parking', 2430, -3666, 2570, -3616),
    FA('airport-hangars', 'hangar', 2062.5, -3850, 2247.5, -3805),
    FA('airport-grounds', 'grounds', 1680, -4150, 3320, -3506),
  ],
};

/**
 * SEA AIRPORT - modern airport on reclaimed land in the sea just south of the south coast, between the island and the seaport (~3.7 km from the city
 * centre). The land is filled to SEA_AIRPORT_FLOOR m above sea level (AirportSite) and a causeway road joins it to the shore. Same layout as the old
 * airport (runway 09/27 west-east, taxiway, apron + 4-gate terminal + parking + tower + hangars) turned by 180 degrees (terminal side NORTH, towards
 * the shore), plus a MILITARY apron with 4 hardstands and shelters. The sub-areas are written in the airport's local frame and turned into world
 * rectangles with the site's position and heading, so they follow SEA_AIRPORT_DEF.
 */
const SEA_PLAN = airportPlanOf(SEA_AIRPORT_DEF);
const seaRect = (id: string, kind: FacilityAreaKind, lx0: number, lz0: number, lx1: number, lz1: number): FacilityArea => {
  const a = localToWorld(SEA_PLAN.site, lx0, lz0);
  const b = localToWorld(SEA_PLAN.site, lx1, lz1);
  return FA(id, kind, Math.min(a.x, b.x), Math.min(a.z, b.z), Math.max(a.x, b.x), Math.max(a.z, b.z));
};
const SEA_GROUNDS = seaRect('airport-sea-grounds', 'grounds', -760, -90, 760, 434);
export const AIRPORT_SEA: Facility = {
  id: 'airport-sea',
  kind: 'airport',
  x0: SEA_GROUNDS.x0,
  z0: SEA_GROUNDS.z0,
  x1: SEA_GROUNDS.x1,
  z1: SEA_GROUNDS.z1,
  areas: [
    seaRect('airport-sea-runway', 'runway', -700, -22.5, 700, 22.5),
    seaRect('airport-sea-tower', 'tower', 111.5, 300.5, 118.5, 307.5),
    seaRect('airport-sea-taxiway', 'taxiway', -620, 114, 620, 136),
    seaRect('airport-sea-military', 'military', 290, 136, 640, 300),
    seaRect('airport-sea-apron', 'apron', -200, 136, 200, 276),
    seaRect('airport-sea-terminal', 'terminal', -85, 284, 85, 324),
    seaRect('airport-sea-parking', 'parking', -70, 334, 70, 384),
    seaRect('airport-sea-hangars', 'hangar', -437.5, 150, -252.5, 195),
    SEA_GROUNDS,
  ],
};

/**
 * SEAPORT - south coast (STAGE 14 built it: see src/port). West to east: fishing harbour, bulk / general cargo quay, container terminal with
 * the landside strip (gates, customs, administration, CFS, port control tower), then the oil terminal (tank farm + T-head jetty) outside the
 * breakwater. The sea part ('seaport-basin') is the sheltered harbour water south of the quays, closed by the breakwater at z ~ 3225.
 * The coast road (S30) runs along the back of the port; two gate roads branch off it.
 * The sub-areas below follow the decks of PortPlan (first match wins; the last one catches the rest).
 */
export const SEAPORT: Facility = {
  id: 'seaport',
  kind: 'seaport',
  x0: 980,
  z0: 2540,
  x1: 2500,
  z1: 3300,
  areas: [
    FA('seaport-admin', 'admin', 1700, 2790, 2100, 2850),
    FA('seaport-container', 'container', 1700, 2850, 2250, 3010),
    FA('seaport-bulk', 'bulk', 1330, 2790, 1700, 3010),
    FA('seaport-fishing', 'fishing', 980, 2840, 1330, 3010),
    FA('seaport-oil', 'oil', 2250, 2850, 2500, 3300),
    FA('seaport-basin', 'basin', 980, 3010, 2500, 3300),
    FA('seaport-quay', 'quay', 980, 2540, 2500, 3300),
  ],
};

/**
 * ARMY CAMP - north-west, on the low flat land at the foot of the big hill (west of the river, south of the hill). The compound (src/army: gate, HQ,
 * parade ground, barracks, tents, ammunition depot, motor pool, helipad) is fenced; the rectangle below is the camp + its safety margin (the railway keeps out).
 * Sub-areas follow ArmyPlan (first match wins; 'army-camp' catches the rest).
 */
const ARMY_PLAN = createArmyPlan();
const AR = { x0: ARMY_PLAN.site.cx - ARMY_PLAN.pad.w / 2, z0: ARMY_PLAN.site.cz - ARMY_PLAN.pad.d / 2, x1: ARMY_PLAN.site.cx + ARMY_PLAN.pad.w / 2, z1: ARMY_PLAN.site.cz + ARMY_PLAN.pad.d / 2 };
export const ARMY: Facility = {
  id: 'army',
  kind: 'army',
  x0: AR.x0,
  z0: AR.z0,
  x1: AR.x1,
  z1: AR.z1,
  areas: ARMY_PLAN.areas.map((a) => FA(a.id, a.id.slice(5) as FacilityAreaKind, ARMY_PLAN.site.cx + a.x0, ARMY_PLAN.site.cz + a.z0, ARMY_PLAN.site.cx + a.x1, ARMY_PLAN.site.cz + a.z1)),
};

export const FACILITIES: readonly Facility[] = [AIRPORT, AIRPORT_SEA, ARMY, SEAPORT];
/** Facilities the RAILWAY keeps out of. The army camp is not in it on purpose: it was fitted next to the existing lines (the camp site is checked clear of every rail corridor), so the rail plan stays exactly as it was. */
export const RAIL_FACILITIES: readonly Facility[] = [AIRPORT, SEAPORT];

const inRect = (r: { x0: number; z0: number; x1: number; z1: number }, x: number, z: number): boolean => x >= r.x0 && x < r.x1 && z >= r.z0 && z < r.z1;

/* ------------------------------------------------------------------ lookup */

export interface WorldZoneHit {
  /** Id of the zone (district seed id, 'airport', 'seaport' or 'sea-south'). */
  id: string;
  kind: WorldZoneKind;
  /** Facility sub-area (runway, terminal, container terminal ...), or null. */
  area: FacilityArea | null;
}

const SEA_HIT: WorldZoneHit = { id: 'sea-south', kind: 'sea', area: null };
const HITS = new Map<string, WorldZoneHit>(WORLD_ZONES.map((z) => [z.id, { id: z.id, kind: z.kind, area: null }]));

/** The main island in the southern sea (Config.terrain.island): a green middle with a sand ring along the shore. */
const ISLAND_IDS = ['island-hills', 'island-beach'] as const;
for (const a of ENGINEERING_AREAS) HITS.set(a.id, { id: a.id, kind: 'engineering', area: null });
HITS.set('island-hills', { id: 'island-hills', kind: 'park', area: null });
HITS.set('island-beach', { id: 'island-beach', kind: 'coast', area: null });


/** The zone of a point of the map (or just outside it). Pure data, no terrain needed. */
export function getWorldZoneAt(x: number, z: number): WorldZoneHit {
  for (const f of FACILITIES) {
    if (!inRect(f, x, z)) continue;
    const area = f.areas.find((a) => inRect(a, x, z)) ?? null;
    return { id: f.id, kind: f.kind, area };
  }
  const eng = getEngineeringAreaAt(x, z);
  if (eng) return HITS.get(eng.id)!;
  const isl = Config.terrain.island;
  const di = Math.hypot(x - isl.x, z - isl.z) / isl.radius;
  if (di < 0.78) return HITS.get('island-hills')!;
  if (di < 1.04) return HITS.get('island-beach')!;
  if (z > coastZ(x) + 20) return SEA_HIT;
  let best = WORLD_ZONES[0];
  let bestD = Infinity;
  for (const s of WORLD_ZONES) {
    const d = (x - s.x) * (x - s.x) + (z - s.z) * (z - s.z) - s.w * s.w;
    if (d < bestD) {
      bestD = d;
      best = s;
    }
  }
  return HITS.get(best.id)!;
}

/** All zone ids (seeds + airport + seaport + sea). */
export const WORLD_ZONE_IDS: readonly string[] = [...WORLD_ZONES.map((z) => z.id), ...ISLAND_IDS, ...ENGINEERING_AREAS.map((a) => a.id), 'airport', 'airport-sea', 'army', 'seaport', 'sea-south'];

/** Rasterised zone map for the minimap and the tests: row-major (z rows from north), value = index into WORLD_ZONE_IDS. */
export function rasterizeWorldZones(cell = 100): { n: number; cell: number; ids: Uint8Array; kinds: WorldZoneKind[] } {
  const half = Config.world.size / 2;
  const n = Math.round(Config.world.size / cell);
  const ids = new Uint8Array(n * n);
  const index = new Map(WORLD_ZONE_IDS.map((id, i) => [id, i]));
  for (let j = 0; j < n; j++) {
    const z = -half + (j + 0.5) * cell;
    for (let i = 0; i < n; i++) ids[j * n + i] = index.get(getWorldZoneAt(-half + (i + 0.5) * cell, z).id)!;
  }
  const kinds: WorldZoneKind[] = WORLD_ZONE_IDS.map((id) => HITS.get(id)?.kind ?? (id === 'airport' || id === 'airport-sea' ? 'airport' : id === 'army' ? 'army' : id === 'seaport' ? 'seaport' : 'sea'));
  return { n, cell, ids, kinds };
}

/** Map / HUD colour of a zone hit: engineering areas use the colour of their group, everything else the colour of its kind. */
export function worldZoneHitColor(h: WorldZoneHit): string {
  if (h.kind === 'engineering') {
    const a = ENGINEERING_AREAS.find((e) => e.id === h.id);
    if (a) return ENGINEERING_GROUP_COLOR[a.group];
  }
  return WORLD_ZONE_COLOR[h.kind];
}
