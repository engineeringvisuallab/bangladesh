import { USE, type VehicleUse } from './VehicleUse';

/** Data describing a vehicle. Adding a new vehicle = adding one more spec (Stage 9 traffic, Stage 11 trucks/cranes reuse this). */
export interface EngineSpec {
  idleRpm: number;
  redlineRpm: number;
  /** [rpm, torque in Nm] at full throttle, linearly interpolated. */
  torque: [number, number][];
  /** Closed-throttle drag torque at redline (Nm); scales with rpm. */
  engineBraking: number;
  /** Clutch-slip launch rpm at full throttle (default 1900). Pedals / electric motors / diesels need other values. */
  launchRpm?: number;
}

export type VehicleId = 'sedan' | 'jeep' | 'hypercar' | 'evhypar' | 'bike' | 'evbike' | 'rickshaw' | 'auto' | 'bus' | 'tank' | 'tractor' | 'combine' | 'pickup' | 'suprim';

/** One wheel of the raycast vehicle. `drive` = share of the drive force, `side` = track side for skid steering (+1 left, -1 right). */
export interface WheelDef {
  x: number;
  z: number;
  steer: boolean;
  drive: number;
  side: -1 | 0 | 1;
}

/** A passenger seat (chassis-local hips position). */
export interface SeatDef {
  x: number;
  y: number;
  z: number;
  scale: number;
}

export interface VehicleSpec {
  id: VehicleId;
  /** Player-facing name (Bangla). */
  nameBn: string;
  mass: number;
  /** Chassis collider half extents (m). */
  half: { x: number; y: number; z: number };
  /** Centre-of-mass height relative to the chassis centre (negative = lower = more stable). */
  comY: number;
  wheelRadius: number;
  wheelWidth: number;
  /** Half track width and half wheelbase (m). */
  trackHalf: number;
  wheelbaseHalf: number;
  /** Suspension mounting height (chassis-local y). */
  connY: number;
  susp: { rest: number; travel: number; stiffness: number; compression: number; relaxation: number };
  frictionSlip: number;
  sideFriction: number;
  drive: 'rwd' | 'awd' | 'track';
  /** Share of the drive torque sent to the front axle when awd. */
  frontShare: number;
  engine: EngineSpec;
  /** Forward gear ratios (1st..nth). */
  gears: number[];
  reverse: number;
  finalDrive: number;
  /** Transmission efficiency 0..1. */
  efficiency: number;
  /** Brake value per wheel at full pedal (Rapier units, see calibration test). */
  brakeMax: number;
  /** Steering lock at standstill (rad). */
  maxSteer: number;
  /** Aerodynamic drag: Cd and frontal area (m^2). */
  cd: number;
  frontalArea: number;
  /** Aerodynamic downforce as Cl x area (m^2): presses the car onto the road with 0.5 x rho x downforce x v^2 (supercars). */
  downforce?: number;
  /** Where AI traffic may put this vehicle (road kinds + world zones + how often). Required: see VehicleUse. */
  use: VehicleUse;
  look: { kind: VehicleId; body: number; accent: number };
  /** Custom wheel layout (bike, rickshaw, auto, bus, tank). Without it: 4 wheels from trackHalf / wheelbaseHalf. */
  wheels?: WheelDef[];
  /** Chassis collider centre height (chassis-local). Default 0. */
  colliderY?: number;
  /** Centre-of-mass offset along the body (+ = towards the nose). Default 0 = midway between the axles. */
  comZ?: number;
  /** Passenger seats (the driver's seat is `seat`). */
  seats?: SeatDef[];
  /** How many passengers AI traffic puts in: [min, max]. */
  pax?: [number, number];
  /** Enclosed body: a bullet that hits the lower body does not reach the people inside. */
  enclosed?: boolean;
  /** Bullets (of an average gun) that blow the vehicle up. 10 / 15 for ordinary vehicles. */
  bulletsToKill: number;
  /** Crash toughness: 1 = ordinary car, < 1 = tougher (a bus), > 1 = more fragile (a bike). */
  fragile: number;
  /** Self-balancing (two wheels): a roll controller keeps the bike up, leaning into bends, until it crashes. */
  balance?: boolean;
  /** Tracked vehicle: steers by driving the two sides at different speeds. */
  skid?: { turnForce: number; yawAssist: number };
  /** AI top speed (m/s). */
  cruiseMax?: number;
  /** Orbit camera: start distance, min, max. */
  camera?: { dist: number; min: number; max: number };
  /** Windscreen / cabin line: chassis-local y above which the people inside are visible to bullets (enclosed vehicles). */
  windowY?: number;
  /**
   * Road + air + water vehicle (EVCity Suprim). Besides driving it has a flight mode (N, wings + VTOL thrusters, Space = up) and a water
   * mode (C = dive like a submarine, T = float on the surface). See Vehicle.mode / SUPRIM_FLIGHT.
   */
  amphibious?: boolean;
  /** Tank: turret pivot (chassis-local) and barrel length. */
  turret?: { y: number; z: number; barrel: number; maxPitch: number; minPitch: number; turnRate: number };
  /** Where the driver sits (chassis-local, hips) and how big he looks inside. Right-hand drive: Bangladesh drives on the LEFT. */
  seat: { x: number; y: number; z: number; scale: number };
}

/** Wheel layout of a spec: 0 front-left, 1 front-right, 2 rear-left, 3 rear-right for the plain 4-wheel vehicles. */
export function wheelDefs(s: VehicleSpec): WheelDef[] {
  if (s.wheels) return s.wheels;
  const f = s.drive === 'awd' ? s.frontShare / 2 : 0;
  const r = s.drive === 'awd' ? (1 - s.frontShare) / 2 : 0.5;
  return [
    { x: s.trackHalf, z: s.wheelbaseHalf, steer: true, drive: f, side: 1 },
    { x: -s.trackHalf, z: s.wheelbaseHalf, steer: true, drive: f, side: -1 },
    { x: s.trackHalf, z: -s.wheelbaseHalf, steer: false, drive: r, side: 1 },
    { x: -s.trackHalf, z: -s.wheelbaseHalf, steer: false, drive: r, side: -1 },
  ];
}

/** Static suspension sag (m): n wheels x stiffness x sag = g (stiffness is per unit mass in Rapier's controller). */
export function suspSag(s: VehicleSpec): number {
  return 9.81 / (wheelDefs(s).length * s.susp.stiffness);
}

/** Chassis-local height of the ground under the loaded vehicle. */
export function groundY(s: VehicleSpec): number {
  return s.connY - (s.susp.rest - suspSag(s)) - s.wheelRadius;
}

/** Brake value that gives `decel` m/s^2 (calibrated on the sedan: 55 per wheel = 8.8 m/s^2). */
export function brakeFor(mass: number, wheels: number, decel: number): number {
  return (decel * mass) / (50 * wheels);
}

export const SEDAN: VehicleSpec = {
  id: 'sedan',
  nameBn: 'সেডান গাড়ি',
  mass: 1250,
  half: { x: 0.9, y: 0.35, z: 2.15 },
  comY: -0.2,
  wheelRadius: 0.33,
  wheelWidth: 0.22,
  trackHalf: 0.8,
  wheelbaseHalf: 1.3,
  connY: -0.1,
  susp: { rest: 0.35, travel: 0.25, stiffness: 22, compression: 2.3, relaxation: 3.0 },
  frictionSlip: 9,
  sideFriction: 1,
  drive: 'rwd',
  frontShare: 0,
  engine: {
    idleRpm: 900,
    redlineRpm: 6500,
    torque: [[900, 100], [1500, 135], [2500, 165], [3500, 185], [4500, 190], [5500, 175], [6500, 145]],
    engineBraking: 45,
  },
  gears: [3.6, 2.2, 1.5, 1.13, 0.92],
  reverse: 3.4,
  finalDrive: 4.1,
  efficiency: 0.9,
  brakeMax: 55,
  maxSteer: 0.55,
  cd: 0.32,
  frontalArea: 2.1,
  use: USE.car(0.28),
  look: { kind: 'sedan', body: 0xb8302a, accent: 0x222a33 },
  seat: { x: -0.42, y: -0.1, z: 0.25, scale: 0.9 },
  seats: [
    { x: 0.42, y: -0.1, z: 0.25, scale: 0.9 },
    { x: 0.42, y: -0.1, z: -0.75, scale: 0.9 },
    { x: -0.42, y: -0.1, z: -0.75, scale: 0.9 },
  ],
  pax: [0, 3],
  enclosed: true,
  windowY: 0.28,
  bulletsToKill: 10,
  fragile: 1,
  camera: { dist: 9, min: 5, max: 28 },
};

export const JEEP: VehicleSpec = {
  id: 'jeep',
  nameBn: 'জিপ (৪×৪)',
  mass: 1750,
  half: { x: 0.95, y: 0.42, z: 2.0 },
  comY: -0.35,
  wheelRadius: 0.42,
  wheelWidth: 0.28,
  trackHalf: 0.9,
  wheelbaseHalf: 1.2,
  connY: -0.05,
  susp: { rest: 0.5, travel: 0.35, stiffness: 17, compression: 2.0, relaxation: 2.6 },
  frictionSlip: 11,
  sideFriction: 1,
  drive: 'awd',
  frontShare: 0.4,
  engine: {
    idleRpm: 800,
    redlineRpm: 4800,
    torque: [[800, 190], [1500, 320], [2500, 380], [3500, 350], [4200, 300], [4800, 240]],
    engineBraking: 60,
  },
  gears: [4.2, 2.5, 1.6, 1.05, 0.8],
  reverse: 4.0,
  finalDrive: 4.9,
  efficiency: 0.88,
  brakeMax: 72,
  maxSteer: 0.6,
  cd: 0.48,
  frontalArea: 2.9,
  use: USE.car(0.1),
  look: { kind: 'jeep', body: 0xd9dde0, accent: 0x24282c },
  seat: { x: -0.45, y: 0.02, z: 0.05, scale: 0.95 },
  seats: [
    { x: 0.45, y: 0.02, z: 0.05, scale: 0.95 },
    { x: 0.45, y: 0.02, z: -0.9, scale: 0.95 },
    { x: -0.45, y: 0.02, z: -0.9, scale: 0.95 },
  ],
  pax: [0, 3],
  enclosed: true,
  windowY: 0.42,
  bulletsToKill: 15,
  fragile: 0.8,
  camera: { dist: 9, min: 5, max: 28 },
};

/**
 * Seat heights / collider clearance / turret height of the specs below are written as metres ABOVE THE GROUND;
 * `finish` turns them into chassis-local values using the real (loaded) suspension height.
 */
function finish(s: VehicleSpec, clearance: number, seatH: number, paxH: number[], turretH?: number, windowH?: number): VehicleSpec {
  const g = groundY(s);
  s.colliderY = g + clearance + s.half.y;
  s.seat = { ...s.seat, y: g + seatH };
  s.seats = (s.seats ?? []).map((q, i) => ({ ...q, y: g + (paxH[i] ?? paxH[paxH.length - 1] ?? seatH) }));
  if (turretH !== undefined && s.turret) s.turret = { ...s.turret, y: g + turretH };
  if (windowH !== undefined) s.windowY = g + windowH;
  return s;
}

const PEDAL_ENGINE: EngineSpec = {
  idleRpm: 40,
  redlineRpm: 85,
  launchRpm: 70,
  torque: [[40, 95], [85, 80]],
  engineBraking: 4,
};

/**
 * EVCity electric sport bike: real sport-bike proportions (wheelbase 1.44 m, 17-inch wheels, seat 0.79 m, centre of mass 0.6 m above the
 * road with the rider). Two wheels: a roll controller plays the rider (see Vehicle.balanceBike) and leans it into bends.
 */
export const BIKE: VehicleSpec = finish({
  id: 'bike',
  nameBn: 'মোটরবাইক',
  mass: 215,
  half: { x: 0.22, y: 0.3, z: 0.95 },
  comY: 0.1,
  comZ: -0.04,
  wheelRadius: 0.31,
  wheelWidth: 0.15,
  trackHalf: 0,
  wheelbaseHalf: 0.72,
  connY: -0.02,
  susp: { rest: 0.27, travel: 0.16, stiffness: 48, compression: 3.2, relaxation: 4.0 },
  frictionSlip: 9,
  sideFriction: 1,
  drive: 'rwd',
  frontShare: 0,
  wheels: [
    { x: 0, z: 0.72, steer: true, drive: 0, side: 0 },
    { x: 0, z: -0.72, steer: false, drive: 1, side: 0 },
  ],
  engine: {
    idleRpm: 1400,
    redlineRpm: 9000,
    launchRpm: 4000,
    torque: [[1400, 20], [3000, 27], [5000, 31], [7000, 29], [9000, 23]],
    engineBraking: 8,
  },
  gears: [2.9, 1.9, 1.4, 1.1],
  reverse: 2.5,
  finalDrive: 3.6,
  efficiency: 0.9,
  brakeMax: brakeFor(215, 2, 4.8),
  maxSteer: 0.5,
  cd: 0.62,
  frontalArea: 0.5,
  use: USE.bike(0.2),
  look: { kind: 'bike', body: 0xc7ccd1, accent: 0x1a1d21 },
  seat: { x: 0, y: 0, z: -0.24, scale: 0.9 },
  seats: [{ x: 0, y: 0, z: -0.68, scale: 0.86 }],
  pax: [0, 1],
  enclosed: false,
  bulletsToKill: 10,
  fragile: 1.7,
  balance: true,
  cruiseMax: 15,
  camera: { dist: 6, min: 3, max: 18 },
}, 0.2, 0.875, [0.93]);

/** Cycle rickshaw: one front wheel, two rear wheels, pedal power (about 15 km/h at best). */
export const RICKSHAW: VehicleSpec = finish({
  id: 'rickshaw',
  nameBn: 'রিকশা',
  mass: 230,
  half: { x: 0.6, y: 0.5, z: 1.3 },
  comY: -0.12,
  wheelRadius: 0.34,
  wheelWidth: 0.06,
  trackHalf: 0.52,
  wheelbaseHalf: 0.8,
  connY: -0.05,
  susp: { rest: 0.3, travel: 0.2, stiffness: 33, compression: 3.0, relaxation: 3.4 },
  frictionSlip: 7,
  sideFriction: 1,
  drive: 'rwd',
  frontShare: 0,
  wheels: [
    { x: 0, z: 1.05, steer: true, drive: 0, side: 0 },
    { x: 0.52, z: -0.55, steer: false, drive: 0.5, side: 1 },
    { x: -0.52, z: -0.55, steer: false, drive: 0.5, side: -1 },
  ],
  engine: PEDAL_ENGINE,
  gears: [0.75],
  reverse: 0.75,
  finalDrive: 1,
  efficiency: 0.9,
  brakeMax: brakeFor(230, 3, 3.5),
  maxSteer: 0.55,
  cd: 0.9,
  frontalArea: 0.8,
  use: USE.rickshaw(0.12),
  look: { kind: 'rickshaw', body: 0x2e6fbd, accent: 0xe8c23a },
  seat: { x: 0, y: 0, z: 0.38, scale: 0.95 },
  seats: [
    { x: 0.2, y: 0, z: -0.5, scale: 0.88 },
    { x: -0.2, y: 0, z: -0.5, scale: 0.88 },
  ],
  pax: [0, 2],
  enclosed: false,
  bulletsToKill: 10,
  fragile: 1.4,
  cruiseMax: 3.9,
  camera: { dist: 7, min: 3, max: 18 },
}, 0.25, 0.98, [0.66]);

/** Electric three-wheeler ("easy bike"): front wheel steers, motor drives the rear axle. */
export const AUTO: VehicleSpec = finish({
  id: 'auto',
  nameBn: 'সিএনজি অটোরিকশা',
  mass: 520,
  half: { x: 0.7, y: 0.75, z: 1.4 },
  comY: -0.3,
  wheelRadius: 0.28,
  wheelWidth: 0.14,
  trackHalf: 0.62,
  wheelbaseHalf: 0.95,
  connY: -0.25,
  susp: { rest: 0.4, travel: 0.25, stiffness: 33, compression: 3.0, relaxation: 3.4 },
  frictionSlip: 8,
  sideFriction: 1,
  drive: 'rwd',
  frontShare: 0,
  wheels: [
    { x: 0, z: 1.15, steer: true, drive: 0, side: 0 },
    { x: 0.62, z: -0.8, steer: false, drive: 0.5, side: 1 },
    { x: -0.62, z: -0.8, steer: false, drive: 0.5, side: -1 },
  ],
  // 4-stroke CNG engine (about 200 cc, 8 hp) with a 3-speed box: strong in first gear, top speed about 60 km/h
  engine: {
    idleRpm: 1100,
    redlineRpm: 5600,
    launchRpm: 2200,
    torque: [[1100, 15], [2200, 20], [3400, 23], [4600, 21], [5600, 13]],
    engineBraking: 12,
  },
  gears: [2.6, 1.6, 1.0],
  reverse: 2.6,
  finalDrive: 11.5,
  efficiency: 0.88,
  brakeMax: brakeFor(520, 3, 5.5),
  maxSteer: 0.6,
  cd: 0.8,
  frontalArea: 2.4,
  use: USE.auto(0.17),
  look: { kind: 'auto', body: 0x2f9e5b, accent: 0x20262b },
  seat: { x: 0, y: 0, z: 0.0, scale: 0.9 },
  seats: [
    { x: -0.4, y: 0, z: -0.85, scale: 0.88 },
    { x: 0.4, y: 0, z: -0.85, scale: 0.88 },
    { x: 0, y: 0, z: -0.85, scale: 0.88 },
  ],
  pax: [0, 3],
  enclosed: false,
  bulletsToKill: 10,
  fragile: 1.2,
  cruiseMax: 14,
  camera: { dist: 8, min: 4, max: 22 },
}, 0.22, 0.65, [0.62]);

/** City bus: long, heavy, diesel. */
export const BUS: VehicleSpec = finish({
  id: 'bus',
  nameBn: 'বাস',
  mass: 9000,
  half: { x: 1.3, y: 1.35, z: 5.3 },
  comY: -0.7,
  wheelRadius: 0.5,
  wheelWidth: 0.3,
  trackHalf: 1.05,
  wheelbaseHalf: 2.95,
  connY: -0.75,
  susp: { rest: 0.6, travel: 0.4, stiffness: 17, compression: 2.2, relaxation: 2.8 },
  frictionSlip: 8,
  sideFriction: 1,
  drive: 'rwd',
  frontShare: 0,
  wheels: [
    { x: 1.05, z: 3.5, steer: true, drive: 0, side: 1 },
    { x: -1.05, z: 3.5, steer: true, drive: 0, side: -1 },
    { x: 1.05, z: -2.4, steer: false, drive: 0.5, side: 1 },
    { x: -1.05, z: -2.4, steer: false, drive: 0.5, side: -1 },
  ],
  engine: {
    idleRpm: 650,
    redlineRpm: 2600,
    launchRpm: 1500,
    torque: [[650, 500], [1200, 850], [1800, 950], [2200, 850], [2600, 650]],
    engineBraking: 160,
  },
  gears: [4.2, 2.7, 1.7, 1.15, 0.85],
  reverse: 4.4,
  finalDrive: 5.2,
  efficiency: 0.85,
  brakeMax: brakeFor(9000, 4, 5.2),
  maxSteer: 0.5,
  cd: 0.75,
  frontalArea: 7.5,
  use: USE.bus(0.13),
  look: { kind: 'bus', body: 0xe8edef, accent: 0x1fd1b0 },
  seat: { x: -0.62, y: 0, z: 3.75, scale: 0.95 },
  seats: [
    { x: 0.62, y: 0, z: 2.2, scale: 0.92 },
    { x: 0.62, y: 0, z: 0.6, scale: 0.92 },
    { x: 0.62, y: 0, z: -1.0, scale: 0.92 },
    { x: 0.62, y: 0, z: -2.8, scale: 0.92 },
    { x: -0.62, y: 0, z: 1.4, scale: 0.92 },
    { x: -0.62, y: 0, z: -0.2, scale: 0.92 },
    { x: -0.62, y: 0, z: -3.4, scale: 0.92 },
  ],
  pax: [2, 7],
  enclosed: true,
  bulletsToKill: 15,
  fragile: 0.45,
  cruiseMax: 15.5,
  camera: { dist: 14, min: 7, max: 36 },
}, 0.45, 1.45, [1.4], undefined, 1.5);

/** War tank: tracked, 38 t, skid steering, turret with a cannon (fired by the player with the left mouse button). */
const TANK_WHEELS: WheelDef[] = [];
for (const z of [2.7, 0.9, -0.9, -2.7]) {
  TANK_WHEELS.push({ x: 1.55, z, steer: false, drive: 1 / 8, side: 1 });
  TANK_WHEELS.push({ x: -1.55, z, steer: false, drive: 1 / 8, side: -1 });
}
export const TANK: VehicleSpec = finish({
  id: 'tank',
  nameBn: 'যুদ্ধ ট্যাংক',
  mass: 38000,
  half: { x: 1.8, y: 0.7, z: 3.6 },
  comY: -0.5,
  wheelRadius: 0.45,
  wheelWidth: 0.5,
  trackHalf: 1.55,
  wheelbaseHalf: 2.7,
  connY: -0.2,
  susp: { rest: 0.45, travel: 0.3, stiffness: 12, compression: 2.0, relaxation: 2.4 },
  frictionSlip: 10,
  sideFriction: 0.15,
  drive: 'track',
  frontShare: 0,
  wheels: TANK_WHEELS,
  engine: {
    idleRpm: 700,
    redlineRpm: 2600,
    launchRpm: 1400,
    torque: [[700, 900], [1400, 1500], [2000, 1800], [2600, 1500]],
    engineBraking: 500,
  },
  gears: [5.0, 3.0, 1.5],
  reverse: 5.0,
  finalDrive: 5.5,
  efficiency: 0.8,
  brakeMax: brakeFor(38000, 8, 7),
  maxSteer: 0,
  cd: 0.8,
  frontalArea: 6,
  use: USE.none(),
  look: { kind: 'tank', body: 0x58613a, accent: 0x2a2e20 },
  seat: { x: 0, y: 0, z: 0.9, scale: 0.9 },
  pax: [0, 0],
  enclosed: true,
  bulletsToKill: 400,
  fragile: 0.005,
  skid: { turnForce: 220000, yawAssist: 450000 },
  turret: { y: 0, z: -0.3, barrel: 4.4, maxPitch: 0.45, minPitch: -0.14, turnRate: 1.1 },
  camera: { dist: 16, min: 9, max: 45 },
}, 0.45, 1.1, [1.1], 1.55);

/**
 * EVCity Volt GT: electric hypercar for the player (not in AI traffic). AWD, 3-speed e-gearbox, ~270 km/h, strong brakes + downforce.
 * Heights below are metres above the ground (see `finish`).
 */
export const HYPERCAR: VehicleSpec = finish({
  id: 'hypercar',
  nameBn: 'ভোল্ট জিটি (সুপারকার)',
  mass: 1650,
  half: { x: 0.95, y: 0.3, z: 2.25 },
  comY: -0.15,
  wheelRadius: 0.35,
  wheelWidth: 0.28,
  trackHalf: 0.8,
  wheelbaseHalf: 1.45,
  connY: 0,
  susp: { rest: 0.26, travel: 0.16, stiffness: 34, compression: 3.0, relaxation: 3.6 },
  frictionSlip: 14,
  sideFriction: 1.3,
  drive: 'awd',
  frontShare: 0.4,
  engine: {
    idleRpm: 800,
    redlineRpm: 14000,
    launchRpm: 3200,
    // electric motors: huge torque right from standstill, falling off at high rpm
    torque: [[800, 600], [6000, 600], [9000, 520], [12000, 380], [14000, 260]],
    engineBraking: 70, // regenerative braking
  },
  gears: [2.4, 1.5, 1.0],
  reverse: 2.4,
  finalDrive: 6.8,
  efficiency: 0.93,
  brakeMax: 95,
  maxSteer: 0.45,
  cd: 0.29,
  frontalArea: 1.85,
  downforce: 1.4,
  use: USE.none(),
  look: { kind: 'hypercar', body: 0x1d2429, accent: 0x0a0c0e },
  seat: { x: -0.38, y: 0, z: 0.15, scale: 0.88 },
  seats: [{ x: 0.38, y: 0, z: 0.15, scale: 0.88 }],
  pax: [0, 1],
  enclosed: true,
  bulletsToKill: 12,
  fragile: 1.2,
  camera: { dist: 9.5, min: 5, max: 28 },
}, 0.13, 0.43, [0.43], undefined, 0.8);

/**
 * EVCity Volt R: high-speed electric superbike for the player (not in AI traffic). Two wheels with the roll controller (like BIKE),
 * long wheelbase for stability, strong motor with a 3-speed e-gearbox: about 225 km/h, 0-100 km/h in roughly 3.5 s.
 */
export const EVBIKE: VehicleSpec = finish({
  id: 'evbike',
  nameBn: 'ভোল্ট আর (হাইস্পিড ইভি বাইক)',
  mass: 240,
  half: { x: 0.22, y: 0.3, z: 0.98 },
  comY: 0,
  wheelRadius: 0.33,
  wheelWidth: 0.17,
  trackHalf: 0,
  wheelbaseHalf: 0.72,
  connY: -0.02,
  susp: { rest: 0.28, travel: 0.18, stiffness: 49, compression: 3.0, relaxation: 3.6 },
  frictionSlip: 11,
  sideFriction: 1.05,
  drive: 'rwd',
  frontShare: 0,
  wheels: [
    { x: 0, z: 0.72, steer: true, drive: 0, side: 0 },
    { x: 0, z: -0.72, steer: false, drive: 1, side: 0 },
  ],
  engine: {
    idleRpm: 600,
    redlineRpm: 16000,
    launchRpm: 2500,
    // electric motor: full torque from standstill, tapering at high rpm
    torque: [[600, 110], [5000, 110], [9000, 100], [13000, 72], [16000, 48]],
    engineBraking: 28, // regenerative braking
  },
  gears: [1.9, 1.3, 1.0],
  reverse: 2.0,
  finalDrive: 8.9,
  efficiency: 0.93,
  brakeMax: brakeFor(240, 2, 9),
  maxSteer: 0.45,
  cd: 0.6,
  frontalArea: 0.5,
  use: USE.none(),
  look: { kind: 'evbike', body: 0xe6eaed, accent: 0x15181b },
  seat: { x: 0, y: 0, z: -0.2, scale: 0.9 },
  seats: [{ x: 0, y: 0, z: -0.74, scale: 0.86 }],
  pax: [0, 1],
  enclosed: false,
  bulletsToKill: 10,
  fragile: 1.7,
  balance: true,
  camera: { dist: 6.5, min: 3, max: 18 },
}, 0.2, 0.82, [0.82]);

/**
 * EVCity EVHypar: electric hyper-GT SUV for the player (not in AI traffic). Low, wide, aerodynamic coupe-SUV: dual-motor AWD, 5 seats,
 * 3-speed e-gearbox, active downforce, big brakes. Top speed 250 km/h. Heights below are metres above the ground (see `finish`).
 */
export const EVHYPAR: VehicleSpec = finish({
  id: 'evhypar',
  nameBn: 'ইভি হাইপার (হাইপার জিটি এসইউভি)',
  mass: 2350,
  half: { x: 1.0, y: 0.42, z: 2.45 },
  comY: -0.3,
  wheelRadius: 0.42,
  wheelWidth: 0.3,
  trackHalf: 0.86,
  wheelbaseHalf: 1.5,
  connY: -0.04,
  susp: { rest: 0.42, travel: 0.3, stiffness: 24, compression: 2.6, relaxation: 3.2 },
  frictionSlip: 13,
  sideFriction: 1.15,
  drive: 'awd',
  frontShare: 0.42,
  engine: {
    idleRpm: 600,
    redlineRpm: 12000,
    launchRpm: 2800,
    // dual electric motors: big torque from standstill, still pulling hard at high rpm (needed to push through the air at 250 km/h)
    torque: [[600, 560], [4500, 560], [7500, 510], [10000, 445], [12000, 365]],
    engineBraking: 80, // regenerative braking
  },
  gears: [2.5, 1.6, 1.0],
  reverse: 2.5,
  finalDrive: 7.35,
  efficiency: 0.92,
  brakeMax: brakeFor(2350, 4, 10),
  maxSteer: 0.5,
  cd: 0.3,
  frontalArea: 2.7,
  downforce: 1.2,
  use: USE.none(),
  look: { kind: 'evhypar', body: 0x1d3f3b, accent: 0x14181b },
  seat: { x: -0.48, y: 0, z: 0.2, scale: 0.95 },
  seats: [
    { x: 0.48, y: 0, z: 0.2, scale: 0.95 },
    { x: 0.48, y: 0, z: -0.8, scale: 0.95 },
    { x: -0.48, y: 0, z: -0.8, scale: 0.95 },
    { x: 0, y: 0, z: -0.8, scale: 0.95 },
  ],
  pax: [0, 4],
  enclosed: true,
  bulletsToKill: 18,
  fragile: 0.8,
  camera: { dist: 10, min: 5.5, max: 30 },
}, 0.2, 0.7, [0.7], undefined, 1.2);


/**
 * EVCity SUPRIM: one electric vehicle, three worlds. On the road it is a low dual-motor AWD sports coupe (like the EVHypar, 2 seats).
 * N unfolds the wings and starts the four VTOL thrusters (Space = up, then W A S D fly); N again lands. In water it floats (T) and dives like a
 * submarine (C). The road physics below are the tested EVHypar numbers; flight / water are handled by Vehicle (mode machine), not by wheels.
 */
export const SUPRIM: VehicleSpec = finish({
  id: 'suprim',
  nameBn: 'ইভিসিটি সুপ্রিম (চলে · উড়ে · ডোবে)',
  amphibious: true,
  mass: 2100,
  half: { x: 1.0, y: 0.4, z: 2.4 },
  comY: -0.3,
  wheelRadius: 0.4,
  wheelWidth: 0.3,
  trackHalf: 0.88,
  wheelbaseHalf: 1.5,
  connY: -0.04,
  susp: { rest: 0.42, travel: 0.3, stiffness: 24, compression: 2.6, relaxation: 3.2 },
  frictionSlip: 13,
  sideFriction: 1.15,
  drive: 'awd',
  frontShare: 0.42,
  engine: {
    idleRpm: 600,
    redlineRpm: 12000,
    launchRpm: 2800,
    torque: [[600, 1000], [4500, 1000], [7500, 960], [10000, 900], [12000, 820]], // ~1 MW at the top: enough for 500 km/h
    engineBraking: 80, // regenerative braking
  },
  gears: [2.5, 1.6, 1.0],
  reverse: 2.5,
  finalDrive: 3.6, // 12000 rpm in 3rd = about 500 km/h (the governor in Vehicle stops it at SUPRIM_FLIGHT.roadMax)
  efficiency: 0.92,
  brakeMax: brakeFor(2100, 4, 14),
  maxSteer: 0.5,
  cd: 0.28,
  frontalArea: 2.4,
  downforce: 1.1,
  use: USE.none(),
  look: { kind: 'suprim', body: 0xc4cad3, accent: 0x0c1118 },
  seat: { x: -0.42, y: 0, z: 0.1, scale: 0.95 },
  seats: [{ x: 0.42, y: 0, z: 0.1, scale: 0.95 }],
  pax: [0, 1],
  enclosed: true,
  bulletsToKill: 18,
  fragile: 0.8,
  camera: { dist: 10, min: 5.5, max: 40 },
}, 0.2, 0.66, [0.66], undefined, 1.15);

/** Flight / water numbers of the Suprim (SI units). Used by Vehicle's mode machine. */
export const SUPRIM_FLIGHT = {
  /** HARD speed limits (m/s): road 500 km/h, air 500 km/h, water 400 km/h. */
  roadMax: 500 / 3.6,
  airMax: 500 / 3.6,
  waterMax: 400 / 3.6,
  /** Drone (VTOL) regime: top horizontal speed on the rotors alone (m/s), steepest tilt (rad), tilt response time (s), hover climb / sink rates (m/s). */
  droneMax: 28,
  tiltMax: 0.62,
  tiltTau: 0.28,
  /** Plane regime: the wings carry the weight from this speed on (full lift at `wingFull`), the rotors fade out between `rotorOff0` and `rotorOff1`. */
  wingStall: 30,
  wingFull: 55,
  rotorOff0: 42,
  rotorOff1: 70,
  /** Plane cruise (no boost) in m/s, Shift = full thrust up to airMax, Ctrl = slow. */
  cruise: 100,
  boost: 1.4,
  slow: 0.3,
  /** Acceleration (m/s^2) of the pusher thrust, normal / boost. */
  accel: 26,
  accelBoost: 48,
  /** Climb speed with Space (m/s), with Shift on top; plane climb at full speed. */
  climb: 11,
  climbBoost: 17,
  climbPlane: 55,
  /** Sink speed when landing (m/s) and the slower final touch-down speed below `flare` metres. */
  descend: 7,
  touchdown: 2.2,
  flare: 6,
  /** Turn rate (rad/s) in the air, on the water, under water. */
  yawAir: 1.5,
  yawWater: 1.0,
  yawSub: 0.9,
  /** Highest altitude above the ground (m). */
  ceiling: 2500,
  /** Takes off only when the thrusters have spooled up (s) and the wings are out. */
  deploy: 1.4,
  /** Water: surface / submarine acceleration (m/s^2); the top speed is waterMax, Ctrl slows. */
  floatAccel: 14,
  subAccel: 10,
  waterBoost: 1.7,
  /** Needs at least this much water under the hull (m) to float / this much to dive. */
  floatDepth: 1.15,
  diveDepth: 3.2,
  /** Default cruising depth below the surface (m), the limits, how fast Space / X change it (m/s) and the clearance above the sea floor. */
  subDepth: 5,
  subMin: 1.6,
  subMax: 80,
  subRate: 3.5,
  floorGap: 1.8,
  /** Rail: top speed on the track before curves (m/s), lateral acceleration allowed in curves (m/s^2), accel / brake (m/s^2). */
  railAccel: 9,
  railBrake: 12,
  railLat: 16,
  railTol: 1.4,
} as const;

/**
 * FARM VEHICLES (never in AI traffic: FarmCrew puts a farmer at the wheel and drives them in the crop fields; you can take them over).
 * Tractor: ~34 km/h, big knobby tyres, all-wheel drive, open seat. Combine harvester: ~27 km/h, mostly front-wheel drive, heavy. Pickup: the farm's light truck.
 */
export const TRACTOR: VehicleSpec = finish({
  id: 'tractor',
  nameBn: 'ট্রাক্টর',
  mass: 2600,
  half: { x: 0.95, y: 0.55, z: 1.9 },
  comY: -0.45,
  wheelRadius: 0.55,
  wheelWidth: 0.36,
  trackHalf: 0.95,
  wheelbaseHalf: 1.3,
  connY: -0.05,
  susp: { rest: 0.5, travel: 0.35, stiffness: 20, compression: 2.2, relaxation: 2.8 },
  frictionSlip: 12,
  sideFriction: 1,
  drive: 'awd',
  frontShare: 0.35,
  engine: {
    idleRpm: 800,
    redlineRpm: 2600,
    torque: [[800, 260], [1400, 380], [2000, 400], [2600, 300]],
    engineBraking: 90,
  },
  gears: [6.5, 4.2, 2.8, 1.9],
  reverse: 6,
  finalDrive: 8,
  efficiency: 0.88,
  brakeMax: 105,
  maxSteer: 0.7,
  cd: 0.8,
  frontalArea: 3.4,
  use: USE.none(),
  look: { kind: 'tractor', body: 0x2e7d32, accent: 0xf2b705 },
  seat: { x: 0, y: 0, z: -0.3, scale: 1 },
  seats: [],
  pax: [0, 0],
  enclosed: false,
  windowY: 0,
  bulletsToKill: 25,
  fragile: 0.4,
  camera: { dist: 10, min: 6, max: 30 },
}, 0.55, 1.5, [], undefined, 2.2);

export const COMBINE: VehicleSpec = finish({
  id: 'combine',
  nameBn: 'কম্বাইন হারভেস্টার',
  mass: 6500,
  half: { x: 1.45, y: 0.9, z: 3.3 },
  comY: -0.7,
  wheelRadius: 0.75,
  wheelWidth: 0.5,
  trackHalf: 1.45,
  wheelbaseHalf: 2.0,
  connY: -0.05,
  susp: { rest: 0.6, travel: 0.4, stiffness: 22, compression: 2.4, relaxation: 3.0 },
  frictionSlip: 11,
  sideFriction: 1,
  drive: 'awd',
  frontShare: 0.9,
  engine: {
    idleRpm: 800,
    redlineRpm: 2400,
    torque: [[800, 520], [1400, 760], [2000, 800], [2400, 640]],
    engineBraking: 120,
  },
  gears: [9, 5.8, 3.6],
  reverse: 8,
  finalDrive: 7,
  efficiency: 0.88,
  brakeMax: 270,
  maxSteer: 0.55,
  cd: 0.9,
  frontalArea: 7,
  use: USE.none(),
  look: { kind: 'combine', body: 0xc62828, accent: 0xf2b705 },
  seat: { x: -0.2, y: 0, z: 1.55, scale: 1 },
  seats: [],
  pax: [0, 0],
  enclosed: true,
  windowY: 0,
  bulletsToKill: 40,
  fragile: 0.3,
  camera: { dist: 14, min: 8, max: 36 },
}, 0.6, 2.7, [], undefined, 3.2);

export const PICKUP: VehicleSpec = {
  ...JEEP,
  id: 'pickup',
  nameBn: 'পিকআপ (খামারের গাড়ি)',
  mass: 1900,
  half: { x: 0.95, y: 0.42, z: 2.5 },
  wheelbaseHalf: 1.6,
  use: USE.none(),
  look: { kind: 'pickup', body: 0xf4f1ea, accent: 0x1b5e20 },
  seats: [{ x: 0.45, y: 0.02, z: 0.2, scale: 0.95 }],
  pax: [0, 1],
};

// the farm vehicles come LAST: scripts/vehicle-test.ts places every vehicle by its index in this object, so the older ones must keep their index
export const SPECS: Record<VehicleId, VehicleSpec> = { sedan: SEDAN, jeep: JEEP, hypercar: HYPERCAR, evhypar: EVHYPAR, bike: BIKE, evbike: EVBIKE, rickshaw: RICKSHAW, auto: AUTO, bus: BUS, tank: TANK, tractor: TRACTOR, combine: COMBINE, pickup: PICKUP, suprim: SUPRIM };


/**
 * Top-speed multiplier per vehicle (2 = twice as fast). Set one to 1 to leave that vehicle as it was.
 * AI traffic keeps its own cruising speeds (VehicleUse / `cruiseMax`), so the roads stay sensible: this is what YOU can do with the vehicle.
 */
export const SPEED_BOOST: Record<VehicleId, number> = {
  sedan: 2,
  jeep: 2,
  hypercar: 2,
  evhypar: 2,
  bike: 2,
  evbike: 2,
  rickshaw: 2,
  auto: 2,
  bus: 2,
  tank: 2,
  tractor: 1,
  combine: 1,
  pickup: 1,
  suprim: 2,
};

/**
 * k times the top speed, with the same feel:
 *  - gearing / k  -> the same rpm gives k times the speed
 *  - torque x k^2 -> the wheel force per rpm grows by k (so it accelerates k times as hard and reaches every gear's limit in the same time),
 *                    and the power grows by k^2 (drag power grows with v^3, so this is what a k-times-faster car really needs)
 *  - drag / k     -> air drag (~ cd v^2) at k times the speed is only k times as big, so the top speed is really reached
 *  - a bit more grip and brake force so the faster car can still turn and stop
 */
function boostSpeed(s: VehicleSpec, k: number): void {
  if (k === 1) return;
  s.finalDrive /= k;
  s.engine = {
    ...s.engine,
    torque: s.engine.torque.map(([r, t]): [number, number] => [r, t * k * k]),
    engineBraking: s.engine.engineBraking * k * k,
  };
  s.cd /= k;
  if (s.downforce) s.downforce /= k;
  const grip = 1 + 0.35 * (k - 1);
  s.frictionSlip *= grip;
  s.sideFriction *= 1 + 0.2 * (k - 1);
  s.brakeMax *= grip;
}

for (const id of Object.keys(SPECS) as VehicleId[]) boostSpeed(SPECS[id], SPEED_BOOST[id]);
