// MILITARY FIGHTER mesh (no three.js): a small delta-wing jet (about 15 m long, 9 m wing span), flat-shaded vertex colours, same local frame as the airliner
// (src/airplane/AirplaneMesh.ts): nose towards +X, +Y up, +Z = right wing, origin on the ground under the centre of the fuselage.
// Two arrays: `body` and `gear` (undercarriage, hidden in flight).
import { MeshBuilder } from '../airport/MeshBuilder';
import { srgb } from '../army/ArmyPlan';
import type { PlaneMeshData } from './AirplaneMesh';

export const FIGHTER_COLORS = {
  hull: srgb(0x7d8777),
  dark: srgb(0x4a5246),
  belly: srgb(0xa3aa9c),
  glass: srgb(0x26323f),
  marking: srgb(0xd9d4c0),
  roundel: srgb(0xc23a2c),
  engineIn: srgb(0x1b1d1c),
  burner: srgb(0x555a58),
  tyre: srgb(0x1c1c1c),
  strut: srgb(0x9a9d9a),
} as const;

export const FIGHTER_DIMS = { length: 15, span: 9, belly: 0.9, height: 4.4 } as const;

export function buildFighterMesh(): PlaneMeshData {
  const C = FIGHTER_COLORS;
  const b = new MeshBuilder();
  const y0 = FIGHTER_DIMS.belly;

  // ---- fuselage: centre box + tapering nose + engine section
  b.box(0, y0, 0, 7, 1.5, 1.7, C.hull);
  b.box(0, y0, 0, 7, 0.4, 1.74, C.belly);
  b.box(4.6, y0 + 0.1, 0, 2.6, 1.2, 1.3, C.hull);
  b.box(6.3, y0 + 0.2, 0, 1.4, 0.9, 0.9, C.hull);
  b.box(7.3, y0 + 0.3, 0, 1.0, 0.6, 0.55, C.dark); // radome
  b.box(2.6, y0 + 1.4, 0, 2.6, 0.55, 1.0, C.glass); // canopy
  b.box(-4.4, y0 + 0.05, 0, 3.0, 1.35, 1.6, C.hull); // engine section
  b.box(-6.4, y0 + 0.2, 0, 1.4, 1.0, 1.25, C.burner); // nozzle
  b.box(-7.15, y0 + 0.3, 0, 0.2, 0.8, 0.95, C.engineIn);
  // air intakes on both sides under the canopy
  for (const sz of [-1, 1]) b.box(1.2, y0 + 0.1, sz * 1.1, 2.6, 0.9, 0.55, C.dark);

  // ---- delta wings: slices, each further back and shorter
  const slices = 6, half = FIGHTER_DIMS.span / 2 - 0.8;
  for (const sz of [-1, 1]) {
    for (let i = 0; i < slices; i++) {
      const t = i / slices, d = half / slices;
      const chord = 6.6 - 4.4 * t, x = -0.9 - 2.2 * t;
      b.box(x, y0 + 0.35, sz * (0.85 + d * (i + 0.5)), chord, 0.16, d + 0.02, C.hull);
    }
    b.box(-3.6, y0 + 0.35, sz * (half + 0.8), 1.0, 0.18, 0.3, C.dark); // wing tip
    b.box(-0.8, y0 + 0.4, sz * 2.6, 0.5, 0.3, 0.7, C.roundel); // roundel on the wing
  }
  // ---- tail: twin canted fins (built as two boxes each) + all-moving tailplanes
  for (const sz of [-1, 1]) {
    for (let i = 0; i < 4; i++) {
      const t = i / 4;
      b.box(-5.2 - 1.4 * t, y0 + 1.4 + 0.5 * i, sz * (0.9 + 0.12 * i), 2.4 - 1.0 * t, 0.52, 0.16, C.hull);
    }
    b.box(-6.0, y0 + 3.45, sz * 1.38, 0.8, 0.4, 0.17, C.roundel);
    for (let i = 0; i < 3; i++) b.box(-6.2 - 0.5 * i, y0 + 0.4, sz * (1.4 + 0.5 * i), 2.2 - 0.7 * i, 0.12, 0.5, C.dark);
  }
  b.box(-1.8, y0 + 1.05, 0, 3.0, 0.22, 0.5, C.marking); // dorsal spine stripe

  // ---- undercarriage
  const g = new MeshBuilder();
  const gear = (x: number, z: number, h: number): void => {
    g.box(x, 0.4, z, 0.16, h, 0.16, C.strut);
    g.box(x, 0, z, 0.7, 0.7, 0.3, C.tyre);
  };
  gear(4.4, 0, y0 - 0.2); // nose
  for (const sz of [-1, 1]) gear(-1.2, sz * 1.1, y0 - 0.2); // mains
  return { body: b.build(), gear: g.build() };
}
