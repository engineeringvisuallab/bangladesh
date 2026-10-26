// AIRPLANE mesh (no three.js): a twin-engine narrow-body passenger jet (about 45 m long, 34 m wing span), flat-shaded vertex colours.
// Local frame: nose towards +X, +Y up, +Z = right wing (looking forward). Origin = on the ground under the centre of the fuselage (wheels touch y = 0).
// Two arrays: `body` (fuselage, wings, tail, engines) and `gear` (undercarriage, hidden in flight).
import { MeshBuilder, type MeshArrays } from '../airport/MeshBuilder';
import { srgb, type RGB } from '../army/ArmyPlan';

export const PLANE_COLORS = {
  hull: srgb(0xf1f2ee),
  belly: srgb(0xc9ccc8),
  stripe: srgb(0x1f9e6e), // EVCity green
  tail: srgb(0x1f9e6e),
  wing: srgb(0xdfe1dd),
  engine: srgb(0xb7bbb7),
  engineIn: srgb(0x2c2f2e),
  glass: srgb(0x1d2733),
  window: srgb(0x222c36),
  tyre: srgb(0x1c1c1c),
  strut: srgb(0x9a9d9a),
} as const;

export const PLANE_DIMS = {
  length: 45,
  span: 34,
  fuselageH: 4,
  fuselageW: 3.8,
  /** Height of the fuselage underside above the ground (gear down). */
  belly: 1.9,
  tailHeight: 12.2,
} as const;

export interface PlaneMeshData { body: MeshArrays; gear: MeshArrays }

export function buildPlaneMesh(): PlaneMeshData {
  const C = PLANE_COLORS;
  const b = new MeshBuilder();
  const y0 = PLANE_DIMS.belly, H = PLANE_DIMS.fuselageH, W = PLANE_DIMS.fuselageW;

  // ---- fuselage: a long centre tube + stepped nose cone + stepped tail cone
  b.box(0, y0, 0, 24, H, W, C.hull);
  b.box(0, y0, 0, 24, 0.9, W + 0.04, C.belly); // darker belly
  b.box(0, y0 + 1.6, 0, 24.2, 0.35, W + 0.06, C.stripe); // cheat line
  // nose (towards +X): three steps getting smaller and lower
  b.box(14.5, y0 + 0.1, 0, 5, H - 0.3, W - 0.5, C.hull);
  b.box(18.2, y0 + 0.3, 0, 3, H - 0.9, W - 1.3, C.hull);
  b.box(20.6, y0 + 0.6, 0, 2, H - 1.6, W - 2.2, C.hull);
  b.box(22.1, y0 + 0.9, 0, 1.2, H - 2.2, W - 2.9, C.belly); // radome
  b.box(15.8, y0 + 2.5, 0, 3.2, 0.9, W - 0.7, C.glass); // cockpit glass
  // tail cone (towards -X): rises and narrows
  b.box(-14.5, y0 + 0.3, 0, 5, H - 0.4, W - 0.5, C.hull);
  b.box(-18.2, y0 + 0.8, 0, 3, H - 1.2, W - 1.3, C.hull);
  b.box(-20.7, y0 + 1.3, 0, 2.2, H - 2.0, W - 2.2, C.hull);
  b.box(-22.2, y0 + 1.7, 0, 1, H - 2.6, W - 3.0, C.stripe);
  // passenger windows: two dark strips per side + doors
  for (const sz of [-1, 1]) {
    b.box(1.5, y0 + 2.6, sz * (W / 2 + 0.03), 19, 0.55, 0.08, C.window);
    b.box(11.6, y0 + 0.9, sz * (W / 2 + 0.03), 1.4, 2.4, 0.1, C.belly); // front door
    b.box(-11.6, y0 + 0.9, sz * (W / 2 + 0.03), 1.4, 2.4, 0.1, C.belly); // rear door
  }

  // ---- main wings: swept, built from slices (each slice a little further back and thinner)
  const slices = 9, half = PLANE_DIMS.span / 2 - W / 2;
  for (const sz of [-1, 1]) {
    for (let i = 0; i < slices; i++) {
      const t = i / slices, d = half / slices;
      const chord = 7.2 - 4.6 * t, sweep = -1.5 - 7.5 * t; // x of the slice centre (further back towards the tip)
      const z = sz * (W / 2 + d * (i + 0.5));
      b.box(sweep, y0 + 0.6 + 0.9 * t, z, chord, 0.45 - 0.2 * t, d + 0.02, C.wing);
    }
    b.box(-9.6, y0 + 1.5 + 0.9, sz * (half + W / 2 - 0.3), 1.6, 1.9, 0.25, C.stripe); // winglet
  }
  // ---- engines under the wings (nacelle + dark intake)
  for (const sz of [-1, 1]) {
    const z = sz * 6.4;
    b.box(-0.8, y0 - 0.55, z, 4.4, 1.7, 1.7, C.engine);
    b.box(1.5, y0 - 0.45, z, 0.25, 1.4, 1.4, C.engineIn);
    b.box(-3.2, y0 - 0.3, z, 0.9, 1.1, 1.1, C.belly); // exhaust cone
    b.box(-1.6, y0 + 0.3, z, 2.2, 0.9, 0.35, C.strut); // pylon
  }
  // ---- tail: vertical fin (swept slices) + horizontal stabilisers
  for (let i = 0; i < 6; i++) {
    const t = i / 6, h = (PLANE_DIMS.tailHeight - 4.4) / 6;
    b.box(-18.6 - 3.2 * t, y0 + H + 0.1 + h * i, 0, 5.4 - 2.6 * t, h + 0.02, 0.5, C.tail);
  }
  for (const sz of [-1, 1]) for (let i = 0; i < 4; i++) {
    const t = i / 4, d = 5.2 / 4;
    b.box(-19.4 - 2.2 * t, y0 + 2.4 + 0.4 * t, sz * (W / 2 - 0.8 + d * (i + 0.5)), 3.8 - 1.8 * t, 0.3, d + 0.02, C.wing);
  }

  // ---- undercarriage: nose gear + two main bogies (own array so it can be hidden in flight)
  const g = new MeshBuilder();
  const gear = (x: number, z: number, strutH: number, wheels: number): void => {
    g.box(x, 0.9, z, 0.35, strutH, 0.35, C.strut);
    for (let k = 0; k < wheels; k++) g.box(x, 0, z + (wheels === 1 ? 0 : (k - 0.5) * 1.1), 1.4, 1.4, 0.55, C.tyre);
  };
  gear(12.5, 0, y0 - 0.3, 1); // nose
  for (const sz of [-1, 1]) gear(-2.5, sz * 3.2, y0 - 0.1, 2); // mains
  return { body: b.build(), gear: g.build() };
}

export type { RGB };
