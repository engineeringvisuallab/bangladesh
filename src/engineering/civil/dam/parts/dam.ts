import * as THREE from 'three';
import type { InfraPart } from '../../../core/types';
import { box, lightPole, railing } from '../../../core/prims';
import type { Ctx } from './ctx';
import { extrudeProfile, slopeBox, solidBox } from './ctx';
import { DAM, H, faceY } from '../layout';

/** Concrete gravity dam: two non-overflow blocks (crest 44 m) and the spillway section between them. Solid concrete, its weight holds back the lake. */
export function buildDam({ mats: m, t, solids }: Ctx): InfraPart {
  const g = new THREE.Group();
  g.name = 'dam';
  const U = DAM.zUp;
  const C = DAM.zCrestIn;
  const T = DAM.zToe;
  const profile: [number, number][] = [[U, 0], [U, H.crest], [C, H.crest], [T, 0]];
  const blocks: [number, number][] = [[-DAM.xEnd, -DAM.xSpill], [DAM.xSpill, DAM.xEnd]];
  for (const [x0, x1] of blocks) {
    g.add(extrudeProfile(profile, x0, x1, m.concrete));
    // collision: the crest block and a staircase that follows the downstream slope
    solids.push(solidBox(x0, x1, 0, H.crest, U, C));
    for (let z = C; z < T; z += 4) solids.push(solidBox(x0, x1, 0, faceY((z + Math.min(z + 4, T)) / 2), z, Math.min(z + 4, T)));
    // crest road: markings, parapet rails, street lights
    for (let x = x0 + 3; x < x1 - 2; x += 6) box(g, 2.6, 0.02, 0.2, m.white, x, H.crest + 0.01, -21);
    railing(g, m.steel, x0, U + 0.5, x1, U + 0.5, H.crest);
    railing(g, m.steel, x0, C - 0.5, x1, C - 0.5, H.crest);
    for (let x = x0 + 6; x < x1; x += 14) lightPole(g, m, x, -21, 1);
    // monolith joints (the dam is poured in blocks) and an inspection-gallery portal on the downstream face
    for (let x = x0; x <= x1 + 0.1; x += 14) slopeBox(g, t.dark, 0.18, 0.08, C, H.crest, T, 0, x, 0.01);
    const portal = slopeBox(g, t.dark, 3, 0.3, -1, 20, 5.5, 13.5, (x0 + x1) / 2, 0.01);
    portal.name = 'portal';
  }
  // spillway section body (ogee crest at 28 m, then the chute and a flip bucket at the toe)
  const sp: [number, number][] = [[U, 0], [U, H.sill], [-20, H.sill], [-12, 25], [14, 4], [18, 1.5], [20, 0]];
  g.add(extrudeProfile(sp, -DAM.xSpill, DAM.xSpill, m.concrete));
  const spY = (z: number): number => (z < -20 ? H.sill : z < -12 ? H.sill - ((z + 20) / 8) * 3 : z < 14 ? 25 - ((z + 12) / 26) * 21 : z < 18 ? 4 - ((z - 14) / 4) * 2.5 : 1.5 - ((z - 18) / 2) * 1.5);
  solids.push(solidBox(-DAM.xSpill, DAM.xSpill, 0, H.sill, U, -20));
  for (let z = -20; z < 20; z += 4) solids.push(solidBox(-DAM.xSpill, DAM.xSpill, 0, spY(z + 2), z, z + 4));
  // a foundation key under the whole dam (the dam is keyed into the rock)
  box(g, 2 * DAM.xEnd + 6, 1.2, 46, t.rockDark, 0, -1.2, -3);
  return { id: 'dam', nameBn: 'Concrete gravity dam', group: g };
}
