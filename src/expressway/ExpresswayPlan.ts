/**
 * CITY FLYOVERS - MASTER PLAN (data only).
 *
 * Only THREE short elevated flyovers (4 + 4 lanes) connect the city to its most important outer areas. There is no ring and no
 * expressway network any more:
 *   - FL1 (east): city -> east industrial works (east-works) and the east logistics area;
 *   - FL2 (north): city -> north heavy industry / north logistics city;
 *   - FL3 (port): city -> port industry and the seaport gate.
 * Both ends of every flyover come down to the ground (full-width descent), so no separate ramps are needed.
 *
 * Units: metres, x east, z south, map centre 0,0. Waypoints are only HINTS for a smooth Catmull-Rom curve (the curve passes
 * through every point, so the end positions are exact).
 */

export const XP = {
  /** Deck half width (m): 4 lanes x 3.6 m + 1.5 m inner shoulder per side, 2 m median barrier, 2.6 m outer shoulder + barrier. */
  deckHalf: 20,
  lanePerSide: 4,
  laneW: 3.6,
  /** Inner edge of the first lane (m from the centre line): half the median barrier + inner shoulder. */
  laneStart: 2.5,
  medianHalf: 1.0,
  slabThick: 1.6,
  /** Ramp: half width (2 lanes + shoulders), maximum grade. */
  rampHalf: 5.6,
  rampGrade: 0.055,
  /** A ramp lands on an ordinary road at most this far (m, straight line) from where it leaves the deck, and is never longer than rampMaxLen. */
  rampReach: 650,
  rampMaxLen: 950,
  /** Minimum free height (m) between the ground (highest point across the deck width) and the underside of the deck... */
  clearance: 9,
  /** ... and the deck surface is never lower than this above sea level (m). */
  minDeckY: 8,
  /** Steepest grade of the main deck (rise / run): trucks stay in gear. */
  maxGrade: 0.04,
  /** Grade of the full-width descent at a dead end. */
  endGrade: 0.045,
  /** Distance between centre-line points (m) of the deck and of the ramps. */
  step: 10,
  rampStep: 8,
  /** Pier spacing (m) along the deck / ramp. */
  pierSpacing: 36,
  /** Extra height (m) the N-SE diameter gets over the W-E diameter at the city centre, and the length over which it climbs / falls. */
  centreLift: 9.5,
  liftFrom: 750,
  liftTo: 260,
  /** Length (m) over which the outer barrier is left open at a ramp (merge / diverge lane). */
  gapHalf: 95,
} as const;

export type XKind = 'flyover' | 'ramp';

export interface XRoutePlan {
  name: string;
  kind: 'flyover';
  closed: boolean;
  /** A dead end comes down to the ground (full width, `endGrade`) instead of stopping in the air. */
  descend?: 'start' | 'end' | 'both';
  pts: readonly (readonly [number, number])[];
}

/** The 12 ring interchanges (number, name, position on the ring). 1 is at the end of the port spur. */
export interface XInterchangePlan {
  n: number;
  id: string;
  x: number;
  z: number;
  /** Ramp target hint: the ramp comes down on the nearest ordinary road to this point (default: the interchange). */
  hint?: readonly [number, number];
  /** Which route the interchange sits on. */
  route: string;
  /** Ramp leaves on this side of the direction of travel (+1 left, -1 right); 0 = whichever side has the nearest road. */
  side?: -1 | 0 | 1;
  /** The ramp does not look for a road: it ends on open ground (future airport). */
  open?: boolean;
}

export const ROUTE_PLANS: readonly XRoutePlan[] = [
  // FL1: city (east edge of the centre) -> east industrial works / east logistics
  { name: 'FL1', kind: 'flyover', closed: false, descend: 'both', pts: [[420, -120], [1100, -120], [1700, -60], [2100, -200], [2300, -450]] },
  // FL2: city (north of the centre) -> north heavy industry / north logistics
  { name: 'FL2', kind: 'flyover', closed: false, descend: 'both', pts: [[100, -450], [150, -650], [206, -1000], [276, -1900], [330, -2800], [230, -3250]] },
  // FL3: city (south-east of the centre) -> port industry -> seaport gate
  { name: 'FL3', kind: 'flyover', closed: false, descend: 'both', pts: [[420, 420], [900, 900], [1150, 1500], [1450, 1950], [1650, 2250], [1750, 2550], [1900, 2790]] },
];

/** The 6 flyover ends (3 in the city, 3 in the industrial / important areas). Each end is a descending deck, so no ramp is built. */
export const INTERCHANGES: readonly XInterchangePlan[] = [
  { n: 1, id: 'city-east', x: 420, z: -120, route: 'FL1' },
  { n: 2, id: 'east-works', x: 2300, z: -450, route: 'FL1' },
  { n: 3, id: 'city-north', x: 100, z: -450, route: 'FL2' },
  { n: 4, id: 'north-industry', x: 230, z: -3250, route: 'FL2' },
  { n: 5, id: 'city-southeast', x: 420, z: 420, route: 'FL3' },
  { n: 6, id: 'port-gate', x: 1900, z: 2790, route: 'FL3' },
];

/** City freight ramps: none (the flyovers come down at both ends). */
export interface XCityRampPlan {
  id: string;
  route: string;
  at: readonly [number, number];
  hint: readonly [number, number];
}

export const CITY_RAMPS: readonly XCityRampPlan[] = [];
