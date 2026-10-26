import { PhysicsConfig } from '../physics/PhysicsConfig';

/**
 * Data describing the speedboat (a 5.4 m open runabout with a 45 kW outboard).
 * All numbers are SI units. Model faces +Z, left side is +X, origin = hull centre (bottom of the keel is y = keelY).
 */
const MASS = 900;
const WATER_DENSITY = 1000;
const WATERPLANE_AREA = 7.6;
/** Local y of the buoyancy sample points = the flat bottom of the hull. */
const KEEL_Y = -0.25;

/**
 * Buoyancy sample points (hull bottom). Each one stands for a share (`w`) of the waterplane area:
 * force = density * g * (area share) * (depth below the surface)  -> Archimedes' principle.
 */
const RAW_POINTS: ReadonlyArray<{ x: number; z: number; w: number }> = [
  { x: 0.9, z: -2.5, w: 1 },
  { x: -0.9, z: -2.5, w: 1 },
  { x: 0.9, z: -0.8, w: 1 },
  { x: -0.9, z: -0.8, w: 1 },
  { x: 0.9, z: 0.9, w: 1 },
  { x: -0.9, z: 0.9, w: 1 },
  { x: 0.45, z: 2.4, w: 0.6 },
  { x: -0.45, z: 2.4, w: 0.6 },
];
const W_SUM = RAW_POINTS.reduce((s, p) => s + p.w, 0);

export const BOAT = {
  nameBn: 'স্পিডবোট',
  mass: MASS,
  length: 5.4,
  beam: 2.0,
  /** Principal moments of inertia (kg m^2): x = pitch axis, y = yaw axis, z = roll axis. */
  inertia: { x: 2600, y: 2500, z: 800 },
  /** Centre of mass relative to the hull centre (the heavy outboard is at the back). */
  com: { x: 0, y: -0.12, z: -0.15 },
  keelY: KEEL_Y,
  waterDensity: WATER_DENSITY,
  waterplaneArea: WATERPLANE_AREA,
  /** Buoyancy points with their own spring stiffness (N/m) and damper (N s/m). */
  points: RAW_POINTS.map((p) => ({
    x: p.x,
    y: KEEL_Y,
    z: p.z,
    k: (WATER_DENSITY * -PhysicsConfig.gravity * WATERPLANE_AREA * p.w) / W_SUM,
    c: 790 * p.w,
  })),
  /** Deepest the hull can sink before the buoyancy stops growing (m) = freeboard of the open hull. */
  maxDraft: 0.9,
  /** Outboard: static thrust (N), effective propulsive power (W), reverse share, turbo factors. */
  thrustStatic: 5200,
  power: 28_000,
  reverseShare: 0.4,
  boostThrust: 1.25,
  boostPower: 1.3,
  /** Propeller position (hull local) and the lowest point of the propeller. */
  stern: { x: 0, y: -0.2, z: -2.6 },
  propY: -0.55,
  /** Steering: how far the outboard can swing (rad) at standstill and at speed. */
  rudderLow: 0.52,
  rudderHigh: 0.3,
  /** Hull resistance (water): quadratic kg/m and linear N s/m, forward and sideways. */
  dragFwd: { quad: 3.8, lin: 40 },
  dragSide: { quad: 500, lin: 700 },
  /** Drag multiplier when the hull moves backwards (transom first). */
  reverseDrag: 4,
  /** Yaw damping torque: linear (N m s/rad) and quadratic. */
  yawDamp: { lin: 1500, quad: 800 },
  /** Hull when the anchor brake (Space) is on: drag multiplier. */
  anchorDrag: 5,
  seat: { x: -0.35, y: 0.12, z: -0.25, scale: 0.9 },
  look: { hull: 0xf2f4f6, bottom: 0x1c3d6e, accent: 0xd8382b, deck: 0x8c9399, glass: 0x1a2c3e },
} as const;
