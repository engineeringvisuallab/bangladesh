import { RAIL_DESIGN as D } from '../rail/RailPlan';

/**
 * STAGE 14 / Step 5a: train constants (pure data, no three.js).
 * Units: metres, seconds. Heights are measured from the TOP OF THE RAIL HEAD (the design height is the top of ballast; the rail head is 0.21 m above it).
 */

/** Rail head top above the top of ballast (m). Same numbers as RailMesh: the rail beam stands 0.04 .. 0.21 m above the ballast. */
export const RAIL_HEAD = 0.21;

/**
 * SPEED: every train speed is SPEED_K (1.5) times the original design (120 km/h -> 180 km/h; station, link and crossover limits too).
 * Accelerations and brakings are scaled by SPEED_K squared, so every DISTANCE stays exactly as designed (braking distance v^2 / 2a, curve speed sqrt(a * R),
 * signal blocks, block horizon, platform approach): the whole simulation just runs SPEED_K times faster. Dwell times at the platforms stay as they were.
 */
export const SPEED_K = 1.5;
const ACC_K = SPEED_K * SPEED_K;

export type CarKind = 'loco' | 'coach' | 'cab';

export interface CarSpec {
  kind: CarKind;
  /** Body length over the buffers (m). */
  length: number;
  /** Distance of each bogie centre from the car centre (m). */
  bogieHalf: number;
  /** True: the model's nose (+x) points to the REAR of the train in the normal (loco-first) orientation. */
  flip: boolean;
}

/** Push-pull set: electric locomotive, four coaches, driving trailer (cab car). After a reversal the cab car leads and the loco pushes. */
export const CONSIST: readonly CarSpec[] = [
  { kind: 'loco', length: 20, bogieHalf: 6.2, flip: false },
  { kind: 'coach', length: 22, bogieHalf: 8, flip: false },
  { kind: 'coach', length: 22, bogieHalf: 8, flip: false },
  { kind: 'coach', length: 22, bogieHalf: 8, flip: false },
  { kind: 'coach', length: 22, bogieHalf: 8, flip: false },
  { kind: 'cab', length: 22, bogieHalf: 8, flip: true },
];

/** Gap between two coupled cars (m). */
export const CAR_GAP = 0.8;

export const TRAIN = {
  /** Trains keep to the left (like the road traffic of the country): each direction uses its own track of the double line. */
  keepLeft: true,
  /** Top speed on the open line (m/s) = 120 km/h x SPEED_K = 180 km/h. */
  maxSpeed: (120 * SPEED_K) / 3.6,
  /** Traction acceleration (m/s^2), service braking used to PLAN the speed envelope, strongest braking the controller may apply. */
  accel: 0.7 * ACC_K,
  serviceBrake: 0.8 * ACC_K,
  maxBrake: 1.0 * ACC_K,
  /** Sideways acceleration the passengers may feel in a curve (m/s^2): v <= sqrt(latAccel * R). */
  latAccel: 1.2 * ACC_K,
  /** Speed limits (m/s): station throat links 40 km/h, crossover (change of track at a terminal) 36 km/h, station approach / departure 60 km/h. */
  linkSpeed: (40 * SPEED_K) / 3.6,
  crossoverSpeed: (36 * SPEED_K) / 3.6,
  approachSpeed: (60 * SPEED_K) / 3.6,
  /** The approach limit starts this far (m) before the stopping point; the departure limit ends this far (m) after the start. */
  approachDist: 350,
  departDist: 200,
  /** Dwell time at a station: between these (s). */
  dwellMin: 20,
  dwellMax: 30,
  /** Where the train centre stops: the middle of the platform, measured from the buffer-stop end of the line (same number the platform mesh uses). */
  platformCentre: 12 + D.platform / 2,
  /** Spare track (m) the path keeps behind the rear of the standing train. */
  tailMargin: 5,
  /** A crossover (terminal reversal, from the arrival track to the other track) starts this far (m) ahead of the leading car and is this long. */
  crossoverGap: 10,
  crossoverLen: 80,
  /** Path sample spacing (m), fixed simulation step (s). */
  sample: 5,
  dt: 0.1,
} as const;

/** Length of the whole train (m). */
export const TRAIN_LENGTH = CONSIST.reduce((a, c) => a + c.length, 0) + CAR_GAP * (CONSIST.length - 1);

/** Distance (m) from the line end to the FRONT of a train that stands with its centre at the platform centre. */
export const STOP_FRONT_D = TRAIN.platformCentre - TRAIN_LENGTH / 2;
