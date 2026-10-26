/**
 * RAILWAY MASTER PLAN (data only) - STAGE 11B: WHERE the railway network goes and where the STATION AREAS are.
 * No track, sleeper, platform or train is built in this stage. The next stages build the tracks on these paths.
 *
 * Network idea (a real-world pattern: a radial network from the central station + a ring through the port):
 *   - the Central Station in the city centre is the hub of every line,
 *   - north line: central -> industrial city freight hub (-> airport branch),
 *   - south line: central -> south interchange -> seaport yard,
 *   - east loop: central -> east industrial works -> seaport (so the port has two ways in),
 *   - OUTER RING: nw-town - north-hub - airport - east-works - port - south-interchange - sw-newtown - nw-town (satellites talk to each other directly),
 *   - west lines: central -> south-west new town, central -> north-west university town (the line has to pass the ridge).
 *
 * Positions are HINTS: each station is moved to the best nearby flat, dry ground (see RailNetwork) and the router finds the
 * path between the stations (gentle slopes, no lakes, as few river and road crossings as possible).
 * Units: metres, x east, z south, map centre = 0,0.
 */
export type StationKind = 'passenger' | 'freight' | 'mixed';

export interface StationPlan {
  id: string;
  kind: StationKind;
  x: number;
  z: number;
  /** Search radius (m) for the best flat, dry ground. */
  snap: number;
  /** Radius (m) of the station area (station building + platforms + yard + forecourt). */
  radius: number;
}

export interface LinePlan {
  id: string;
  from: string;
  to: string;
  /** Optional hint points the track should pass (moved to passable ground by the router). */
  via: readonly (readonly [number, number])[];
}

export const STATIONS: readonly StationPlan[] = [
  { id: 'central', kind: 'passenger', x: 0, z: 300, snap: 250, radius: 300 },
  { id: 'south-interchange', kind: 'passenger', x: 350, z: 1450, snap: 250, radius: 220 },
  { id: 'port', kind: 'mixed', x: 1650, z: 2300, snap: 120, radius: 230 },
  { id: 'east-works', kind: 'mixed', x: 2350, z: -500, snap: 400, radius: 260 },
  { id: 'north-hub', kind: 'freight', x: 360, z: -3300, snap: 300, radius: 330 },
  { id: 'airport', kind: 'passenger', x: 2350, z: -3330, snap: 80, radius: 150 },
  { id: 'nw-town', kind: 'passenger', x: -1950, z: -2700, snap: 200, radius: 220 },
  { id: 'sw-newtown', kind: 'passenger', x: -1900, z: 1700, snap: 250, radius: 220 },
];

export const LINES: readonly LinePlan[] = [
  { id: 'south-1', from: 'central', to: 'south-interchange', via: [] },
  { id: 'south-2', from: 'south-interchange', to: 'port', via: [] },
  { id: 'north-1', from: 'central', to: 'north-hub', via: [[250, -1500]] },
  { id: 'airport-branch', from: 'north-hub', to: 'airport', via: [[1500, -3350]] },
  { id: 'east-1', from: 'central', to: 'east-works', via: [[1100, -50]] },
  { id: 'east-2', from: 'east-works', to: 'port', via: [[2250, 800], [2100, 1900]] },
  { id: 'west-nw', from: 'central', to: 'nw-town', via: [[-1100, -300], [-2100, -900], [-2300, -1900]] },
  { id: 'west-sw', from: 'central', to: 'sw-newtown', via: [[-1000, 800]] },
  // OUTER RING: the satellite stations are joined to each other, so nobody has to change at the Central Station to reach another district.
  { id: 'ring-north', from: 'nw-town', to: 'north-hub', via: [[-700, -2750]] },
  { id: 'ring-northeast', from: 'airport', to: 'east-works', via: [[2350, -2900], [3000, -1700]] },
  { id: 'ring-south', from: 'sw-newtown', to: 'south-interchange', via: [[-1000, 1300], [-300, 1500]] },
  { id: 'ring-west', from: 'nw-town', to: 'sw-newtown', via: [[-2400, -1000], [-2800, -500], [-2700, 400], [-2400, 1300]] },
];

/** Gentle-line design limits (a heavy railway: far gentler than a road). */
export const RAIL_DESIGN = {
  /** Steepest allowed grade (rise / run). */
  maxGrade: 0.025,
  /** Safety margin (rise/run) the profile solver keeps below the limit; samples are not always exactly `step` apart. */
  gradeMargin: 0.0001,
  /** Where a steeper grade is needed, it is used only within this distance (m) of a river deck / road window. */
  gradeReach: 500,
  /** Steeper grade allowed for a short section (<= 640 m) where a crossing cannot be reached otherwise. */
  maxGradeException: 0.035,
  /** Smallest curve radius (m) the smoothed path should keep. */
  minRadius: 250,
  /** STAGE 13: the alignment pass stiffens the line wherever the radius (3-sample circle) is below this (m); it may move a point this far (m). */
  curveGoal: 150,
  curveMove: 90,
  /** How many samples (x 20 m) on each side of a tight bend are re-stiffened together (a short window cannot turn gently enough). */
  curveWindow: 50,
  /** Sample spacing along the centre line (m). */
  step: 20,
  /** Tunnel where the ground is this much above the line (m) for at least `tunnelMinLen` m. */
  tunnelCut: 14,
  tunnelMinLen: 120,
  /** Viaduct / bridge where the line is this much above the ground (m) for at least `bridgeMinLen` m, or over water. */
  bridgeFill: 10,
  bridgeMinLen: 100,
  /** Cutting / embankment deeper than this (m) decides which of road or rail goes over at a crossing. */
  crossCutFill: 4,

  /* ---- STAGE 12: cross-section (all heights are TOP OF BALLAST = "design"; rail head is 0.2 m above) ---- */
  /** Two tracks (double track), centre to centre; standard gauge. */
  trackSpacing: 4.5,
  gauge: 1.435,
  /** Ballast: half width at the top / at the foot, thickness (m). The terrain under it is `ballast` lower than the design height. */
  ballastTop: 3.9,
  ballastFoot: 5.0,
  ballast: 0.45,
  /** Flat formation (embankment top / cutting floor) half width (m), then slopes (horizontal : vertical). */
  formationHalf: 8.5,
  fillSlope: 2.0,
  cutSlope: 1.5,
  /** Longest slope run (m) on either side - deeper cuts are tunnelled, higher fills are viaducts. */
  slopeMax: 30,
  /** Railway land (fence to fence) half width on open line (m). Nothing else may be built inside. */
  rowHalf: 14,
  /** Viaduct: deck half width, deck thickness, normal span (m), longest span (m), pier column size (m). */
  deckHalf: 5.8,
  deckThick: 2.2,
  spanNormal: 30,
  spanMax: 46,
  /** Steel through-girder: longest span without a pier (m). */
  spanSteelMax: 120,
  pierSize: 3.2,
  /** Vertical clearance: rail OVER a road needs the girder underside this far above the road; rail UNDER a road (cut & cover box) needs the track this far below the road surface. */
  roadClearance: 5.2,
  overRoadRise: 7.4,
  underRoadDrop: 7.4,
  /** Rail over a river: deck underside above the highest water (m). */
  waterClearance: 2.5,
  /** Horizontal gap between a pier column and the road edge (asphalt + shoulder) (m). */
  pierRoadGap: 1.6,
  /** Stations: the last `endR` m before the station centre are not used; platforms are `platform` m long, flat for `flat` m. */
  endR: 70,
  platform: 150,
  stationFlat: 290,
  /** Electrification: 25 kV 50 Hz AC overhead line. Contact wire / messenger wire heights above the top of ballast (m); mast spacing (m). */
  contactHeight: 5.5,
  messengerHeight: 6.9,
  mastSpacing: 50,
  /** Minimum angle between two lines arriving at the same station (deg). */
  minArrivalGap: 26,
  /** STAGE 13: station throat links (through-running connections between two lines of one station): smallest curve radius (m). */
  linkMinRadius: 120,
  /** STAGE 13 / Step 4: switch blades (m, upper limit), and the smallest crossing angle (deg) of two link tracks that gets a diamond crossing (smaller = the tracks just run side by side). */
  switchBladeMax: 7.5,
  diamondMinAngle: 25,
  /** Gap (m) between two structures below which they are joined into one viaduct. */
  mergeGap: 110,
  /** Minimum distance (m) between two different lines outside station areas. */
  lineGap: 40,
} as const;
