/**
 * ROAD MASTER PLAN (data only). Inspired by the "Engineering Strategic Planning Map: City-State Project X".
 *
 * The network is built TIER BY TIER, never all at once (Config.roads.activeTier):
 *   Tier 1  MAIN roads (freeways)       - outer ring + central N-S + central E-W      <- Stage 6A (this file)
 *   Tier 2  PRIMARY roads (arterials)   - connect the city sites / districts to the main roads   (Stage 6B)
 *   Tier 3  SECONDARY roads (collectors)- connect neighbourhoods to the primary roads            (Stage 6C)
 *   Tier 4  TERTIARY roads (local)      - city street grids, roundabouts, ring roads of the sites (Stage 6D)
 *
 * All coordinates are world metres (x east, z south, map centre = 0,0, world = 10 km x 10 km, sea in the south).
 * `via` points are only HINTS: each one is moved to the best nearby ground (flat, dry, low) and the A* router
 * finds the real path between them, so the roads follow the terrain instead of climbing mountains.
 */
export interface PlanNode {
  id: string;
  x: number;
  z: number;
  /** Search radius (m) for the nearest flat, dry spot. */
  snap: number;
  /** If set: the node is the hub of this city site (x, z are ignored). */
  site?: number;
  type: 'T' | '4way';
}

export interface PlanEdge {
  name: string;
  from: string;
  to: string;
  via: readonly (readonly [number, number])[];
}

/** Junctions where main roads meet. C = "Central Transport Interchange" at the map centre (spawn / city site 0). */
export const MAIN_NODES: readonly PlanNode[] = [
  { id: 'C', x: 0, z: 0, snap: 0, site: 0, type: '4way' },
  { id: 'N', x: 360, z: -3650, snap: 300, type: 'T' },
  { id: 'E', x: 2700, z: -300, snap: 500, type: 'T' },
  { id: 'S', x: 150, z: 2350, snap: 300, type: 'T' },
  { id: 'W', x: -2850, z: -500, snap: 500, type: 'T' },
];

/**
 * The hints follow the low, flat plain of this map (|x| < ~2.8 km, between the northern ridge and the coast);
 * the mountain rim (east / west / north edges) is left alone.
 */
export const MAIN_EDGES: readonly PlanEdge[] = [
  // --- outer ring freeway (clockwise from the north): 3 arcs; the NW arc is a ridge gap (see below) ---
  { name: 'F1', from: 'N', to: 'E', via: [[1500, -3500], [2600, -3200], [2700, -2300], [2700, -1300]] },
  { name: 'F2', from: 'E', to: 'S', via: [[2750, 500], [2700, 1500], [2500, 2200], [1400, 2400]] },
  { name: 'F3', from: 'S', to: 'W', via: [[-1000, 2350], [-2000, 2250], [-2500, 1500], [-2850, 800]] },
  // NW arc (W -> N) intentionally missing: a 100+ m ridge blocks it. The gap is closed by a PRIMARY road later (Stage 6B).
  // --- central north-south freeway (passes the hub of city site 2 in the north, ends at the coast ring) ---
  { name: 'F4', from: 'C', to: 'N', via: [[180, -900], [250, -1900], [360, -3120]] },
  { name: 'F5', from: 'C', to: 'S', via: [[-100, 900], [100, 1700]] },
  // --- central east-west freeway ---
  { name: 'F6', from: 'W', to: 'C', via: [[-2000, -600], [-1000, -250]] },
  { name: 'F7', from: 'C', to: 'E', via: [[1100, -150], [1900, -500]] },
];

/**
 * TIER 2: PRIMARY roads (arterials), Stage 6B.
 *  - an inner ring road around the central interchange, split into 8 arcs: 4 arcs end on the main roads
 *    (E, S, W, N spokes) and 4 "diagonal" nodes in between;
 *  - 3 radial arterials from the diagonal nodes out to the outer ring freeway (NE, SE, SW);
 *  - the NW diagonal runs to city site 1, and site 1 is joined to the north-south freeway beside city site 2.
 * Angles: 0 = east, 90 = south, 180 = west, 270 = north (x east, z south).
 */
export const PRIMARY = {
  ringRadius: 950,
  /** Main road that leaves the centre in each spoke direction (angle -> road name). */
  spokes: { 0: 'F7', 90: 'F5', 180: 'F6', 270: 'F4' } as Record<number, string>,
  /** Radial arterials: diagonal angle -> target point on a main road (nearest point of that road to x, z). */
  radials: [
    { angle: 315, road: 'F1', x: 2300, z: -2800 },
    { angle: 45, road: 'F2', x: 2500, z: 1800 },
    { angle: 135, road: 'F3', x: -2300, z: 1700 },
  ],
  /** The NW diagonal goes to the hub of this city site; that site then links to the N-S freeway. */
  nwSite: 1,
  siteLink: { road: 'F4', x: 340, z: -2800 },
} as const;

/**
 * TIER 3: SECONDARY roads (collectors), Stage 6C.
 *  - a middle ring road (radius 1.9 km) in 8 arcs; every arc ends on a road of tier 1/2 (the 4 main spokes and the
 *    4 diagonal arterials), so the ring "collects" traffic from the districts between the spokes;
 *  - a link from the hub of city site 2 east to the outer ring freeway.
 */
export const SECONDARY = {
  ringRadius: 1900,
  siteLink: { site: 2, road: 'F1', x: 1600, z: -3450 },
} as const;

/**
 * TIER 3 (continued): DISTRICT LINKS (collectors) = the remaining roads of the reference map, traced by hand.
 * The reference map is treated as exactly 10 km x 10 km (map centre = world 0,0; 1 map px = 9.26 m).
 * Each entry is a polyline of HINT points in world metres (x east, z south). The first and last point attach to the nearest
 * existing road (within `DISTRICT_LINK_SNAP` m) or to another link end; otherwise they stay free ends (village hubs, Stage 6D).
 * Middle points are only hints: the A* router moves them onto flat dry ground.
 */
export const DISTRICT_LINK_SNAP = 650;
export const DISTRICT_LINKS: readonly (readonly (readonly [number, number])[])[] = [
  [[-2640, -3040], [-2040, -2910], [-1390, -2560], [-1130, -2220], [-370, -1900], [300, -1560]],  // S10
  [[-2640, -3040], [-2570, -3380], [-2820, -3700], [-3100, -3910]],  // S11
  [[-2640, -3040], [-2890, -2390], [-2590, -1810], [-2390, -1310], [-1760, -1020], [-1160, -810]],  // S12
  [[-140, -4120], [50, -3610], [190, -3010]],  // S13
  [[1360, -3200], [1390, -3610], [1410, -4060]],  // S14
  [[1360, -3200], [1300, -2570], [2130, -2470], [2280, -2110], [1760, -1440], [1570, -910]],  // S15
  [[2960, -2310], [3060, -1810], [3240, -1440], [3800, -1160]],  // S16
  [[2960, -2310], [3190, -2360], [3610, -2730], [3890, -3060]],  // S17
  [[3010, -420], [2780, -560], [2220, -540], [1850, -810], [1570, -910]],  // S18
  [[-2590, 760], [-2130, 900], [-1810, 1020], [-1560, 890], [-1160, 610], [-370, 530]],  // S19
  [[-2590, 760], [-2410, 1530], [-2360, 1850], [-2550, 2080], [-2570, 2590]],  // S20
  [[-2570, 2590], [-1990, 2610], [-1570, 2650], [-970, 2960]],  // S21
  [[-2570, 2590], [-1760, 2270], [-1020, 1760], [-740, 1440], [-370, 930]],  // S22
  [[-3840, 1220], [-3380, 1060], [-2940, 830], [-2590, 760]],  // S23
  [[2360, 970], [1570, 930], [1110, 650], [600, 930], [420, 1530]],  // S24
  [[2360, 970], [2450, 1480], [2080, 1990], [2040, 2410], [2870, 2870]],  // S25
  [[2360, 970], [3240, 600], [3940, 320], [4260, 140]],  // S26
  [[2870, 2870], [2040, 2730], [1760, 2890], [1160, 2960]],  // S27
  [[2870, 2870], [3610, 2690], [3700, 2500], [4070, 2220]],  // S28
];

/**
 * THE ISLAND (Config.terrain.island): a long bridge from the mainland south coast to the island, and a first road network on
 * the island (the street grid / luxury mini city follows later).
 *
 *  - IB  : the bridge road (4-lane highway). It leaves a road of tier 1-3 near `join` (A* over land), runs to the south coast
 *          and then straight over the strait (the wet part becomes an arch bridge with piers) to the island ring road.
 *  - IR1..4 : the island ring road (arterial), 4 arcs, at `ringShare` of the local shore radius (the shore is bent by noise).
 *  - IS1..4 : 4 spokes (collectors) from the ring to the island centre (the future city centre).
 * The 4 ring nodes sit at 90 degrees to each other; node 0 faces the mainland, where the bridge arrives.
 */
export const ISLAND_PLAN = {
  /** Where the bridge reaches the south coast (hint; the real landing is the last dry point on the line to the island). */
  coast: [-1450, 2900] as readonly [number, number],
  /** Mainland roads (tier 1-3) are searched near this point for the bridge's first junction. */
  join: [-1450, 2750] as readonly [number, number],
  /** Longest distance (m) from `join` to an existing road that the bridge approach may use. */
  joinReach: 900,
  /** Ring radius as a share of the (smoothed) shore radius. */
  ringShare: 0.5,
  /** Ground the ring and the spokes need: dry and higher than this (m). */
  minGround: 3.5,
} as const;
