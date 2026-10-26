import { PhysicsConfig } from '../physics/PhysicsConfig';

/**
 * Data describing the helicopter (light utility helicopter, ~1.6 t).
 * All numbers are SI units. Model faces +Z, left side is +X, origin = fuselage centre.
 */
const MASS = 1600;

export const HELI = {
  nameBn: 'হেলিকপ্টার',
  mass: MASS,
  /** Principal moments of inertia (kg m^2): x = pitch axis, y = yaw axis, z = roll axis. */
  inertia: { x: 3200, y: 2600, z: 2400 },
  /** Centre of mass height relative to the fuselage centre. */
  comY: -0.15,
  /** Distance from the fuselage centre down to the bottom of the skids. */
  skidDepth: 1.25,
  rotorRadius: 5.2,
  /** Maximum rotor thrust at 100 % rotor speed, sea level (N). 2x weight = strong climb reserve. */
  thrustMax: MASS * -PhysicsConfig.gravity * 2.0,
  /** Drag area Cd*A (m^2) along the side (x), vertical (y) and forward (z) body axes. */
  cdA: { x: 3.4, y: 7.0, z: 1.9 },
  /** Rotor spool-up rate (fraction of full speed per second) and coast-down rates. */
  spoolUp: 0.16,
  spoolDownAir: 0.03,
  spoolDownGround: 0.08,
  /** Attitude limits of the stability assist (rad). */
  maxPitch: 0.38,
  maxPitchBoost: 0.55,
  maxRoll: 0.5,
  /** Highest altitude where the rotor still gives full thrust / zero thrust (m). */
  ceilingFull: 2600,
  ceilingZero: 3200,
  look: { body: 0xe8edf2, accent: 0xc8102e, glass: 0x16283a },
} as const;
