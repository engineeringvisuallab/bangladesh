// ARMY CAMP mesh (no three.js): flat-shaded vertex-coloured triangles built from the plan. Ground pavements and solids are two separate arrays.
import { MeshBuilder, type MeshArrays } from '../airport/MeshBuilder';
import { ARMY_COLORS as C, ARMY_K as K, type ArmyPlan, type ArmySolid, srgb } from './ArmyPlan';

export interface ArmyMeshData { ground: MeshArrays; solid: MeshArrays }

const SAND_DARK = srgb(0x8f7f58);
const GROUND_Y = { sand: 0.04, concrete: 0.05, road: 0.06, white: 0.09 } as const;

function solid(b: MeshBuilder, s: ArmySolid): void {
  const { cx, cz, w, d, h } = s;
  switch (s.kind) {
    case 'hq': {
      b.box(cx, 0, cz, w, h, d, C.wall);
      b.box(cx, h, cz, w + 1.2, 0.6, d + 1.2, C.roof);
      b.box(cx, 0, cz + d / 2 + 2, 14, 0.35, 4, C.concrete); // steps
      b.box(cx, 0, cz + d / 2 + 0.05, 6, 3.4, 0.2, C.door); // main door
      for (const y of [2.2, 5.6]) b.box(cx, y, cz + d / 2 + 0.05, w * 0.82, 1.3, 0.2, C.door); // window strips
      break;
    }
    case 'barracks': {
      b.gable(cx, 0, cz, w, d, h, 2.4, C.wall, C.roof);
      b.box(cx, 1.2, cz + d / 2 + 0.05, w * 0.86, 1.1, 0.2, C.door);
      break;
    }
    case 'mess': {
      b.gable(cx, 0, cz, w, d, h, 3, C.wall, C.roofRed);
      b.box(cx - w * 0.25, 0, cz + d / 2 + 0.05, 3, 2.6, 0.2, C.door);
      b.box(cx + w * 0.15, 1.3, cz + d / 2 + 0.05, w * 0.4, 1.2, 0.2, C.door);
      break;
    }
    case 'medical': {
      b.box(cx, 0, cz, w, h, d, C.white);
      b.box(cx, h, cz, w + 0.8, 0.5, d + 0.8, C.roof);
      b.box(cx, h + 0.5, cz, 4.2, 0.12, 1.1, C.red); // red cross on the flat roof
      b.box(cx, h + 0.5, cz, 1.1, 0.12, 4.2, C.red);
      b.box(cx, 0, cz + d / 2 + 0.05, 3, 2.5, 0.2, C.door);
      break;
    }
    case 'garage': {
      b.gable(cx, 0, cz, w, d, h, 3.5, C.metal, C.roof);
      b.box(cx, 0, cz + d / 2 + 0.05, w * 0.9, h * 0.78, 0.2, C.door);
      break;
    }
    case 'gatehouse': {
      b.box(cx, 0, cz, w, h, d, C.wallDark);
      b.box(cx, h, cz, w + 1, 0.4, d + 1, C.roof);
      b.box(cx, 1.2, cz + d / 2 + 0.05, w * 0.7, 1, 0.2, C.door);
      break;
    }
    case 'tower': {
      const legH = h - 3, o = w / 2 - 0.4;
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) b.box(cx + sx * o, 0, cz + sz * o, 0.7, legH, 0.7, C.metal);
      b.box(cx, legH * 0.5, cz, w, 0.3, d, C.metal); // mid platform
      b.box(cx, legH, cz, w + 0.6, 2.4, d + 0.6, C.wallDark); // cab
      b.box(cx, legH + 1.0, cz + (d + 0.6) / 2 + 0.05, w * 0.8, 0.9, 0.2, C.door); // window
      b.frustum(cx, legH + 2.4, cz, w + 1.8, d + 1.8, 1, 1, 1.6, C.roof);
      break;
    }
    case 'tent': {
      b.gable(cx, 0, cz, w, d, 1.2, 2.0, C.tent, C.tentRoof);
      break;
    }
    case 'bunker': {
      b.frustum(cx, 0, cz, w, d, w * 0.55, d * 0.5, h, C.earth);
      b.box(cx, 0, cz + d / 2 - 0.5, 5, 3, 1.2, C.concrete);
      b.box(cx, 0, cz + d / 2 + 0.1, 3.4, 2.6, 0.2, C.door);
      break;
    }
    case 'fuel': {
      b.box(cx, 0, cz, w, h, d, C.metal);
      b.frustum(cx, h, cz, w, d, w * 0.6, d * 0.6, 0.8, C.metal);
      b.box(cx, 1.2, cz, w + 0.1, 0.5, d + 0.1, C.red); // red band
      break;
    }
    case 'mast': {
      b.frustum(cx, 0, cz, w, d, 0.5, 0.5, h, C.metal);
      b.box(cx, 0, cz, w + 2, 0.8, d + 2, C.concrete);
      b.box(cx, h - 6, cz, 5, 0.25, 0.25, C.metal);
      b.box(cx, h - 11, cz, 3.4, 0.25, 0.25, C.metal);
      break;
    }
    case 'flagpole': {
      b.frustum(cx, 0, cz, 0.55, 0.55, 0.25, 0.25, h, C.pole);
      b.box(cx, 0, cz, 3.5, 0.5, 3.5, C.concrete);
      b.box(cx + 2.4, h - 3.4, cz, 4.4, 2.8, 0.08, C.flag);
      break;
    }
    case 'sandbag': {
      b.box(cx, 0, cz, w, h, d, SAND_DARK);
      b.box(cx, h, cz, w * 0.8, 0.35, d * 0.8, SAND_DARK);
      break;
    }
    case 'vehicle': {
      // main battle tank, gun towards +X: tracks, hull, turret, barrel (4 variants of green)
      const col = (s.tint ?? 0) > 0.5 ? C.tankDark : C.tank;
      b.box(cx, 0, cz - d / 2 + 0.45, w, 1.0, 0.9, C.door);
      b.box(cx, 0, cz + d / 2 - 0.45, w, 1.0, 0.9, C.door);
      b.box(cx, 0.5, cz, w - 0.4, 1.1, d - 1.2, col);
      b.frustum(cx - 0.4, 1.6, cz, 3.6, 2.9, 2.6, 2.3, 0.9, col);
      b.box(cx + 3.2, 1.9, cz, 4.8, 0.32, 0.32, C.metal);
      break;
    }
    case 'fence':
      break;
  }
}

export function buildArmyMesh(plan: ArmyPlan): ArmyMeshData {
  const gb = new MeshBuilder();
  for (const r of plan.ground) {
    const col = r.kind === 'sand' ? C.sand : r.kind === 'concrete' ? C.concrete : r.kind === 'road' ? C.road : C.white;
    gb.rect(r.cx, r.cz, r.w, r.d, GROUND_Y[r.kind], col);
  }
  // helipad: dark disc with a white "H"
  const hp = plan.helipad;
  gb.disc(hp.x, hp.z, hp.r, 0.07, C.road, 32);
  gb.rect(hp.x - hp.r * 0.3, hp.z, 0.9, hp.r * 0.9, 0.09, C.white);
  gb.rect(hp.x + hp.r * 0.3, hp.z, 0.9, hp.r * 0.9, 0.09, C.white);
  gb.rect(hp.x, hp.z, hp.r * 0.6, 0.9, 0.09, C.white);
  // parade ground: white border lines + a red star-ish square in the middle
  gb.rect(0, -10 * K, 100 * K, 0.5, 0.07, C.white);
  gb.rect(0, -10 * K, 0.5, 52 * K, 0.07, C.white);
  // road centre line (main road)
  gb.rect(0, 80 * K, 0.35, 90 * K, 0.08, C.white);

  const sb = new MeshBuilder();
  for (const s of plan.solids) solid(sb, s);
  for (const f of plan.fence) {
    const cx = (f.x0 + f.x1) / 2, cz = (f.z0 + f.z1) / 2;
    const w = Math.abs(f.x1 - f.x0) || 0.2, d = Math.abs(f.z1 - f.z0) || 0.2;
    sb.box(cx, 0, cz, w, 2.6, d, C.fence);
    sb.box(cx, 2.6, cz, Math.abs(f.x1 - f.x0) ? w : 0.5, 0.35, Math.abs(f.z1 - f.z0) ? d : 0.5, C.fenceTop); // barbed-wire top
  }
  return { ground: gb.build(), solid: sb.build() };
}
