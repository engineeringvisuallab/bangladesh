/**
 * ENGINEERING AREAS (data only) - the places of the game where each branch of engineering is learned.
 * Every area is an axis-aligned rectangle with a REAL BOUNDARY (metres, x east, z south, map centre 0,0), exactly like the airport and the seaport.
 * No building is placed here (that is the next step); this file only fixes WHERE each area is and how far it reaches.
 *
 * Already built elsewhere and therefore NOT repeated here: airport (src/airport), seaport (src/port), railway (src/rail), agro site (src/agro),
 * shopping mall (src/mall), city library (src/library), EV lab (src/evlab). Ordinary buildings (homes, shops ...) have no boundary at all.
 *
 * `getWorldZoneAt` (WorldZones.ts) returns kind 'engineering' and the area id for every point inside a rectangle. Bangla names: `bn.worldZones.names[id]`
 * and `bn.worldZones.engineeringGroup[group]`. The positions were chosen on the real terrain (dry, gentle ground, away from the railway and stations,
 * clear of the other facilities); `npm run test:eng-zones` checks all of that again.
 */

export type EngineeringGroup =
  | 'campus' | 'civil' | 'environmental' | 'mechanical' | 'materials' | 'chemical' | 'resource' | 'marine'
  | 'aerospace' | 'electrical' | 'energy' | 'electronics' | 'biomedical' | 'safety' | 'rural';

/** Colour of each group (minimap outline, HUD chip). */
export const ENGINEERING_GROUP_COLOR: Record<EngineeringGroup, string> = {
  campus: '#00e5ff',
  civil: '#ff5252',
  environmental: '#26a69a',
  mechanical: '#b388ff',
  materials: '#8d6e63',
  chemical: '#ff9100',
  resource: '#6d4c41',
  marine: '#2962ff',
  aerospace: '#eceff1',
  electrical: '#ffeb3b',
  energy: '#76ff03',
  electronics: '#e040fb',
  biomedical: '#ff4081',
  safety: '#ff1744',
  rural: '#c0ca33',
};

/** What the ground of the area is like; the test checks it against the real terrain. */
export type EngineeringGround = 'land' | 'shore' | 'lake' | 'sea' | 'hill';

export interface EngineeringArea {
  id: string;
  group: EngineeringGroup;
  /** Engineering branches learned here (ids, used by the learning content later). */
  branches: readonly string[];
  /** Boundary (metres). */
  x0: number;
  z0: number;
  x1: number;
  z1: number;
  ground: EngineeringGround;
}

const E = (
  id: string, group: EngineeringGroup, ground: EngineeringGround, branches: readonly string[],
  x0: number, z0: number, x1: number, z1: number,
): EngineeringArea => ({ id, group, ground, branches, x0, z0, x1, z1 });

export const ENGINEERING_AREAS: readonly EngineeringArea[] = [
  // --- campus: the north-west satellite town, just north of its railway station
  E('eng-campus', 'campus', 'land', ['foundation-science', 'all-branches-intro'], -2200, -3450, -1750, -3000),
  // --- civil
  E('eng-structures', 'civil', 'land', ['structural', 'construction', 'surveying', 'architecture-planning'], 1150, -1050, 1650, -650),
  E('eng-geotech', 'civil', 'hill', ['geotechnical'], -4400, -1550, -3800, -1050),
  E('eng-transport', 'civil', 'land', ['transportation', 'traffic', 'highway'], 2250, 1550, 2850, 2000),
  E('eng-dam', 'civil', 'lake', ['water-resources', 'hydraulic', 'dam', 'hydropower'], 3150, 350, 3750, 850),
  // --- environmental (water treatment + sewage already stand in the world: SWTP / STP, src/engineering)
  E('eng-waste', 'environmental', 'land', ['waste-management', 'recycling', 'environmental'], 0, -2900, 400, -2600),
  // --- mechanical / production
  E('eng-mech-works', 'mechanical', 'land', ['mechanical', 'thermal', 'machine-design', 'production', 'industrial'], 1450, 200, 2050, 650),
  E('eng-vehicle', 'mechanical', 'land', ['automotive', 'vehicle-engineering', 'manufacturing', 'ev'], -500, 2400, 100, 2750),
  E('eng-automation', 'mechanical', 'land', ['mechatronics', 'robotics', 'industrial-automation', 'supply-chain'], 2200, 550, 2800, 1000),
  // --- materials / textile
  E('eng-steel', 'materials', 'land', ['materials', 'metallurgy', 'cement', 'ceramic-glass'], 800, -3900, 1400, -3450),
  E('eng-textile', 'materials', 'land', ['textile', 'leather', 'ceramic'], 550, -2600, 1000, -2250),
  // --- chemical / petroleum / mining
  E('eng-chemical', 'chemical', 'land', ['chemical', 'petroleum-refining', 'process'], 2100, 2050, 2700, 2450),
  E('eng-gasfield', 'resource', 'land', ['petroleum', 'gas', 'drilling'], -3650, 2200, -3150, 2650),
  E('eng-mining', 'resource', 'hill', ['mining', 'minerals', 'quarry'], -3600, -650, -3000, -150),
  E('eng-offshore', 'resource', 'sea', ['offshore', 'petroleum', 'wind'], 1500, 3600, 2100, 4200),
  // --- marine / aerospace
  E('eng-shipyard', 'marine', 'shore', ['naval-architecture', 'marine', 'shipbuilding'], 300, 2850, 800, 3200),
  E('eng-aerospace', 'aerospace', 'land', ['aerospace', 'aerodynamics', 'propulsion'], 1500, -3050, 1950, -2750),
  // --- electrical / energy
  E('eng-thermal-power', 'electrical', 'land', ['power-generation', 'thermal-power'], 700, -3150, 1150, -2850),
  E('eng-grid', 'electrical', 'land', ['power-transmission', 'high-voltage', 'protection'], 150, 2100, 600, 2450),
  E('eng-renewable', 'energy', 'land', ['solar', 'wind', 'renewable', 'battery'], -2750, -2900, -2250, -2550),
  E('eng-nuclear', 'energy', 'land', ['nuclear', 'radiation-safety'], 2950, 2200, 3550, 2700),
  // --- electronics / computer
  E('eng-tech-park', 'electronics', 'land', ['electronics', 'telecom', 'computer-science', 'ai'], 450, -1350, 1050, -900),
  // --- biomedical / safety / rural
  E('eng-biomed', 'biomedical', 'land', ['biomedical'], -1550, 300, -1150, 650),
  E('eng-fire-safety', 'safety', 'land', ['fire-safety', 'disaster', 'building-services'], -100, -2000, 300, -1650),
  E('eng-rural', 'rural', 'land', ['rural', 'tubewell', 'low-cost-housing', 'rural-electrification'], -3000, -1350, -2700, -1100),
];

/**
 * ENTRANCE GATES: areas whose engineering site is built get one opening in the fence, so the player can walk / drive in.
 * side = which edge ('S' = the +z edge), at = world coordinate along that edge, width = opening (m).
 */
export const ENGINEERING_GATES: Readonly<Record<string, { side: 'N' | 'S' | 'E' | 'W'; at: number; width: number }>> = {
  'eng-thermal-power': { side: 'S', at: 925, width: 30 },
  'eng-dam': { side: 'S', at: 3450, width: 30 },
  'eng-vehicle': { side: 'S', at: -129, width: 30 },
};

export const ENGINEERING_BY_ID: ReadonlyMap<string, EngineeringArea> = new Map(ENGINEERING_AREAS.map((a) => [a.id, a]));

/** The engineering area that contains (x, z), or null. Areas never overlap. */
export function getEngineeringAreaAt(x: number, z: number): EngineeringArea | null {
  for (const a of ENGINEERING_AREAS) if (x >= a.x0 && x < a.x1 && z >= a.z0 && z < a.z1) return a;
  return null;
}
