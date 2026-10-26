import * as THREE from 'three';
import type { InfraPart } from '../../../../core/types';
import { box, cyl, tank } from '../../../../core/prims';
import type { Ctx } from './ctx';
import { L } from '../layout';

/** Two long rectangular clarifiers: flocs settle, scraper bridge moves sludge to the hopper, launders collect clear water. */
export function buildSedimentation({ mats: m, site }: Ctx): InfraPart {
  const g = new THREE.Group();
  g.name = 'sedimentation';
  const s = L.sed;
  const xw = s.x - s.w / 2;
  const xe = s.x + s.w / 2;
  for (const z of [s.zN, s.zS]) {
    tank(g, site, m, { x: s.x, z, w: s.w, d: s.d, depth: 4, top: 1.0, water: m.waterSettled, rail: true });
    // inlet baffle wall (water flows over/through it slowly)
    box(g, 0.3, 3.0, s.d - 1, m.concrete, xw + 4, -4, z);
    // sludge hopper at the inlet end
    box(g, 3, 1.0, s.d - 1, m.sludge, xw + 2.2, -3.9, z);
    // launders (collecting troughs) at the outlet end + collecting channel
    for (const dz of [-5.5, 0, 5.5]) box(g, 12, 0.5, 0.8, m.concrete, xe - 7.5, 0.0, z + dz);
    box(g, 1.2, 0.6, s.d - 1, m.concrete, xe - 1.3, -0.05, z);
    // scraper bridge on rails
    const bx = s.x - 4;
    box(g, 0.9, 0.3, s.d + 0.8, m.steel, bx, 1.1, z);
    box(g, 1.4, 1.1, 1.6, m.motor, bx, 1.4, z + s.d / 2 - 1.5);
    for (const k of [-1, 1]) cyl(g, 0.1, 5, m.steel, bx, -3.9, z + k * (s.d / 2 - 1.2), 8);
    box(g, 0.12, 1.8, s.d - 1.6, m.steel, bx, -3.9, z);
  }
  return { id: 'sedimentation', nameBn: 'Sedimentation (Settling) Tanks', group: g };
}
