/**
 * SEA PORT MASTER PLAN (data only) - STAGE 14: the real harbour that fills the 'seaport' zone of WorldZones.
 *
 * Shape of the port (west -> east, all on the south coast, the sea is to the south, +z):
 *   fishing harbour | bulk / general cargo quay | container terminal (+ landside: gates, customs, admin, CFS) || oil terminal (tank farm + T-head jetty)
 *   a rubble-mound breakwater (south mole + west wing) shelters the basin; the oil jetty lies OUTSIDE it (explosive cargo: separate, downwind).
 *
 * Earthworks (PortFormation): flat quay decks 5.0 m above sea (oil terrace 9.0 m), cut 1:1.5 / fill 1:2 slopes, dredged berth pockets in front of
 * every quay (15.5 m container, 12.5 m bulk, 4.5 m fishing, 14.5 m oil head), the breakwater mound (crest 6 m).
 * The existing coast road (S30) runs along the back of the port: platforms keep `roadClear` m away from every road, and the two gate roads
 * simply branch off it.
 *
 * Every rectangle edge is snapped to a 15.625 m lattice = the vertex grid of terrain LOD0, LOD1 and LOD2, so a quay edge falls exactly on a
 * terrain vertex row and the collider is flat up to the very edge of the quay at every LOD that has physics.
 * Units: metres, x east, z south, map centre 0,0.
 */
import { Config } from '../core/Config';

const HALF = Config.world.size / 2;
/** Vertex spacing of terrain LOD2 (500 / 32). LOD0 and LOD1 vertex rows are a subset-multiple of it. */
export const LATTICE = Config.world.chunkSize / 32;
export const snap = (v: number): number => Math.round((v + HALF) / LATTICE) * LATTICE - HALF;

export const PORT_DESIGN = {
  /** Quay deck level above sea (m). Real container quays are +4 .. +6 m. */
  deck: 5.0,
  /** Oil terminal terrace / trestle level (m): higher, so a spill cannot run towards the yards. */
  oilDeck: 9.0,
  cutSlope: 1.5,
  fillSlope: 2.0,
  /** How far (m) from a platform edge the cut / fill slope is computed (beyond it the natural ground stays). */
  reach: 60,
  /** Platforms keep this far from the centre of any road (m); between this and `roadClear + roadFade` the earthwork fades out. */
  roadClear: 26,
  roadFade: 14,
  /** Dredged pocket in front of a quay: full depth this far from the quay face (m), then it fades back into the seabed. */
  pocketLen: 70,
  pocketFade: 55,
  pocketSide: 24,
  /** Breakwater: crest height (m above sea), crest half width (m), side slopes (horizontal : vertical). */
  mound: { crest: 6.0, half: 6, slope: 1.6 },
} as const;

export interface PortPlatform {
  id: 'fishing' | 'bulk' | 'landside' | 'container' | 'oil';
  x0: number;
  z0: number;
  x1: number;
  z1: number;
  /** Deck height (m). */
  h: number;
}

const P = (id: PortPlatform['id'], x0: number, z0: number, x1: number, z1: number, h: number = PORT_DESIGN.deck): PortPlatform => ({
  id, x0: snap(x0), z0: snap(z0), x1: snap(x1), z1: snap(z1), h,
});

/** Flat decks. Their union is the port land. All of them are >= 40 m from every road (tested). */
export const PLATFORMS: readonly PortPlatform[] = [
  P('fishing', 1100, 2850, 1330, 2940),
  P('bulk', 1330, 2815, 1700, 2906),
  P('landside', 1700, 2815, 2100, 2850),
  P('container', 1700, 2850, 2200, 2953),
  P('oil', 2290, 2875, 2440, 2940, PORT_DESIGN.oilDeck),
];
export const platform = (id: PortPlatform['id']): PortPlatform => PLATFORMS.find((p) => p.id === id)!;

/** z of the quay faces (the south edge of each platform). */
export const ZQ_FISH = platform('fishing').z1;
export const ZQ_BULK = platform('bulk').z1;
export const ZQ_CONT = platform('container').z1;

export interface Berth {
  id: string;
  kind: 'container' | 'bulk' | 'fishing';
  x0: number;
  x1: number;
  /** z of the quay face; the water is south of it. */
  zq: number;
  /** Dredged depth below sea level (m). */
  depth: number;
}

export const BERTHS: readonly Berth[] = [
  { id: 'fishing', kind: 'fishing', x0: platform('fishing').x0, x1: platform('fishing').x1, zq: ZQ_FISH, depth: 4.5 },
  { id: 'bulk', kind: 'bulk', x0: platform('bulk').x0, x1: platform('bulk').x1, zq: ZQ_BULK, depth: 12.5 },
  { id: 'container', kind: 'container', x0: platform('container').x0, x1: platform('container').x1, zq: ZQ_CONT, depth: 15.5 },
];

/** Vertical quay walls (axis-aligned). `face` = the side the water is on. */
export interface QuayWall {
  id: string;
  /** Wall runs from (x0, z0) to (x1, z1) (one of the two axes is constant). */
  x0: number;
  z0: number;
  x1: number;
  z1: number;
  face: 'S' | 'E' | 'W';
  /** Level of the foot (m, negative = below sea) and of the top. */
  bottom: number;
  top: number;
}
const D = PORT_DESIGN;
export const QUAY_WALLS: readonly QuayWall[] = [
  { id: 'fishing-south', x0: platform('fishing').x0, z0: ZQ_FISH, x1: platform('fishing').x1, z1: ZQ_FISH, face: 'S', bottom: -4.5, top: D.deck },
  { id: 'fishing-east', x0: platform('fishing').x1, z0: ZQ_BULK, x1: platform('fishing').x1, z1: ZQ_FISH, face: 'E', bottom: -4.5, top: D.deck },
  { id: 'bulk-south', x0: platform('bulk').x0, z0: ZQ_BULK, x1: platform('bulk').x1, z1: ZQ_BULK, face: 'S', bottom: -12.5, top: D.deck },
  { id: 'bulk-step', x0: platform('bulk').x1, z0: ZQ_BULK, x1: platform('bulk').x1, z1: ZQ_CONT, face: 'W', bottom: -12.5, top: D.deck },
  { id: 'container-south', x0: platform('container').x0, z0: ZQ_CONT, x1: platform('container').x1, z1: ZQ_CONT, face: 'S', bottom: -15.5, top: D.deck },
  { id: 'container-return', x0: platform('container').x1, z0: ZQ_CONT, x1: platform('container').x1, z1: ZQ_CONT + 62, face: 'W', bottom: -15.5, top: 2.0 },
];

/** Rubble-mound breakwater centre lines (m). The south mole shelters the basin from the open sea, the west wing closes it to the west. */
export interface BreakwaterSeg {
  id: string;
  ax: number;
  az: number;
  bx: number;
  bz: number;
}
export const BREAKWATERS: readonly BreakwaterSeg[] = [
  { id: 'south-mole', ax: 1250, az: 3225, bx: 2150, bz: 3225 },
  { id: 'west-wing', ax: 1250, az: 3225, bx: 1000, bz: 2930 },
];

/** Oil terminal: tank farm terrace + trestle (pipes and a service road on piles) + T-head jetty with the loading arms. */
export const OIL = {
  tankFarm: platform('oil'),
  trunkX: 2365,
  trunkHalf: 5,
  deck: D.oilDeck,
  headZ: 3140,
  headX0: 2305,
  headX1: 2435,
  headHalf: 7,
  /** Dredged pocket around the jetty head: depth (m) and extent. */
  pocket: { x0: 2285, x1: 2465, z0: 3125, z1: 3200, depth: 14.5 },
} as const;

/** Gate roads: branch off the coast road (S30) at these x and run south to the gate booths on the landside strip. */
export const GATES: readonly { id: string; x: number }[] = [
  { id: 'gate-in', x: 1850 },
  { id: 'gate-out', x: 1935 },
];
/** Gate booths sit this far south of the north edge of the landside strip (m). */
export const GATE_Z = platform('landside').z0 + 9;

/** Rectangle of the whole port work area incl. slopes (used for quick rejection and by the HUD). */
export const PORT_BOUNDS = { x0: 980, z0: 2700, x1: 2540, z1: 3340 } as const;
